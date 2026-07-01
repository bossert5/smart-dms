import { z } from "zod";
import {
  DocumentEntrySourceSchema,
  IsoDateSchema,
  IsoDateTimeSchema,
  LocalTimeSchema,
  PaginationMetaSchema,
  UuidSchema,
} from "../common";
import {
  CalendarEventKindSchema,
  DocumentCalendarEventDtoSchema,
} from "../calendar";
import { TenantSummaryDtoSchema } from "../tenants";
import { UserAssigneeDtoSchema } from "../users";

export const DocumentStatusSchema = z.enum([
  "NEW",
  "INGESTING",
  "OCR_PENDING",
  "OCR_RUNNING",
  "READY",
  "AI_PENDING",
  "AI_RUNNING",
  "FAILED",
  "ARCHIVED",
]);
export type DocumentStatus = z.infer<typeof DocumentStatusSchema>;

export const DocumentSourceSchema = z.enum(["SCANNER", "UPLOAD", "EMAIL"]);
export type DocumentSource = z.infer<typeof DocumentSourceSchema>;

export const DocumentAttributeValueTypeSchema = z.enum([
  "TEXT",
  "NUMBER",
  "DATE",
  "BOOLEAN",
]);
export type DocumentAttributeValueType = z.infer<
  typeof DocumentAttributeValueTypeSchema
>;

export const DocumentPaymentStatusSchema = z.enum(["OPEN", "PAID", "IGNORED"]);
export type DocumentPaymentStatus = z.infer<typeof DocumentPaymentStatusSchema>;

export const FileArtifactTypeSchema = z.enum([
  "ORIGINAL",
  "NORMALIZED_IMAGE",
  "FINAL_PDF",
  "THUMBNAIL",
  "ERROR_ARTIFACT",
  "DOCLING_DEBUG_JSON",
]);
export type FileArtifactType = z.infer<typeof FileArtifactTypeSchema>;

const AttributeValueSchema = z.union([z.string(), z.number(), z.boolean()]);

export const TagDtoSchema = z.object({
  id: UuidSchema,
  name: z.string().min(1),
  createdAt: IsoDateTimeSchema,
  createdBy: UuidSchema.nullable(),
});
export type TagDto = z.infer<typeof TagDtoSchema>;

export const DocumentTagDtoSchema = TagDtoSchema.extend({
  source: DocumentEntrySourceSchema,
});
export type DocumentTagDto = z.infer<typeof DocumentTagDtoSchema>;

export const DocumentTypeDtoSchema = z.object({
  id: UuidSchema,
  key: z.string().trim().min(1).max(100),
  name: z.string().trim().min(1).max(200),
  active: z.boolean(),
  isSystem: z.boolean(),
  displayOrder: z.number().int(),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});
export type DocumentTypeDto = z.infer<typeof DocumentTypeDtoSchema>;

export const DocumentFieldDefinitionDtoSchema = z.object({
  id: UuidSchema,
  key: z.string().trim().min(1).max(100),
  label: z.string().trim().min(1).max(200),
  valueType: DocumentAttributeValueTypeSchema,
  required: z.boolean(),
  active: z.boolean(),
  displayOrder: z.number().int(),
  appliesToAllDocumentTypes: z.boolean(),
  documentTypeIds: z.array(UuidSchema),
  includeInFullTextSearch: z.boolean(),
  includeInAiExtraction: z.boolean(),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});
export type DocumentFieldDefinitionDto = z.infer<
  typeof DocumentFieldDefinitionDtoSchema
>;

export const DocumentAttributeDtoSchema = z.object({
  id: UuidSchema,
  fieldDefinitionId: UuidSchema.nullable(),
  key: z.string().min(1),
  label: z.string().min(1).nullable(),
  value: z.union([z.string(), z.number(), z.boolean()]),
  valueType: DocumentAttributeValueTypeSchema,
  source: DocumentEntrySourceSchema,
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});
export type DocumentAttributeDto = z.infer<typeof DocumentAttributeDtoSchema>;

export const DocumentPaymentDtoSchema = z.object({
  id: UuidSchema,
  iban: z.string().nullable(),
  recipient: z.string().nullable(),
  purpose: z.string().nullable(),
  amount: z.number().nullable(),
  currency: z.string().nullable(),
  status: DocumentPaymentStatusSchema,
  paidAt: IsoDateTimeSchema.nullable(),
  paidById: UuidSchema.nullable(),
  assignedToId: UuidSchema.nullable().optional(),
  assignedTo: UserAssigneeDtoSchema.nullable().optional(),
  assignedAt: IsoDateTimeSchema.nullable().optional(),
  dueDate: IsoDateSchema.nullable().optional(),
  dueDateEventId: UuidSchema.nullable().optional(),
  source: DocumentEntrySourceSchema,
  displayOrder: z.number().int(),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});
export type DocumentPaymentDto = z.infer<typeof DocumentPaymentDtoSchema>;

export const DocumentReferenceDtoSchema = z.object({
  id: UuidSchema,
  referenceNumber: z.string().min(1),
  referenceType: z.string().min(1),
  source: DocumentEntrySourceSchema,
  displayOrder: z.number().int(),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});
export type DocumentReferenceDto = z.infer<typeof DocumentReferenceDtoSchema>;

export const FileArtifactDtoSchema = z.object({
  id: UuidSchema,
  artifactType: FileArtifactTypeSchema,
  mimeType: z.string().min(1),
  size: z.number().int().nonnegative(),
  checksum: z.string().nullable(),
  url: z.string().optional(),
  createdAt: IsoDateTimeSchema,
});
export type FileArtifactDto = z.infer<typeof FileArtifactDtoSchema>;

export const DocumentCoreMetadataSourcesSchema = z.object({
  title: DocumentEntrySourceSchema,
  documentType: DocumentEntrySourceSchema,
  documentDate: DocumentEntrySourceSchema,
  sender: DocumentEntrySourceSchema,
});
export type DocumentCoreMetadataSources = z.infer<
  typeof DocumentCoreMetadataSourcesSchema
>;

export const DocumentSummaryDtoSchema = z.object({
  id: UuidSchema,
  tenant: TenantSummaryDtoSchema,
  title: z.string().nullable(),
  displayTitle: z.string().optional(),
  documentType: DocumentTypeDtoSchema.nullable(),
  originalFileName: z.string(),
  source: DocumentSourceSchema,
  mimeType: z.string(),
  status: DocumentStatusSchema,
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
  acceptedAt: IsoDateTimeSchema.nullable(),
  acceptedById: UuidSchema.nullable(),
  aiProcessedAt: IsoDateTimeSchema.nullable(),
  aiDeferredByEditLock: z.boolean().optional(),
  documentDate: IsoDateTimeSchema.nullable(),
  summary: z.string().nullable(),
  sender: z.string().nullable(),
  recipient: z.string().nullable(),
  note: z.string().nullable(),
  fileSize: z.number().int().nonnegative().nullable(),
  pageCount: z.number().int().positive().nullable(),
  tags: z.array(DocumentTagDtoSchema),
  thumbnailUrl: z.string().nullable(),
  calendarEventKinds: z.array(CalendarEventKindSchema),
  metadataSources: DocumentCoreMetadataSourcesSchema.optional(),
});
export type DocumentSummaryDto = z.infer<typeof DocumentSummaryDtoSchema>;

export const DocumentDetailDtoSchema = DocumentSummaryDtoSchema.extend({
  ocrText: z.string().nullable(),
  failedReason: z.string().nullable(),
  pdfUrl: z.string().nullable(),
  attributes: z.array(DocumentAttributeDtoSchema),
  payments: z.array(DocumentPaymentDtoSchema),
  references: z.array(DocumentReferenceDtoSchema),
  fieldDefinitions: z.array(DocumentFieldDefinitionDtoSchema),
  documentTypes: z.array(DocumentTypeDtoSchema),
  artifacts: z.array(FileArtifactDtoSchema),
  calendarEvents: z.array(DocumentCalendarEventDtoSchema),
});
export type DocumentDetailDto = z.infer<typeof DocumentDetailDtoSchema>;

export const DocumentPaymentInputSchema = z.object({
  id: UuidSchema.optional(),
  iban: z.string().trim().max(80).nullable().optional(),
  recipient: z.string().trim().max(300).nullable().optional(),
  purpose: z.string().trim().max(500).nullable().optional(),
  amount: z.number().finite().nullable().optional(),
  currency: z.string().trim().min(1).max(3).nullable().optional(),
  status: DocumentPaymentStatusSchema.optional(),
  paidAt: IsoDateTimeSchema.nullable().optional(),
  dueDate: IsoDateSchema.nullable().optional(),
  dueDateSourceText: z.string().trim().max(1000).nullable().optional(),
});
export type DocumentPaymentInput = z.infer<typeof DocumentPaymentInputSchema>;

export const DocumentCalendarEventInputSchema = z
  .object({
    id: UuidSchema.optional(),
    kind: CalendarEventKindSchema,
    title: z.string().trim().min(1).max(500),
    description: z.string().trim().max(2000).nullable().optional(),
    date: IsoDateSchema,
    time: LocalTimeSchema.nullable().optional(),
    endDate: IsoDateSchema.nullable().optional(),
    endTime: LocalTimeSchema.nullable().optional(),
    sourceText: z.string().trim().max(1000).nullable().optional(),
  })
  .strict();
export type DocumentCalendarEventInput = z.infer<
  typeof DocumentCalendarEventInputSchema
>;

export const DocumentTaskUpdateRequestSchema = z
  .object({
    assignedToId: UuidSchema.nullable().optional(),
    completed: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided.",
  });
export type DocumentTaskUpdateRequest = z.infer<
  typeof DocumentTaskUpdateRequestSchema
>;

export const DocumentReferenceInputSchema = z.object({
  id: UuidSchema.optional(),
  referenceNumber: z.string().trim().min(1).max(200),
  referenceType: z.string().trim().min(1).max(120),
});
export type DocumentReferenceInput = z.infer<
  typeof DocumentReferenceInputSchema
>;

export const DocumentAttributeInputSchema = z.object({
  fieldDefinitionId: UuidSchema.nullable().optional(),
  key: z.string().trim().min(1).max(100),
  value: AttributeValueSchema,
  valueType: DocumentAttributeValueTypeSchema,
});
export type DocumentAttributeInput = z.infer<
  typeof DocumentAttributeInputSchema
>;

export const DocumentMetadataUpdateRequestSchema = z
  .object({
    title: z.string().trim().min(1).max(500).nullable().optional(),
    documentTypeId: UuidSchema.nullable().optional(),
    documentDate: IsoDateTimeSchema.nullable().optional(),
    summary: z.string().trim().max(4000).nullable().optional(),
    sender: z.string().trim().min(1).max(300).nullable().optional(),
    recipient: z.string().trim().max(300).nullable().optional(),
    note: z.string().trim().max(4000).nullable().optional(),
    payments: z.array(DocumentPaymentInputSchema).max(50).optional(),
    calendarEvents: z.array(DocumentCalendarEventInputSchema).max(100).optional(),
    references: z.array(DocumentReferenceInputSchema).max(100).optional(),
    attributes: z.array(DocumentAttributeInputSchema).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided.",
  });
export type DocumentMetadataUpdateRequest = z.infer<
  typeof DocumentMetadataUpdateRequestSchema
>;

export const UpdateDocumentTagsRequestSchema = z.object({
  tags: z.array(z.string().trim().min(1).max(80)).max(50),
});
export type UpdateDocumentTagsRequest = z.infer<
  typeof UpdateDocumentTagsRequestSchema
>;

export const MoveDocumentToTenantRequestSchema = z.object({
  targetTenantId: UuidSchema,
});
export type MoveDocumentToTenantRequest = z.infer<
  typeof MoveDocumentToTenantRequestSchema
>;

export const AcceptInboxDocumentsRequestSchema = z.object({
  documentIds: z.array(UuidSchema).min(1).max(500),
});
export type AcceptInboxDocumentsRequest = z.infer<
  typeof AcceptInboxDocumentsRequestSchema
>;

export const AcceptInboxDocumentsResponseSchema = z.object({
  acceptedCount: z.number().int().nonnegative(),
  documents: z.array(DocumentSummaryDtoSchema),
});
export type AcceptInboxDocumentsResponse = z.infer<
  typeof AcceptInboxDocumentsResponseSchema
>;

export const MoveDocumentToInboxResponseSchema = z.object({
  document: DocumentSummaryDtoSchema,
});
export type MoveDocumentToInboxResponse = z.infer<
  typeof MoveDocumentToInboxResponseSchema
>;

export const MoveDocumentToTenantResponseSchema = z.object({
  document: DocumentSummaryDtoSchema,
});
export type MoveDocumentToTenantResponse = z.infer<
  typeof MoveDocumentToTenantResponseSchema
>;

export const DeleteDocumentResponseSchema = z.object({
  deleted: z.literal(true),
  documentId: UuidSchema,
});
export type DeleteDocumentResponse = z.infer<
  typeof DeleteDocumentResponseSchema
>;

export const UploadDocumentResponseSchema = z.object({
  document: DocumentSummaryDtoSchema,
  jobId: UuidSchema,
});
export type UploadDocumentResponse = z.infer<
  typeof UploadDocumentResponseSchema
>;

export const UploadConfigResponseSchema = z.object({
  maxUploadSizeBytes: z.number().int().positive(),
  allowedMimeTypes: z.array(z.string().min(1)),
});
export type UploadConfigResponse = z.infer<typeof UploadConfigResponseSchema>;

export const ReprocessDocumentResponseSchema = z.object({
  documentId: UuidSchema,
  jobId: UuidSchema,
  status: DocumentStatusSchema,
});
export type ReprocessDocumentResponse = z.infer<
  typeof ReprocessDocumentResponseSchema
>;

export const ReprocessDocumentActionSchema = z.enum(["OCR", "ROTATE_180"]);
export type ReprocessDocumentAction = z.infer<
  typeof ReprocessDocumentActionSchema
>;

export const ReprocessDocumentRequestSchema = z.object({
  action: ReprocessDocumentActionSchema.default("OCR"),
});
export type ReprocessDocumentRequest = z.infer<
  typeof ReprocessDocumentRequestSchema
>;

export const TriggerDocumentAiProcessingResponseSchema = z.object({
  documentId: UuidSchema,
  jobId: UuidSchema,
  status: DocumentStatusSchema,
  queuePosition: z.number().int().positive(),
});
export type TriggerDocumentAiProcessingResponse = z.infer<
  typeof TriggerDocumentAiProcessingResponseSchema
>;

export const QueuedAiDocumentSchema = TriggerDocumentAiProcessingResponseSchema;
export type QueuedAiDocument = z.infer<typeof QueuedAiDocumentSchema>;

export const TriggerBulkAiProcessingResponseSchema = z.object({
  queuedCount: z.number().int().nonnegative(),
  queuedDocuments: z.array(QueuedAiDocumentSchema),
});
export type TriggerBulkAiProcessingResponse = z.infer<
  typeof TriggerBulkAiProcessingResponseSchema
>;

export const DocumentHistoryEventTypeSchema = z.enum([
  "SCANNER_DOCUMENT_DETECTED",
  "DOCUMENT_UPLOADED",
  "EMAIL_ATTACHMENT_IMPORTED",
  "DOCUMENT_PROCESSING_QUEUED",
  "DOCUMENT_REPROCESS_REQUESTED",
  "OCR_PROCESSING_STARTED",
  "OCR_PROCESSING_COMPLETED",
  "DOCUMENT_PROCESSING_FAILED",
  "AI_METADATA_EXTRACTED",
  "DOCUMENT_METADATA_UPDATED",
  "DOCUMENT_TAGS_UPDATED",
  "DOCUMENT_ACCEPTED",
  "DOCUMENT_MOVED_TO_INBOX",
  "DOCUMENT_MOVED_TO_TENANT",
  "DOCUMENT_ARCHIVED",
]);
export type DocumentHistoryEventType = z.infer<
  typeof DocumentHistoryEventTypeSchema
>;

export const DocumentHistoryChangeValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.array(z.string()),
  z.null(),
]);
export type DocumentHistoryChangeValue = z.infer<
  typeof DocumentHistoryChangeValueSchema
>;

export const DocumentHistoryChangeDtoSchema = z.object({
  field: z.string().trim().min(1).max(100),
  label: z.string().trim().min(1).max(120),
  oldValue: DocumentHistoryChangeValueSchema,
  newValue: DocumentHistoryChangeValueSchema,
});
export type DocumentHistoryChangeDto = z.infer<
  typeof DocumentHistoryChangeDtoSchema
>;

export const DocumentHistoryActorDtoSchema = z.object({
  id: UuidSchema,
  username: z.string().trim().min(1).max(100),
  displayName: z.string().trim().min(1).max(200),
});
export type DocumentHistoryActorDto = z.infer<
  typeof DocumentHistoryActorDtoSchema
>;

export const DocumentHistoryEventDtoSchema = z.object({
  id: UuidSchema,
  documentId: UuidSchema,
  type: DocumentHistoryEventTypeSchema,
  summary: z.string().trim().min(1).max(500),
  actor: DocumentHistoryActorDtoSchema.nullable(),
  changes: z.array(DocumentHistoryChangeDtoSchema),
  metadata: z.record(z.string(), z.unknown()).nullable(),
  createdAt: IsoDateTimeSchema,
});
export type DocumentHistoryEventDto = z.infer<
  typeof DocumentHistoryEventDtoSchema
>;

export const DocumentHistoryResponseSchema = z.object({
  items: z.array(DocumentHistoryEventDtoSchema),
  meta: PaginationMetaSchema,
});
export type DocumentHistoryResponse = z.infer<
  typeof DocumentHistoryResponseSchema
>;

export const CreateDocumentTypeRequestSchema = z.object({
  key: z.string().trim().min(1).max(100),
  name: z.string().trim().min(1).max(200),
  active: z.boolean().default(true),
  displayOrder: z.number().int().default(0),
});
export type CreateDocumentTypeRequest = z.infer<
  typeof CreateDocumentTypeRequestSchema
>;

export const UpdateDocumentTypeRequestSchema =
  CreateDocumentTypeRequestSchema.partial().refine(
    (value) => Object.keys(value).length > 0,
    {
      message: "At least one field must be provided.",
    },
  );
export type UpdateDocumentTypeRequest = z.infer<
  typeof UpdateDocumentTypeRequestSchema
>;

export const ReorderDocumentTypesRequestSchema = z.object({
  documentTypeIds: z.array(UuidSchema).min(1),
});
export type ReorderDocumentTypesRequest = z.infer<
  typeof ReorderDocumentTypesRequestSchema
>;

const DocumentFieldDefinitionRequestBaseSchema = z.object({
  key: z.string().trim().min(1).max(100),
  label: z.string().trim().min(1).max(200),
  valueType: DocumentAttributeValueTypeSchema,
  required: z.boolean().default(false),
  active: z.boolean().default(true),
  displayOrder: z.number().int().default(0),
  appliesToAllDocumentTypes: z.boolean().default(true),
  documentTypeIds: z.array(UuidSchema).default([]),
  includeInFullTextSearch: z.boolean().default(false),
  includeInAiExtraction: z.boolean().default(false),
});

export const CreateDocumentFieldDefinitionRequestSchema =
  DocumentFieldDefinitionRequestBaseSchema.refine(
    (value) =>
      value.appliesToAllDocumentTypes || value.documentTypeIds.length > 0,
    {
      message:
        "At least one document type is required when the field is not global.",
      path: ["documentTypeIds"],
    },
  );
export type CreateDocumentFieldDefinitionRequest = z.infer<
  typeof CreateDocumentFieldDefinitionRequestSchema
>;

export const UpdateDocumentFieldDefinitionRequestSchema =
  DocumentFieldDefinitionRequestBaseSchema.partial()
    .refine((value) => Object.keys(value).length > 0, {
      message: "At least one field must be provided.",
    })
    .refine(
      (value) =>
        value.appliesToAllDocumentTypes !== false ||
        value.documentTypeIds === undefined ||
        value.documentTypeIds.length > 0,
      {
        message:
          "At least one document type is required when the field is not global.",
        path: ["documentTypeIds"],
      },
    );
export type UpdateDocumentFieldDefinitionRequest = z.infer<
  typeof UpdateDocumentFieldDefinitionRequestSchema
>;
