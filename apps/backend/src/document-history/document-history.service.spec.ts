import { expectObjectContaining } from '../testing/expect-matchers';
import { NotFoundException } from '@nestjs/common';
import { DocumentHistoryService } from './document-history.service';

const documentId = '018f1a44-9093-7f55-a515-278f4d9bd99f';
const userId = '018f1a44-9093-7f55-a515-278f4d9bd990';
const createdAt = new Date('2026-05-08T10:00:00.000Z');

function historyEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: '018f1a44-9093-7f55-a515-278f4d9bd991',
    documentId,
    type: 'DOCUMENT_METADATA_UPDATED',
    summary: 'Metadaten wurden geändert.',
    actorUser: {
      id: userId,
      username: 'admin',
      displayName: 'Admin',
    },
    changes: [
      {
        field: 'title',
        label: 'Titel',
        oldValue: 'Alt',
        newValue: 'Neu',
      },
    ],
    metadata: { status: 'READY' },
    createdAt,
    ...overrides,
  };
}

function createService() {
  const prisma = {
    document: {
      findUnique: jest.fn(),
    },
    documentHistoryEvent: {
      create: jest.fn(),
      count: jest.fn(),
      findMany: jest.fn(),
    },
  };
  const service = new DocumentHistoryService(prisma as never);

  return { prisma, service };
}

describe('DocumentHistoryService', () => {
  it('sanitizes and maps recorded history events', async () => {
    const { prisma, service } = createService();
    prisma.documentHistoryEvent.create.mockResolvedValue(historyEvent());

    await expect(
      service.record({
        documentId,
        actorUserId: userId,
        type: 'DOCUMENT_METADATA_UPDATED',
        summary: ` ${'x'.repeat(700)} `,
        changes: [
          {
            field: 'title',
            label: 'Titel',
            oldValue: 'Alt',
            newValue: 'Neu',
          },
        ],
        metadata: {
          status: 'READY',
          longValue: 'a'.repeat(500),
        },
      }),
    ).resolves.toEqual({
      id: '018f1a44-9093-7f55-a515-278f4d9bd991',
      documentId,
      type: 'DOCUMENT_METADATA_UPDATED',
      summary: 'Metadaten wurden geändert.',
      actor: {
        id: userId,
        username: 'admin',
        displayName: 'Admin',
      },
      changes: [
        {
          field: 'title',
          label: 'Titel',
          oldValue: 'Alt',
          newValue: 'Neu',
        },
      ],
      metadata: { status: 'READY' },
      createdAt: '2026-05-08T10:00:00.000Z',
    });
    expect(prisma.documentHistoryEvent.create).toHaveBeenCalledWith(
      expectObjectContaining({
        data: expectObjectContaining({
          summary: 'x'.repeat(500),
          metadata: {
            status: 'READY',
            longValue: 'a'.repeat(300),
          },
        }),
      }),
    );
  });

  it('returns paginated document history', async () => {
    const { prisma, service } = createService();
    prisma.document.findUnique.mockResolvedValue({ id: documentId });
    prisma.documentHistoryEvent.count.mockResolvedValue(1);
    prisma.documentHistoryEvent.findMany.mockResolvedValue([historyEvent()]);

    await expect(
      service.listForDocument(documentId, { page: 1, pageSize: 100 }),
    ).resolves.toMatchObject({
      items: [
        {
          id: '018f1a44-9093-7f55-a515-278f4d9bd991',
          documentId,
          actor: {
            displayName: 'Admin',
          },
        },
      ],
      meta: {
        page: 1,
        pageSize: 100,
        totalItems: 1,
        totalPages: 1,
      },
    });
    expect(prisma.documentHistoryEvent.findMany).toHaveBeenCalledWith(
      expectObjectContaining({
        where: { documentId },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        skip: 0,
        take: 100,
      }),
    );
  });

  it('throws when listing history for an unknown document', async () => {
    const { prisma, service } = createService();
    prisma.document.findUnique.mockResolvedValue(null);

    await expect(
      service.listForDocument(documentId, { page: 1, pageSize: 100 }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
