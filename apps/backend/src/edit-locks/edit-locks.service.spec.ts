import { expectObjectContaining } from '../testing/expect-matchers';
import { ConflictException } from '@nestjs/common';
import type { AuthenticatedUser } from '../common/authenticated-user';
import { EditLocksService } from './edit-locks.service';

const tenant = {
  id: '018f1a44-9093-7f55-a515-278f4d9bd900',
  key: 'default',
  name: 'Default',
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

function editLock(overrides: Record<string, unknown> = {}) {
  return {
    id: '018f1a44-9093-7f55-a515-278f4d9bd990',
    scope: 'INBOX' as const,
    resourceId: 'all',
    ownerUserId: user.id,
    ownerDisplayName: user.displayName,
    clientId: 'client-id',
    socketId: 'socket-id',
    tenantIds: [tenant.id],
    expiresAt: new Date('2026-05-07T18:05:00.000Z'),
    createdAt: new Date('2026-05-07T18:00:00.000Z'),
    updatedAt: new Date('2026-05-07T18:00:00.000Z'),
    ...overrides,
  };
}

function createService() {
  const prisma = {
    editLock: {
      create: jest.fn().mockResolvedValue(editLock()),
      delete: jest.fn().mockResolvedValue(editLock()),
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn(),
    },
    document: {
      count: jest.fn().mockResolvedValue(0),
      findFirst: jest.fn(),
    },
  };
  const aiProcessing = {
    assertDocumentIsNotAiRunning: jest.fn(),
    triggerDeferredInboxAiExtraction: jest.fn().mockResolvedValue(undefined),
  };
  const realtimeEvents = {
    editLockChanged: jest.fn().mockResolvedValue(undefined),
  };
  const service = new EditLocksService(
    aiProcessing as never,
    prisma as never,
    realtimeEvents as never,
  );

  return { aiProcessing, prisma, realtimeEvents, service };
}

describe('EditLocksService', () => {
  it('creates an inbox lock with the resolved tenant scope', async () => {
    const { prisma, realtimeEvents, service } = createService();

    const result = await service.acquire(
      {
        scope: 'INBOX',
        resourceId: 'all',
        clientId: 'client-id',
        socketId: 'socket-id',
      },
      user,
    );

    expect(result.lock.id).toBe('018f1a44-9093-7f55-a515-278f4d9bd990');
    expect(prisma.document.count).toHaveBeenCalledWith({
      where: {
        tenantId: { in: [tenant.id] },
        acceptedAt: null,
        status: { in: ['AI_PENDING', 'AI_RUNNING'] },
      },
    });
    expect(prisma.editLock.create).toHaveBeenCalledWith({
      data: expectObjectContaining({
        scope: 'INBOX',
        resourceId: 'all',
        ownerUserId: user.id,
        tenantIds: [tenant.id],
      }),
    });
    expect(realtimeEvents.editLockChanged).toHaveBeenCalledWith(
      expectObjectContaining({ action: 'LOCKED' }),
    );
  });

  it('returns the active lock as conflict response when the scope is locked', async () => {
    const { prisma, service } = createService();
    prisma.editLock.create.mockRejectedValueOnce(new Error('unique violation'));
    prisma.editLock.findFirst.mockResolvedValueOnce(editLock());

    await expect(
      service.acquire(
        {
          scope: 'INBOX',
          resourceId: 'all',
          clientId: 'client-id',
          socketId: 'socket-id',
        },
        user,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('releases socket locks and starts deferred inbox AI jobs for locked tenants', async () => {
    const lock = editLock();
    const { aiProcessing, prisma, realtimeEvents, service } = createService();
    prisma.editLock.findMany.mockResolvedValueOnce([lock]);

    await service.releaseBySocketId('socket-id');

    expect(prisma.editLock.delete).toHaveBeenCalledWith({
      where: { id: lock.id },
    });
    expect(realtimeEvents.editLockChanged).toHaveBeenCalledWith(
      expectObjectContaining({ action: 'RELEASED' }),
    );
    expect(aiProcessing.triggerDeferredInboxAiExtraction).toHaveBeenCalledWith(
      user.id,
      [tenant.id],
    );
  });
});
