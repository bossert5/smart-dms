import { Injectable, Logger } from '@nestjs/common';
import type { FileArtifact } from '@prisma/client';
import type { DocumentStatus } from '@smart-dms/shared-dto';
import { copyFile, readFile, writeFile } from 'node:fs/promises';
import { AiProcessingService } from '../ai/ai-processing.service';
import { AppConfigService } from '../common/app-config.service';
import {
  OCR_LANGUAGE_CODE_TO_ENGLISH_NAME,
  ocrLanguageNameForCode,
} from '../common/ocr-language-map';
import { DocumentHistoryService } from '../document-history/document-history.service';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeEventsService } from '../realtime/realtime-events.service';
import { RealtimeNotificationsService } from '../realtime/realtime-notifications.service';
import { SettingsService } from '../settings/settings.service';
import { StorageService } from '../storage/storage.service';
import type { DocumentProcessingOptions } from '../processing/processing.types';
import { OcrCommandService, type OcrCommand } from './ocr-command.service';
import { normalizeOcrText } from './ocr-text-normalizer';

const EXISTING_TEXT_LAYER_MIN_CHARS = 100;
const LANGUAGE_SAMPLE_MIN_CHARS = 100;
const LANGUAGE_MIN_CONFIDENCE = 0.45;
const LANGUAGE_MIN_MARGIN = 0.05;
const OCR_LANGUAGE_CANDIDATES = 'deu+eng+fra+spa+por+chi_sim';
const OCR_LANGUAGE_FALLBACK = 'deu+eng';
const OCR_SINGLE_LANGUAGES = new Set(
  Object.keys(OCR_LANGUAGE_CODE_TO_ENGLISH_NAME),
);

type CleanupArtifact = Pick<FileArtifact, 'artifactType' | 'path'>;

interface PdfTextLayerAnalysis {
  firstPageText: string;
  fullText: string;
  hasUsableTextLayer: boolean;
}

interface LanguageDetectionResult {
  tesseractLanguage?: string | null;
  confidence?: number;
  margin?: number;
}

interface OcrLanguageSelection {
  readonly ocrRunLanguage: string;
  readonly detectedLanguage: string | null;
}

interface BlankPageRemovalResult {
  totalPages: number;
  removedPages: number[];
  keptPages: number[];
  remainingPages: number;
  pages?: BlankPageAnalysis[];
}

interface BlankPageAnalysis {
  page: number;
  textLength: number;
  textTokenCount?: number;
  backgroundValue: number | null;
  foregroundRatio: number;
  componentCount: number;
  largestComponentArea: number;
  decision: 'blank' | 'content';
  reason: string;
}

interface DoclingMarkdownResult {
  markdownCharacters?: number;
  debugJson?: boolean;
  elapsedMs?: number;
}

interface ExtractedDoclingMarkdown {
  readonly markdown: string | null;
  readonly debugArtifact?: {
    readonly relativePath: string;
    readonly size: number;
    readonly checksum: string | null;
  };
}

@Injectable()
export class OcrProcessingService {
  private readonly logger = new Logger(OcrProcessingService.name);

  constructor(
    private readonly config: AppConfigService,
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly ocrCommands: OcrCommandService,
    private readonly realtimeEvents: RealtimeEventsService,
    private readonly notifications: RealtimeNotificationsService,
    private readonly documentHistory: DocumentHistoryService,
    private readonly settings: SettingsService,
    private readonly aiProcessing: AiProcessingService,
  ) {}

  async processDocument(
    documentId: string,
    processingJobId: string,
    options: DocumentProcessingOptions = {},
  ): Promise<void> {
    const original = await this.prisma.fileArtifact.findFirst({
      where: {
        documentId,
        artifactType: 'ORIGINAL',
      },
      orderBy: { createdAt: 'asc' },
    });
    if (!original) {
      throw new Error('Document original artifact is missing.');
    }

    const cleanupCandidates = await this.prisma.fileArtifact.findMany({
      where: {
        documentId,
        artifactType: {
          in: ['FINAL_PDF', 'THUMBNAIL', 'DOCLING_DEBUG_JSON'],
        },
      },
      select: {
        artifactType: true,
        path: true,
      },
    });

    const finalPdf = await this.storage.prepareFinalDocumentArtifactPath(
      'pdfs',
      documentId,
      '.pdf',
    );
    const sidecar = await this.storage.prepareArtifactPath(
      'tmp/processing',
      documentId,
      '.txt',
    );
    const thumbnail = await this.storage.prepareFinalDocumentArtifactPath(
      'thumbnails',
      documentId,
      '.jpg',
    );

    await this.updateProgress(processingJobId, 15);
    const sourcePath = this.fileArtifactPath(original);
    const finalPdfOutput =
      sourcePath.relativePath === finalPdf.relativePath
        ? await this.storage.prepareArtifactPath(
            'tmp/processing',
            documentId,
            '.final.pdf',
          )
        : finalPdf;
    const settings = await this.settings.getSettings();
    const baseSourcePath = options.rotationDegrees
      ? await this.rotatePdfPages(
          documentId,
          sourcePath,
          options.rotationDegrees,
        )
      : sourcePath;
    const processingSourcePath = settings.pdfRemoveBlankPages
      ? await this.removeBlankPdfPages(documentId, baseSourcePath)
      : baseSourcePath;
    const forceOcr =
      options.forceOcr === true ||
      settings.ocrReprocessExistingTextLayer === true;
    const textLayer = forceOcr
      ? null
      : await this.analyzeTextLayer(processingSourcePath);
    let ocrText: string;
    let ocrLanguage: string | null = null;

    if (textLayer?.hasUsableTextLayer) {
      await copyFile(
        processingSourcePath.absolutePath,
        finalPdfOutput.absolutePath,
      );
      ocrText = textLayer.fullText;
      ocrLanguage = (
        await this.detectOcrLanguage(documentId, textLayer.fullText)
      ).detectedLanguage;
    } else {
      const languageSelection = await this.detectOcrLanguageFromProbe(
        documentId,
        processingSourcePath,
        { forceOcr },
      );
      ocrLanguage = languageSelection.detectedLanguage;
      await this.runOcr(processingSourcePath, finalPdfOutput, sidecar, {
        language: languageSelection.ocrRunLanguage,
        forceOcr,
      });
      ocrText = await this.readOcrText(sidecar.absolutePath);
    }

    if (finalPdfOutput.relativePath !== finalPdf.relativePath) {
      await this.storage.replaceStoredFile(
        finalPdfOutput.relativePath,
        finalPdf.relativePath,
      );
    }

    await this.updateProgress(processingJobId, 75);
    await this.runThumbnail(finalPdf, thumbnail);

    await this.updateProgress(processingJobId, 90);
    const [pdfArtifact, thumbnailArtifact] = await Promise.all([
      this.storage.describeStoredFile(finalPdf.relativePath),
      this.storage.describeStoredFile(thumbnail.relativePath),
    ]);
    const pageCount = await this.countPdfPages(finalPdf);
    const doclingExtraction = await this.extractDoclingMarkdown(
      documentId,
      finalPdf,
    );
    const extractedMarkdown = doclingExtraction.markdown;
    const artifactRows = [
      {
        documentId,
        artifactType: 'FINAL_PDF' as const,
        path: pdfArtifact.relativePath,
        mimeType: 'application/pdf',
        size: pdfArtifact.size,
        checksum: pdfArtifact.checksum,
      },
      {
        documentId,
        artifactType: 'THUMBNAIL' as const,
        path: thumbnailArtifact.relativePath,
        mimeType: 'image/jpeg',
        size: thumbnailArtifact.size,
        checksum: thumbnailArtifact.checksum,
      },
      ...(doclingExtraction.debugArtifact
        ? [
            {
              documentId,
              artifactType: 'DOCLING_DEBUG_JSON' as const,
              path: doclingExtraction.debugArtifact.relativePath,
              mimeType: 'application/json',
              size: doclingExtraction.debugArtifact.size,
              checksum: doclingExtraction.debugArtifact.checksum,
            },
          ]
        : []),
    ];
    const retainedPaths = [
      pdfArtifact.relativePath,
      thumbnailArtifact.relativePath,
      ...(doclingExtraction.debugArtifact
        ? [doclingExtraction.debugArtifact.relativePath]
        : []),
    ];

    const processingResult = await this.prisma.$transaction(async (tx) => {
      await tx.fileArtifact.deleteMany({
        where: {
          documentId,
          artifactType: {
            in: ['FINAL_PDF', 'THUMBNAIL', 'DOCLING_DEBUG_JSON'],
          },
        },
      });
      await tx.fileArtifact.createMany({
        data: artifactRows,
      });
      const processingDocument = await tx.document.update({
        where: { id: documentId },
        data: {
          pdfPath: pdfArtifact.relativePath,
          thumbnailPath: thumbnailArtifact.relativePath,
          ocrText,
          extractedMarkdown,
          ocrLanguage,
          pageCount,
          failedReason: null,
        },
        select: { autoAiAfterOcr: true },
      });
      const aiQueueResult: { status: DocumentStatus; jobId?: string } =
        processingDocument.autoAiAfterOcr
          ? await this.aiProcessing.createAutomaticMetadataJobAfterOcr(
              tx,
              documentId,
              ocrText,
            )
          : { status: 'READY' };
      const queuedAiJobId = aiQueueResult.jobId;
      const document = await tx.document.update({
        where: { id: documentId },
        data: {
          status: aiQueueResult.status,
        },
        select: {
          tenantId: true,
          title: true,
          originalFileName: true,
          status: true,
        },
      });
      await tx.processingJob.update({
        where: { id: processingJobId },
        data: {
          status: 'COMPLETED',
          finishedAt: new Date(),
          progress: 100,
          errorCode: null,
          errorMessage: null,
        },
      });
      await this.documentHistory.record(
        {
          documentId,
          type: 'OCR_PROCESSING_COMPLETED',
          summary: 'OCR-Verarbeitung wurde erfolgreich abgeschlossen.',
          metadata: {
            jobId: processingJobId,
            status: document.status,
            pageCount,
            aiJobId: queuedAiJobId,
            extractionMode: settings.extractionMode,
          },
        },
        tx,
      );
      return { document, queuedAiJobId };
    });
    const updatedDocument = processingResult.document;
    await this.cleanupSuccessfulProcessingArtifacts(
      documentId,
      cleanupCandidates,
      retainedPaths,
    );
    await this.notifications.publish({
      type: 'ocr.completed',
      severity: 'success',
      title: 'OCR abgeschlossen',
      message: `${documentNotificationTitle(updatedDocument)} ist bereit.`,
      documentId,
      tenantId: updatedDocument.tenantId,
      documentTitle: documentNotificationTitle(updatedDocument),
      jobId: processingJobId,
      status: updatedDocument.status,
    });
    await this.realtimeEvents.documentChanged({
      documentId,
      tenantId: updatedDocument.tenantId,
      jobId: processingJobId,
      status: updatedDocument.status,
      reason: 'OCR_COMPLETED',
    });
    if (processingResult.queuedAiJobId) {
      await this.realtimeEvents.documentChanged({
        documentId,
        tenantId: updatedDocument.tenantId,
        jobId: processingResult.queuedAiJobId,
        status: updatedDocument.status,
        reason: 'AI_QUEUED',
      });
    }
  }

  private async cleanupSuccessfulProcessingArtifacts(
    documentId: string,
    artifacts: CleanupArtifact[],
    retainedPaths: string[],
  ): Promise<void> {
    const retainedPathSet = new Set(retainedPaths);
    const paths = [
      ...new Set(
        artifacts
          .map((artifact) => artifact.path)
          .filter((path) => !retainedPathSet.has(path)),
      ),
    ];

    for (const path of paths) {
      await this.storage.deleteStoredFile(path).catch((error) => {
        this.logger.warn(
          `Failed to delete superseded storage artifact ${path}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      });
    }

    await this.storage
      .deleteDocumentTemporaryFiles(documentId)
      .catch((error) => {
        this.logger.warn(
          `Failed to delete temporary processing files for document ${documentId}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      });
  }

  private async runOcr(
    original: { relativePath: string; absolutePath: string; mimeType: string },
    finalPdf: { relativePath: string; absolutePath: string },
    sidecar: { relativePath: string; absolutePath: string },
    options: { language: string; forceOcr: boolean },
  ): Promise<void> {
    const args = [
      '-l',
      options.language,
      '--jobs',
      String(this.config.ocrJobs),
      '--rotate-pages',
    ];

    if (options.forceOcr) {
      args.push('--force-ocr');
    }

    args.push('--deskew');

    if (this.config.ocrClean) {
      args.push('--clean');
    }

    if (this.config.ocrCleanFinal) {
      args.push('--clean-final');
    }

    args.push(
      '--optimize',
      String(this.config.ocrOptimizeLevel),
      '--tesseract-timeout',
      String(this.config.ocrTesseractTimeoutSeconds),
    );

    if (original.mimeType.startsWith('image/')) {
      args.push('--image-dpi', String(this.config.ocrImageDpi));
    }

    args.push(
      '--sidecar',
      this.runnerPath(sidecar),
      this.runnerPath(original),
      this.runnerPath(finalPdf),
    );

    await this.runProcessingCommand('ocrmypdf', args);
  }

  private async readOcrText(sidecarPath: string): Promise<string> {
    const text = await readFile(sidecarPath, 'utf8').catch(() => '');
    return normalizeOcrText(text);
  }

  private async extractDoclingMarkdown(
    documentId: string,
    finalPdf: { relativePath: string; absolutePath: string },
  ): Promise<ExtractedDoclingMarkdown> {
    if (this.config.doclingEnabled === false) {
      return { markdown: null };
    }

    const markdown = await this.storage.prepareArtifactPath(
      'tmp/processing',
      documentId,
      '.docling.md',
    );
    const debugJson = this.config.doclingDebugJsonEnabled
      ? await this.storage.prepareFinalDocumentArtifactPath(
          'docling-debug',
          documentId,
          '.json',
        )
      : null;
    const outputJsonArgs = debugJson
      ? ['--output-json', this.runnerPath(debugJson)]
      : [];

    try {
      const result = await this.runProcessingCommand(
        'python3',
        [
          this.ocrHelperScriptPath(),
          'extract-docling-markdown',
          '--max-pages',
          String(this.config.doclingMaxPages),
          '--max-file-size',
          String(this.config.doclingMaxFileSizeBytes),
          '--timeout-seconds',
          String(Math.ceil(this.config.doclingTimeoutMs / 1000)),
          ...outputJsonArgs,
          this.runnerPath(finalPdf),
          this.runnerPath(markdown),
        ],
        this.config.doclingTimeoutMs,
      );
      const status = JSON.parse(result.stdout || '{}') as DoclingMarkdownResult;
      const markdownText = await readFile(markdown.absolutePath, 'utf8').catch(
        () => '',
      );
      const normalizedMarkdown = normalizeExtractedMarkdown(markdownText);
      this.logger.log(
        `Docling Markdown extraction completed for document ${documentId}: ${
          normalizedMarkdown?.length ?? 0
        } characters in ${status.elapsedMs ?? 'unknown'} ms.`,
      );
      const debugArtifact =
        debugJson && status.debugJson
          ? await this.storage.describeStoredFile(debugJson.relativePath)
          : undefined;
      return { markdown: normalizedMarkdown, debugArtifact };
    } catch (error) {
      this.logger.warn(
        `Docling Markdown extraction failed for document ${documentId}; continuing with OCR text fallback. error=${errorName(
          error,
        )}`,
      );
      return { markdown: null };
    }
  }

  private async removeBlankPdfPages(
    documentId: string,
    sourcePdf: { relativePath: string; absolutePath: string; mimeType: string },
  ): Promise<{ relativePath: string; absolutePath: string; mimeType: string }> {
    if (sourcePdf.mimeType !== 'application/pdf') {
      return sourcePdf;
    }

    const prunedPdf = await this.storage.prepareArtifactPath(
      'tmp/processing',
      documentId,
      '.blank-pages.pdf',
    );
    const result = await this.runProcessingCommand('python3', [
      this.ocrHelperScriptPath(),
      'remove-blank-pdf-pages',
      this.runnerPath(sourcePdf),
      this.runnerPath(prunedPdf),
    ]);
    const removalResult = JSON.parse(result.stdout) as BlankPageRemovalResult;
    this.logger.log(
      `Blank page analysis for document ${documentId}: ${formatBlankPageRemovalResult(
        removalResult,
      )}`,
    );

    if (removalResult.remainingPages <= 0) {
      throw new Error('PDF contains only empty pages.');
    }

    return removalResult.removedPages.length > 0
      ? { ...prunedPdf, mimeType: 'application/pdf' }
      : sourcePdf;
  }

  private async rotatePdfPages(
    documentId: string,
    sourcePdf: { relativePath: string; absolutePath: string; mimeType: string },
    rotationDegrees: 180,
  ): Promise<{ relativePath: string; absolutePath: string; mimeType: string }> {
    if (sourcePdf.mimeType !== 'application/pdf') {
      throw new Error('Only PDF documents can be rotated.');
    }

    const rotatedPdf = await this.storage.prepareArtifactPath(
      'tmp/processing',
      documentId,
      '.rotated.pdf',
    );
    await this.runProcessingCommand('python3', [
      this.ocrHelperScriptPath(),
      'rotate-pdf-pages',
      '--degrees',
      String(rotationDegrees),
      this.runnerPath(sourcePdf),
      this.runnerPath(rotatedPdf),
    ]);

    return { ...rotatedPdf, mimeType: 'application/pdf' };
  }

  private async runThumbnail(
    finalPdf: { relativePath: string; absolutePath: string },
    thumbnail: { relativePath: string; absolutePath: string },
  ): Promise<void> {
    await this.runProcessingCommand('gs', [
      '-dSAFER',
      '-dBATCH',
      '-dNOPAUSE',
      '-sDEVICE=jpeg',
      '-dFirstPage=1',
      '-dLastPage=1',
      `-r${this.config.thumbnailDpi}`,
      `-dJPEGQ=${this.config.thumbnailJpegQuality}`,
      `-sOutputFile=${this.runnerPath(thumbnail)}`,
      this.runnerPath(finalPdf),
    ]);
  }

  private async runProcessingCommand(
    command: OcrCommand,
    args: string[],
    timeoutMs = this.config.ocrTimeoutMs,
  ) {
    return this.ocrCommands.run(command, args, {
      timeoutMs,
    });
  }

  private fileArtifactPath(artifact: FileArtifact): {
    relativePath: string;
    absolutePath: string;
    mimeType: string;
  } {
    return {
      relativePath: artifact.path,
      absolutePath: this.storage.resolveRelativePath(artifact.path),
      mimeType: artifact.mimeType,
    };
  }

  private async analyzeTextLayer(original: {
    relativePath: string;
    absolutePath: string;
    mimeType: string;
  }): Promise<PdfTextLayerAnalysis | null> {
    if (original.mimeType !== 'application/pdf') {
      return null;
    }

    try {
      const [firstPageText, fullText] = await Promise.all([
        this.extractPdfText(original, 'first'),
        this.extractPdfText(original, 'all'),
      ]);
      const normalizedFirstPageText = normalizeOcrText(firstPageText);
      const normalizedFullText = normalizeOcrText(fullText);
      const fullTextLength = nonWhitespaceLength(normalizedFullText);

      return {
        firstPageText: normalizedFirstPageText,
        fullText: normalizedFullText,
        hasUsableTextLayer: fullTextLength >= EXISTING_TEXT_LAYER_MIN_CHARS,
      };
    } catch (error) {
      this.logger.warn(
        `Failed to inspect PDF text layer: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return null;
    }
  }

  private async extractPdfText(
    original: { relativePath: string; absolutePath: string },
    pages: 'first' | 'all',
  ): Promise<string> {
    const result = await this.runProcessingCommand('python3', [
      this.ocrHelperScriptPath(),
      'extract-pdf-text',
      '--pages',
      pages,
      this.runnerPath(original),
    ]);
    return result.stdout;
  }

  private async countPdfPages(pdf: {
    relativePath: string;
    absolutePath: string;
  }): Promise<number | null> {
    try {
      const result = await this.runProcessingCommand('python3', [
        this.ocrHelperScriptPath(),
        'count-pdf-pages',
        this.runnerPath(pdf),
      ]);
      const pageCount = Number.parseInt(result.stdout.trim(), 10);
      return Number.isInteger(pageCount) && pageCount > 0 ? pageCount : null;
    } catch (error) {
      this.logger.warn(
        `Failed to count PDF pages: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return null;
    }
  }

  private async detectOcrLanguageFromProbe(
    documentId: string,
    original: { relativePath: string; absolutePath: string; mimeType: string },
    options: { forceOcr: boolean } = { forceOcr: false },
  ): Promise<OcrLanguageSelection> {
    const sidecar = await this.storage.prepareArtifactPath(
      'tmp/processing',
      documentId,
      '.probe.txt',
    );
    const args = [
      '-l',
      OCR_LANGUAGE_CANDIDATES,
      '--jobs',
      '1',
      '--output-type',
      'none',
      '--tesseract-timeout',
      String(this.config.ocrTesseractTimeoutSeconds),
      '--sidecar',
      this.runnerPath(sidecar),
    ];

    if (options.forceOcr) {
      args.push('--force-ocr');
    }

    if (original.mimeType === 'application/pdf') {
      args.push('--pages', '1');
    }

    args.push(this.runnerPath(original), '-');

    try {
      await this.runProcessingCommand('ocrmypdf', args);
      const text = await readFile(sidecar.absolutePath, 'utf8').catch(() => '');
      return this.detectOcrLanguage(documentId, text);
    } catch (error) {
      this.logger.warn(
        `Failed to run OCR language probe: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return fallbackOcrLanguageSelection();
    }
  }

  private async detectOcrLanguage(
    documentId: string,
    text: string,
  ): Promise<OcrLanguageSelection> {
    const normalizedText = normalizeOcrText(text);
    if (nonWhitespaceLength(normalizedText) < LANGUAGE_SAMPLE_MIN_CHARS) {
      return fallbackOcrLanguageSelection();
    }

    const sample = await this.storage.prepareArtifactPath(
      'tmp/processing',
      documentId,
      '.language-sample.txt',
    );
    await writeFile(sample.absolutePath, normalizedText, 'utf8');

    try {
      const result = await this.runProcessingCommand('python3', [
        this.ocrHelperScriptPath(),
        'detect-language',
        this.runnerPath(sample),
      ]);
      return languageSelectionOrFallback(result.stdout);
    } catch (error) {
      this.logger.warn(
        `Failed to detect OCR language: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return fallbackOcrLanguageSelection();
    }
  }

  private ocrHelperScriptPath(): string {
    return this.ocrCommands.helperScriptPath;
  }

  private runnerPath(path: { relativePath: string }): string {
    return this.ocrCommands.storagePath(path);
  }

  private async updateProgress(
    processingJobId: string,
    progress: number,
  ): Promise<void> {
    await this.prisma.processingJob.update({
      where: { id: processingJobId },
      data: { progress },
    });
  }
}

function documentNotificationTitle(document: {
  readonly title: string | null;
  readonly originalFileName: string;
}): string {
  return document.title?.trim() || document.originalFileName;
}

function languageSelectionOrFallback(stdout: string): OcrLanguageSelection {
  const detected = JSON.parse(stdout) as LanguageDetectionResult;
  const language = detected.tesseractLanguage;
  const languageName = ocrLanguageNameForCode(language);
  const confidence = detected.confidence ?? 0;
  const margin = detected.margin ?? 0;

  if (
    !language ||
    !languageName ||
    !OCR_SINGLE_LANGUAGES.has(language) ||
    confidence < LANGUAGE_MIN_CONFIDENCE ||
    margin < LANGUAGE_MIN_MARGIN
  ) {
    return fallbackOcrLanguageSelection();
  }

  return {
    ocrRunLanguage: language,
    detectedLanguage: languageName,
  };
}

function fallbackOcrLanguageSelection(): OcrLanguageSelection {
  return {
    ocrRunLanguage: OCR_LANGUAGE_FALLBACK,
    detectedLanguage: null,
  };
}

function nonWhitespaceLength(text: string): number {
  return text.replace(/\s/g, '').length;
}

function normalizeExtractedMarkdown(markdown: string): string | null {
  const normalized = markdown
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim();
  return normalized ? normalized : null;
}

function errorName(error: unknown): string {
  return error instanceof Error ? error.name : typeof error;
}

function formatBlankPageRemovalResult(result: BlankPageRemovalResult): string {
  const summary = `total=${result.totalPages}, removed=[${
    result.removedPages.join(',') || '-'
  }], kept=[${result.keptPages.join(',') || '-'}]`;
  const pageReasons = (result.pages ?? [])
    .map(
      (page) =>
        `${page.page}:${page.decision}/${page.reason}` +
        `(text=${page.textLength},tokens=${page.textTokenCount ?? 0},` +
        `bg=${page.backgroundValue ?? 'n/a'},fg=${page.foregroundRatio},` +
        `components=${page.componentCount},largest=${page.largestComponentArea})`,
    )
    .join('; ');

  return pageReasons ? `${summary}; pages=${pageReasons}` : summary;
}
