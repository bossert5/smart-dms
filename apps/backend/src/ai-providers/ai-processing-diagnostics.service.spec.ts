import { AiProcessingDiagnosticsService } from './ai-processing-diagnostics.service';
import { mockArg } from '../testing/expect-matchers';

type AttemptCreateArgs = {
  data: {
    requestMetadata?: unknown;
    promptKey?: string;
  };
};

type AttemptUpdateArgs = {
  data: {
    rawResponse?: string | null;
    rawResponseTruncated?: boolean;
    errorCode?: string;
    status?: string;
    durationMs?: number;
  };
};

type ProcessingJobFindManyArgs = {
  where: unknown;
  skip: number;
  take: number;
  select: {
    aiAttempts: {
      select: Record<string, unknown>;
    };
  };
};

const jobId = '018f1a44-9093-7f55-a515-278f4d9bd700';
const documentId = '018f1a44-9093-7f55-a515-278f4d9bd701';
const providerId = '018f1a44-9093-7f55-a515-278f4d9bd777';

function createPrismaMock() {
  const prisma = {
    aiProcessingAttempt: {
      create: jest
        .fn<
          (args: AttemptCreateArgs) => Promise<{ id: string; startedAt: Date }>
        >()
        .mockResolvedValue({
          id: '018f1a44-9093-7f55-a515-278f4d9bd702',
          startedAt: new Date('2026-08-11T20:00:00.000Z'),
        }),
      update: jest
        .fn<(args: AttemptUpdateArgs) => Promise<object>>()
        .mockResolvedValue({}),
      findMany: jest.fn().mockResolvedValue([
        {
          id: '018f1a44-9093-7f55-a515-278f4d9bd704',
          startedAt: new Date('2026-08-15T11:30:00.000Z'),
        },
      ]),
      deleteMany: jest.fn().mockResolvedValue({ count: 2 }),
    },
    processingJob: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      count: jest.fn(),
    },
    $transaction: jest.fn((operations: Promise<unknown>[]) =>
      Promise.all(operations),
    ),
  };
  return prisma;
}

const requestMetadata = {
  temperature: 0.1,
  maxOutputTokens: 1200,
  reasoningEffort: 'none' as const,
  inputCharacterCount: 120,
  resultSchemaHash: 'a'.repeat(64),
};

describe('AiProcessingDiagnosticsService', () => {
  it('stores bounded raw provider responses for failed attempts', async () => {
    const prisma = createPrismaMock();
    const service = new AiProcessingDiagnosticsService(prisma as never);
    const context = {
      processingJobId: jobId,
      documentId,
      providerId,
      model: 'gemma4-12b',
      promptKey: 'TITLE',
      sequenceIndex: 0,
      attemptKind: 'INITIAL' as const,
      requestMetadata,
    };
    const attempt = await service.tryStartAttempt(context);

    await service.tryFailAttempt(attempt, context, {
      httpStatus: 200,
      responseMetadata: null,
      errorCode: 'AI_INVALID_JSON',
      errorMessage: 'invalid JSON',
      rawResponse: 'x'.repeat(300 * 1024),
    });

    const create = mockArg<AttemptCreateArgs>(
      prisma.aiProcessingAttempt.create,
    );
    expect(create.data.requestMetadata).toEqual(requestMetadata);
    expect(create.data.promptKey).toBe('TITLE');
    const update = mockArg<AttemptUpdateArgs>(
      prisma.aiProcessingAttempt.update,
    );
    expect(update.data.rawResponseTruncated).toBe(true);
    expect(
      Buffer.byteLength(update.data.rawResponse ?? '', 'utf8'),
    ).toBeLessThanOrEqual(256 * 1024);
    expect(update.data.errorCode).toBe('AI_INVALID_JSON');
  });

  it('does not let diagnostic persistence failures affect AI processing', async () => {
    const prisma = createPrismaMock();
    prisma.aiProcessingAttempt.create.mockRejectedValueOnce(
      new Error('database unavailable'),
    );
    const service = new AiProcessingDiagnosticsService(prisma as never);

    await expect(
      service.tryStartAttempt({
        processingJobId: jobId,
        documentId,
        providerId,
        model: 'gemma4-12b',
        promptKey: 'TITLE',
        sequenceIndex: 0,
        attemptKind: 'INITIAL',
        requestMetadata,
      }),
    ).resolves.toBeNull();
  });

  it('marks stale attempts interrupted and removes diagnostics older than 14 days', async () => {
    const prisma = createPrismaMock();
    const service = new AiProcessingDiagnosticsService(prisma as never);
    const now = new Date('2026-08-15T12:00:00.000Z');

    await expect(service.maintain(now)).resolves.toEqual({
      interrupted: 1,
      deleted: 2,
    });
    expect(prisma.aiProcessingAttempt.findMany).toHaveBeenCalledWith({
      where: {
        status: 'ACTIVE',
        startedAt: { lt: new Date('2026-08-15T11:45:00.000Z') },
      },
      select: { id: true, startedAt: true },
    });
    expect(
      mockArg<AttemptUpdateArgs>(prisma.aiProcessingAttempt.update),
    ).toMatchObject({
      where: { id: '018f1a44-9093-7f55-a515-278f4d9bd704' },
      data: {
        status: 'INTERRUPTED',
        durationMs: 30 * 60 * 1000,
        errorCode: 'AI_PROCESS_INTERRUPTED',
      },
    });
    expect(prisma.aiProcessingAttempt.deleteMany).toHaveBeenCalledWith({
      where: { createdAt: { lt: new Date('2026-08-01T12:00:00.000Z') } },
    });
  });

  it('groups failed and successful attempts as a recovered job', async () => {
    const prisma = createPrismaMock();
    prisma.processingJob.findMany.mockResolvedValue([
      {
        id: jobId,
        documentId,
        status: 'COMPLETED',
        startedAt: new Date('2026-08-11T20:00:00.000Z'),
        finishedAt: new Date('2026-08-11T20:00:05.000Z'),
        errorCode: null,
        errorMessage: null,
        document: { title: null, originalFileName: 'invoice.pdf' },
        assignedAiProvider: {
          id: providerId,
          name: 'PC-PB',
          selectedModel: 'gemma4-12b',
        },
        aiAttempts: [
          {
            providerId,
            provider: { name: 'PC-PB' },
            model: 'gemma4-12b',
            status: 'FAILED',
            startedAt: new Date('2026-08-11T20:00:00.000Z'),
            finishedAt: new Date('2026-08-11T20:00:02.000Z'),
            errorCode: 'AI_INVALID_JSON',
            errorMessage: 'invalid JSON',
          },
          {
            providerId,
            provider: { name: 'PC-PB' },
            model: 'gemma4-12b',
            status: 'SUCCESS',
            startedAt: new Date('2026-08-11T20:00:02.000Z'),
            finishedAt: new Date('2026-08-11T20:00:05.000Z'),
            errorCode: null,
            errorMessage: null,
          },
        ],
      },
    ]);
    prisma.processingJob.count.mockResolvedValue(1);
    const service = new AiProcessingDiagnosticsService(prisma as never);

    const result = await service.list({ page: 1, pageSize: 25 });

    expect(result.items[0]).toMatchObject({
      jobId,
      status: 'RECOVERED',
      attemptCount: 2,
      failedAttemptCount: 1,
      errorCode: 'AI_INVALID_JSON',
      hasDetailedDiagnostics: true,
    });
    expect(result.pagination).toEqual({
      page: 1,
      pageSize: 25,
      totalItems: 1,
      totalPages: 1,
    });
  });

  it('combines diagnostic filters with server pagination and omits raw responses from lists', async () => {
    const prisma = createPrismaMock();
    prisma.processingJob.findMany.mockResolvedValue([]);
    prisma.processingJob.count.mockResolvedValue(0);
    const service = new AiProcessingDiagnosticsService(prisma as never);
    const dateNow = jest
      .spyOn(Date, 'now')
      .mockReturnValue(new Date('2026-08-11T22:00:00.000Z').getTime());

    await service.list({
      page: 2,
      pageSize: 10,
      status: 'FAILED',
      providerId,
      errorCode: 'AI_INVALID_JSON',
      from: '2026-08-10T00:00:00.000Z',
      to: '2026-08-11T23:59:59.000Z',
    });
    dateNow.mockRestore();

    const query = mockArg<ProcessingJobFindManyArgs>(
      prisma.processingJob.findMany,
    );
    expect(query).toMatchObject({
      where: {
        jobType: 'EXTRACT_AI_METADATA',
        createdAt: {
          gte: new Date('2026-08-10T00:00:00.000Z'),
          lte: new Date('2026-08-11T23:59:59.000Z'),
        },
        AND: [
          {
            OR: [
              { assignedAiProviderId: providerId },
              { aiAttempts: { some: { providerId } } },
            ],
          },
          { aiAttempts: { some: { errorCode: 'AI_INVALID_JSON' } } },
          {
            status: 'FAILED',
            aiAttempts: { none: { status: 'INTERRUPTED' } },
          },
        ],
      },
      skip: 10,
      take: 10,
    });
    expect(query.select.aiAttempts.select).not.toHaveProperty('rawResponse');
  });
});
