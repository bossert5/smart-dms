import {
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import type { Prisma } from '@prisma/client';
import {
  AiProcessingErrorCodeSchema,
  AiProcessingRequestMetadataSchema,
  AiProcessingResponseMetadataSchema,
  type AiProcessingAttemptDto,
  type AiProcessingAttemptKind,
  type AiProcessingErrorCode,
  type AiProcessingLogDetail,
  type AiProcessingLogListItem,
  type AiProcessingLogListResponse,
  type AiProcessingLogQuery,
  type AiProcessingLogStatus,
  type AiProcessingRequestMetadata,
  type AiProcessingResponseMetadata,
} from '@smart-dms/shared-dto';
import { PrismaService } from '../prisma/prisma.service';

const DIAGNOSTIC_RETENTION_MS = 14 * 24 * 60 * 60 * 1000;
const INTERRUPTED_AFTER_MS = 15 * 60 * 1000;
const MAINTENANCE_INTERVAL_MS = 6 * 60 * 60 * 1000;
const MAX_RAW_RESPONSE_BYTES = 256 * 1024;

export interface AiDiagnosticContext {
  readonly processingJobId: string;
  readonly documentId: string;
  readonly promptKey: string;
  readonly sequenceIndex: number;
}

export interface AiDiagnosticAttemptRef extends AiDiagnosticContext {
  readonly id: string;
  readonly providerId: string;
  readonly model: string;
  readonly startedAt: Date;
  readonly attemptKind: AiProcessingAttemptKind;
}

export interface StartAiDiagnosticAttemptInput extends AiDiagnosticContext {
  readonly providerId: string;
  readonly model: string;
  readonly attemptKind: AiProcessingAttemptKind;
  readonly requestMetadata: AiProcessingRequestMetadata;
}

export interface FinishAiDiagnosticAttemptInput {
  readonly httpStatus: number | null;
  readonly responseMetadata: AiProcessingResponseMetadata | null;
}

export interface FailAiDiagnosticAttemptInput extends FinishAiDiagnosticAttemptInput {
  readonly errorCode: AiProcessingErrorCode;
  readonly errorMessage: string;
  readonly rawResponse: string | null;
}

@Injectable()
export class AiProcessingDiagnosticsService {
  private readonly logger = new Logger(AiProcessingDiagnosticsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async tryStartAttempt(
    input: StartAiDiagnosticAttemptInput,
  ): Promise<AiDiagnosticAttemptRef | null> {
    try {
      const attempt = await this.prisma.aiProcessingAttempt.create({
        data: {
          processingJobId: input.processingJobId,
          providerId: input.providerId,
          attemptKind: input.attemptKind,
          promptKey: input.promptKey,
          sequenceIndex: input.sequenceIndex,
          model: input.model,
          requestMetadata: toInputJson(input.requestMetadata),
        },
        select: { id: true, startedAt: true },
      });
      return { ...input, ...attempt };
    } catch (error) {
      this.logger.warn(
        `AI diagnostic start failed jobId=${input.processingJobId} providerId=${input.providerId} promptKey=${input.promptKey}: ${errorMessage(error)}`,
      );
      return null;
    }
  }

  async tryCompleteAttempt(
    attempt: AiDiagnosticAttemptRef | null,
    input: FinishAiDiagnosticAttemptInput,
  ): Promise<void> {
    if (!attempt) {
      return;
    }
    try {
      const finishedAt = new Date();
      await this.prisma.aiProcessingAttempt.update({
        where: { id: attempt.id },
        data: {
          status: 'SUCCESS',
          finishedAt,
          durationMs: durationMs(attempt.startedAt, finishedAt),
          httpStatus: input.httpStatus,
          responseMetadata: input.responseMetadata
            ? toInputJson(input.responseMetadata)
            : undefined,
        },
      });
    } catch (error) {
      this.logger.warn(
        `AI diagnostic completion failed attemptId=${attempt.id} jobId=${attempt.processingJobId}: ${errorMessage(error)}`,
      );
    }
  }

  async tryFailAttempt(
    attempt: AiDiagnosticAttemptRef | null,
    context: StartAiDiagnosticAttemptInput,
    input: FailAiDiagnosticAttemptInput,
  ): Promise<void> {
    const rawResponse = truncateUtf8(input.rawResponse, MAX_RAW_RESPONSE_BYTES);
    if (attempt) {
      try {
        const finishedAt = new Date();
        await this.prisma.aiProcessingAttempt.update({
          where: { id: attempt.id },
          data: {
            status: 'FAILED',
            finishedAt,
            durationMs: durationMs(attempt.startedAt, finishedAt),
            httpStatus: input.httpStatus,
            responseMetadata: input.responseMetadata
              ? toInputJson(input.responseMetadata)
              : undefined,
            errorCode: input.errorCode,
            errorMessage: input.errorMessage,
            rawResponse: rawResponse.value,
            rawResponseTruncated: rawResponse.truncated,
          },
        });
      } catch (error) {
        this.logger.warn(
          `AI diagnostic failure persistence failed attemptId=${attempt.id} jobId=${attempt.processingJobId}: ${errorMessage(error)}`,
        );
      }
    }

    this.logger.warn(
      `AI attempt failed attemptId=${attempt?.id ?? 'unavailable'} jobId=${context.processingJobId} providerId=${context.providerId} model=${context.model} promptKey=${context.promptKey} errorCode=${input.errorCode}`,
    );
  }

  async list(
    query: AiProcessingLogQuery,
  ): Promise<AiProcessingLogListResponse> {
    const where = this.listWhere(query);
    const [jobs, totalItems] = await this.prisma.$transaction([
      this.prisma.processingJob.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        select: {
          id: true,
          documentId: true,
          status: true,
          startedAt: true,
          finishedAt: true,
          errorCode: true,
          errorMessage: true,
          document: {
            select: { title: true, originalFileName: true },
          },
          assignedAiProvider: {
            select: { id: true, name: true, selectedModel: true },
          },
          aiAttempts: {
            orderBy: [{ startedAt: 'asc' }, { id: 'asc' }],
            select: {
              providerId: true,
              provider: { select: { name: true } },
              model: true,
              status: true,
              startedAt: true,
              finishedAt: true,
              errorCode: true,
              errorMessage: true,
            },
          },
        },
      }),
      this.prisma.processingJob.count({ where }),
    ]);

    return {
      items: jobs.map((job) => toLogListItem(job)),
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        totalItems,
        totalPages: Math.ceil(totalItems / query.pageSize),
      },
    };
  }

  async detail(jobId: string): Promise<AiProcessingLogDetail> {
    const job = await this.prisma.processingJob.findFirst({
      where: { id: jobId, jobType: 'EXTRACT_AI_METADATA' },
      select: {
        id: true,
        documentId: true,
        status: true,
        startedAt: true,
        finishedAt: true,
        errorCode: true,
        errorMessage: true,
        document: { select: { title: true, originalFileName: true } },
        assignedAiProvider: {
          select: { id: true, name: true, selectedModel: true },
        },
        aiAttempts: {
          orderBy: [{ startedAt: 'asc' }, { id: 'asc' }],
          include: { provider: { select: { name: true } } },
        },
      },
    });
    if (!job) {
      throw new NotFoundException('AI processing log does not exist.');
    }

    return {
      ...toLogListItem(job),
      attempts: job.aiAttempts.map(toAttemptDto),
    };
  }

  async maintain(now = new Date()): Promise<{
    interrupted: number;
    deleted: number;
  }> {
    const interruptedBefore = new Date(now.getTime() - INTERRUPTED_AFTER_MS);
    const deleteBefore = new Date(now.getTime() - DIAGNOSTIC_RETENTION_MS);
    const staleAttempts = await this.prisma.aiProcessingAttempt.findMany({
      where: { status: 'ACTIVE', startedAt: { lt: interruptedBefore } },
      select: { id: true, startedAt: true },
    });
    const results = await this.prisma.$transaction([
      ...staleAttempts.map((attempt) =>
        this.prisma.aiProcessingAttempt.update({
          where: { id: attempt.id },
          data: {
            status: 'INTERRUPTED',
            finishedAt: now,
            durationMs: durationMs(attempt.startedAt, now),
            errorCode: 'AI_PROCESS_INTERRUPTED',
            errorMessage: 'AI processing was interrupted before completion.',
          },
        }),
      ),
      this.prisma.aiProcessingAttempt.deleteMany({
        where: { createdAt: { lt: deleteBefore } },
      }),
    ]);
    const deleted = results[results.length - 1] as { count: number };
    return { interrupted: staleAttempts.length, deleted: deleted.count };
  }

  private listWhere(
    query: AiProcessingLogQuery,
  ): Prisma.ProcessingJobWhereInput {
    const retentionStart = new Date(Date.now() - DIAGNOSTIC_RETENTION_MS);
    const requestedStart = query.from ? new Date(query.from) : retentionStart;
    const effectiveStart =
      requestedStart > retentionStart ? requestedStart : retentionStart;
    const filters: Prisma.ProcessingJobWhereInput[] = [];
    if (query.providerId) {
      filters.push({
        OR: [
          { assignedAiProviderId: query.providerId },
          { aiAttempts: { some: { providerId: query.providerId } } },
        ],
      });
    }
    if (query.errorCode) {
      filters.push({
        aiAttempts: { some: { errorCode: query.errorCode } },
      });
    }
    if (query.status) {
      filters.push(statusWhere(query.status));
    }
    return {
      jobType: 'EXTRACT_AI_METADATA',
      createdAt: {
        gte: effectiveStart,
        ...(query.to ? { lte: new Date(query.to) } : {}),
      },
      ...(filters.length ? { AND: filters } : {}),
    };
  }
}

@Injectable()
export class AiDiagnosticsRetentionService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AiDiagnosticsRetentionService.name);

  constructor(private readonly diagnostics: AiProcessingDiagnosticsService) {}

  onApplicationBootstrap(): void {
    void this.runMaintenance();
  }

  @Interval(MAINTENANCE_INTERVAL_MS)
  runScheduledMaintenance(): void {
    void this.runMaintenance();
  }

  private async runMaintenance(): Promise<void> {
    try {
      const result = await this.diagnostics.maintain();
      if (result.interrupted || result.deleted) {
        this.logger.log(
          `AI diagnostics maintenance interrupted=${result.interrupted} deleted=${result.deleted}`,
        );
      }
    } catch (error) {
      this.logger.warn(
        `AI diagnostics maintenance failed: ${errorMessage(error)}`,
      );
    }
  }
}

function statusWhere(
  status: AiProcessingLogStatus,
): Prisma.ProcessingJobWhereInput {
  switch (status) {
    case 'RUNNING':
      return { status: { in: ['WAITING', 'ACTIVE'] } };
    case 'SUCCESS':
      return {
        status: 'COMPLETED',
        aiAttempts: { none: { status: { in: ['FAILED', 'INTERRUPTED'] } } },
      };
    case 'RECOVERED':
      return {
        status: 'COMPLETED',
        aiAttempts: { some: { status: { in: ['FAILED', 'INTERRUPTED'] } } },
      };
    case 'INTERRUPTED':
      return {
        OR: [
          {
            status: { in: ['WAITING', 'ACTIVE'] },
            aiAttempts: { some: { status: 'INTERRUPTED' } },
            NOT: { aiAttempts: { some: { status: 'ACTIVE' } } },
          },
          {
            status: 'FAILED',
            aiAttempts: { some: { status: 'INTERRUPTED' } },
          },
        ],
      };
    case 'FAILED':
      return {
        status: 'FAILED',
        aiAttempts: { none: { status: 'INTERRUPTED' } },
      };
    default:
      return {};
  }
}

function toLogListItem(job: {
  readonly id: string;
  readonly documentId: string | null;
  readonly status: string;
  readonly startedAt: Date | null;
  readonly finishedAt: Date | null;
  readonly errorCode: string | null;
  readonly errorMessage: string | null;
  readonly document: {
    readonly title: string | null;
    readonly originalFileName: string;
  } | null;
  readonly assignedAiProvider: {
    readonly id: string;
    readonly name: string;
    readonly selectedModel: string | null;
  } | null;
  readonly aiAttempts: readonly {
    readonly providerId: string | null;
    readonly provider: { readonly name: string } | null;
    readonly model: string;
    readonly status: string;
    readonly startedAt: Date;
    readonly finishedAt: Date | null;
    readonly errorCode: string | null;
    readonly errorMessage: string | null;
  }[];
}): AiProcessingLogListItem {
  const failedAttempts = job.aiAttempts.filter((attempt) =>
    ['FAILED', 'INTERRUPTED'].includes(attempt.status),
  );
  const lastAttempt = job.aiAttempts[job.aiAttempts.length - 1];
  const lastFailure = failedAttempts[failedAttempts.length - 1];
  const providerId =
    lastAttempt?.providerId ?? job.assignedAiProvider?.id ?? null;
  const providerName =
    lastAttempt?.provider?.name ?? job.assignedAiProvider?.name ?? null;

  return {
    jobId: job.id,
    documentId: job.documentId,
    documentTitle: job.document
      ? job.document.title?.trim() || job.document.originalFileName
      : null,
    providerId,
    providerName,
    model: lastAttempt?.model ?? job.assignedAiProvider?.selectedModel ?? null,
    status: logStatus(job.status, job.aiAttempts),
    startedAt: job.startedAt?.toISOString() ?? null,
    finishedAt: job.finishedAt?.toISOString() ?? null,
    durationMs:
      job.startedAt && job.finishedAt
        ? durationMs(job.startedAt, job.finishedAt)
        : null,
    attemptCount: job.aiAttempts.length,
    failedAttemptCount: failedAttempts.length,
    errorCode: parsedErrorCode(lastFailure?.errorCode ?? job.errorCode),
    errorMessage: lastFailure?.errorMessage ?? job.errorMessage,
    hasDetailedDiagnostics: job.aiAttempts.length > 0,
  };
}

function toAttemptDto(attempt: {
  readonly id: string;
  readonly status: AiProcessingAttemptDto['status'];
  readonly attemptKind: AiProcessingAttemptKind;
  readonly promptKey: string;
  readonly sequenceIndex: number;
  readonly providerId: string | null;
  readonly provider: { readonly name: string } | null;
  readonly model: string;
  readonly startedAt: Date;
  readonly finishedAt: Date | null;
  readonly durationMs: number | null;
  readonly httpStatus: number | null;
  readonly requestMetadata: unknown;
  readonly responseMetadata: unknown;
  readonly errorCode: string | null;
  readonly errorMessage: string | null;
  readonly rawResponse: string | null;
  readonly rawResponseTruncated: boolean;
}): AiProcessingAttemptDto {
  return {
    id: attempt.id,
    status: attempt.status,
    attemptKind: attempt.attemptKind,
    promptKey: attempt.promptKey,
    sequenceIndex: attempt.sequenceIndex,
    providerId: attempt.providerId,
    providerName: attempt.provider?.name ?? null,
    model: attempt.model,
    startedAt: attempt.startedAt.toISOString(),
    finishedAt: attempt.finishedAt?.toISOString() ?? null,
    durationMs: attempt.durationMs,
    httpStatus: attempt.httpStatus,
    requestMetadata: AiProcessingRequestMetadataSchema.parse(
      attempt.requestMetadata,
    ),
    responseMetadata: attempt.responseMetadata
      ? AiProcessingResponseMetadataSchema.parse(attempt.responseMetadata)
      : null,
    errorCode: parsedErrorCode(attempt.errorCode),
    errorMessage: attempt.errorMessage,
    rawResponse: attempt.rawResponse,
    rawResponseTruncated: attempt.rawResponseTruncated,
  };
}

function logStatus(
  jobStatus: string,
  attempts: readonly { readonly status: string }[],
): AiProcessingLogStatus {
  const hasInterrupted = attempts.some(
    (attempt) => attempt.status === 'INTERRUPTED',
  );
  const hasFailed = attempts.some((attempt) => attempt.status === 'FAILED');
  if (jobStatus === 'WAITING' || jobStatus === 'ACTIVE') {
    const hasActive = attempts.some((attempt) => attempt.status === 'ACTIVE');
    return hasInterrupted && !hasActive ? 'INTERRUPTED' : 'RUNNING';
  }
  if (jobStatus === 'COMPLETED') {
    return hasFailed || hasInterrupted ? 'RECOVERED' : 'SUCCESS';
  }
  return hasInterrupted ? 'INTERRUPTED' : 'FAILED';
}

function parsedErrorCode(
  value: string | null | undefined,
): AiProcessingErrorCode | null {
  if (!value) {
    return null;
  }
  const parsed = AiProcessingErrorCodeSchema.safeParse(value);
  return parsed.success ? parsed.data : 'AI_INTERNAL_ERROR';
}

function durationMs(startedAt: Date, finishedAt: Date): number {
  return Math.max(0, finishedAt.getTime() - startedAt.getTime());
}

function toInputJson(value: object): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function truncateUtf8(
  value: string | null,
  maximumBytes: number,
): { value: string | null; truncated: boolean } {
  if (value === null) {
    return { value: null, truncated: false };
  }
  const bytes = Buffer.from(value, 'utf8');
  if (bytes.byteLength <= maximumBytes) {
    return { value, truncated: false };
  }
  return {
    value: bytes.subarray(0, maximumBytes).toString('utf8'),
    truncated: true,
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
