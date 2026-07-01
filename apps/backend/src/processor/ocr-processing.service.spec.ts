import { expectStringContaining } from '../testing/expect-matchers';
import {
  expectAny,
  expectArrayContaining,
  expectObjectContaining,
} from '../testing/expect-matchers';
import { mkdtemp, mkdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { OcrProcessingService } from './ocr-processing.service';

const documentId = 'document-id';
const processingJobId = 'job-id';
const longGermanText =
  'Dies ist ein deutscher Beispieltext mit ausreichend vielen Zeichen fuer die OCR Sprachenerkennung. '.repeat(
    4,
  );
const longEnglishText =
  'This is an English sample text with enough content to make language detection reliable. '.repeat(
    4,
  );

describe('OcrProcessingService', () => {
  let storageRoot: string;

  beforeEach(async () => {
    storageRoot = await mkdtemp(join(tmpdir(), 'smart-dms-ocr-'));
    await writeOriginal('input.pdf', 'original pdf');
  });

  afterEach(async () => {
    await rm(storageRoot, { recursive: true, force: true });
  });

  it('keeps an existing text layer when reprocessing existing text is disabled', async () => {
    const { commandRunner, service, tx } = createService({
      settings: { ocrReprocessExistingTextLayer: false },
      extractedFirstPageText: longGermanText,
      extractedFullText: `${longGermanText}\nVolltext aus dem vorhandenen Layer.`,
    });

    await service.processDocument(documentId, processingJobId);

    expect(commandRunner.run).not.toHaveBeenCalledWith(
      'ocrmypdf',
      expectAny(Array),
      expectAny(Object),
    );
    expect(commandRunner.run).toHaveBeenCalledWith(
      'gs',
      expectArrayContaining(['-sDEVICE=jpeg']),
      { timeoutMs: 1800000 },
    );
    expect(tx.document.update).toHaveBeenCalledWith(
      expectObjectContaining({
        data: expectObjectContaining({
          pdfPath: 'pdfs/document-id.pdf',
          thumbnailPath: 'thumbnails/document-id.jpg',
          ocrText: expectStringContaining(
            'Volltext aus dem vorhandenen Layer.',
          ),
          ocrLanguage: 'german',
          pageCount: 3,
        }),
      }),
    );
    expect(tx.document.update).toHaveBeenCalledWith(
      expectObjectContaining({
        data: expectObjectContaining({
          status: 'READY',
        }),
      }),
    );
  });

  it('reprocesses an existing text layer when reprocessing existing text is enabled', async () => {
    const { commandRunner, service, tx } = createService({
      settings: { ocrReprocessExistingTextLayer: true },
      extractedFirstPageText: longGermanText,
      extractedFullText: `${longGermanText}\nVolltext aus dem vorhandenen Layer.`,
      probeText: longGermanText,
      ocrCleanFinal: true,
    });

    await service.processDocument(documentId, processingJobId);

    expect(commandRunner.run).not.toHaveBeenCalledWith(
      'python3',
      expectArrayContaining(['extract-pdf-text']),
      expectAny(Object),
    );
    const ocrCalls = commandRunner.run.mock.calls.filter(
      ([command]) => command === 'ocrmypdf',
    );
    expect(ocrCalls).toHaveLength(2);
    expect(ocrCalls[0][1]).toEqual(
      expectArrayContaining(['--output-type', 'none', '--force-ocr']),
    );
    expect(ocrCalls[1][1]).toEqual(
      expectArrayContaining(['--force-ocr', '--clean-final']),
    );
    expect(ocrCalls[0][1]).not.toContain('--tesseract-non-ocr-timeout');
    expect(ocrCalls[1][1]).not.toContain('--tesseract-non-ocr-timeout');
    expect(tx.document.update).toHaveBeenCalledWith(
      expectObjectContaining({
        data: expectObjectContaining({
          ocrText: expectStringContaining('Vollstaendig erkannter OCR Text.'),
        }),
      }),
    );
  });

  it('sets the document to AI_PENDING when OCR queues AI metadata extraction', async () => {
    const { aiProcessing, service, tx } = createService({
      settings: { ocrReprocessExistingTextLayer: false },
      extractedFirstPageText: longGermanText,
      extractedFullText: longGermanText,
    });
    aiProcessing.createAutomaticMetadataJobAfterOcr.mockResolvedValue({
      status: 'AI_PENDING',
      jobId: 'ai-job-id',
    });

    await service.processDocument(documentId, processingJobId);

    expect(tx.document.update).toHaveBeenCalledWith(
      expectObjectContaining({
        data: expectObjectContaining({
          status: 'AI_PENDING',
        }),
      }),
    );
  });

  it('stores extracted Docling Markdown when available', async () => {
    const { service, tx } = createService({
      settings: { ocrReprocessExistingTextLayer: false },
      extractedFirstPageText: longGermanText,
      extractedFullText: longGermanText,
      doclingMarkdown:
        '# Rechnung\n\n| Nr | Betrag |\n| --- | --- |\n| R-100 | 42,00 EUR |',
    });

    await service.processDocument(documentId, processingJobId);

    expect(tx.document.update).toHaveBeenCalledWith(
      expectObjectContaining({
        data: expectObjectContaining({
          extractedMarkdown: expectStringContaining('| Nr | Betrag |'),
        }),
      }),
    );
  });

  it('continues OCR processing when Docling Markdown extraction fails', async () => {
    const { service, tx } = createService({
      settings: { ocrReprocessExistingTextLayer: false },
      extractedFirstPageText: longGermanText,
      extractedFullText: longGermanText,
      doclingFails: true,
    });

    await service.processDocument(documentId, processingJobId);

    expect(tx.document.update).toHaveBeenCalledWith(
      expectObjectContaining({
        data: expectObjectContaining({
          ocrText: expectStringContaining(longGermanText.slice(0, 20)),
          extractedMarkdown: null,
        }),
      }),
    );
  });

  it('stores Docling debug JSON as an optional artifact', async () => {
    const { service, storage, tx } = createService({
      settings: { ocrReprocessExistingTextLayer: false },
      extractedFirstPageText: longGermanText,
      extractedFullText: longGermanText,
      doclingMarkdown: '# Rechnung',
      doclingDebugJson: true,
    });

    await service.processDocument(documentId, processingJobId);

    expect(tx.fileArtifact.createMany).toHaveBeenCalledWith({
      data: expectArrayContaining([
        expectObjectContaining({
          artifactType: 'DOCLING_DEBUG_JSON',
          path: 'docling-debug/document-id.json',
          mimeType: 'application/json',
        }),
      ]),
    });
    expect(storage.deleteStoredFile).not.toHaveBeenCalledWith(
      'docling-debug/document-id.json',
    );
  });

  it('passes Docling debug JSON output before input and markdown paths', async () => {
    const { commandRunner, service } = createService({
      settings: { ocrReprocessExistingTextLayer: false },
      extractedFirstPageText: longGermanText,
      extractedFullText: longGermanText,
      doclingDebugJson: true,
    });

    await service.processDocument(documentId, processingJobId);

    const doclingCall = commandRunner.run.mock.calls.find(
      ([command, args]) =>
        command === 'python3' && args.includes('extract-docling-markdown'),
    );
    expect(doclingCall?.[1]).toEqual(
      expectArrayContaining([
        '--output-json',
        expectStringContaining('docling-debug/document-id.json'),
      ]),
    );
    expect((doclingCall?.[1] as string[]).at(-2)).toContain(
      'pdfs/document-id.pdf',
    );
    expect((doclingCall?.[1] as string[]).at(-1)).toContain('.docling.md');
  });

  it('skips automatic AI metadata extraction when the document disables it', async () => {
    const { aiProcessing, service, tx } = createService({
      settings: { ocrReprocessExistingTextLayer: false },
      extractedFirstPageText: longGermanText,
      extractedFullText: longGermanText,
    });
    tx.document.update.mockImplementationOnce(() => ({
      autoAiAfterOcr: false,
    }));

    await service.processDocument(documentId, processingJobId);

    expect(
      aiProcessing.createAutomaticMetadataJobAfterOcr,
    ).not.toHaveBeenCalled();
    expect(tx.document.update).toHaveBeenCalledWith(
      expectObjectContaining({
        data: expectObjectContaining({
          status: 'READY',
        }),
      }),
    );
  });

  it('keeps original and removes derived temporary artifacts after successful processing', async () => {
    const { service, storage, tx } = createService({
      settings: { ocrReprocessExistingTextLayer: false },
      extractedFirstPageText: longGermanText,
      extractedFullText: longGermanText,
    });

    await service.processDocument(documentId, processingJobId);

    expect(tx.fileArtifact.deleteMany).toHaveBeenCalledWith({
      where: {
        documentId,
        artifactType: {
          in: ['FINAL_PDF', 'THUMBNAIL', 'DOCLING_DEBUG_JSON'],
        },
      },
    });
    expect(storage.deleteStoredFile).not.toHaveBeenCalledWith(
      'originals/document-id/input.pdf',
    );
    expect(storage.deleteStoredFile).toHaveBeenCalledWith(
      'pdfs/document-id-old.pdf',
    );
    expect(storage.deleteStoredFile).toHaveBeenCalledWith(
      'thumbnails/document-id-old.jpg',
    );
    expect(storage.deleteDocumentTemporaryFiles).toHaveBeenCalledWith(
      documentId,
    );
  });

  it('uses the original source when a current final PDF also exists', async () => {
    const { commandRunner, prisma, service, storage } = createService({
      settings: { ocrReprocessExistingTextLayer: false },
      extractedFirstPageText: longGermanText,
      extractedFullText: longGermanText,
    });
    await writeStorageFile('pdfs/document-id.pdf', 'current pdf');
    prisma.fileArtifact.findMany.mockResolvedValueOnce([
      {
        artifactType: 'FINAL_PDF',
        path: 'pdfs/document-id.pdf',
      },
    ]);

    await service.processDocument(documentId, processingJobId);

    expect(prisma.fileArtifact.findFirst).toHaveBeenCalledTimes(1);
    expect(prisma.fileArtifact.findFirst).toHaveBeenCalledWith({
      where: {
        documentId,
        artifactType: 'ORIGINAL',
      },
      orderBy: { createdAt: 'asc' },
    });
    expect(commandRunner.run).toHaveBeenCalledWith(
      'python3',
      expectArrayContaining([
        'extract-pdf-text',
        expectStringContaining('originals/document-id/input.pdf'),
      ]),
      expectAny(Object),
    );
    expect(storage.replaceStoredFile).not.toHaveBeenCalled();
    expect(storage.deleteStoredFile).not.toHaveBeenCalledWith(
      'pdfs/document-id.pdf',
    );
  });

  it('fails when the original artifact is missing instead of using the final PDF fallback', async () => {
    const { commandRunner, prisma, service } = createService({
      settings: { ocrReprocessExistingTextLayer: false },
      extractedFirstPageText: longGermanText,
      extractedFullText: longGermanText,
    });
    prisma.fileArtifact.findFirst.mockResolvedValueOnce(null);

    await expect(
      service.processDocument(documentId, processingJobId),
    ).rejects.toThrow('Document original artifact is missing.');

    expect(prisma.fileArtifact.findMany).not.toHaveBeenCalled();
    expect(commandRunner.run).not.toHaveBeenCalled();
  });

  it('runs a page-one probe before full OCR when no text layer is usable', async () => {
    const { commandRunner, service, tx } = createService({
      settings: { ocrReprocessExistingTextLayer: false },
      extractedFirstPageText: '',
      extractedFullText: '',
      probeText: longEnglishText,
      detectedLanguage: {
        tesseractLanguage: 'eng',
        confidence: 0.93,
        margin: 0.35,
      },
    });

    await service.processDocument(documentId, processingJobId);

    const ocrCalls = commandRunner.run.mock.calls.filter(
      ([command]) => command === 'ocrmypdf',
    );
    expect(ocrCalls).toHaveLength(2);
    expect(ocrCalls[0][1]).toEqual(
      expectArrayContaining([
        '-l',
        'deu+eng+fra+spa+por+chi_sim',
        '--output-type',
        'none',
        '--tesseract-timeout',
        '--pages',
        '1',
      ]),
    );
    expect(ocrCalls[0][1]).not.toContain('--tesseract-non-ocr-timeout');
    expect(ocrCalls[1][1]).toEqual(expectArrayContaining(['-l', 'eng']));
    expect(ocrCalls[1][1]).not.toContain('--force-ocr');
    expect(ocrCalls[1][1]).not.toContain('--tesseract-non-ocr-timeout');
    expect(ocrCalls[1][1]).toEqual(expectArrayContaining(['--deskew']));
    expect(tx.document.update).toHaveBeenCalledWith(
      expectObjectContaining({
        data: expectObjectContaining({
          ocrLanguage: 'english',
        }),
      }),
    );
  });

  it('rotates PDF pages before OCR and forces OCR after rotation', async () => {
    const { commandRunner, service } = createService({
      settings: { ocrReprocessExistingTextLayer: false },
      extractedFirstPageText: longGermanText,
      extractedFullText: longGermanText,
      probeText: longEnglishText,
      detectedLanguage: {
        tesseractLanguage: 'eng',
        confidence: 0.93,
        margin: 0.35,
      },
    });

    await service.processDocument(documentId, processingJobId, {
      rotationDegrees: 180,
      forceOcr: true,
    });

    const rotateCallIndex = commandRunner.run.mock.calls.findIndex(
      ([command, args]) =>
        command === 'python3' && args[1] === 'rotate-pdf-pages',
    );
    const fullOcrCallIndex = commandRunner.run.mock.calls.findIndex(
      ([command, args]) =>
        command === 'ocrmypdf' && !args.includes('--output-type'),
    );
    const fullOcrCall = commandRunner.run.mock.calls[fullOcrCallIndex];
    expect(rotateCallIndex).toBeGreaterThanOrEqual(0);
    expect(fullOcrCallIndex).toBeGreaterThan(rotateCallIndex);
    expect(commandRunner.run).not.toHaveBeenCalledWith(
      'python3',
      expectArrayContaining(['extract-pdf-text']),
      expectAny(Object),
    );
    expect(fullOcrCall?.[1]).toEqual(expectArrayContaining(['--force-ocr']));
    expect(fullOcrCall?.[1]).toEqual(
      expectArrayContaining([expectStringContaining('.rotated.pdf')]),
    );
  });

  it('uses the fallback OCR language when language detection is not clear', async () => {
    const { commandRunner, service, tx } = createService({
      settings: { ocrReprocessExistingTextLayer: true },
      extractedFirstPageText: '',
      extractedFullText: '',
      probeText: longGermanText,
      detectedLanguage: {
        tesseractLanguage: 'deu',
        confidence: 0.4,
        margin: 0.01,
      },
    });

    await service.processDocument(documentId, processingJobId);

    const ocrCall = commandRunner.run.mock.calls.find(
      ([command, args]) =>
        command === 'ocrmypdf' && !args.includes('--output-type'),
    );
    expect(ocrCall?.[1]).toEqual(expectArrayContaining(['-l', 'deu+eng']));
    expect(tx.document.update).toHaveBeenCalledWith(
      expectObjectContaining({
        data: expectObjectContaining({
          ocrLanguage: null,
        }),
      }),
    );
  });

  it('removes blank pages before text inspection and thumbnailing when enabled', async () => {
    const { commandRunner, service, tx } = createService({
      settings: {
        ocrReprocessExistingTextLayer: false,
        pdfRemoveBlankPages: true,
      },
      extractedFirstPageText: longGermanText,
      extractedFullText: longGermanText,
      blankPageRemoval: {
        totalPages: 3,
        removedPages: [2],
        keptPages: [1, 3],
        remainingPages: 2,
      },
      pageCount: 2,
    });

    await service.processDocument(documentId, processingJobId);

    const removeBlankPagesCallIndex = commandRunner.run.mock.calls.findIndex(
      ([command, args]) =>
        command === 'python3' && args[1] === 'remove-blank-pdf-pages',
    );
    const extractTextCallIndex = commandRunner.run.mock.calls.findIndex(
      ([command, args]) =>
        command === 'python3' && args[1] === 'extract-pdf-text',
    );
    const thumbnailCallIndex = commandRunner.run.mock.calls.findIndex(
      ([command]) => command === 'gs',
    );
    expect(removeBlankPagesCallIndex).toBeGreaterThanOrEqual(0);
    expect(extractTextCallIndex).toBeGreaterThan(removeBlankPagesCallIndex);
    expect(thumbnailCallIndex).toBeGreaterThan(removeBlankPagesCallIndex);
    expect(tx.document.update).toHaveBeenCalledWith(
      expectObjectContaining({
        data: expectObjectContaining({
          pageCount: 2,
        }),
      }),
    );
  });

  it('runs OCR against the pruned source when blank pages were removed', async () => {
    const { commandRunner, service } = createService({
      settings: {
        ocrReprocessExistingTextLayer: false,
        pdfRemoveBlankPages: true,
      },
      extractedFirstPageText: '',
      extractedFullText: '',
      blankPageRemoval: {
        totalPages: 3,
        removedPages: [2],
        keptPages: [1, 3],
        remainingPages: 2,
      },
      probeText: longEnglishText,
      detectedLanguage: {
        tesseractLanguage: 'eng',
        confidence: 0.93,
        margin: 0.35,
      },
      pageCount: 2,
    });

    await service.processDocument(documentId, processingJobId);

    const fullOcrCall = commandRunner.run.mock.calls.find(
      ([command, args]) =>
        command === 'ocrmypdf' && !args.includes('--output-type'),
    );
    expect(fullOcrCall?.[1]).toEqual(
      expectArrayContaining([
        expectStringContaining('artifact-1.blank-pages.pdf'),
      ]),
    );
  });

  it('fails processing when blank page removal leaves no pages', async () => {
    const { commandRunner, prisma, service } = createService({
      settings: {
        ocrReprocessExistingTextLayer: false,
        pdfRemoveBlankPages: true,
      },
      extractedFirstPageText: '',
      extractedFullText: '',
      blankPageRemoval: {
        totalPages: 1,
        removedPages: [1],
        keptPages: [],
        remainingPages: 0,
      },
    });

    await expect(
      service.processDocument(documentId, processingJobId),
    ).rejects.toThrow('PDF contains only empty pages.');
    expect(commandRunner.run).not.toHaveBeenCalledWith(
      'gs',
      expectAny(Array),
      expectAny(Object),
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  function createService(options: {
    settings: {
      ocrReprocessExistingTextLayer: boolean;
      pdfRemoveBlankPages?: boolean;
    };
    extractedFirstPageText: string;
    extractedFullText: string;
    blankPageRemoval?: {
      totalPages: number;
      removedPages: number[];
      keptPages: number[];
      remainingPages: number;
    };
    detectedLanguage?: {
      tesseractLanguage: string;
      confidence: number;
      margin: number;
    };
    pageCount?: number;
    probeText?: string;
    ocrCleanFinal?: boolean;
    doclingMarkdown?: string;
    doclingFails?: boolean;
    doclingDebugJson?: boolean;
  }) {
    const tx = {
      fileArtifact: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        createMany: jest.fn().mockResolvedValue({ count: 2 }),
      },
      document: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          autoAiAfterOcr: true,
        }),
        update: jest.fn(
          (args: {
            select?: { autoAiAfterOcr?: boolean };
            data?: { status?: string };
          }) => {
            if (args.select?.autoAiAfterOcr) {
              return { autoAiAfterOcr: true };
            }

            return {
              tenantId: 'tenant-id',
              title: 'Input document',
              originalFileName: 'input.pdf',
              status: args.data?.status ?? 'READY',
            };
          },
        ),
      },
      processingJob: {
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const prisma = {
      fileArtifact: {
        findFirst: jest.fn().mockResolvedValue({
          path: 'originals/document-id/input.pdf',
          mimeType: 'application/pdf',
        }),
        findMany: jest.fn().mockResolvedValue([
          {
            artifactType: 'FINAL_PDF',
            path: 'pdfs/document-id-old.pdf',
          },
          {
            artifactType: 'THUMBNAIL',
            path: 'thumbnails/document-id-old.jpg',
          },
        ]),
      },
      processingJob: {
        update: jest.fn().mockResolvedValue({}),
      },
      $transaction: jest.fn(
        <TResult>(callback: (transaction: typeof tx) => TResult) =>
          callback(tx),
      ),
    };
    let artifactCounter = 0;
    const storage = {
      root: storageRoot,
      prepareArtifactPath: jest.fn(
        async (area: string, id: string, extension: string) => {
          const relativePath = `${area}/${id}/artifact-${artifactCounter}${extension}`;
          artifactCounter += 1;
          const absolutePath = join(storageRoot, relativePath);
          await mkdir(dirname(absolutePath), { recursive: true });
          return { relativePath, absolutePath };
        },
      ),
      prepareFinalDocumentArtifactPath: jest.fn(
        async (area: string, id: string, extension: string) => {
          const relativePath = `${area}/${id}${extension}`;
          const absolutePath = join(storageRoot, relativePath);
          await mkdir(dirname(absolutePath), { recursive: true });
          return { relativePath, absolutePath };
        },
      ),
      replaceStoredFile: jest.fn(
        async (sourceRelativePath: string, destinationRelativePath: string) => {
          const sourcePath = join(storageRoot, sourceRelativePath);
          const destinationPath = join(storageRoot, destinationRelativePath);
          await mkdir(dirname(destinationPath), { recursive: true });
          await rm(destinationPath, { force: true });
          await rename(sourcePath, destinationPath);
        },
      ),
      resolveRelativePath: jest.fn((relativePath: string) =>
        join(storageRoot, relativePath),
      ),
      toContainerPath: jest.fn(
        (relativePath: string, root: string) => `${root}/${relativePath}`,
      ),
      describeStoredFile: jest.fn(async (relativePath: string) => {
        const absolutePath = join(storageRoot, relativePath);
        const fileStat = await stat(absolutePath);
        return {
          relativePath,
          absolutePath,
          size: fileStat.size,
          checksum: 'checksum',
        };
      }),
      deleteStoredFile: jest.fn().mockResolvedValue(undefined),
      deleteDocumentTemporaryFiles: jest.fn().mockResolvedValue(undefined),
    };
    const commandRunner = {
      run: jest.fn(async (command: string, args: string[]) => {
        if (command === 'python3' && args[1] === 'extract-pdf-text') {
          return {
            exitCode: 0,
            stdout:
              args[3] === 'first'
                ? options.extractedFirstPageText
                : options.extractedFullText,
            stderr: '',
          };
        }

        if (command === 'python3' && args[1] === 'count-pdf-pages') {
          return {
            exitCode: 0,
            stdout: `${options.pageCount ?? 3}\n`,
            stderr: '',
          };
        }

        if (command === 'python3' && args[1] === 'remove-blank-pdf-pages') {
          const removal = options.blankPageRemoval ?? {
            totalPages: options.pageCount ?? 3,
            removedPages: [],
            keptPages: [1, 2, 3],
            remainingPages: options.pageCount ?? 3,
          };
          if (removal.remainingPages > 0) {
            await writeFile(args[3], 'pruned pdf', 'utf8');
          }

          return {
            exitCode: 0,
            stdout: JSON.stringify(removal),
            stderr: '',
          };
        }

        if (command === 'python3' && args[1] === 'rotate-pdf-pages') {
          await writeFile(args[5], 'rotated pdf', 'utf8');
          return { exitCode: 0, stdout: '', stderr: '' };
        }

        if (command === 'python3' && args[1] === 'detect-language') {
          return {
            exitCode: 0,
            stdout: JSON.stringify(
              options.detectedLanguage ?? {
                tesseractLanguage: 'deu',
                confidence: 0.95,
                margin: 0.4,
              },
            ),
            stderr: '',
          };
        }

        if (command === 'python3' && args[1] === 'extract-docling-markdown') {
          if (options.doclingFails) {
            throw new Error('docling failed');
          }
          const outputJsonIndex = args.indexOf('--output-json') + 1;
          if (outputJsonIndex > 0) {
            await writeFile(
              args[outputJsonIndex],
              JSON.stringify({ texts: [{ label: 'PAGE_FOOTER' }] }),
              'utf8',
            );
          }
          await writeFile(
            args[args.length - 1],
            options.doclingMarkdown ?? '',
            'utf8',
          );
          return {
            exitCode: 0,
            stdout: JSON.stringify({
              markdownCharacters: options.doclingMarkdown?.length ?? 0,
              debugJson: outputJsonIndex > 0,
              elapsedMs: 25,
            }),
            stderr: '',
          };
        }

        if (command === 'ocrmypdf') {
          const sidecarIndex = args.indexOf('--sidecar') + 1;
          if (sidecarIndex > 0) {
            await writeFile(
              args[sidecarIndex],
              args.includes('--output-type')
                ? (options.probeText ?? '')
                : 'Vollstaendig erkannter OCR Text.',
              'utf8',
            );
          }
          const outputPath = args[args.length - 1];
          if (outputPath !== '-') {
            await writeFile(outputPath, 'pdf', 'utf8');
          }
        }

        if (command === 'gs') {
          const outputArg = args.find((arg) => arg.startsWith('-sOutputFile='));
          await writeFile(outputArg?.replace('-sOutputFile=', '') ?? '', 'jpg');
        }

        return { exitCode: 0, stdout: '', stderr: '' };
      }),
    };
    const config = {
      ocrDockerImage: 'smart-dms/ocr-runtime:latest',
      ocrImageDpi: 600,
      ocrClean: true,
      ocrCleanFinal: options.ocrCleanFinal ?? false,
      ocrOptimizeLevel: 1,
      ocrJobs: 2,
      ocrTimeoutMs: 1800000,
      ocrTesseractTimeoutSeconds: 30,
      ocrTesseractNonOcrTimeoutSeconds: 10,
      ocrStorageContainerRoot: '/data',
      doclingEnabled: true,
      doclingTimeoutMs: 600000,
      doclingMaxPages: 200,
      doclingMaxFileSizeBytes: 104857600,
      doclingDebugJsonEnabled: options.doclingDebugJson ?? false,
      thumbnailDpi: 144,
      thumbnailJpegQuality: 85,
    };
    const ocrCommands = {
      helperScriptPath: '/usr/local/bin/smart-dms-ocr-helper',
      storagePath: jest.fn((path: { relativePath: string }) =>
        join(storageRoot, path.relativePath),
      ),
      run: commandRunner.run,
    };
    const notifications = {
      publish: jest.fn().mockResolvedValue(undefined),
    };
    const realtimeEvents = {
      documentChanged: jest.fn().mockResolvedValue(undefined),
    };
    const documentHistory = {
      record: jest.fn().mockResolvedValue(undefined),
    };
    const settings = {
      getSettings: jest.fn().mockResolvedValue({
        pdfRemoveBlankPages: false,
        extractionMode: 'fast',
        ...options.settings,
      }),
    };
    const aiProcessing = {
      createAutomaticMetadataJobAfterOcr: jest
        .fn()
        .mockResolvedValue({ status: 'READY' }),
    };
    const service = new OcrProcessingService(
      config as never,
      prisma as never,
      storage as never,
      ocrCommands as never,
      realtimeEvents as never,
      notifications as never,
      documentHistory as never,
      settings as never,
      aiProcessing as never,
    );

    return {
      aiProcessing,
      commandRunner,
      prisma,
      realtimeEvents,
      service,
      storage,
      tx,
    };
  }

  async function writeOriginal(
    fileName: string,
    content: string,
  ): Promise<void> {
    await writeStorageFile(join('originals', documentId, fileName), content);
  }

  async function writeStorageFile(
    relativePath: string,
    content: string,
  ): Promise<void> {
    const path = join(storageRoot, relativePath);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content, 'utf8');
  }
});
