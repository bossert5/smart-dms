import { expectAny, expectObjectContaining } from './testing/expect-matchers';
import {
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  AppConfigService,
  resolveBackendRoot,
} from './common/app-config.service';
import { JwtAuthGuard } from './common/jwt-auth.guard';
import { RolesGuard } from './common/roles.guard';
import { AuditService } from './audit/audit.service';
import { AccessTokenService } from './auth/access-token.service';
import { AiProviderRouter } from './ai-providers/ai-provider-router.service';
import {
  AiProviderHealthError,
  AiProviderResponseError,
} from './ai-providers/ai-provider-errors';
import { AiProviderSecretService } from './ai-providers/ai-provider-secret.service';
import { OpenAiModelsClient } from './ai-providers/openai-models.client';
import { ProcessingJobsService } from './processing/processing-jobs.service';
import { TenantScopeService } from './tenants/tenant-scope.service';
import { UploadsService } from './uploads/uploads.service';
import { HealthService } from './health/health.service';

const tenantId = '018f1a44-9093-7f55-a515-278f4d9bd900';
const otherTenantId = '018f1a44-9093-7f55-a515-278f4d9bd901';
const user = {
  id: '00000000-0000-4000-8000-000000000001',
  username: 'admin',
  displayName: 'Admin',
  role: 'Admin' as const,
  isActive: true,
  passwordChangeRequired: false,
  createdAt: '2026-05-07T00:00:00.000Z',
  updatedAt: '2026-05-07T00:00:00.000Z',
  tenants: [{ id: tenantId, key: 'default', name: 'Default', isActive: true }],
  defaultTenantId: tenantId,
};

const now = new Date('2026-05-07T18:00:00.000Z');

describe('critical backend services', () => {
  it('resolves tenant scope from headers and denies inaccessible tenants', async () => {
    const prisma = {
      tenant: {
        findUnique: jest.fn().mockResolvedValue({ isActive: true }),
      },
    };
    const service = new TenantScopeService(prisma as never);

    expect(service.resolveFromHeader(user, undefined)).toEqual({
      requestedScope: tenantId,
      tenantIds: [tenantId],
      isAll: false,
    });
    expect(service.resolveFromHeader(user, 'all')).toEqual({
      requestedScope: 'all',
      tenantIds: [tenantId],
      isAll: true,
    });
    expect(() => service.resolveFromHeader(user, otherTenantId)).toThrow(
      ForbiddenException,
    );
    await expect(
      service.assertTenantAccess(user, otherTenantId),
    ).rejects.toThrow(ForbiddenException);
    await expect(
      service.assertActiveTenantExists(tenantId),
    ).resolves.toBeUndefined();
    prisma.tenant.findUnique.mockResolvedValueOnce({ isActive: false });
    await expect(service.assertActiveTenantExists(tenantId)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('authenticates bearer tokens and enforces roles', async () => {
    const accessTokens = {
      authenticate: jest.fn().mockResolvedValue(user),
    };
    const publicReflector = {
      getAllAndOverride: jest.fn().mockReturnValue(true),
    };
    const privateReflector = {
      getAllAndOverride: jest.fn().mockReturnValue(false),
    };
    const request = { headers: { authorization: 'Bearer token' } };
    const context = executionContext(request);

    await expect(
      new JwtAuthGuard(
        publicReflector as never,
        accessTokens as never,
      ).canActivate(context as never),
    ).resolves.toBe(true);
    await expect(
      new JwtAuthGuard(
        privateReflector as never,
        accessTokens as never,
      ).canActivate(context as never),
    ).resolves.toBe(true);
    expect(accessTokens.authenticate).toHaveBeenCalledWith('token');
    expect(request).toMatchObject({ user });

    const rolesGuard = new RolesGuard({
      getAllAndOverride: jest.fn().mockReturnValue(['Admin']),
    } as never);
    expect(rolesGuard.canActivate(executionContext({ user }) as never)).toBe(
      true,
    );
    expect(() =>
      rolesGuard.canActivate(
        executionContext({ user: { ...user, role: 'User' } }) as never,
      ),
    ).toThrow(ForbiddenException);
  });

  it('loads users from valid access tokens and hides invalid token errors', async () => {
    const jwt = {
      verifyAsync: jest.fn().mockResolvedValue({ sub: user.id }),
    };
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: user.id,
          username: user.username,
          displayName: user.displayName,
          role: user.role,
          isActive: true,
          passwordChangeRequired: false,
          createdAt: now,
          updatedAt: now,
          tenantMemberships: [
            {
              tenantId,
              isDefault: true,
              tenant: {
                id: tenantId,
                key: 'default',
                name: 'Default',
                isActive: true,
              },
            },
          ],
        }),
      },
    };
    const service = new AccessTokenService(
      jwt as never,
      { jwtAccessSecret: 'secret' } as never,
      prisma as never,
    );

    await expect(service.authenticate('token')).resolves.toMatchObject({
      id: user.id,
      defaultTenantId: tenantId,
    });
    await expect(service.authenticate(undefined)).rejects.toThrow(
      'Missing access token.',
    );
    jwt.verifyAsync.mockRejectedValueOnce(new Error('bad jwt'));
    await expect(service.authenticate('bad-token')).rejects.toThrow(
      'Invalid access token.',
    );
  });

  it('creates and enqueues processing jobs with processing options', async () => {
    const prisma = {
      processingJob: {
        create: jest.fn().mockResolvedValue({ id: 'job-id' }),
        update: jest
          .fn()
          .mockResolvedValue({ id: 'job-id', bullJobId: 'bull-id' }),
      },
    };
    const queue = {
      add: jest.fn().mockResolvedValue({ id: 'bull-id' }),
    };
    const service = new ProcessingJobsService(prisma as never, queue as never);

    await expect(
      service.enqueueDocumentProcessing('document-id', 'OCR_DOCUMENT', {
        rotationDegrees: 180,
      }),
    ).resolves.toEqual({ id: 'job-id', bullJobId: 'bull-id' });

    expect(prisma.processingJob.create).toHaveBeenCalledWith({
      data: expectObjectContaining({
        documentId: 'document-id',
        jobType: 'OCR_DOCUMENT',
        status: 'WAITING',
        payload: { rotationDegrees: 180 },
      }),
    });
    expect(queue.add).toHaveBeenCalledWith(
      'process-document',
      {
        documentId: 'document-id',
        jobType: 'OCR_DOCUMENT',
        processingJobId: 'job-id',
        processingOptions: { rotationDegrees: 180 },
      },
      { jobId: 'job-id' },
    );
  });

  it('requeues existing processing jobs with BullMQ-safe custom ids', async () => {
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(1715104800000);
    const prisma = {
      processingJob: {
        update: jest
          .fn()
          .mockResolvedValue({ id: 'job-id', bullJobId: 'bull-id' }),
      },
    };
    const queue = {
      add: jest.fn().mockResolvedValue({ id: 'bull-id' }),
    };
    const service = new ProcessingJobsService(prisma as never, queue as never);

    try {
      await expect(
        service.enqueueExistingDocumentProcessingJob({
          id: 'job-id',
          documentId: 'document-id',
          jobType: 'EXTRACT_AI_METADATA',
        }),
      ).resolves.toEqual({ id: 'job-id', bullJobId: 'bull-id' });
    } finally {
      nowSpy.mockRestore();
    }

    expect(queue.add).toHaveBeenCalledWith(
      'process-document',
      {
        documentId: 'document-id',
        jobType: 'EXTRACT_AI_METADATA',
        processingJobId: 'job-id',
      },
      { jobId: 'job-id-retry-1715104800000' },
    );
  });

  it('accepts uploads and records all processing side effects', async () => {
    const createdDocument = documentRecord({ status: 'INGESTING' });
    const updatedDocument = documentRecord({ status: 'OCR_PENDING' });
    const uploadTransaction = {
      fileArtifact: { create: jest.fn() },
      document: { update: jest.fn().mockResolvedValue(updatedDocument) },
    };
    const prisma = {
      document: {
        create: jest.fn().mockResolvedValue(createdDocument),
      },
      $transaction: jest.fn(
        <TResult>(callback: (tx: typeof uploadTransaction) => TResult) =>
          callback(uploadTransaction),
      ),
    };
    const storage = {
      moveUploadedOriginal: jest.fn().mockResolvedValue({
        relativePath: 'documents/document-id/original.pdf',
        size: 1234,
        checksum: 'checksum',
      }),
      documentThumbnailUrl: jest.fn(),
    };
    const processingJobs = {
      createDocumentProcessingJob: jest.fn().mockResolvedValue({
        id: 'pending-job-id',
        documentId: createdDocument.id,
      }),
      enqueueCreatedDocumentProcessingJob: jest.fn().mockResolvedValue({
        id: 'job-id',
      }),
    };
    const audit = { record: jest.fn() };
    const realtimeEvents = { documentChanged: jest.fn() };
    const notifications = { publish: jest.fn() };
    const documentHistory = { record: jest.fn() };
    const tenantScope = {
      assertTenantAccess: jest.fn().mockResolvedValue(undefined),
    };
    const service = new UploadsService(
      { maxUploadSizeBytes: 1000 } as never,
      prisma as never,
      storage as never,
      processingJobs as never,
      audit as never,
      realtimeEvents as never,
      notifications as never,
      documentHistory as never,
      tenantScope as never,
    );

    await expect(
      service.acceptDocumentUpload(
        {
          originalname: 'invoice.pdf',
          mimetype: 'application/pdf',
          path: '/tmp/upload',
          size: 456,
        } as Express.Multer.File,
        user,
        tenantId,
      ),
    ).resolves.toMatchObject({
      document: { id: createdDocument.id, title: 'invoice' },
      jobId: 'job-id',
    });

    expect(tenantScope.assertTenantAccess).toHaveBeenCalledWith(user, tenantId);
    expect(storage.moveUploadedOriginal).toHaveBeenCalledWith(
      '/tmp/upload',
      createdDocument.id,
      'invoice.pdf',
    );
    expect(processingJobs.createDocumentProcessingJob).toHaveBeenCalledWith(
      createdDocument.id,
      'OCR_DOCUMENT',
    );
    expect(
      processingJobs.enqueueCreatedDocumentProcessingJob,
    ).toHaveBeenCalled();
    expect(documentHistory.record).toHaveBeenCalledTimes(2);
    expect(notifications.publish).toHaveBeenCalledWith(
      expectObjectContaining({ type: 'document.uploaded', tenantId }),
    );
    expect(realtimeEvents.documentChanged).toHaveBeenCalledWith(
      expectObjectContaining({ reason: 'DOCUMENT_UPLOADED' }),
    );
    expect(audit.record).toHaveBeenCalledWith(
      expectObjectContaining({ action: 'DOCUMENT_UPLOADED' }),
    );
    expect(service.configResponse()).toEqual({
      maxUploadSizeBytes: 1000,
      allowedMimeTypes: [
        'application/pdf',
        'image/tiff',
        'image/jpeg',
        'image/png',
      ],
    });
    await expect(
      service.acceptDocumentUpload(undefined, user, tenantId),
    ).rejects.toThrow('Missing upload file.');
    await expect(
      service.acceptDocumentUpload(
        { mimetype: 'text/plain' } as Express.Multer.File,
        user,
        tenantId,
      ),
    ).rejects.toThrow('Unsupported file type.');
  });

  it('routes AI prompts through available providers and marks failures', async () => {
    const providers = {
      availableProviders: jest.fn().mockResolvedValue([
        { id: 'provider-1', name: 'Provider 1' },
        { id: 'provider-2', name: 'Provider 2' },
      ]),
      markProviderUnavailable: jest.fn(),
    };
    const responses = {
      runPrompt: jest
        .fn()
        .mockRejectedValueOnce(new AiProviderHealthError('rate limited'))
        .mockResolvedValueOnce({ title: 'Invoice' }),
    };
    const router = new AiProviderRouter(
      providers as never,
      responses as never,
      {} as never,
    );

    await expect(router.hasAvailableProvider()).resolves.toBe(true);
    await expect(
      router.promptRunner()({ prompt: 'Extract metadata' } as never),
    ).resolves.toEqual({
      title: 'Invoice',
    });
    expect(providers.markProviderUnavailable).toHaveBeenCalledWith(
      'provider-1',
      expectAny(Error),
    );

    providers.availableProviders.mockResolvedValueOnce([]);
    await expect(
      router.runPrompt({ prompt: 'Extract metadata' } as never),
    ).rejects.toThrow(ServiceUnavailableException);
  });

  it('keeps providers available when an AI response is invalid', async () => {
    const providers = {
      availableProviders: jest.fn().mockResolvedValue([
        { id: 'provider-1', name: 'Provider 1' },
        { id: 'provider-2', name: 'Provider 2' },
      ]),
      markProviderUnavailable: jest.fn(),
    };
    const responses = {
      runPrompt: jest
        .fn()
        .mockRejectedValueOnce(new AiProviderResponseError('invalid JSON')),
    };
    const router = new AiProviderRouter(
      providers as never,
      responses as never,
      {} as never,
    );

    await expect(
      router.runPrompt({ prompt: 'Extract metadata' } as never),
    ).rejects.toThrow('invalid JSON');
    expect(responses.runPrompt).toHaveBeenCalledTimes(1);
    expect(providers.markProviderUnavailable).not.toHaveBeenCalled();
  });

  it('encrypts provider secrets and reads OpenAI-compatible model lists', async () => {
    const secrets = new AiProviderSecretService({
      secretEncryptionKey: 'test-secret',
    } as never);
    const encrypted = secrets.encrypt('api-key');
    expect(secrets.decrypt(encrypted)).toBe('api-key');

    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            data: [
              { id: 'gpt-test', created: 1_700_000_000, owned_by: 'owner' },
              { id: '', created: 'bad' },
            ],
          }),
      } as Response)
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ error: { message: 'provider failed' } }),
      } as Response);
    const client = new OpenAiModelsClient();

    await expect(
      client.listModels(
        { baseUrl: 'https://provider.example/v1/', encryptedApiKey: encrypted },
        secrets,
      ),
    ).resolves.toEqual([
      {
        name: 'gpt-test',
        model: 'gpt-test',
        createdAt: '2023-11-14T22:13:20.000Z',
        ownedBy: 'owner',
      },
    ]);
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://provider.example/v1/models',
      expectObjectContaining({
        headers: expectObjectContaining({ Authorization: 'Bearer api-key' }),
      }),
    );
    await expect(
      client.listModels(
        { baseUrl: 'https://provider.example/v1', encryptedApiKey: null },
        secrets,
      ),
    ).rejects.toThrow('provider failed');
    fetchSpy.mockRestore();
  });

  it('reads configuration defaults and validates bounded values', () => {
    const values = new Map<string, string | undefined>([
      ['DMS_SECRET_ENCRYPTION_KEY', 'secret'],
      ['DMS_MAX_UPLOAD_SIZE_MB', '5'],
      ['DMS_OCR_OPTIMIZE', '9'],
      ['DMS_OCR_JOBS', '-1'],
      ['DMS_OCR_CLEAN', 'no'],
    ]);
    const config = new AppConfigService({
      get: jest.fn((key: string) => values.get(key)),
    } as never);

    expect(config.port).toBe(3010);
    expect(config.secretEncryptionKey).toBe('secret');
    expect(config.maxUploadSizeBytes).toBe(5 * 1024 * 1024);
    expect(config.ocrOptimizeLevel).toBe(3);
    expect(config.ocrJobs).toBe(2);
    expect(config.ocrClean).toBe(false);
    expect(config.resolveScannerImportPath('default')).toContain(
      'scanner-import/default',
    );
    expect(resolveBackendRoot('/app/apps/backend/src/common')).toBe(
      '/app/apps/backend',
    );
    expect(resolveBackendRoot('/app/apps/backend/dist/src/common')).toBe(
      '/app/apps/backend',
    );

    const missingSecret = new AppConfigService({ get: jest.fn() } as never);
    expect(() => missingSecret.secretEncryptionKey).toThrow(
      'DMS_SECRET_ENCRYPTION_KEY must be configured.',
    );
  });

  it('records audit events without leaking persistence failures', async () => {
    const create = jest.fn().mockResolvedValue(undefined);
    const service = new AuditService({ auditEvent: { create } } as never);
    await expect(
      service.record({
        actorUserId: user.id,
        action: 'DOCUMENT_UPLOADED',
        entityType: 'Document',
        entityId: 'document-id',
        metadata: { fileName: 'invoice.pdf' },
      }),
    ).resolves.toBeUndefined();
    expect(create).toHaveBeenCalledWith({
      data: expectObjectContaining({
        actorUserId: user.id,
        action: 'DOCUMENT_UPLOADED',
      }),
    });

    create.mockRejectedValueOnce(new Error('db down'));
    await expect(
      service.record({ action: 'FAILED', entityType: 'Document' }),
    ).resolves.toBeUndefined();
  });

  it('checks database health', async () => {
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
    };
    const service = new HealthService(prisma as never);

    await expect(service.check()).resolves.toMatchObject({ status: 'ok' });
    expect(prisma.$queryRaw).toHaveBeenCalled();
  });
});

function executionContext(request: unknown) {
  return {
    getHandler: jest.fn(),
    getClass: jest.fn(),
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  };
}

function documentRecord(input: { status: string }) {
  return {
    id: '018f1a44-9093-7f55-a515-278f4d9bd99f',
    tenantId,
    tenant: { id: tenantId, key: 'default', name: 'Default', isActive: true },
    title: 'invoice',
    originalFileName: 'invoice.pdf',
    source: 'UPLOAD',
    mimeType: 'application/pdf',
    status: input.status,
    createdAt: now,
    updatedAt: now,
    acceptedAt: null,
    acceptedById: null,
    aiProcessedAt: null,
    documentDate: null,
    summary: null,
    sender: null,
    recipient: null,
    note: null,
    checksum: 'checksum',
    fileSize: 1234,
    pageCount: null,
    thumbnailPath: null,
    pdfPath: null,
    ocrText: null,
    failedReason: null,
    documentTypeId: null,
    documentType: null,
    tags: [],
    calendarEvents: [],
  };
}
