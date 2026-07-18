import {
  expectAny,
  expectArrayContaining,
  expectObjectContaining,
  mockArg,
} from '../testing/expect-matchers';
import { BadRequestException } from '@nestjs/common';
import type { DocumentSearchRequest } from '@smart-dms/shared-dto';
import type { AuthenticatedUser } from '../common/authenticated-user';
import { DocumentsService } from './documents.service';

const tenant = {
  id: '018f1a44-9093-7f55-a515-278f4d9bd900',
  key: 'default',
  name: 'Default',
  isActive: true,
};
const targetTenant = {
  id: '018f1a44-9093-7f55-a515-278f4d9bd901',
  key: 'target',
  name: 'Target',
  isActive: true,
};

const user: AuthenticatedUser = {
  id: '00000000-0000-4000-8000-000000000001',
  username: 'admin',
  displayName: 'Admin',
  role: 'Admin',
  isActive: true,
  passwordChangeRequired: false,
  createdAt: '2026-05-07T00:00:00.000Z',
  updatedAt: '2026-05-07T00:00:00.000Z',
  tenants: [tenant],
  defaultTenantId: tenant.id,
};

const documentId = '018f1a44-9093-7f55-a515-278f4d9bd99f';
const jobId = '018f1a44-9093-7f55-a515-278f4d9bd990';

function summaryDocument(status: 'ARCHIVED' | 'OCR_PENDING' | 'READY') {
  return {
    id: documentId,
    tenantId: tenant.id,
    tenant,
    title: 'Invoice',
    documentTypeId: null,
    documentType: null,
    originalFileName: 'invoice.pdf',
    source: 'UPLOAD',
    mimeType: 'application/pdf',
    status,
    createdAt: new Date('2026-05-07T18:00:00.000Z'),
    updatedAt: new Date('2026-05-07T18:05:00.000Z'),
    acceptedAt: new Date('2026-05-07T18:05:00.000Z'),
    acceptedById: null,
    aiProcessedAt: null,
    documentDate: null,
    summary: null,
    sender: null,
    recipient: null,
    note: null,
    fileSize: 1234,
    pageCount: 1,
    thumbnailPath: null,
    tags: [],
    calendarEvents: [],
  };
}

function detailDocument(overrides: Record<string, unknown> = {}) {
  return {
    ...summaryDocument('READY'),
    pdfPath: null,
    ocrText: null,
    failedReason: null,
    attributes: [],
    payments: [],
    references: [],
    artifacts: [],
    calendarEvents: [],
    ...overrides,
  };
}

function createService() {
  const tx = {
    document: {
      update: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    documentAttribute: {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    documentPayment: {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      count: jest.fn().mockResolvedValue(1),
      create: jest.fn().mockResolvedValue({}),
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    documentCalendarEvent: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
      delete: jest.fn().mockResolvedValue({}),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      create: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    documentReference: {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      update: jest.fn().mockResolvedValue({}),
      create: jest.fn().mockResolvedValue({}),
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    documentFieldDefinition: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    documentTag: {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      create: jest.fn().mockResolvedValue({}),
    },
    tag: {
      upsert: jest.fn().mockResolvedValue({
        id: '018f1a44-9093-7f55-a515-278f4d9bd902',
      }),
    },
    user: {
      findFirst: jest.fn().mockResolvedValue({ id: user.id }),
      findMany: jest.fn().mockResolvedValue([{ id: user.id }]),
    },
  };
  const prisma = {
    document: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      findMany: jest.fn(),
    },
    tag: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    tenant: {
      findMany: jest.fn().mockResolvedValue([
        { id: tenant.id, name: tenant.name },
        { id: targetTenant.id, name: targetTenant.name },
      ]),
    },
    documentFieldDefinition: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    documentType: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    documentCalendarEvent: {
      findFirst: jest.fn(),
    },
    user: {
      findFirst: jest.fn().mockResolvedValue({ id: user.id }),
    },
    $queryRaw: jest.fn().mockResolvedValue([]),
    $transaction: jest.fn(
      <TResult>(callback: (transaction: typeof tx) => TResult) => callback(tx),
    ),
  };
  const storage = {
    deleteStoredFile: jest.fn().mockResolvedValue(undefined),
    deleteDocumentTemporaryFiles: jest.fn().mockResolvedValue(undefined),
  };
  const processingJobs = {
    enqueueDocumentProcessing: jest.fn(),
  };
  const audit = {
    record: jest.fn().mockResolvedValue(undefined),
  };
  const notifications = {
    publish: jest.fn().mockResolvedValue(undefined),
  };
  const realtimeEvents = {
    documentChanged: jest.fn().mockResolvedValue(undefined),
  };
  const documentHistory = {
    listForDocument: jest.fn(),
    record: jest.fn().mockResolvedValue(undefined),
  };
  const aiProcessing = {
    assertDocumentIsNotAiRunning: jest.fn(),
    triggerDocumentAiExtraction: jest.fn(),
    triggerBulkAiExtraction: jest.fn(),
  };
  const settings = {
    getSettings: jest.fn().mockResolvedValue({
      ocrReprocessExistingTextLayer: false,
      pdfRemoveBlankPages: false,
      documentsRequireAiMetadataBeforeAcceptance: false,
      extractionMode: 'fast',
      aiMetadataLanguage: 'DOCUMENT_LANGUAGE',
    }),
  };
  const service = new DocumentsService(
    prisma as never,
    storage as never,
    processingJobs as never,
    audit as never,
    realtimeEvents as never,
    notifications as never,
    documentHistory as never,
    aiProcessing as never,
    settings as never,
  );

  return {
    aiProcessing,
    audit,
    documentHistory,
    notifications,
    realtimeEvents,
    prisma,
    processingJobs,
    service,
    settings,
    storage,
    tx,
  };
}

function orderBySql(
  service: DocumentsService,
  sortBy: DocumentSearchRequest['sortBy'],
  sortDirection: DocumentSearchRequest['sortDirection'] = 'asc',
): string {
  const request: DocumentSearchRequest = {
    page: 1,
    pageSize: 25,
    searchFields: ['title', 'content', 'sender', 'tags'],
    sortBy,
    sortDirection,
  };
  const orderBy = (
    service as unknown as {
      buildSqlOrderBy(
        request: DocumentSearchRequest,
        hasSearchQuery: boolean,
      ): { readonly strings: readonly string[] };
    }
  ).buildSqlOrderBy(request, false);

  return orderBy.strings.join('');
}

interface MetadataContainsSearchTokenForTest {
  readonly value: string;
  readonly pattern: string;
}

function metadataTokens(
  ...values: string[]
): MetadataContainsSearchTokenForTest[] {
  return values.map((value) => ({ value, pattern: `%${value}%` }));
}

function searchSql(
  service: DocumentsService,
  method:
    | 'searchFtsMatchSql'
    | 'searchMetadataContainsSql'
    | 'searchMatchSql'
    | 'searchRankSql',
  searchFields: DocumentSearchRequest['searchFields'],
  metadataContainsTokens: MetadataContainsSearchTokenForTest[] = [],
): { readonly text: string; readonly values: readonly unknown[] } {
  const privateService = service as unknown as {
    searchFtsMatchSql(fields: DocumentSearchRequest['searchFields']): {
      readonly strings: readonly string[];
      readonly values: readonly unknown[];
    };
    searchMetadataContainsSql(
      fields: DocumentSearchRequest['searchFields'],
      metadataContainsTokens: MetadataContainsSearchTokenForTest[],
    ): {
      readonly strings: readonly string[];
      readonly values: readonly unknown[];
    } | null;
    searchMatchSql(
      fields: DocumentSearchRequest['searchFields'],
      metadataContainsTokens: MetadataContainsSearchTokenForTest[],
    ): {
      readonly strings: readonly string[];
      readonly values: readonly unknown[];
    };
    searchRankSql(
      fields: DocumentSearchRequest['searchFields'],
      metadataContainsTokens?: MetadataContainsSearchTokenForTest[],
    ): {
      readonly strings: readonly string[];
      readonly values: readonly unknown[];
    };
  };
  const sql =
    method === 'searchFtsMatchSql'
      ? privateService.searchFtsMatchSql(searchFields)
      : method === 'searchMetadataContainsSql'
        ? privateService.searchMetadataContainsSql(
            searchFields,
            metadataContainsTokens,
          )
        : method === 'searchMatchSql'
          ? privateService.searchMatchSql(searchFields, metadataContainsTokens)
          : privateService.searchRankSql(searchFields, metadataContainsTokens);

  return {
    text: sql?.strings.join('') ?? '',
    values: sql?.values ?? [],
  };
}

function conditionsSql(
  service: DocumentsService,
  request: DocumentSearchRequest,
  tenantIds: readonly string[] = [tenant.id],
): string {
  const conditions = (
    service as unknown as {
      buildSqlConditions(
        request: DocumentSearchRequest,
        scope: 'accepted' | 'inbox',
        tenantIds: readonly string[],
      ): Array<{ readonly strings: readonly string[] }>;
      combineSqlConditions(
        conditions: Array<{ readonly strings: readonly string[] }>,
      ): { readonly strings: readonly string[] };
    }
  ).buildSqlConditions(request, 'accepted', tenantIds);

  return (
    service as unknown as {
      combineSqlConditions(
        conditions: Array<{ readonly strings: readonly string[] }>,
      ): { readonly strings: readonly string[] };
    }
  )
    .combineSqlConditions(conditions)
    .strings.join('');
}

function metadataContainsSearchTokens(
  service: DocumentsService,
  query: string,
): MetadataContainsSearchTokenForTest[] {
  return (
    service as unknown as {
      metadataContainsSearchTokens(
        searchQuery: string,
      ): MetadataContainsSearchTokenForTest[];
    }
  ).metadataContainsSearchTokens(query);
}

function containsPattern(service: DocumentsService, token: string): string {
  return (
    service as unknown as {
      containsPattern(token: string): string;
    }
  ).containsPattern(token);
}

describe('DocumentsService', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('publishes a realtime notification when a document is archived', async () => {
    const {
      documentHistory,
      notifications,
      prisma,
      realtimeEvents,
      service,
      tx,
    } = createService();
    prisma.document.findFirst.mockResolvedValue({
      status: 'READY',
      tenantId: tenant.id,
    });
    tx.document.update.mockResolvedValue(summaryDocument('ARCHIVED'));

    await service.archive(documentId, user, [tenant.id]);

    expect(documentHistory.record).toHaveBeenCalledWith(
      expectObjectContaining({
        type: 'DOCUMENT_ARCHIVED',
        actorUserId: user.id,
        documentId,
      }),
      tx,
    );
    expect(notifications.publish).toHaveBeenCalledWith({
      type: 'document.archived',
      severity: 'warning',
      documentId,
      documentTitle: 'Invoice',
      tenantId: tenant.id,
      status: 'ARCHIVED',
    });
    expect(realtimeEvents.documentChanged).toHaveBeenCalledWith({
      documentId,
      tenantId: tenant.id,
      status: 'ARCHIVED',
      reason: 'DOCUMENT_ARCHIVED',
    });
  });

  it('moves an accepted document back to inbox and publishes realtime updates', async () => {
    const {
      audit,
      documentHistory,
      notifications,
      prisma,
      realtimeEvents,
      service,
      tx,
    } = createService();
    const acceptedAt = new Date('2026-05-07T18:05:00.000Z');
    prisma.document.findFirst.mockResolvedValue({
      id: documentId,
      status: 'READY',
      tenantId: tenant.id,
      title: 'Invoice',
      acceptedAt,
      acceptedById: user.id,
    });
    tx.document.update.mockResolvedValue({
      ...summaryDocument('READY'),
      acceptedAt: null,
      acceptedById: null,
    });

    await expect(
      service.moveToInbox(documentId, user, [tenant.id]),
    ).resolves.toMatchObject({
      document: {
        id: documentId,
        acceptedAt: null,
        acceptedById: null,
      },
    });

    expect(tx.document.update).toHaveBeenCalledWith(
      expectObjectContaining({
        where: { id: documentId },
        data: {
          acceptedAt: null,
          acceptedById: null,
        },
      }),
    );
    expect(documentHistory.record).toHaveBeenCalledWith(
      expectObjectContaining({
        type: 'DOCUMENT_MOVED_TO_INBOX',
        actorUserId: user.id,
        documentId,
      }),
      tx,
    );
    expect(audit.record).toHaveBeenCalledWith({
      actorUserId: user.id,
      action: 'DOCUMENT_MOVED_TO_INBOX',
      entityType: 'Document',
      entityId: documentId,
    });
    expect(notifications.publish).toHaveBeenCalledWith(
      expectObjectContaining({
        type: 'document.moved_to_inbox',
        tenantId: tenant.id,
        status: 'READY',
      }),
    );
    expect(realtimeEvents.documentChanged).toHaveBeenCalledWith({
      documentId,
      tenantId: tenant.id,
      status: 'READY',
      reason: 'DOCUMENT_MOVED_TO_INBOX',
    });
  });

  it('moves an inbox document to another active tenant and normalizes tenant-scoped data', async () => {
    const {
      audit,
      documentHistory,
      notifications,
      prisma,
      realtimeEvents,
      service,
      tx,
    } = createService();
    const invalidUserId = '018f1a44-9093-7f55-a515-278f4d9bd903';
    prisma.document.findFirst.mockResolvedValue({
      id: documentId,
      status: 'READY',
      tenantId: tenant.id,
      title: 'Invoice',
      originalFileName: 'invoice.pdf',
      acceptedAt: null,
      tags: [
        {
          source: 'MANUAL',
          tag: { name: 'finance' },
        },
      ],
      payments: [
        { id: '018f1a44-9093-7f55-a515-278f4d9bd904', assignedToId: user.id },
        {
          id: '018f1a44-9093-7f55-a515-278f4d9bd905',
          assignedToId: invalidUserId,
        },
      ],
      calendarEvents: [
        {
          id: '018f1a44-9093-7f55-a515-278f4d9bd906',
          assignedToId: invalidUserId,
        },
      ],
    });
    tx.document.update.mockResolvedValue({
      ...summaryDocument('READY'),
      tenantId: targetTenant.id,
      tenant: targetTenant,
      acceptedAt: null,
    });

    await expect(
      service.moveToTenant(
        documentId,
        { targetTenantId: targetTenant.id },
        user,
        [tenant.id],
      ),
    ).resolves.toMatchObject({
      document: {
        id: documentId,
        tenant: expectObjectContaining({ id: targetTenant.id }),
        acceptedAt: null,
      },
    });

    expect(prisma.tenant.findMany).toHaveBeenCalledWith({
      where: { isActive: true },
      select: { id: true, name: true },
    });
    expect(tx.user.findMany).toHaveBeenCalledWith({
      where: {
        id: { in: [user.id, invalidUserId] },
        isActive: true,
        tenantMemberships: {
          some: { tenantId: targetTenant.id },
        },
      },
      select: { id: true },
    });
    expect(tx.documentPayment.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['018f1a44-9093-7f55-a515-278f4d9bd905'] } },
      data: { assignedToId: null, assignedAt: null },
    });
    expect(tx.documentCalendarEvent.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['018f1a44-9093-7f55-a515-278f4d9bd906'] } },
      data: { assignedToId: null, assignedAt: null },
    });
    expect(tx.documentTag.deleteMany).toHaveBeenCalledWith({
      where: { documentId },
    });
    expect(tx.tag.upsert).toHaveBeenCalledWith({
      where: {
        tenantId_name: {
          tenantId: targetTenant.id,
          name: 'finance',
        },
      },
      create: {
        tenantId: targetTenant.id,
        name: 'finance',
        createdBy: user.id,
      },
      update: {},
    });
    expect(tx.documentTag.create).toHaveBeenCalledWith({
      data: {
        documentId,
        tagId: '018f1a44-9093-7f55-a515-278f4d9bd902',
        source: 'MANUAL',
      },
    });
    expect(tx.document.update).toHaveBeenCalledWith(
      expectObjectContaining({
        where: { id: documentId },
        data: { tenantId: targetTenant.id },
      }),
    );
    expect(documentHistory.record).toHaveBeenCalledWith(
      expectObjectContaining({
        type: 'DOCUMENT_MOVED_TO_TENANT',
        actorUserId: user.id,
        documentId,
        metadata: {
          status: 'READY',
          sourceTenantId: tenant.id,
          targetTenantId: targetTenant.id,
        },
      }),
      tx,
    );
    expect(audit.record).toHaveBeenCalledWith({
      actorUserId: user.id,
      action: 'DOCUMENT_MOVED_TO_TENANT',
      entityType: 'Document',
      entityId: documentId,
      metadata: {
        sourceTenantId: tenant.id,
        targetTenantId: targetTenant.id,
      },
    });
    expect(notifications.publish).toHaveBeenCalledWith(
      expectObjectContaining({
        type: 'document.moved_to_tenant',
        tenantId: targetTenant.id,
        status: 'READY',
      }),
    );
    expect(realtimeEvents.documentChanged).toHaveBeenCalledWith({
      documentId,
      tenantId: tenant.id,
      status: 'READY',
      reason: 'DOCUMENT_MOVED_TO_TENANT',
    });
    expect(realtimeEvents.documentChanged).toHaveBeenCalledWith({
      documentId,
      tenantId: targetTenant.id,
      status: 'READY',
      reason: 'DOCUMENT_MOVED_TO_TENANT',
    });
  });

  it('rejects moving accepted documents, archived documents, and current-tenant targets', async () => {
    const { prisma, service } = createService();

    prisma.document.findFirst.mockResolvedValueOnce({
      id: documentId,
      status: 'READY',
      tenantId: tenant.id,
      acceptedAt: new Date('2026-05-07T18:05:00.000Z'),
      tags: [],
      payments: [],
      calendarEvents: [],
    });
    await expect(
      service.moveToTenant(
        documentId,
        { targetTenantId: targetTenant.id },
        user,
        [tenant.id],
      ),
    ).rejects.toThrow(BadRequestException);

    prisma.document.findFirst.mockResolvedValueOnce({
      id: documentId,
      status: 'ARCHIVED',
      tenantId: tenant.id,
      acceptedAt: null,
      tags: [],
      payments: [],
      calendarEvents: [],
    });
    await expect(
      service.moveToTenant(
        documentId,
        { targetTenantId: targetTenant.id },
        user,
        [tenant.id],
      ),
    ).rejects.toThrow(BadRequestException);

    prisma.document.findFirst.mockResolvedValueOnce({
      id: documentId,
      status: 'READY',
      tenantId: tenant.id,
      acceptedAt: null,
      tags: [],
      payments: [],
      calendarEvents: [],
    });
    await expect(
      service.moveToTenant(documentId, { targetTenantId: tenant.id }, user, [
        tenant.id,
      ]),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects moving an inbox document when the target tenant is unavailable', async () => {
    const { prisma, service } = createService();
    prisma.document.findFirst.mockResolvedValue({
      id: documentId,
      status: 'READY',
      tenantId: tenant.id,
      acceptedAt: null,
      tags: [],
      payments: [],
      calendarEvents: [],
    });
    prisma.tenant.findMany.mockResolvedValueOnce([
      { id: tenant.id, name: tenant.name },
    ]);

    await expect(
      service.moveToTenant(
        documentId,
        { targetTenantId: targetTenant.id },
        user,
        [tenant.id],
      ),
    ).rejects.toThrow(BadRequestException);

    prisma.tenant.findMany.mockResolvedValueOnce([
      { id: tenant.id, name: tenant.name },
      { id: '018f1a44-9093-7f55-a515-278f4d9bd907', name: 'Other' },
    ]);
    await expect(
      service.moveToTenant(
        documentId,
        { targetTenantId: targetTenant.id },
        user,
        [tenant.id],
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('uses the existing AI lock guard before moving an inbox document to another tenant', async () => {
    const { aiProcessing, prisma, service } = createService();
    prisma.document.findFirst.mockResolvedValue({
      id: documentId,
      status: 'AI_RUNNING',
      tenantId: tenant.id,
      acceptedAt: null,
      tags: [],
      payments: [],
      calendarEvents: [],
    });
    aiProcessing.assertDocumentIsNotAiRunning.mockImplementation(() => {
      throw new BadRequestException('Document is currently locked.');
    });

    await expect(
      service.moveToTenant(
        documentId,
        { targetTenantId: targetTenant.id },
        user,
        [tenant.id],
      ),
    ).rejects.toThrow('Document is currently locked.');
    expect(prisma.tenant.findMany).not.toHaveBeenCalled();
  });

  it('permanently deletes a document and its stored files', async () => {
    const { audit, notifications, prisma, realtimeEvents, service, storage } =
      createService();
    prisma.document.findFirst.mockResolvedValue({
      id: documentId,
      tenantId: tenant.id,
      title: 'Invoice',
      status: 'READY',
      pdfPath: 'documents/final/invoice.pdf',
      thumbnailPath: 'documents/thumbnails/invoice.jpg',
      artifacts: [
        { path: 'documents/original/invoice.pdf' },
        { path: 'documents/final/invoice.pdf' },
      ],
    });
    prisma.document.delete.mockResolvedValue({ id: documentId });

    await expect(
      service.delete(documentId, user, [tenant.id]),
    ).resolves.toEqual({
      deleted: true,
      documentId,
    });

    expect(storage.deleteStoredFile).toHaveBeenCalledTimes(3);
    expect(storage.deleteStoredFile).toHaveBeenCalledWith(
      'documents/final/invoice.pdf',
    );
    expect(storage.deleteStoredFile).toHaveBeenCalledWith(
      'documents/thumbnails/invoice.jpg',
    );
    expect(storage.deleteStoredFile).toHaveBeenCalledWith(
      'documents/original/invoice.pdf',
    );
    expect(storage.deleteDocumentTemporaryFiles).toHaveBeenCalledWith(
      documentId,
    );
    expect(prisma.document.delete).toHaveBeenCalledWith({
      where: { id: documentId },
    });
    expect(audit.record).toHaveBeenCalledWith({
      actorUserId: user.id,
      action: 'DOCUMENT_DELETED',
      entityType: 'Document',
      entityId: documentId,
    });
    expect(notifications.publish).toHaveBeenCalledWith(
      expectObjectContaining({
        type: 'document.deleted',
        tenantId: tenant.id,
        status: 'READY',
      }),
    );
    expect(realtimeEvents.documentChanged).toHaveBeenCalledWith({
      documentId,
      tenantId: tenant.id,
      status: 'READY',
      reason: 'DOCUMENT_DELETED',
    });
  });

  it('publishes a realtime notification when reprocessing changes the status', async () => {
    const {
      documentHistory,
      notifications,
      prisma,
      processingJobs,
      realtimeEvents,
      service,
    } = createService();
    prisma.document.findFirst.mockResolvedValue({
      id: documentId,
      status: 'FAILED',
      tenantId: tenant.id,
      acceptedAt: null,
    });
    prisma.document.update.mockResolvedValue(summaryDocument('OCR_PENDING'));
    processingJobs.enqueueDocumentProcessing.mockResolvedValue({ id: jobId });

    await service.reprocess(documentId, user, [tenant.id]);

    expect(documentHistory.record).toHaveBeenCalledWith(
      expectObjectContaining({
        type: 'DOCUMENT_REPROCESS_REQUESTED',
        actorUserId: user.id,
        changes: [
          {
            field: 'status',
            label: 'Status',
            oldValue: 'FAILED',
            newValue: 'OCR_PENDING',
          },
        ],
      }),
    );
    expect(documentHistory.record).toHaveBeenCalledWith(
      expectObjectContaining({
        type: 'DOCUMENT_PROCESSING_QUEUED',
        metadata: expectObjectContaining({
          jobId,
          jobType: 'OCR_DOCUMENT',
          action: 'OCR',
          status: 'OCR_PENDING',
        }),
      }),
    );
    expect(processingJobs.enqueueDocumentProcessing).toHaveBeenCalledWith(
      documentId,
      'OCR_DOCUMENT',
      undefined,
    );
    expect(notifications.publish).toHaveBeenCalledWith({
      type: 'document.reprocess_queued',
      severity: 'info',
      documentId,
      documentTitle: 'Invoice',
      tenantId: tenant.id,
      jobId,
      status: 'OCR_PENDING',
    });
    expect(realtimeEvents.documentChanged).toHaveBeenCalledWith({
      documentId,
      tenantId: tenant.id,
      jobId,
      status: 'OCR_PENDING',
      reason: 'DOCUMENT_REPROCESS_REQUESTED',
    });
  });

  it('queues rotate reprocessing with OCR rotation options', async () => {
    const { documentHistory, prisma, processingJobs, service } =
      createService();
    prisma.document.findFirst.mockResolvedValue({
      id: documentId,
      status: 'READY',
      tenantId: tenant.id,
      mimeType: 'application/pdf',
      acceptedAt: null,
    });
    prisma.document.update.mockResolvedValue(summaryDocument('OCR_PENDING'));
    processingJobs.enqueueDocumentProcessing.mockResolvedValue({ id: jobId });

    await service.reprocess(documentId, user, [tenant.id], {
      action: 'ROTATE_180',
    });

    expect(processingJobs.enqueueDocumentProcessing).toHaveBeenCalledWith(
      documentId,
      'OCR_DOCUMENT',
      { rotationDegrees: 180, forceOcr: true },
    );
    expect(documentHistory.record).toHaveBeenCalledWith(
      expectObjectContaining({
        type: 'DOCUMENT_REPROCESS_REQUESTED',
        metadata: expectObjectContaining({
          action: 'ROTATE_180',
          processingOptions: { rotationDegrees: 180, forceOcr: true },
        }),
      }),
    );
  });

  it('rejects rotate reprocessing for non-PDF documents', async () => {
    const { prisma, processingJobs, service } = createService();
    prisma.document.findFirst.mockResolvedValue({
      id: documentId,
      status: 'READY',
      tenantId: tenant.id,
      mimeType: 'image/png',
      acceptedAt: null,
    });

    await expect(
      service.reprocess(documentId, user, [tenant.id], {
        action: 'ROTATE_180',
      }),
    ).rejects.toThrow(BadRequestException);
    expect(processingJobs.enqueueDocumentProcessing).not.toHaveBeenCalled();
  });

  it('rejects reprocessing accepted documents', async () => {
    const { prisma, processingJobs, service } = createService();
    prisma.document.findFirst.mockResolvedValue({
      id: documentId,
      status: 'READY',
      tenantId: tenant.id,
      mimeType: 'application/pdf',
      acceptedAt: new Date('2026-05-07T18:05:00.000Z'),
    });

    await expect(
      service.reprocess(documentId, user, [tenant.id]),
    ).rejects.toThrow(BadRequestException);
    expect(processingJobs.enqueueDocumentProcessing).not.toHaveBeenCalled();
  });

  it('accepts ready inbox documents and publishes realtime updates', async () => {
    const {
      audit,
      documentHistory,
      notifications,
      prisma,
      realtimeEvents,
      service,
      tx,
    } = createService();
    const inboxDocument = {
      ...summaryDocument('READY'),
      acceptedAt: null,
      acceptedById: null,
      documentTypeId: '018f1a44-9093-7f55-a515-278f4d9bd901',
      documentDate: new Date('2026-05-07T00:00:00.000Z'),
      sender: 'Sender GmbH',
    };
    const acceptedDocument = {
      ...summaryDocument('READY'),
      acceptedAt: new Date('2026-05-07T19:00:00.000Z'),
      acceptedById: user.id,
    };
    prisma.document.findMany.mockResolvedValue([inboxDocument]);
    tx.document.findMany.mockResolvedValue([acceptedDocument]);

    await expect(
      service.acceptInboxDocuments([documentId], user, [tenant.id]),
    ).resolves.toMatchObject({
      acceptedCount: 1,
      documents: [
        {
          id: documentId,
          acceptedById: user.id,
        },
      ],
    });

    expect(tx.document.updateMany).toHaveBeenCalledWith({
      where: {
        id: { in: [documentId] },
        tenantId: { in: [tenant.id] },
        acceptedAt: null,
      },
      data: {
        acceptedAt: expectAny(Date),
        acceptedById: user.id,
      },
    });
    expect(documentHistory.record).toHaveBeenCalledWith(
      expectObjectContaining({
        documentId,
        actorUserId: user.id,
        type: 'DOCUMENT_ACCEPTED',
      }),
      tx,
    );
    expect(audit.record).toHaveBeenCalledWith({
      actorUserId: user.id,
      action: 'DOCUMENT_ACCEPTED',
      entityType: 'Document',
      entityId: documentId,
    });
    expect(notifications.publish).toHaveBeenCalledWith(
      expectObjectContaining({
        type: 'document.accepted',
        tenantId: tenant.id,
        status: 'READY',
      }),
    );
    expect(realtimeEvents.documentChanged).toHaveBeenCalledWith({
      documentId,
      tenantId: tenant.id,
      status: 'READY',
      reason: 'DOCUMENT_ACCEPTED',
    });
  });

  it('rejects accepting documents without AI metadata when the setting requires it', async () => {
    const { prisma, service, settings, tx } = createService();
    prisma.document.findMany.mockResolvedValue([
      {
        ...summaryDocument('READY'),
        acceptedAt: null,
        acceptedById: null,
        aiProcessedAt: null,
      },
    ]);
    settings.getSettings.mockResolvedValue({
      ocrReprocessExistingTextLayer: false,
      pdfRemoveBlankPages: false,
      documentsRequireAiMetadataBeforeAcceptance: true,
      extractionMode: 'fast',
      aiMetadataLanguage: 'DOCUMENT_LANGUAGE',
    });

    await expect(
      service.acceptInboxDocuments([documentId], user, [tenant.id]),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.document.updateMany).not.toHaveBeenCalled();
  });

  it('rejects accepting inbox documents with missing core metadata', async () => {
    const { prisma, service, tx } = createService();
    prisma.document.findMany.mockResolvedValue([
      {
        ...summaryDocument('READY'),
        acceptedAt: null,
        acceptedById: null,
        documentTypeId: null,
        documentDate: null,
        sender: null,
      },
    ]);

    await expect(
      service.acceptInboxDocuments([documentId], user, [tenant.id]),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.document.updateMany).not.toHaveBeenCalled();
  });

  it('records changed metadata fields in document history', async () => {
    const { documentHistory, prisma, service, tx } = createService();
    prisma.document.findFirst.mockResolvedValue({
      title: 'Old invoice',
      documentTypeId: null,
      documentDate: null,
      summary: null,
      sender: null,
      recipient: null,
      note: null,
      status: 'READY',
      acceptedAt: null,
      tenantId: tenant.id,
      payments: [],
      references: [],
      attributes: [],
    });
    tx.document.findUniqueOrThrow.mockResolvedValue(
      detailDocument({ title: 'Invoice' }),
    );

    await service.updateMetadata(documentId, { title: 'Invoice' }, user, [
      tenant.id,
    ]);

    expect(documentHistory.record).toHaveBeenCalledWith(
      expectObjectContaining({
        type: 'DOCUMENT_METADATA_UPDATED',
        actorUserId: user.id,
        documentId,
        changes: [
          {
            field: 'title',
            label: 'Document name',
            oldValue: 'Old invoice',
            newValue: 'Invoice',
          },
        ],
      }),
      tx,
    );
  });

  it('allows clearing core metadata for inbox documents and releases AI ownership', async () => {
    const { prisma, service, tx } = createService();
    prisma.document.findFirst.mockResolvedValue({
      title: 'Invoice',
      titleSource: 'MANUAL',
      documentTypeId: '018f1a44-9093-7f55-a515-278f4d9bd901',
      documentTypeSource: 'MANUAL',
      documentDate: new Date('2026-05-07T00:00:00.000Z'),
      documentDateSource: 'MANUAL',
      summary: null,
      sender: 'Sender GmbH',
      senderSource: 'MANUAL',
      recipient: null,
      note: null,
      status: 'READY',
      acceptedAt: null,
      tenantId: tenant.id,
      payments: [],
      references: [],
      attributes: [],
    });
    tx.document.findUniqueOrThrow.mockResolvedValue(
      detailDocument({ title: null }),
    );

    await service.updateMetadata(
      documentId,
      {
        title: null,
        sender: null,
        documentTypeId: null,
        documentDate: null,
      },
      user,
      [tenant.id],
    );

    expect(tx.document.update).toHaveBeenCalledWith(
      expectObjectContaining({
        data: expectObjectContaining({
          title: null,
          titleSource: 'AI_EXTRACTED',
          sender: null,
          senderSource: 'AI_EXTRACTED',
          documentTypeId: null,
          documentTypeSource: 'AI_EXTRACTED',
          documentDate: null,
          documentDateSource: 'AI_EXTRACTED',
        }),
      }),
    );
  });

  it('rejects clearing core metadata outside the inbox', async () => {
    const { prisma, service, tx } = createService();
    prisma.document.findFirst.mockResolvedValue({
      title: 'Invoice',
      titleSource: 'MANUAL',
      documentTypeId: '018f1a44-9093-7f55-a515-278f4d9bd901',
      documentTypeSource: 'MANUAL',
      documentDate: new Date('2026-05-07T00:00:00.000Z'),
      documentDateSource: 'MANUAL',
      summary: null,
      sender: 'Sender GmbH',
      senderSource: 'MANUAL',
      recipient: null,
      note: null,
      status: 'READY',
      acceptedAt: new Date('2026-05-07T18:00:00.000Z'),
      tenantId: tenant.id,
      payments: [],
      references: [],
      attributes: [],
    });

    await expect(
      service.updateMetadata(documentId, { sender: null }, user, [tenant.id]),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.document.update).not.toHaveBeenCalled();
  });

  it('syncs completed payment tasks to linked due-date events', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-29T10:00:00.000Z'));
    const { prisma, service, tx } = createService();
    prisma.document.findFirst
      .mockResolvedValueOnce({
        id: documentId,
        tenantId: tenant.id,
        status: 'READY',
        payments: [{ id: 'payment-1' }],
      })
      .mockResolvedValueOnce(detailDocument());
    tx.documentCalendarEvent.updateMany.mockResolvedValue({ count: 2 });

    await service.updatePaymentTask(
      documentId,
      'payment-1',
      { completed: true },
      user,
      [tenant.id],
    );

    const expectedDate = new Date('2026-05-29T10:00:00.000Z');
    expect(tx.documentPayment.update).toHaveBeenCalledWith({
      where: { id: 'payment-1' },
      data: expectObjectContaining({
        status: 'PAID',
        paidAt: expectedDate,
        paidById: user.id,
      }),
    });
    expect(tx.documentCalendarEvent.updateMany).toHaveBeenCalledWith({
      where: {
        documentId,
        paymentId: 'payment-1',
        kind: 'DUE_DATE',
      },
      data: expectObjectContaining({
        completedAt: expectedDate,
        completedById: user.id,
      }),
    });
    expect(tx.documentCalendarEvent.findFirst).not.toHaveBeenCalled();
  });

  it('syncs undone payment tasks to linked due-date events', async () => {
    const { prisma, service, tx } = createService();
    prisma.document.findFirst
      .mockResolvedValueOnce({
        id: documentId,
        tenantId: tenant.id,
        status: 'READY',
        payments: [{ id: 'payment-1' }],
      })
      .mockResolvedValueOnce(detailDocument());

    await service.updatePaymentTask(
      documentId,
      'payment-1',
      { completed: false },
      user,
      [tenant.id],
    );

    expect(tx.documentPayment.update).toHaveBeenCalledWith({
      where: { id: 'payment-1' },
      data: expectObjectContaining({
        status: 'OPEN',
        paidAt: null,
        paidById: null,
      }),
    });
    expect(tx.documentCalendarEvent.updateMany).toHaveBeenCalledWith({
      where: {
        documentId,
        paymentId: 'payment-1',
        kind: 'DUE_DATE',
      },
      data: expectObjectContaining({
        completedAt: null,
        completedById: null,
      }),
    });
  });

  it('syncs payment assignees to linked due-date events', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-29T11:00:00.000Z'));
    const { prisma, service, tx } = createService();
    const assignedToId = '018f1a44-9093-7f55-a515-278f4d9bd901';
    tx.user.findFirst.mockResolvedValue({ id: assignedToId });
    prisma.document.findFirst
      .mockResolvedValueOnce({
        id: documentId,
        tenantId: tenant.id,
        status: 'READY',
        payments: [{ id: 'payment-1' }],
      })
      .mockResolvedValueOnce(detailDocument());

    await service.updatePaymentTask(
      documentId,
      'payment-1',
      { assignedToId },
      user,
      [tenant.id],
    );

    const expectedDate = new Date('2026-05-29T11:00:00.000Z');
    expect(tx.documentPayment.update).toHaveBeenCalledWith({
      where: { id: 'payment-1' },
      data: expectObjectContaining({
        assignedToId,
        assignedAt: expectedDate,
      }),
    });
    expect(tx.documentCalendarEvent.updateMany).toHaveBeenCalledWith({
      where: {
        documentId,
        paymentId: 'payment-1',
        kind: 'DUE_DATE',
      },
      data: expectObjectContaining({
        assignedToId,
        assignedAt: expectedDate,
      }),
    });
  });

  it('uses the legacy unlinked due-date fallback only when no linked due date exists', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-29T12:00:00.000Z'));
    const { prisma, service, tx } = createService();
    prisma.document.findFirst
      .mockResolvedValueOnce({
        id: documentId,
        tenantId: tenant.id,
        status: 'READY',
        payments: [{ id: 'payment-1' }],
      })
      .mockResolvedValueOnce(detailDocument());
    tx.documentCalendarEvent.updateMany.mockResolvedValue({ count: 0 });
    tx.documentCalendarEvent.findFirst.mockResolvedValue({
      id: 'legacy-due-date',
    });

    await service.updatePaymentTask(
      documentId,
      'payment-1',
      { completed: true },
      user,
      [tenant.id],
    );

    expect(tx.documentPayment.count).toHaveBeenCalledWith({
      where: { documentId, status: { not: 'IGNORED' } },
    });
    expect(tx.documentCalendarEvent.update).toHaveBeenCalledWith({
      where: { id: 'legacy-due-date' },
      data: {
        completedAt: new Date('2026-05-29T12:00:00.000Z'),
        completedById: user.id,
      },
    });
  });

  it('syncs completed linked due-date events back to payments', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-29T13:00:00.000Z'));
    const { prisma, service, tx } = createService();
    prisma.documentCalendarEvent.findFirst.mockResolvedValue({
      id: 'event-1',
      kind: 'DUE_DATE',
      paymentId: 'payment-1',
      document: { id: documentId, tenantId: tenant.id, status: 'READY' },
    });
    prisma.document.findFirst.mockResolvedValue(detailDocument());

    await service.updateCalendarEventTask(
      documentId,
      'event-1',
      { completed: true },
      user,
      [tenant.id],
    );

    const expectedDate = new Date('2026-05-29T13:00:00.000Z');
    expect(tx.documentCalendarEvent.updateMany).toHaveBeenCalledWith({
      where: {
        documentId,
        paymentId: 'payment-1',
        kind: 'DUE_DATE',
      },
      data: expectObjectContaining({
        completedAt: expectedDate,
        completedById: user.id,
      }),
    });
    expect(tx.documentPayment.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'payment-1',
        status: { not: 'IGNORED' },
      },
      data: expectObjectContaining({
        status: 'PAID',
        paidAt: expectedDate,
        paidById: user.id,
      }),
    });
  });

  it('syncs undone linked due-date events back to payments', async () => {
    const { prisma, service, tx } = createService();
    prisma.documentCalendarEvent.findFirst.mockResolvedValue({
      id: 'event-1',
      kind: 'DUE_DATE',
      paymentId: 'payment-1',
      document: { id: documentId, tenantId: tenant.id, status: 'READY' },
    });
    prisma.document.findFirst.mockResolvedValue(detailDocument());

    await service.updateCalendarEventTask(
      documentId,
      'event-1',
      { completed: false },
      user,
      [tenant.id],
    );

    expect(tx.documentCalendarEvent.updateMany).toHaveBeenCalledWith({
      where: {
        documentId,
        paymentId: 'payment-1',
        kind: 'DUE_DATE',
      },
      data: expectObjectContaining({
        completedAt: null,
        completedById: null,
      }),
    });
    expect(tx.documentPayment.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'payment-1',
        status: { not: 'IGNORED' },
      },
      data: expectObjectContaining({
        status: 'OPEN',
        paidAt: null,
        paidById: null,
      }),
    });
  });

  it('syncs linked due-date assignees back to payments', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-29T14:00:00.000Z'));
    const { prisma, service, tx } = createService();
    const assignedToId = '018f1a44-9093-7f55-a515-278f4d9bd901';
    tx.user.findFirst.mockResolvedValue({ id: assignedToId });
    prisma.documentCalendarEvent.findFirst.mockResolvedValue({
      id: 'event-1',
      kind: 'DUE_DATE',
      paymentId: 'payment-1',
      document: { id: documentId, tenantId: tenant.id, status: 'READY' },
    });
    prisma.document.findFirst.mockResolvedValue(detailDocument());

    await service.updateCalendarEventTask(
      documentId,
      'event-1',
      { assignedToId },
      user,
      [tenant.id],
    );

    const expectedDate = new Date('2026-05-29T14:00:00.000Z');
    expect(tx.documentCalendarEvent.updateMany).toHaveBeenCalledWith({
      where: {
        documentId,
        paymentId: 'payment-1',
        kind: 'DUE_DATE',
      },
      data: expectObjectContaining({
        assignedToId,
        assignedAt: expectedDate,
      }),
    });
    expect(tx.documentPayment.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'payment-1',
        status: { not: 'IGNORED' },
      },
      data: expectObjectContaining({
        assignedToId,
        assignedAt: expectedDate,
      }),
    });
  });

  it('does not sync unlinked calendar event tasks to payments', async () => {
    const { prisma, service, tx } = createService();
    prisma.documentCalendarEvent.findFirst.mockResolvedValue({
      id: 'event-1',
      kind: 'DEADLINE',
      paymentId: null,
      document: { id: documentId, tenantId: tenant.id, status: 'READY' },
    });
    prisma.document.findFirst.mockResolvedValue(detailDocument());

    await service.updateCalendarEventTask(
      documentId,
      'event-1',
      { completed: true },
      user,
      [tenant.id],
    );

    expect(tx.documentCalendarEvent.update).toHaveBeenCalledWith({
      where: { id: 'event-1' },
      data: expectObjectContaining({
        completedAt: expectAny(Date),
        completedById: user.id,
      }),
    });
    expect(tx.documentPayment.updateMany).not.toHaveBeenCalled();
  });

  it('rejects completing appointment calendar events', async () => {
    const { prisma, service, tx } = createService();
    prisma.documentCalendarEvent.findFirst.mockResolvedValue({
      id: 'event-1',
      kind: 'APPOINTMENT',
      paymentId: null,
      document: { id: documentId, tenantId: tenant.id, status: 'READY' },
    });

    await expect(
      service.updateCalendarEventTask(
        documentId,
        'event-1',
        { completed: true },
        user,
        [tenant.id],
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.documentCalendarEvent.update).not.toHaveBeenCalled();
    expect(tx.documentPayment.updateMany).not.toHaveBeenCalled();
  });

  it('preserves unchanged payment and reference sources while marking changed rows manual', async () => {
    const { prisma, service, tx } = createService();
    prisma.document.findFirst.mockResolvedValue({
      title: 'Invoice',
      documentTypeId: null,
      documentDate: null,
      summary: null,
      sender: null,
      recipient: null,
      note: null,
      status: 'READY',
      acceptedAt: null,
      tenantId: tenant.id,
      payments: [
        {
          id: 'payment-ai',
          iban: 'DE02120300000000202051',
          recipient: 'Sender GmbH',
          purpose: 'R-100',
          amount: { toString: () => '120.5' },
          currency: 'EUR',
          status: 'OPEN',
          paidAt: null,
          source: 'AI_EXTRACTED',
        },
        {
          id: 'payment-changed',
          iban: null,
          recipient: 'Old recipient',
          purpose: null,
          amount: null,
          currency: 'EUR',
          status: 'OPEN',
          paidAt: null,
          source: 'AI_EXTRACTED',
        },
      ],
      references: [
        {
          id: 'reference-ai',
          referenceNumber: 'R-100',
          referenceType: 'Invoice',
          source: 'AI_EXTRACTED',
        },
        {
          id: 'reference-changed',
          referenceNumber: 'OLD',
          referenceType: 'Invoice',
          source: 'AI_EXTRACTED',
        },
      ],
      attributes: [],
    });
    tx.document.findUniqueOrThrow.mockResolvedValue(detailDocument());

    await service.updateMetadata(
      documentId,
      {
        payments: [
          {
            id: 'payment-ai',
            iban: 'DE02120300000000202051',
            recipient: 'Sender GmbH',
            purpose: 'R-100',
            amount: 120.5,
            currency: 'EUR',
            status: 'OPEN',
            paidAt: null,
          },
          {
            id: 'payment-changed',
            recipient: 'New recipient',
            amount: null,
            currency: 'EUR',
            status: 'OPEN',
            paidAt: null,
          },
          {
            recipient: 'Manual recipient',
            amount: 80,
          },
        ],
        references: [
          {
            id: 'reference-ai',
            referenceNumber: 'R-100',
            referenceType: 'Invoice',
          },
          {
            id: 'reference-changed',
            referenceNumber: 'NEW',
            referenceType: 'Invoice',
          },
          {
            referenceNumber: 'MAN-1',
            referenceType: 'Manual',
          },
        ],
      },
      user,
      [tenant.id],
    );

    expect(tx.documentPayment.deleteMany).toHaveBeenCalledWith({
      where: {
        documentId,
        id: { notIn: ['payment-ai', 'payment-changed'] },
      },
    });
    expect(tx.documentPayment.update).toHaveBeenCalledWith(
      expectObjectContaining({
        where: { id: 'payment-ai' },
        data: expectObjectContaining({ source: 'AI_EXTRACTED' }),
      }),
    );
    expect(tx.documentPayment.update).toHaveBeenCalledWith(
      expectObjectContaining({
        where: { id: 'payment-changed' },
        data: expectObjectContaining({
          recipient: 'New recipient',
          source: 'MANUAL',
        }),
      }),
    );
    expect(tx.documentPayment.create).toHaveBeenCalledWith(
      expectObjectContaining({
        data: expectObjectContaining({
          documentId,
          recipient: 'Manual recipient',
          source: 'MANUAL',
        }),
      }),
    );
    expect(tx.documentReference.update).toHaveBeenCalledWith({
      where: { id: 'reference-ai' },
      data: expectObjectContaining({ source: 'AI_EXTRACTED' }),
    });
    expect(tx.documentReference.update).toHaveBeenCalledWith({
      where: { id: 'reference-changed' },
      data: expectObjectContaining({
        referenceNumber: 'NEW',
        source: 'MANUAL',
      }),
    });
    expect(tx.documentReference.create).toHaveBeenCalledWith({
      data: expectObjectContaining({
        documentId,
        referenceNumber: 'MAN-1',
        source: 'MANUAL',
      }),
    });
  });

  it('replaces only unlinked calendar events and records metadata history', async () => {
    const { documentHistory, prisma, service, tx } = createService();
    const unchangedEvent = {
      id: 'event-ai',
      kind: 'DEADLINE' as const,
      title: 'Reply deadline',
      description: 'Send reply',
      date: new Date('2026-05-15T00:00:00.000Z'),
      time: '10:30',
      endDate: null,
      endTime: null,
      source: 'AI_EXTRACTED' as const,
      sourceText: 'reply by 15 May',
      paymentId: null,
    };
    const changedEvent = {
      id: 'event-changed',
      kind: 'APPOINTMENT' as const,
      title: 'Old call',
      description: null,
      date: new Date('2026-05-16T00:00:00.000Z'),
      time: '11:00',
      endDate: null,
      endTime: null,
      source: 'AI_EXTRACTED' as const,
      sourceText: null,
      paymentId: null,
    };
    const removedEvent = {
      ...unchangedEvent,
      id: 'event-removed',
      title: 'Removed deadline',
    };
    prisma.document.findFirst.mockResolvedValue({
      title: 'Invoice',
      documentTypeId: null,
      documentDate: null,
      summary: null,
      sender: null,
      recipient: null,
      note: null,
      status: 'READY',
      acceptedAt: null,
      tenantId: tenant.id,
      payments: [],
      references: [],
      calendarEvents: [unchangedEvent, changedEvent, removedEvent],
      attributes: [],
    });
    tx.document.findUniqueOrThrow.mockResolvedValue(
      detailDocument({
        calendarEvents: [
          unchangedEvent,
          {
            ...changedEvent,
            title: 'Updated call',
            source: 'MANUAL',
          },
          {
            id: 'event-new',
            kind: 'DEADLINE',
            title: 'Manual deadline',
            description: null,
            date: new Date('2026-05-20T00:00:00.000Z'),
            time: null,
            endDate: null,
            endTime: null,
            source: 'MANUAL',
            sourceText: null,
            paymentId: null,
          },
          {
            id: 'event-linked-payment',
            kind: 'DUE_DATE',
            title: 'Payment due',
            description: null,
            date: new Date('2026-05-29T00:00:00.000Z'),
            time: null,
            endDate: null,
            endTime: null,
            source: 'AI_EXTRACTED',
            sourceText: null,
            paymentId: 'payment-1',
          },
        ],
      }),
    );

    await service.updateMetadata(
      documentId,
      {
        calendarEvents: [
          {
            id: 'event-ai',
            kind: 'DEADLINE',
            title: 'Reply deadline',
            description: 'Send reply',
            date: '2026-05-15',
            time: '10:30',
            sourceText: 'reply by 15 May',
          },
          {
            id: 'event-changed',
            kind: 'APPOINTMENT',
            title: 'Updated call',
            description: null,
            date: '2026-05-16',
            time: '11:00',
          },
          {
            kind: 'DEADLINE',
            title: 'Manual deadline',
            date: '2026-05-20',
          },
        ],
      },
      user,
      [tenant.id],
    );

    expect(tx.documentCalendarEvent.deleteMany).toHaveBeenCalledWith({
      where: {
        documentId,
        paymentId: null,
        id: { notIn: ['event-ai', 'event-changed'] },
      },
    });
    expect(tx.documentCalendarEvent.update).toHaveBeenCalledWith({
      where: { id: 'event-ai' },
      data: expectObjectContaining({ source: 'AI_EXTRACTED' }),
    });
    expect(tx.documentCalendarEvent.update).toHaveBeenCalledWith({
      where: { id: 'event-changed' },
      data: expectObjectContaining({
        title: 'Updated call',
        source: 'MANUAL',
      }),
    });
    expect(tx.documentCalendarEvent.create).toHaveBeenCalledWith({
      data: expectObjectContaining({
        documentId,
        title: 'Manual deadline',
        source: 'MANUAL',
      }),
    });
    expect(documentHistory.record).toHaveBeenCalledWith(
      expectObjectContaining({
        changes: expectArrayContaining([
          expectObjectContaining({
            field: 'calendarEvents',
            label: 'Calendar events',
          }),
        ]),
      }),
      tx,
    );
  });

  it('preserves document tag sources by tag name and marks new tags manual', async () => {
    const { prisma, service, tx } = createService();
    prisma.document.findFirst.mockResolvedValue({
      status: 'READY',
      tenantId: tenant.id,
      tags: [
        {
          source: 'AI_EXTRACTED',
          tag: { name: 'finance' },
        },
        {
          source: 'MANUAL',
          tag: { name: 'pinned' },
        },
      ],
    });
    tx.tag.upsert.mockImplementation(
      ({ where }: { where: { tenantId_name: { name: string } } }) =>
        Promise.resolve({ id: `tag-${where.tenantId_name.name}` }),
    );
    tx.document.findUniqueOrThrow.mockResolvedValue(detailDocument());

    await service.updateTags(
      documentId,
      { tags: ['finance', 'pinned', 'urgent'] },
      user,
      [tenant.id],
    );

    expect(tx.documentTag.create).toHaveBeenCalledWith({
      data: {
        documentId,
        tagId: 'tag-finance',
        source: 'AI_EXTRACTED',
      },
    });
    expect(tx.documentTag.create).toHaveBeenCalledWith({
      data: {
        documentId,
        tagId: 'tag-pinned',
        source: 'MANUAL',
      },
    });
    expect(tx.documentTag.create).toHaveBeenCalledWith({
      data: {
        documentId,
        tagId: 'tag-urgent',
        source: 'MANUAL',
      },
    });
  });

  it('lists document search facets from tags, senders, and active document types', async () => {
    const { prisma, service } = createService();
    prisma.tag.findMany.mockResolvedValue([
      {
        id: '018f1a44-9093-7f55-a515-278f4d9bd991',
        name: 'tax',
        createdAt: new Date('2026-05-07T18:00:00.000Z'),
        createdBy: null,
      },
    ]);
    prisma.$queryRaw.mockResolvedValue([{ sender: 'Sender GmbH' }]);
    prisma.documentType.findMany.mockResolvedValue([
      {
        id: '018f1a44-9093-7f55-a515-278f4d9bd992',
        key: 'invoice',
        name: 'Invoice',
        active: true,
        isSystem: true,
        displayOrder: 10,
        createdAt: new Date('2026-05-07T18:00:00.000Z'),
        updatedAt: new Date('2026-05-07T18:00:00.000Z'),
      },
    ]);

    await expect(service.searchFacets([tenant.id])).resolves.toEqual({
      tags: [
        {
          id: '018f1a44-9093-7f55-a515-278f4d9bd991',
          name: 'tax',
          createdAt: '2026-05-07T18:00:00.000Z',
          createdBy: null,
        },
      ],
      senders: ['Sender GmbH'],
      documentTypes: [
        {
          id: '018f1a44-9093-7f55-a515-278f4d9bd992',
          key: 'invoice',
          name: 'Invoice',
          active: true,
          isSystem: true,
          displayOrder: 10,
          createdAt: '2026-05-07T18:00:00.000Z',
          updatedAt: '2026-05-07T18:00:00.000Z',
        },
      ],
    });
    expect(prisma.tag.findMany).toHaveBeenCalledWith({
      where: { tenantId: { in: [tenant.id] } },
      orderBy: { name: 'asc' },
    });
    expect(prisma.documentType.findMany).toHaveBeenCalledWith({
      where: { active: true },
      orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
    });
  });

  it('loads document search summaries without OCR text', async () => {
    const { prisma, service } = createService();
    prisma.$queryRaw
      .mockResolvedValueOnce([{ id: documentId }])
      .mockResolvedValueOnce([{ count: 1 }]);
    prisma.document.findMany.mockResolvedValue([summaryDocument('READY')]);

    await service.search(
      {
        page: 1,
        pageSize: 25,
        searchFields: ['title', 'content', 'sender', 'tags'],
        sortBy: 'documentDate',
        sortDirection: 'desc',
      },
      [tenant.id],
    );

    const findManyArgs = mockArg<{
      select: {
        ocrText?: boolean;
        tenant?: unknown;
        title?: boolean;
      };
    }>(prisma.document.findMany);
    expect(findManyArgs.select.title).toBe(true);
    expect(findManyArgs.select.tenant).toEqual({
      select: { id: true, key: true, name: true, isActive: true },
    });
    expect(findManyArgs.select.ocrText).toBeUndefined();
  });

  it('sorts document search ids by document type name', () => {
    const { service } = createService();

    expect(orderBySql(service, 'documentType')).toBe(
      '(SELECT dt.name FROM "DocumentType" dt WHERE dt.id = d."documentTypeId") ASC NULLS LAST, d.id ASC',
    );
  });

  it('sorts document search ids by the visible document date', () => {
    const { service } = createService();

    expect(orderBySql(service, 'documentDate', 'desc')).toBe(
      'coalesce(d."documentDate", d."createdAt") DESC, d.id ASC',
    );
  });

  it('sorts document search ids by trimmed sender', () => {
    const { service } = createService();

    expect(orderBySql(service, 'sender', 'desc')).toBe(
      'NULLIF(trim(d."sender"), \'\') DESC NULLS LAST, d.id ASC',
    );
  });

  it('searches and ranks sender and tag text for full-text document search', () => {
    const { service } = createService();

    const matchSql = searchSql(service, 'searchFtsMatchSql', [
      'sender',
      'tags',
    ]).text;
    const rankSql = searchSql(service, 'searchRankSql', [
      'sender',
      'tags',
    ]).text;

    expect(matchSql).toContain('d."senderSearchVector"');
    expect(matchSql).toContain('d."tagSearchVector"');
    expect(matchSql).not.toContain('FROM "DocumentTag" dt');
    expect(rankSql).toContain('d."senderSearchVector"');
    expect(rankSql).toContain('d."tagSearchVector"');
    expect(rankSql).not.toContain('FROM "DocumentTag" dt');
  });

  it('adds metadata contains search for title, sender, and tags', () => {
    const { service } = createService();

    const containsSql = searchSql(
      service,
      'searchMetadataContainsSql',
      ['title', 'sender', 'tags'],
      metadataTokens('ascal'),
    );

    expect(containsSql.text).toContain('lower(d."title") LIKE');
    expect(containsSql.text).toContain('lower(d."sender") LIKE');
    expect(containsSql.text).toContain('FROM "DocumentTag" dt');
    expect(containsSql.text).toContain('JOIN "Tag" t ON t.id = dt."tagId"');
    expect(containsSql.text).toContain('lower(t.name) LIKE');
    expect(containsSql.values).toContain('%ascal%');
  });

  it('keeps content search full-text only for metadata contains search', () => {
    const { service } = createService();

    const containsSql = searchSql(
      service,
      'searchMetadataContainsSql',
      ['content'],
      metadataTokens('ascal'),
    );
    const matchSql = searchSql(
      service,
      'searchMatchSql',
      ['content'],
      metadataTokens('ascal'),
    );

    expect(containsSql.text).toBe('');
    expect(matchSql.text).toContain('d."contentSearchVector"');
    expect(matchSql.text).not.toContain('to_tsvector');
    expect(matchSql.text).not.toContain('coalesce(d."ocrText", \'\')');
    expect(matchSql.text).not.toContain('LIKE');
    expect(matchSql.text).not.toContain('FROM "DocumentTag" dt');
  });

  it('keeps raw search filters type-safe for indexed columns', () => {
    const { service } = createService();

    const sql = conditionsSql(service, {
      page: 1,
      pageSize: 25,
      searchFields: ['title', 'content', 'sender', 'tags'],
      sortBy: 'documentDate',
      sortDirection: 'desc',
      filters: {
        statuses: ['READY'],
        sources: ['UPLOAD'],
        documentTypeIds: ['018f1a44-9093-7f55-a515-278f4d9bd992'],
      },
    });

    expect(sql).toContain('d."tenantId" IN');
    expect(sql).toContain('::uuid');
    expect(sql).toContain('::"DocumentStatus"');
    expect(sql).toContain('::"DocumentSource"');
    expect(sql).not.toContain('"tenantId"::text');
    expect(sql).not.toContain('"status"::text');
    expect(sql).not.toContain('"documentTypeId"::text');
  });

  it('ignores short metadata contains search tokens', () => {
    const { service } = createService();

    expect(metadataContainsSearchTokens(service, 'as pa pas')).toEqual(
      metadataTokens('pas'),
    );
  });

  it('normalizes metadata contains search tokens from punctuation', () => {
    const { service } = createService();

    expect(
      metadataContainsSearchTokens(service, 'sample, "Mara". Invoice-2026'),
    ).toEqual(metadataTokens('sample', 'mara', 'invoice', '2026'));
  });

  it('escapes metadata contains LIKE wildcard tokens', () => {
    const { service } = createService();

    expect(containsPattern(service, 'a%c_\\')).toBe('%a\\%c\\_\\\\%');
  });

  it('adds low-weight metadata contains ranking', () => {
    const { service } = createService();

    const rankSql = searchSql(
      service,
      'searchRankSql',
      ['title', 'sender', 'tags'],
      metadataTokens('ascal'),
    ).text;

    expect(rankSql).toContain('CASE');
    expect(rankSql).toContain('LIKE');
    expect(rankSql).toContain('THEN similarity(lower(d."title")');
    expect(rankSql).toContain('ELSE 0');
    expect(rankSql).toContain('* 0.02');
    expect(rankSql).toContain('THEN similarity(lower(d."sender")');
    expect(rankSql).toContain('* 0.015');
    expect(rankSql).toContain('SELECT MAX');
    expect(rankSql).toContain('THEN similarity(lower(t.name)');
    expect(rankSql).toContain('* 0.012');
  });
});
