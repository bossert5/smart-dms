import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type {
  AiMetadataExtractionJobPayload,
  AiMetadataLanguage,
  AiMetadataPromptScope,
  DocumentStatus,
  TriggerBulkAiProcessingResponse,
  TriggerDocumentAiProcessingResponse,
} from '@smart-dms/shared-dto';
import { DocumentHistoryService } from '../document-history/document-history.service';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeEventsService } from '../realtime/realtime-events.service';
import { RealtimeNotificationsService } from '../realtime/realtime-notifications.service';
import {
  AI_METADATA_LANGUAGE_KEY,
  DEFAULT_AI_METADATA_LANGUAGE,
} from '../settings/settings.service';
import { AiProviderRouter } from '../ai-providers/ai-provider-router.service';
import {
  AiMetadataPromptBuilder,
  type AiOptimizedPromptStep,
  type AiMetadataTextChunk,
} from './ai-metadata-prompt.builder';
import {
  type AiMetadataEvidencePack,
  type AiOcrPreprocessingResult,
  type AiPromptSourceTextKind,
} from './ai-metadata-evidence';
import { AiMetadataEvidenceExtractor } from './ai-metadata-evidence.extractor';
import { AiOcrTextPreprocessor } from './ai-ocr-text-preprocessor';
import { AiPromptPlanner } from './ai-prompt-planner';
import { AiService } from './ai.service';
import { ACTIVE_AI_JOB_STATUSES, AI_METADATA_JOB_TYPE } from './ai-job-types';

const AI_JOB_TYPE = AI_METADATA_JOB_TYPE;
const OCR_CHARS_PER_ESTIMATED_TOKEN = 3;
const DIRECT_OCR_TOKEN_LIMIT = 24000;
const TARGET_CHUNK_TOKEN_LIMIT = 18000;
const DIRECT_OCR_CHAR_LIMIT =
  DIRECT_OCR_TOKEN_LIMIT * OCR_CHARS_PER_ESTIMATED_TOKEN;
const TARGET_CHUNK_CHARS =
  TARGET_CHUNK_TOKEN_LIMIT * OCR_CHARS_PER_ESTIMATED_TOKEN;
const HARD_CHUNK_CHAR_LIMIT = DIRECT_OCR_CHAR_LIMIT;
const MAX_TOKENS_BY_PROMPT_KEY: Record<string, number> = {
  CORE_METADATA: 3200,
  TITLE: 1200,
  DOCUMENT_TYPE: 1200,
  SUMMARY: 1800,
  TAGS: 1600,
  PARTIES: 1800,
  DOCUMENT_DATE: 1200,
  PAYMENTS: 2400,
  REFERENCES: 2000,
  ATTRIBUTES: 2000,
  CALENDAR_EVENTS: 3200,
  MERGE_METADATA: 6500,
};
const FREE_JSON_STRUCTURED_OUTPUT_MODE: StructuredOutputMode = 'FREE_JSON';
const FAST_EXTRACTION_TEMPERATURE = 0.1;
const GEMMA_THINKING_TEMPERATURE = 1.0;
const PRESERVE_EMPTY_ARRAY_RESULT_KEYS = new Set([
  'payments',
  'references',
  'attributes',
  'calendarEvents',
  'tags',
]);

type PrismaClientLike = PrismaService | Prisma.TransactionClient;

export interface ClaimedAiJob {
  jobId: string;
  documentId: string;
  documentTitle: string;
  payload: AiMetadataExtractionJobPayload;
  status: DocumentStatus;
  providerId: string;
}

export interface AiPromptRunInput {
  text: string;
  resultSchema: Record<string, unknown>;
  maxTokens: number;
  temperature: number;
  enableThinking: boolean;
  structuredOutputMode: StructuredOutputMode;
  logThinkingStream: boolean;
  evidencePack?: AiMetadataEvidencePack;
  sourceTextKind?: AiPromptSourceTextKind;
  skipReason?: string;
}

export type AiPromptRunner = (
  input: AiPromptRunInput,
) => Promise<Record<string, unknown>>;

export type StructuredOutputMode = 'FREE_JSON';

export type AiProgressCallback = (
  percent: number,
  message: string,
) => Promise<void> | void;

interface QueuedAiDocument {
  documentId: string;
  jobId: string;
  status: 'AI_PENDING';
  queuePosition: number;
}

interface AiMetadataJobPayload extends Prisma.InputJsonObject {
  readonly scopes?: readonly AiMetadataPromptScope[];
  readonly aiMetadataLanguage?: string | null;
}

export interface RequeuedAiJob {
  jobId: string;
  documentId: string;
  tenantId: string;
  documentTitle: string;
  status: 'AI_PENDING';
}

@Injectable()
export class AiProcessingService {
  private isDispatching = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly documentHistory: DocumentHistoryService,
    private readonly notifications: RealtimeNotificationsService,
    private readonly aiService: AiService,
    private readonly aiProviderRouter: AiProviderRouter,
    private readonly realtimeEvents?: RealtimeEventsService,
    private readonly promptBuilder: AiMetadataPromptBuilder = new AiMetadataPromptBuilder(),
    private readonly preprocessor: AiOcrTextPreprocessor = new AiOcrTextPreprocessor(),
    private readonly evidenceExtractor: AiMetadataEvidenceExtractor = new AiMetadataEvidenceExtractor(),
    private readonly promptPlanner: AiPromptPlanner = new AiPromptPlanner(),
  ) {}

  async dispatchWaitingJobs(): Promise<void> {
    if (this.isDispatching) {
      return;
    }

    this.isDispatching = true;
    try {
      while (true) {
        const claimed = await this.claimNextMetadataJob();
        if (!claimed) {
          return;
        }
        void this.processClaimedMetadataJob(claimed);
      }
    } finally {
      this.isDispatching = false;
    }
  }

  async requeueInterruptedMetadataJobs(): Promise<RequeuedAiJob[]> {
    const requeuedJobs = await this.prisma.$transaction(async (tx) => {
      const interruptedJobs = await tx.processingJob.findMany({
        where: {
          jobType: AI_JOB_TYPE,
          status: 'ACTIVE',
        },
        select: {
          id: true,
          document: {
            select: {
              id: true,
              tenantId: true,
              title: true,
              originalFileName: true,
            },
          },
        },
        orderBy: [{ startedAt: 'asc' }, { createdAt: 'asc' }],
      });
      const requeued: RequeuedAiJob[] = [];

      for (const job of interruptedJobs) {
        await tx.processingJob.update({
          where: { id: job.id },
          data: {
            status: 'WAITING',
            assignedAiProviderId: null,
            startedAt: null,
            finishedAt: null,
            progress: 0,
            errorCode: null,
            errorMessage: null,
          },
        });

        if (!job.document) {
          continue;
        }

        const document = await tx.document.update({
          where: { id: job.document.id },
          data: {
            status: 'AI_PENDING',
            failedReason: null,
          },
          select: {
            id: true,
            tenantId: true,
            title: true,
            originalFileName: true,
            status: true,
          },
        });
        await this.documentHistory.record(
          {
            documentId: document.id,
            type: 'DOCUMENT_PROCESSING_QUEUED',
            summary:
              'Unterbrochene AI-Metadatenextraktion wurde erneut eingestellt.',
            metadata: {
              jobId: job.id,
              jobType: AI_JOB_TYPE,
              status: document.status,
              requeuedAfterInterruption: true,
            },
          },
          tx,
        );
        requeued.push({
          jobId: job.id,
          documentId: document.id,
          tenantId: document.tenantId,
          documentTitle: displayDocumentTitle(document),
          status: 'AI_PENDING',
        });
      }

      return requeued;
    });

    const realtimeEvents = this.realtimeEvents;
    if (realtimeEvents) {
      await Promise.all(
        requeuedJobs.map((job) =>
          realtimeEvents.documentChanged({
            documentId: job.documentId,
            tenantId: job.tenantId,
            jobId: job.jobId,
            status: job.status,
            reason: 'AI_QUEUED',
          }),
        ),
      );
    }

    return requeuedJobs;
  }

  async hasAvailableMetadataProvider(
    client: PrismaClientLike = this.prisma,
  ): Promise<boolean> {
    if (client !== this.prisma) {
      const providers = await client.aiProvider.findMany({
        where: {
          isActive: true,
          status: 'AVAILABLE',
          selectedModel: { not: null },
        },
      });
      return providers.length > 0;
    }

    return this.aiProviderRouter.hasAvailableProvider();
  }

  async createAutomaticMetadataJobAfterOcr(
    tx: Prisma.TransactionClient,
    documentId: string,
    ocrText: string,
  ): Promise<{ status: DocumentStatus; jobId?: string }> {
    if (!ocrText.trim()) {
      return { status: 'READY' };
    }

    if (!(await this.hasAvailableMetadataProvider(tx))) {
      return { status: 'READY' };
    }

    if (await this.isInboxAiDeferredByEditLock(tx, documentId)) {
      await tx.document.update({
        where: { id: documentId },
        data: { aiDeferredByEditLock: true },
      });
      return { status: 'READY' };
    }

    const existingJob = await this.findActiveMetadataJob(tx, documentId);
    if (existingJob) {
      return { status: 'AI_PENDING', jobId: existingJob.id };
    }

    const document = await tx.document.findUnique({
      where: { id: documentId },
      select: { ocrLanguage: true },
    });
    const payload = await this.metadataJobPayloadForDocument(tx, {
      ocrLanguage: document?.ocrLanguage ?? null,
    });

    const job = await tx.processingJob.create({
      data: {
        documentId,
        jobType: AI_JOB_TYPE,
        status: 'WAITING',
        payload,
      },
    });
    await this.documentHistory.record(
      {
        documentId,
        type: 'DOCUMENT_PROCESSING_QUEUED',
        summary: 'Dokument wurde zur AI-Metadatenextraktion eingestellt.',
        metadata: {
          jobId: job.id,
          jobType: AI_JOB_TYPE,
          status: 'AI_PENDING',
        },
      },
      tx,
    );

    return { status: 'AI_PENDING', jobId: job.id };
  }

  async triggerDocumentAiExtraction(
    documentId: string,
    actorUserId?: string,
    scopes?: readonly AiMetadataPromptScope[],
  ): Promise<TriggerDocumentAiProcessingResponse> {
    if (!(await this.hasAvailableMetadataProvider())) {
      throw new ServiceUnavailableException('No AI provider is available.');
    }

    const document = await this.prisma.document.findUnique({
      where: { id: documentId },
      select: {
        id: true,
        tenantId: true,
        title: true,
        originalFileName: true,
        status: true,
        ocrLanguage: true,
        ocrText: true,
        extractedMarkdown: true,
        acceptedAt: true,
      },
    });

    if (!document) {
      throw new NotFoundException('Document not found.');
    }

    this.assertAiCanStart(document.status, scopes, document.acceptedAt);
    if (!document.ocrText?.trim()) {
      throw new BadRequestException(
        'Document has no OCR text for AI extraction.',
      );
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const existingJob = await this.findActiveMetadataJob(tx, documentId);
      if (existingJob) {
        const queuePosition = await this.metadataJobQueuePosition(
          tx,
          existingJob.id,
        );
        await tx.document.update({
          where: { id: documentId },
          data: { status: 'AI_PENDING' },
        });
        return {
          jobId: existingJob.id,
          status: 'AI_PENDING' as const,
          queuePosition,
        };
      }

      const job = await tx.processingJob.create({
        data: {
          documentId,
          jobType: AI_JOB_TYPE,
          status: 'WAITING',
          payload: await this.metadataJobPayloadForDocument(
            tx,
            { ocrLanguage: document.ocrLanguage },
            scopes,
          ),
        },
      });
      await tx.document.update({
        where: { id: documentId },
        data: {
          status: 'AI_PENDING',
          failedReason: null,
        },
      });
      await this.documentHistory.record(
        {
          documentId,
          actorUserId,
          type: 'DOCUMENT_PROCESSING_QUEUED',
          summary: 'Dokument wurde zur AI-Metadatenextraktion eingestellt.',
          metadata: {
            jobId: job.id,
            jobType: AI_JOB_TYPE,
            status: 'AI_PENDING',
            scopes,
          },
        },
        tx,
      );
      const queuePosition = await this.metadataJobQueuePosition(tx, job.id);

      return { jobId: job.id, status: 'AI_PENDING' as const, queuePosition };
    });

    await this.notifications.publish({
      type: 'document.status_changed',
      severity: 'info',
      title: scopes?.length
        ? 'AI-Feldaktualisierung geplant'
        : 'AI-Verarbeitung geplant',
      message: `${displayDocumentTitle(document)} wurde zur AI-Verarbeitung eingestellt. Position ${result.queuePosition} in der AI-Warteschlange.`,
      documentId,
      tenantId: document.tenantId,
      documentTitle: displayDocumentTitle(document),
      jobId: result.jobId,
      status: result.status,
      queuePosition: result.queuePosition,
    });
    await this.realtimeEvents?.documentChanged({
      documentId,
      tenantId: document.tenantId,
      jobId: result.jobId,
      status: result.status,
      queuePosition: result.queuePosition,
      reason: 'AI_QUEUED',
    });

    return {
      documentId,
      jobId: result.jobId,
      status: result.status,
      queuePosition: result.queuePosition,
    };
  }

  private async isInboxAiDeferredByEditLock(
    tx: Prisma.TransactionClient,
    documentId: string,
  ): Promise<boolean> {
    const document = await tx.document.findUnique({
      where: { id: documentId },
      select: { acceptedAt: true, tenantId: true, status: true },
    });
    if (
      !document ||
      document.acceptedAt !== null ||
      document.status === 'ARCHIVED'
    ) {
      return false;
    }

    const lock = await tx.editLock.findFirst({
      where: {
        scope: 'INBOX',
        expiresAt: { gt: new Date() },
        OR: [{ resourceId: document.tenantId }, { resourceId: 'all' }],
      },
      select: { id: true },
    });

    return Boolean(lock);
  }

  async triggerBulkAiExtraction(
    actorUserId?: string,
    tenantIds: readonly string[] = [],
  ): Promise<TriggerBulkAiProcessingResponse> {
    if (!(await this.hasAvailableMetadataProvider())) {
      throw new ServiceUnavailableException('No AI provider is available.');
    }

    const queuedDocuments = await this.prisma.$transaction(async (tx) => {
      const documents = await tx.document.findMany({
        where: {
          status: 'READY',
          tenantId: tenantIds.length ? { in: [...tenantIds] } : undefined,
          aiProcessedAt: null,
          ocrText: { not: null },
          NOT: { ocrText: '' },
          jobs: {
            none: {
              jobType: AI_JOB_TYPE,
              status: { in: [...ACTIVE_AI_JOB_STATUSES] },
            },
          },
        },
        select: {
          id: true,
          tenantId: true,
          ocrLanguage: true,
        },
      });

      const queued: Array<QueuedAiDocument & { tenantId: string }> = [];

      for (const document of documents) {
        const job = await tx.processingJob.create({
          data: {
            documentId: document.id,
            jobType: AI_JOB_TYPE,
            status: 'WAITING',
            payload: await this.metadataJobPayloadForDocument(tx, document),
          },
        });
        await tx.document.update({
          where: { id: document.id },
          data: {
            status: 'AI_PENDING',
            failedReason: null,
          },
        });
        await this.documentHistory.record(
          {
            documentId: document.id,
            actorUserId,
            type: 'DOCUMENT_PROCESSING_QUEUED',
            summary: 'Dokument wurde zur AI-Metadatenextraktion eingestellt.',
            metadata: {
              jobId: job.id,
              jobType: AI_JOB_TYPE,
              status: 'AI_PENDING',
            },
          },
          tx,
        );
        const queuePosition = await this.metadataJobQueuePosition(tx, job.id);
        queued.push({
          documentId: document.id,
          tenantId: document.tenantId,
          jobId: job.id,
          status: 'AI_PENDING',
          queuePosition,
        });
      }

      return queued;
    });
    const queuedCount = queuedDocuments.length;

    if (queuedCount > 0) {
      await this.notifications.publish({
        type: 'document.status_changed',
        severity: 'info',
        title: 'AI-Verarbeitung geplant',
        message: `${queuedCount} Dokumente wurden zur AI-Verarbeitung eingestellt. Erste Position: ${queuedDocuments[0]?.queuePosition ?? 1}.`,
      });
    }
    const realtimeEvents = this.realtimeEvents;
    if (realtimeEvents) {
      await Promise.all(
        queuedDocuments.map((document) =>
          realtimeEvents.documentChanged({
            documentId: document.documentId,
            tenantId: document.tenantId,
            jobId: document.jobId,
            status: document.status,
            queuePosition: document.queuePosition,
            reason: 'AI_QUEUED',
          }),
        ),
      );
    }

    return { queuedCount, queuedDocuments };
  }

  async triggerDeferredInboxAiExtraction(
    actorUserId?: string,
    tenantIds: readonly string[] = [],
  ): Promise<TriggerBulkAiProcessingResponse> {
    if (!(await this.hasAvailableMetadataProvider())) {
      return { queuedCount: 0, queuedDocuments: [] };
    }

    const queuedDocuments = await this.prisma.$transaction(async (tx) => {
      const documents = await tx.document.findMany({
        where: {
          status: 'READY',
          acceptedAt: null,
          aiDeferredByEditLock: true,
          tenantId: tenantIds.length ? { in: [...tenantIds] } : undefined,
          ocrText: { not: null },
          NOT: { ocrText: '' },
          jobs: {
            none: {
              jobType: AI_JOB_TYPE,
              status: { in: [...ACTIVE_AI_JOB_STATUSES] },
            },
          },
        },
        select: {
          id: true,
          tenantId: true,
          ocrLanguage: true,
        },
      });

      const queued: Array<QueuedAiDocument & { tenantId: string }> = [];

      for (const document of documents) {
        const job = await tx.processingJob.create({
          data: {
            documentId: document.id,
            jobType: AI_JOB_TYPE,
            status: 'WAITING',
            payload: await this.metadataJobPayloadForDocument(tx, document),
          },
        });
        await tx.document.update({
          where: { id: document.id },
          data: {
            status: 'AI_PENDING',
            failedReason: null,
            aiDeferredByEditLock: false,
          },
        });
        await this.documentHistory.record(
          {
            documentId: document.id,
            actorUserId,
            type: 'DOCUMENT_PROCESSING_QUEUED',
            summary: 'Zurückgestellte AI-Metadatenextraktion wurde gestartet.',
            metadata: {
              jobId: job.id,
              jobType: AI_JOB_TYPE,
              status: 'AI_PENDING',
              deferredByEditLock: true,
            },
          },
          tx,
        );
        const queuePosition = await this.metadataJobQueuePosition(tx, job.id);
        queued.push({
          documentId: document.id,
          tenantId: document.tenantId,
          jobId: job.id,
          status: 'AI_PENDING',
          queuePosition,
        });
      }

      await tx.document.updateMany({
        where: {
          aiDeferredByEditLock: true,
          acceptedAt: null,
          tenantId: tenantIds.length ? { in: [...tenantIds] } : undefined,
        },
        data: { aiDeferredByEditLock: false },
      });

      return queued;
    });

    const realtimeEvents = this.realtimeEvents;
    if (realtimeEvents) {
      await Promise.all(
        queuedDocuments.map((document) =>
          realtimeEvents.documentChanged({
            documentId: document.documentId,
            tenantId: document.tenantId,
            jobId: document.jobId,
            status: document.status,
            queuePosition: document.queuePosition,
            reason: 'AI_QUEUED',
          }),
        ),
      );
    }

    return {
      queuedCount: queuedDocuments.length,
      queuedDocuments,
    };
  }

  async claimNextMetadataJob(): Promise<ClaimedAiJob | null> {
    const claimed = await this.prisma.$transaction(async (tx) => {
      const providers = await tx.aiProvider.findMany({
        where: {
          isActive: true,
          status: 'AVAILABLE',
          selectedModel: { not: null },
        },
        orderBy: [{ priority: 'asc' }, { name: 'asc' }],
      });
      if (providers.length === 0) {
        return null;
      }

      const activeProviderIds = new Set(
        (
          await tx.processingJob.findMany({
            where: {
              assignedAiProviderId: { not: null },
              jobType: AI_JOB_TYPE,
              status: 'ACTIVE',
            },
            select: { assignedAiProviderId: true },
          })
        )
          .map((job) => job.assignedAiProviderId)
          .filter((id): id is string => Boolean(id)),
      );
      const provider = providers.find(
        (entry) => !activeProviderIds.has(entry.id),
      );
      if (!provider) {
        return null;
      }

      const job = await tx.processingJob.findFirst({
        where: {
          jobType: AI_JOB_TYPE,
          status: 'WAITING',
          document: {
            status: 'AI_PENDING',
            ocrText: { not: null },
          },
        },
        include: { document: true },
        orderBy: { createdAt: 'asc' },
      });
      if (!job?.document?.ocrText?.trim()) {
        return null;
      }

      const jobPayload = aiMetadataJobPayloadFromJobPayload(job.payload);
      const payload = await this.metadataPayload(tx, job.document, {
        scopes: jobPayload.scopes,
        aiMetadataLanguage:
          jobPayload.aiMetadataLanguage ?? job.document.ocrLanguage,
      });
      await tx.processingJob.update({
        where: { id: job.id },
        data: {
          status: 'ACTIVE',
          assignedAiProviderId: provider.id,
          startedAt: new Date(),
          attempts: { increment: 1 },
          progress: 0,
          errorCode: null,
          errorMessage: null,
        },
      });
      const document = await tx.document.update({
        where: { id: job.documentId ?? job.document.id },
        data: {
          status: 'AI_RUNNING',
          failedReason: null,
        },
        select: {
          id: true,
          tenantId: true,
          title: true,
          originalFileName: true,
          status: true,
        },
      });

      return {
        jobId: job.id,
        documentId: document.id,
        tenantId: document.tenantId,
        documentTitle: displayDocumentTitle(document),
        payload,
        status: document.status,
        providerId: provider.id,
      };
    });

    if (!claimed) {
      return null;
    }

    await this.notifications.publish({
      type: 'ai.started',
      severity: 'info',
      title: 'AI gestartet',
      message: `${claimed.documentTitle} wird durch den AI Provider ausgewertet.`,
      documentId: claimed.documentId,
      tenantId: claimed.tenantId,
      documentTitle: claimed.documentTitle,
      jobId: claimed.jobId,
      status: claimed.status,
    });
    await this.realtimeEvents?.documentChanged({
      documentId: claimed.documentId,
      tenantId: claimed.tenantId,
      jobId: claimed.jobId,
      status: claimed.status,
      reason: 'AI_STARTED',
    });
    return claimed;
  }

  async extractMetadataWithPromptRunner(
    payload: AiMetadataExtractionJobPayload,
    runPrompt: AiPromptRunner,
    progress?: AiProgressCallback,
  ): Promise<Record<string, unknown>> {
    const preprocessing = this.preprocessor.preprocess(payload.ocrText);
    const optimizedPayload = {
      ...payload,
      ocrText: preprocessing.cleanedText || preprocessing.rawText,
    };
    const chunks = chunkOcrText(optimizedPayload.ocrText);

    return this.extractMetadataWithStructuredPromptSequence(
      optimizedPayload,
      chunks,
      preprocessing,
      runPrompt,
      progress,
    );
  }

  private async processClaimedMetadataJob(
    claimed: ClaimedAiJob,
  ): Promise<void> {
    try {
      const result = await this.extractMetadataWithPromptRunner(
        claimed.payload,
        this.aiProviderRouter.promptRunner(),
        async (percent) => {
          await this.prisma.processingJob.update({
            where: { id: claimed.jobId },
            data: { progress: activeJobProgress(percent) },
          });
        },
      );
      await this.aiService.applyMetadataExtractionResult(
        claimed.documentId,
        result,
        claimed.jobId,
        claimed.payload.scopes,
      );
      await this.completeMetadataJob(claimed.jobId);
    } catch (error) {
      await this.failMetadataJob(
        claimed.jobId,
        claimed.documentId,
        'AI_EXTRACTION_FAILED',
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      void this.dispatchWaitingJobs();
    }
  }

  private async extractMetadataWithStructuredPromptSequence(
    payload: AiMetadataExtractionJobPayload,
    chunks: readonly AiMetadataTextChunk[],
    preprocessing: AiOcrPreprocessingResult,
    runPrompt: AiPromptRunner,
    progress?: AiProgressCallback,
  ): Promise<Record<string, unknown>> {
    if (chunks.length === 1) {
      const evidence = this.evidenceExtractor.extract(
        payload.ocrText,
        payload.metadata.ocrLanguage,
      );
      const planned = this.plannedPromptSequence(payload, evidence);
      await progress?.(20, 'AI prompt started.');
      const result = await this.runPromptSequence(
        planned.prompts,
        runPrompt,
        (stepIndex) => 20 + stepIndex * 30,
        progress,
        evidence,
      );
      await progress?.(85, 'AI prompt completed.');
      const merged = { ...planned.skippedResult, ...result };
      return payload.scopes?.length ? merged : compactExtractionResult(merged);
    }

    const chunkResults: Record<string, unknown>[] = [];
    for (const chunk of chunks) {
      const chunkPayload = {
        ...payload,
        ocrText: chunk.text,
      };
      const evidence = this.evidenceExtractor.extract(
        chunk.text,
        payload.metadata.ocrLanguage,
      );
      const planned = this.plannedPromptSequence(chunkPayload, evidence);
      await progress?.(
        progressForChunk(chunk.chunkIndex, chunk.chunkCount, 5),
        `AI chunk ${chunk.chunkIndex + 1}/${chunk.chunkCount} started.`,
      );
      const chunkResult = await this.runPromptSequence(
        planned.prompts,
        runPrompt,
        (stepIndex) =>
          progressForChunk(
            chunk.chunkIndex,
            chunk.chunkCount,
            stepIndex === 0 ? 35 : 70,
          ),
        progress,
        evidence,
      );
      const mergedChunkResult = { ...planned.skippedResult, ...chunkResult };
      chunkResults.push({
        chunkIndex: chunk.chunkIndex,
        chunkCount: chunk.chunkCount,
        startOffset: chunk.startOffset,
        endOffset: chunk.endOffset,
        preprocessing: {
          charCountBefore: preprocessing.charCountBefore,
          charCountAfter: preprocessing.charCountAfter,
        },
        result: payload.scopes?.length
          ? mergedChunkResult
          : compactExtractionResult(mergedChunkResult),
      });
    }

    await progress?.(88, 'AI merge started.');
    const mergePrompt = this.promptBuilder.buildMerge(payload, chunkResults);
    const merged = await runPrompt({
      text: mergePrompt.text,
      resultSchema: mergePrompt.resultSchema,
      maxTokens: MAX_TOKENS_BY_PROMPT_KEY.MERGE_METADATA,
      temperature: GEMMA_THINKING_TEMPERATURE,
      enableThinking: true,
      structuredOutputMode: FREE_JSON_STRUCTURED_OUTPUT_MODE,
      logThinkingStream: true,
    });
    await progress?.(95, 'AI merge completed.');

    return payload.scopes?.length ? merged : compactExtractionResult(merged);
  }

  async completeMetadataJob(jobId: string): Promise<void> {
    await this.prisma.processingJob.update({
      where: { id: jobId },
      data: {
        status: 'COMPLETED',
        progress: 100,
        finishedAt: new Date(),
        errorCode: null,
        errorMessage: null,
      },
    });
  }

  async failMetadataJob(
    jobId: string,
    documentId: string | undefined,
    errorCode: string,
    errorMessage: string,
  ): Promise<void> {
    const document = documentId
      ? await this.prisma.document.update({
          where: { id: documentId },
          data: {
            status: 'READY',
            failedReason: errorMessage,
          },
          select: {
            id: true,
            tenantId: true,
            title: true,
            originalFileName: true,
            status: true,
          },
        })
      : null;

    await this.prisma.processingJob.update({
      where: { id: jobId },
      data: {
        status: 'FAILED',
        progress: 100,
        finishedAt: new Date(),
        errorCode,
        errorMessage,
      },
    });

    if (document) {
      await this.notifications.publish({
        type: 'ai.failed',
        severity: 'warning',
        title: 'AI-Verarbeitung fehlgeschlagen',
        message: `${displayDocumentTitle(document)}: ${errorMessage}`,
        documentId: document.id,
        tenantId: document.tenantId,
        documentTitle: displayDocumentTitle(document),
        jobId,
        status: document.status,
      });
      await this.realtimeEvents?.documentChanged({
        documentId: document.id,
        tenantId: document.tenantId,
        jobId,
        status: document.status,
        reason: 'AI_FAILED',
      });
    }
  }

  assertDocumentIsNotAiRunning(status: DocumentStatus): void {
    if (status === 'AI_PENDING' || status === 'AI_RUNNING') {
      throw new ConflictException(
        'Document is currently locked by AI processing.',
      );
    }
  }

  private async findActiveMetadataJob(
    client: PrismaClientLike,
    documentId: string,
  ) {
    return client.processingJob.findFirst({
      where: {
        documentId,
        jobType: AI_JOB_TYPE,
        status: { in: [...ACTIVE_AI_JOB_STATUSES] },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  private async metadataJobPayloadForDocument(
    client: PrismaClientLike,
    document: { readonly ocrLanguage: string | null },
    scopes?: readonly AiMetadataPromptScope[],
  ): Promise<AiMetadataJobPayload> {
    const setting = await this.aiMetadataLanguageSetting(client);

    return {
      ...(scopes?.length ? { scopes: [...scopes] } : {}),
      aiMetadataLanguage:
        setting === DEFAULT_AI_METADATA_LANGUAGE
          ? document.ocrLanguage
          : setting,
    };
  }

  private async aiMetadataLanguageSetting(
    client: PrismaClientLike,
  ): Promise<AiMetadataLanguage> {
    const setting = await client.systemSetting.findUnique({
      where: { key: AI_METADATA_LANGUAGE_KEY },
      select: { value: true },
    });

    return isAiMetadataLanguage(setting?.value)
      ? setting.value
      : DEFAULT_AI_METADATA_LANGUAGE;
  }

  private async metadataJobQueuePosition(
    client: PrismaClientLike,
    jobId: string,
  ): Promise<number> {
    const job = await client.processingJob.findUnique({
      where: { id: jobId },
      select: { id: true, createdAt: true, status: true },
    });
    if (!job) {
      return 1;
    }
    if (job.status === 'ACTIVE') {
      return 1;
    }
    if (job.status !== 'WAITING') {
      return 1;
    }

    const [activeCount, earlierWaitingCount] = await Promise.all([
      client.processingJob.count({
        where: {
          jobType: AI_JOB_TYPE,
          status: 'ACTIVE',
        },
      }),
      client.processingJob.count({
        where: {
          jobType: AI_JOB_TYPE,
          status: 'WAITING',
          OR: [
            { createdAt: { lt: job.createdAt } },
            { createdAt: job.createdAt, id: { lt: job.id } },
          ],
        },
      }),
    ]);

    return activeCount + earlierWaitingCount + 1;
  }

  private assertAiCanStart(
    status: DocumentStatus,
    scopes?: readonly AiMetadataPromptScope[],
    acceptedAt?: Date | null,
  ): void {
    this.assertDocumentIsNotAiRunning(status);

    if (status !== 'READY' && status !== 'AI_PENDING') {
      throw new BadRequestException(
        `AI extraction can only be started for READY documents. Current status: ${status}.`,
      );
    }

    if (scopes?.length && (status !== 'READY' || acceptedAt != null)) {
      throw new BadRequestException(
        `Scoped AI extraction can only be started for READY inbox documents. Current status: ${status}.`,
      );
    }
  }

  private async metadataPayload(
    tx: Prisma.TransactionClient,
    document: {
      id: string;
      title: string | null;
      originalFileName: string;
      documentDate: Date | null;
      ocrLanguage: string | null;
      sender: string | null;
      recipient: string | null;
      ocrText: string | null;
      extractedMarkdown?: string | null;
    },
    options: AiMetadataJobPayload = {},
  ): Promise<AiMetadataExtractionJobPayload> {
    const [documentTypes, fieldDefinitions, promptTemplates] =
      await Promise.all([
        tx.documentType.findMany({
          where: { active: true },
          orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
          select: { key: true, name: true },
        }),
        tx.documentFieldDefinition.findMany({
          where: {
            active: true,
            includeInAiExtraction: true,
          },
          orderBy: [{ displayOrder: 'asc' }, { label: 'asc' }],
          select: { key: true, label: true, valueType: true },
        }),
        tx.aiMetadataPrompt.findMany({
          orderBy: [{ displayOrder: 'asc' }, { key: 'asc' }],
          select: {
            key: true,
            label: true,
            description: true,
            promptText: true,
            displayOrder: true,
          },
        }),
      ]);
    const markdownSourceText = document.extractedMarkdown?.trim() || '';
    const plainSourceText = document.ocrText?.trim() || '';
    const sourceText = markdownSourceText || plainSourceText;
    const sourceTextFormat = markdownSourceText
      ? ('MARKDOWN' as const)
      : ('PLAIN_TEXT' as const);

    const payload = {
      documentId: document.id,
      ocrText: sourceText,
      sourceTextFormat,
      metadata: {
        title: displayDocumentTitle(document),
        originalFileName: document.originalFileName,
        documentDate: document.documentDate?.toISOString() ?? null,
        ocrLanguage: document.ocrLanguage,
        aiMetadataLanguage: options.aiMetadataLanguage ?? document.ocrLanguage,
        sender: document.sender,
        recipient: document.recipient,
      },
      documentTypes,
      fieldDefinitions,
      scopes: options.scopes?.length ? [...options.scopes] : undefined,
      promptTemplates: promptTemplates.map((prompt) => ({
        ...prompt,
        key: prompt.key as AiMetadataPromptScope,
      })),
    };

    return {
      ...payload,
      prompts: this.promptBuilder.build(payload),
    };
  }

  private async runPromptSequence(
    prompts: readonly PlannedPromptStep[],
    runPrompt: AiPromptRunner,
    progressPercent: (stepIndex: number) => number,
    progress?: AiProgressCallback,
    evidencePack?: AiMetadataEvidencePack,
  ): Promise<Record<string, unknown>> {
    const merged: Record<string, unknown> = {};

    for (let index = 0; index < prompts.length; index += 1) {
      const prompt = prompts[index];
      const enableThinking = prompt.enableThinking;
      const result = await runPrompt({
        text: prompt.text,
        resultSchema: prompt.resultSchema,
        maxTokens: MAX_TOKENS_BY_PROMPT_KEY[prompt.key] ?? 1200,
        temperature: enableThinking
          ? GEMMA_THINKING_TEMPERATURE
          : FAST_EXTRACTION_TEMPERATURE,
        enableThinking,
        structuredOutputMode: FREE_JSON_STRUCTURED_OUTPUT_MODE,
        logThinkingStream: enableThinking,
        evidencePack,
        sourceTextKind: prompt.sourceTextKind,
        skipReason: prompt.skipReason,
      });
      Object.assign(merged, result);
      await progress?.(
        progressPercent(index),
        `${prompt.key} prompt completed.`,
      );
    }

    return merged;
  }

  private plannedPromptSequence(
    payload: AiMetadataExtractionJobPayload,
    evidence: AiMetadataEvidencePack,
  ): {
    prompts: readonly PlannedPromptStep[];
    skippedResult: Record<string, unknown>;
  } {
    const optimizedPrompts = this.promptBuilder.buildOptimized(
      payload,
      evidence,
      {
        manualScopes: payload.scopes,
      },
    );
    const plan = this.promptPlanner.plan(optimizedPrompts, evidence, {
      manualScopes: payload.scopes,
      hasFieldDefinitions: payload.fieldDefinitions.length > 0,
    });
    const promptByKey = new Map<string, AiOptimizedPromptStep>(
      optimizedPrompts.map((prompt) => [prompt.key, prompt]),
    );
    const prompts = plan.decisions
      .filter((decision) => decision.action === 'RUN')
      .map((decision): PlannedPromptStep => {
        const prompt = promptByKey.get(decision.key);
        if (!prompt) {
          throw new Error(`No prompt found for AI step ${decision.key}.`);
        }
        return {
          ...prompt,
          enableThinking: decision.enableThinking,
          sourceTextKind: prompt.sourceTextKind ?? decision.sourceTextKind,
          skipReason: decision.skipReason,
        };
      });

    return { prompts, skippedResult: plan.skippedResult };
  }
}

type PlannedPromptStep = AiOptimizedPromptStep & {
  readonly enableThinking: boolean;
  readonly skipReason?: string;
};

function displayDocumentTitle(document: {
  readonly title: string | null;
  readonly originalFileName: string;
}): string {
  return document.title?.trim() || document.originalFileName;
}

export function chunkOcrText(text: string): AiMetadataTextChunk[] {
  const trimmed = text.trim();
  if (estimatedOcrTokens(trimmed) <= DIRECT_OCR_TOKEN_LIMIT) {
    return [
      {
        text: trimmed,
        chunkIndex: 0,
        chunkCount: 1,
        startOffset: 0,
        endOffset: trimmed.length,
      },
    ];
  }

  const chunks: Omit<AiMetadataTextChunk, 'chunkIndex' | 'chunkCount'>[] = [];
  let startOffset = 0;
  while (startOffset < trimmed.length) {
    const remaining = trimmed.length - startOffset;
    const maxEnd = startOffset + Math.min(HARD_CHUNK_CHAR_LIMIT, remaining);
    const targetEnd = startOffset + Math.min(TARGET_CHUNK_CHARS, remaining);
    const endOffset =
      remaining <= HARD_CHUNK_CHAR_LIMIT
        ? trimmed.length
        : bestChunkEnd(trimmed, startOffset, targetEnd, maxEnd);
    chunks.push({
      text: trimmed.slice(startOffset, endOffset).trim(),
      startOffset,
      endOffset,
    });
    startOffset = skipWhitespace(trimmed, endOffset);
  }

  return chunks.map((chunk, chunkIndex) => ({
    ...chunk,
    chunkIndex,
    chunkCount: chunks.length,
  }));
}

function estimatedOcrTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / OCR_CHARS_PER_ESTIMATED_TOKEN));
}

function bestChunkEnd(
  text: string,
  startOffset: number,
  targetEnd: number,
  maxEnd: number,
): number {
  const search = text.slice(startOffset, maxEnd);
  const relativeTarget = targetEnd - startOffset;
  const boundaries = ['\f', '\n\n', '\r\n\r\n', '\n', '. '];

  for (const boundary of boundaries) {
    const beforeTarget = search.lastIndexOf(boundary, relativeTarget);
    if (beforeTarget > 0 && beforeTarget > TARGET_CHUNK_CHARS * 0.6) {
      return startOffset + beforeTarget + boundary.length;
    }
    const afterTarget = search.indexOf(boundary, relativeTarget);
    if (afterTarget > 0) {
      return startOffset + afterTarget + boundary.length;
    }
  }

  const lastSpace = search.lastIndexOf(' ', relativeTarget);
  if (lastSpace > 0) {
    return startOffset + lastSpace;
  }

  return maxEnd;
}

function skipWhitespace(text: string, offset: number): number {
  let nextOffset = offset;
  while (nextOffset < text.length && /\s/.test(text[nextOffset])) {
    nextOffset += 1;
  }
  return nextOffset;
}

function progressForChunk(
  chunkIndex: number,
  chunkCount: number,
  chunkPercent: number,
): number {
  const chunkProgressStart = 10;
  const chunkProgressRange = 75;
  const completedChunks = chunkIndex / chunkCount;
  const currentChunk = chunkPercent / 100 / chunkCount;
  return Math.min(
    85,
    Math.round(
      chunkProgressStart +
        (completedChunks + currentChunk) * chunkProgressRange,
    ),
  );
}

export function activeJobProgress(percent: number): number {
  if (!Number.isFinite(percent)) {
    return 0;
  }

  return Math.min(99, Math.max(0, Math.round(percent)));
}

function compactExtractionResult(
  result: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(result).filter(([key, value]) => {
      if (value === null || value === undefined) {
        return false;
      }
      if (typeof value === 'string') {
        return value.trim().length > 0;
      }
      if (Array.isArray(value)) {
        return value.length > 0 || PRESERVE_EMPTY_ARRAY_RESULT_KEYS.has(key);
      }
      return true;
    }),
  );
}

export function scopesFromJobPayload(
  value: unknown,
): AiMetadataPromptScope[] | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }

  const scopes = (value as { scopes?: unknown }).scopes;
  if (!Array.isArray(scopes)) {
    return undefined;
  }

  const validScopes = new Set<AiMetadataPromptScope>([
    'TITLE',
    'DOCUMENT_TYPE',
    'SUMMARY',
    'TAGS',
    'PARTIES',
    'DOCUMENT_DATE',
    'PAYMENTS',
    'REFERENCES',
    'ATTRIBUTES',
    'CALENDAR_EVENTS',
  ]);
  const parsedScopes = scopes.filter(
    (scope): scope is AiMetadataPromptScope =>
      typeof scope === 'string' &&
      validScopes.has(scope as AiMetadataPromptScope),
  );

  return parsedScopes.length ? parsedScopes : undefined;
}

function aiMetadataJobPayloadFromJobPayload(
  value: unknown,
): AiMetadataJobPayload {
  return {
    scopes: scopesFromJobPayload(value),
    aiMetadataLanguage: aiMetadataLanguageFromJobPayload(value),
  };
}

function aiMetadataLanguageFromJobPayload(
  value: unknown,
): string | null | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }

  const aiMetadataLanguage = (value as { aiMetadataLanguage?: unknown })
    .aiMetadataLanguage;
  if (aiMetadataLanguage === null) {
    return null;
  }
  if (
    typeof aiMetadataLanguage === 'string' &&
    aiMetadataLanguage.trim().length > 0
  ) {
    return aiMetadataLanguage.trim();
  }

  return undefined;
}

function isAiMetadataLanguage(value: unknown): value is AiMetadataLanguage {
  return (
    value === 'DOCUMENT_LANGUAGE' ||
    value === 'deu' ||
    value === 'eng' ||
    value === 'fra' ||
    value === 'spa' ||
    value === 'por' ||
    value === 'chi_sim'
  );
}
