import {
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type {
  CreateEditLockRequest,
  CreateEditLockResponse,
  EditLockDto,
  EditLockScope,
} from '@smart-dms/shared-dto';
import type { EditLock } from '@prisma/client';
import { AiProcessingService } from '../ai/ai-processing.service';
import type { AuthenticatedUser } from '../common/authenticated-user';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeEventsService } from '../realtime/realtime-events.service';
import { toEditLockDto } from './edit-lock.mapper';

const EDIT_LOCK_TTL_MS = 2 * 60 * 1000;
const AI_LOCKED_STATUSES = ['AI_PENDING', 'AI_RUNNING'] as const;

@Injectable()
export class EditLocksService {
  constructor(
    private readonly aiProcessing: AiProcessingService,
    private readonly prisma: PrismaService,
    private readonly realtimeEvents: RealtimeEventsService,
  ) {}

  async acquire(
    request: CreateEditLockRequest,
    user: AuthenticatedUser,
  ): Promise<CreateEditLockResponse> {
    await this.releaseExpiredLocks();

    if (!request.socketId.trim()) {
      throw new ServiceUnavailableException(
        'Edit locks require an active realtime connection.',
      );
    }

    const tenantIds =
      request.scope === 'INBOX'
        ? await this.assertInboxCanBeLocked(request.resourceId, user)
        : [];

    if (request.scope === 'DOCUMENT') {
      await this.assertDocumentCanBeLocked(request.resourceId, user);
    }

    const expiresAt = this.nextExpiresAt();

    try {
      const lock = await this.prisma.editLock.create({
        data: {
          scope: request.scope,
          resourceId: request.resourceId,
          ownerUserId: user.id,
          ownerDisplayName: user.displayName,
          clientId: request.clientId,
          socketId: request.socketId,
          tenantIds,
          expiresAt,
        },
      });
      await this.publish(lock, 'LOCKED');
      return { lock: toEditLockDto(lock) };
    } catch (error) {
      const existing = await this.activeLock(request.scope, request.resourceId);
      if (existing) {
        throw new ConflictException({ lock: toEditLockDto(existing) });
      }
      throw error;
    }
  }

  async heartbeat(
    lockId: string,
    user: AuthenticatedUser,
  ): Promise<CreateEditLockResponse> {
    await this.releaseExpiredLocks();
    const lock = await this.prisma.editLock.findFirst({
      where: {
        id: lockId,
        ownerUserId: user.id,
        expiresAt: { gt: new Date() },
      },
    });

    if (!lock) {
      throw new NotFoundException('Edit lock not found.');
    }

    const renewed = await this.prisma.editLock.update({
      where: { id: lock.id },
      data: { expiresAt: this.nextExpiresAt() },
    });
    await this.publish(renewed, 'RENEWED');

    return { lock: toEditLockDto(renewed) };
  }

  async release(lockId: string, user: AuthenticatedUser): Promise<void> {
    const lock = await this.prisma.editLock.findFirst({
      where: { id: lockId, ownerUserId: user.id },
    });

    if (!lock) {
      return;
    }

    await this.releaseLock(lock, 'RELEASED');
  }

  async releaseBySocketId(socketId: string): Promise<void> {
    const locks = await this.prisma.editLock.findMany({ where: { socketId } });
    for (const lock of locks) {
      await this.releaseLock(lock, 'RELEASED');
    }
  }

  async releaseExpiredLocks(): Promise<void> {
    const expiredLocks = await this.prisma.editLock.findMany({
      where: { expiresAt: { lte: new Date() } },
    });
    for (const lock of expiredLocks) {
      await this.releaseLock(lock, 'EXPIRED');
    }
  }

  private async releaseLock(
    lock: EditLock,
    action: 'RELEASED' | 'EXPIRED',
  ): Promise<void> {
    await this.prisma.editLock
      .delete({ where: { id: lock.id } })
      .catch(() => undefined);
    await this.publish(lock, action);

    if (lock.scope === 'INBOX') {
      await this.aiProcessing.triggerDeferredInboxAiExtraction(
        lock.ownerUserId,
        lock.scope === 'INBOX' ? this.tenantIdsForLock(lock) : [],
      );
    }
  }

  private async activeLock(
    scope: EditLockScope,
    resourceId: string,
  ): Promise<EditLock | null> {
    return this.prisma.editLock.findFirst({
      where: { scope, resourceId, expiresAt: { gt: new Date() } },
    });
  }

  private async assertInboxCanBeLocked(
    resourceId: string,
    user: AuthenticatedUser,
  ): Promise<string[]> {
    const tenantIds = this.tenantIdsForInboxResource(resourceId, user);
    if (tenantIds.length === 0) {
      throw new NotFoundException('Inbox scope not found.');
    }
    const activeAiCount = await this.prisma.document.count({
      where: {
        tenantId: { in: tenantIds },
        acceptedAt: null,
        status: { in: [...AI_LOCKED_STATUSES] },
      },
    });

    if (activeAiCount > 0) {
      throw new ConflictException({ activeAiCount });
    }

    return tenantIds;
  }

  private async assertDocumentCanBeLocked(
    documentId: string,
    user: AuthenticatedUser,
  ): Promise<void> {
    const document = await this.prisma.document.findFirst({
      where: {
        id: documentId,
        tenantId: { in: this.userTenantIds(user) },
      },
      select: { status: true },
    });

    if (!document) {
      throw new NotFoundException('Document not found.');
    }

    this.aiProcessing.assertDocumentIsNotAiRunning(document.status);
  }

  private tenantIdsForInboxResource(
    resourceId: string,
    user: AuthenticatedUser | null,
  ): string[] {
    if (resourceId === 'all') {
      return user ? this.userTenantIds(user) : [];
    }

    const tenantIds = user ? this.userTenantIds(user) : [resourceId];
    return tenantIds.includes(resourceId) ? [resourceId] : [];
  }

  private userTenantIds(user: AuthenticatedUser): string[] {
    return user.tenants
      .filter((tenant) => tenant.isActive)
      .map((tenant) => tenant.id);
  }

  private tenantIdsForLock(lock: EditLock): string[] {
    if (lock.tenantIds.length > 0) {
      return lock.tenantIds;
    }
    return lock.resourceId === 'all' ? [] : [lock.resourceId];
  }

  private nextExpiresAt(): Date {
    return new Date(Date.now() + EDIT_LOCK_TTL_MS);
  }

  private publish(
    lock: EditLock,
    action: 'LOCKED' | 'RENEWED' | 'RELEASED' | 'EXPIRED',
  ): Promise<EditLockDto> {
    const dto = toEditLockDto(lock);
    return this.realtimeEvents
      .editLockChanged({ action, lock: dto })
      .then(() => dto);
  }
}
