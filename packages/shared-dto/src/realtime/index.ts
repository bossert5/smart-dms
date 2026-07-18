import { z } from 'zod';
import { IsoDateTimeSchema, UuidSchema } from '../common';
import { DocumentStatusSchema } from '../documents';
import { AiProviderDtoSchema } from '../ai';
import { EditLockDtoSchema } from '../edit-locks';

export const REALTIME_NAMESPACE = '/realtime' as const;
export const NOTIFICATIONS_SNAPSHOT_EVENT = 'notifications.snapshot' as const;
export const NOTIFICATIONS_CREATED_EVENT = 'notifications.created' as const;
export const DOCUMENT_CHANGED_EVENT = 'document.changed' as const;
export const AI_PROVIDER_CHANGED_EVENT = 'ai.provider.changed' as const;
export const EDIT_LOCK_CHANGED_EVENT = 'edit-lock.changed' as const;

export const RealtimeNotificationTypeSchema = z.enum([
  'document.uploaded',
  'document.scanner_ingested',
  'document.status_changed',
  'document.reprocess_queued',
  'document.accepted',
  'document.moved_to_inbox',
  'document.moved_to_tenant',
  'document.archived',
  'document.deleted',
  'ocr.started',
  'ocr.completed',
  'extraction.started',
  'extraction.completed',
  'extraction.failed',
  'processing.failed',
  'ai.queued',
  'ai.bulk_queued',
  'ai.field_update_queued',
  'ai.started',
  'ai.failed',
  'ai.metadata_extracted',
  'ai.metadata_updated',
]);
export type RealtimeNotificationType = z.infer<
  typeof RealtimeNotificationTypeSchema
>;

export const RealtimeNotificationSeveritySchema = z.enum([
  'info',
  'success',
  'warning',
  'error',
]);
export type RealtimeNotificationSeverity = z.infer<
  typeof RealtimeNotificationSeveritySchema
>;

export const RealtimeNotificationDtoSchema = z.object({
  id: UuidSchema,
  tenantId: UuidSchema.optional(),
  type: RealtimeNotificationTypeSchema,
  severity: RealtimeNotificationSeveritySchema,
  createdAt: IsoDateTimeSchema,
  documentId: UuidSchema.optional(),
  documentTitle: z.string().trim().min(1).max(500).optional(),
  jobId: UuidSchema.optional(),
  status: DocumentStatusSchema.optional(),
  queuePosition: z.number().int().positive().optional(),
  documentCount: z.number().int().positive().optional(),
  targetTenantName: z.string().trim().min(1).max(200).optional(),
});
export type RealtimeNotificationDto = z.infer<
  typeof RealtimeNotificationDtoSchema
>;

export const RealtimeNotificationsSnapshotSchema = z.object({
  items: z.array(RealtimeNotificationDtoSchema),
});
export type RealtimeNotificationsSnapshot = z.infer<
  typeof RealtimeNotificationsSnapshotSchema
>;

export const RealtimeDocumentChangeReasonSchema = z.enum([
  'DOCUMENT_UPLOADED',
  'SCANNER_INGESTED',
  'DOCUMENT_ACCEPTED',
  'DOCUMENT_REPROCESS_REQUESTED',
  'DOCUMENT_MOVED_TO_INBOX',
  'DOCUMENT_MOVED_TO_TENANT',
  'DOCUMENT_ARCHIVED',
  'DOCUMENT_DELETED',
  'DOCUMENT_TASK_UPDATED',
  'OCR_STARTED',
  'OCR_COMPLETED',
  'EXTRACTION_STARTED',
  'EXTRACTION_COMPLETED',
  'EXTRACTION_FAILED',
  'PROCESSING_FAILED',
  'AI_QUEUED',
  'AI_STARTED',
  'AI_FAILED',
  'AI_METADATA_EXTRACTED',
]);
export type RealtimeDocumentChangeReason = z.infer<
  typeof RealtimeDocumentChangeReasonSchema
>;

export const RealtimeDocumentChangedEventSchema = z.object({
  type: z.literal(DOCUMENT_CHANGED_EVENT),
  documentId: UuidSchema,
  tenantId: UuidSchema,
  status: DocumentStatusSchema,
  jobId: UuidSchema.optional(),
  queuePosition: z.number().int().positive().optional(),
  reason: RealtimeDocumentChangeReasonSchema,
  changedAt: IsoDateTimeSchema,
});
export type RealtimeDocumentChangedEvent = z.infer<
  typeof RealtimeDocumentChangedEventSchema
>;

export const RealtimeAiProviderChangeActionSchema = z.enum([
  'UPSERT',
  'DELETE',
]);
export type RealtimeAiProviderChangeAction = z.infer<
  typeof RealtimeAiProviderChangeActionSchema
>;

export const RealtimeAiProviderChangeReasonSchema = z.enum([
  'PROVIDER_CREATED',
  'PROVIDER_UPDATED',
  'PROVIDER_DELETED',
  'PROVIDER_HEALTH_CHANGED',
  'PROVIDER_MODEL_REFRESHED',
  'PROVIDER_MODEL_DOWNLOAD',
]);
export type RealtimeAiProviderChangeReason = z.infer<
  typeof RealtimeAiProviderChangeReasonSchema
>;

export const RealtimeEditLockChangeActionSchema = z.enum([
  'LOCKED',
  'RENEWED',
  'RELEASED',
  'EXPIRED',
]);
export type RealtimeEditLockChangeAction = z.infer<
  typeof RealtimeEditLockChangeActionSchema
>;

export const RealtimeEditLockChangedEventSchema = z.object({
  type: z.literal(EDIT_LOCK_CHANGED_EVENT),
  action: RealtimeEditLockChangeActionSchema,
  lock: EditLockDtoSchema,
  changedAt: IsoDateTimeSchema,
});
export type RealtimeEditLockChangedEvent = z.infer<
  typeof RealtimeEditLockChangedEventSchema
>;

export const RealtimeAiProviderChangedEventSchema = z.object({
  type: z.literal(AI_PROVIDER_CHANGED_EVENT),
  providerId: UuidSchema,
  action: RealtimeAiProviderChangeActionSchema,
  provider: AiProviderDtoSchema.optional(),
  reason: RealtimeAiProviderChangeReasonSchema,
  changedAt: IsoDateTimeSchema,
});
export type RealtimeAiProviderChangedEvent = z.infer<
  typeof RealtimeAiProviderChangedEventSchema
>;

export const RealtimeDomainEventSchema = z.discriminatedUnion('type', [
  RealtimeDocumentChangedEventSchema,
  RealtimeAiProviderChangedEventSchema,
  RealtimeEditLockChangedEventSchema,
]);
export type RealtimeDomainEvent = z.infer<typeof RealtimeDomainEventSchema>;
