import type { EditLock } from '@prisma/client';
import type { EditLockDto } from '@smart-dms/shared-dto';
import { toIsoDateTime } from '../common/date-mapper';

export function toEditLockDto(lock: EditLock): EditLockDto {
  return {
    id: lock.id,
    scope: lock.scope,
    resourceId: lock.resourceId,
    ownerUserId: lock.ownerUserId,
    ownerDisplayName: lock.ownerDisplayName,
    clientId: lock.clientId,
    socketId: lock.socketId,
    expiresAt: toIsoDateTime(lock.expiresAt),
    createdAt: toIsoDateTime(lock.createdAt),
  };
}
