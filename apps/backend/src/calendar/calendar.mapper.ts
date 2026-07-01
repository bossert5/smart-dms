import type {
  Document,
  DocumentCalendarEvent,
  Tenant,
  User,
} from '@prisma/client';
import type { DocumentCalendarEventDto } from '@smart-dms/shared-dto';
import { toIsoDate, toIsoDateTime } from '../common/date-mapper';
import { toTenantSummaryDto } from '../tenants/tenant.mapper';

export type DocumentCalendarEventWithDocumentSender = DocumentCalendarEvent & {
  document?:
    | (Pick<Document, 'sender'> & {
        tenant?: Pick<Tenant, 'id' | 'key' | 'name' | 'isActive'>;
      })
    | null;
  assignedTo?: Pick<User, 'id' | 'username' | 'displayName'> | null;
};

export function toDocumentCalendarEventDto(
  event: DocumentCalendarEventWithDocumentSender,
  documentSender = event.document?.sender ?? null,
  tenant = event.document?.tenant,
): DocumentCalendarEventDto {
  return {
    id: event.id,
    documentId: event.documentId,
    paymentId: event.paymentId,
    tenant: toTenantSummaryDto(requiredTenant(tenant)),
    documentSender,
    kind: event.kind,
    title: event.title,
    description: event.description,
    date: toIsoDate(event.date),
    time: event.time,
    endDate: toIsoDate(event.endDate),
    endTime: event.endTime,
    source: event.source,
    sourceText: event.sourceText,
    assignedToId: event.assignedToId,
    assignedTo: event.assignedTo ? toUserAssigneeDto(event.assignedTo) : null,
    assignedAt: toIsoDateTime(event.assignedAt),
    completedAt: toIsoDateTime(event.completedAt),
    completedById: event.completedById,
    createdAt: toIsoDateTime(event.createdAt),
    updatedAt: toIsoDateTime(event.updatedAt),
  };
}

function toUserAssigneeDto(
  user: Pick<User, 'id' | 'username' | 'displayName'>,
) {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
  };
}

function requiredTenant(
  tenant: Pick<Tenant, 'id' | 'key' | 'name' | 'isActive'> | undefined,
): Pick<Tenant, 'id' | 'key' | 'name' | 'isActive'> {
  if (!tenant) {
    throw new Error('Calendar event mapping requires a tenant.');
  }
  return tenant;
}
