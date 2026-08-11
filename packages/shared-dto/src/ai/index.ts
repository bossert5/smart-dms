import { z } from 'zod';
import {
  IsoDateTimeSchema,
  PaginationMetaSchema,
  PaginationRequestSchema,
  UuidSchema,
} from '../common';
import { AiExtractedCalendarEventSchema } from '../calendar';
import {
  DocumentFieldDefinitionDtoSchema,
  DocumentTypeDtoSchema,
  DocumentAttributeValueTypeSchema,
  DocumentPaymentInputSchema,
  DocumentReferenceInputSchema,
} from '../documents';

export const AiProviderTypeSchema = z.enum(['OPENAI_COMPATIBLE']);
export type AiProviderType = z.infer<typeof AiProviderTypeSchema>;

export const AiProviderStatusSchema = z.enum([
  'UNKNOWN',
  'AVAILABLE',
  'UNAVAILABLE',
]);
export type AiProviderStatus = z.infer<typeof AiProviderStatusSchema>;

export const AiProcessingErrorCodeSchema = z.enum([
  'AI_NETWORK_ERROR',
  'AI_TIMEOUT',
  'AI_AUTH_ERROR',
  'AI_RATE_LIMIT',
  'AI_PROVIDER_HTTP_ERROR',
  'AI_EMPTY_OUTPUT',
  'AI_INCOMPLETE_OUTPUT',
  'AI_INVALID_JSON',
  'AI_SCHEMA_MISMATCH',
  'AI_INTERNAL_ERROR',
  'AI_PROCESS_INTERRUPTED',
]);
export type AiProcessingErrorCode = z.infer<typeof AiProcessingErrorCodeSchema>;

export const AiProcessingAttemptStatusSchema = z.enum([
  'ACTIVE',
  'SUCCESS',
  'FAILED',
  'INTERRUPTED',
]);
export type AiProcessingAttemptStatus = z.infer<
  typeof AiProcessingAttemptStatusSchema
>;

export const AiProcessingAttemptKindSchema = z.enum(['INITIAL', 'REPAIR']);
export type AiProcessingAttemptKind = z.infer<
  typeof AiProcessingAttemptKindSchema
>;

export const AiProcessingLogStatusSchema = z.enum([
  'RUNNING',
  'SUCCESS',
  'FAILED',
  'RECOVERED',
  'INTERRUPTED',
]);
export type AiProcessingLogStatus = z.infer<typeof AiProcessingLogStatusSchema>;

export const AiProcessingRequestMetadataSchema = z.object({
  temperature: z.number().finite(),
  maxOutputTokens: z.number().int().positive(),
  reasoningEffort: z.enum(['none', 'low']),
  inputCharacterCount: z.number().int().nonnegative(),
  resultSchemaHash: z.string().regex(/^[a-f0-9]{64}$/),
});
export type AiProcessingRequestMetadata = z.infer<
  typeof AiProcessingRequestMetadataSchema
>;

export const AiProcessingResponseMetadataSchema = z.object({
  responseStatus: z.string().nullable(),
  outputTypes: z.array(z.string()),
  outputContentTypes: z.array(z.string()),
  inputTokens: z.number().int().nonnegative().nullable(),
  outputTokens: z.number().int().nonnegative().nullable(),
  totalTokens: z.number().int().nonnegative().nullable(),
  incompleteDetails: z.unknown().nullable(),
});
export type AiProcessingResponseMetadata = z.infer<
  typeof AiProcessingResponseMetadataSchema
>;

export const AiProcessingAttemptDtoSchema = z.object({
  id: UuidSchema,
  status: AiProcessingAttemptStatusSchema,
  attemptKind: AiProcessingAttemptKindSchema,
  promptKey: z.string().min(1).max(64),
  sequenceIndex: z.number().int().nonnegative(),
  providerId: UuidSchema.nullable(),
  providerName: z.string().min(1).nullable(),
  model: z.string().min(1).max(200),
  startedAt: IsoDateTimeSchema,
  finishedAt: IsoDateTimeSchema.nullable(),
  durationMs: z.number().int().nonnegative().nullable(),
  httpStatus: z.number().int().min(100).max(599).nullable(),
  requestMetadata: AiProcessingRequestMetadataSchema,
  responseMetadata: AiProcessingResponseMetadataSchema.nullable(),
  errorCode: AiProcessingErrorCodeSchema.nullable(),
  errorMessage: z.string().nullable(),
  rawResponse: z.string().nullable(),
  rawResponseTruncated: z.boolean(),
});
export type AiProcessingAttemptDto = z.infer<
  typeof AiProcessingAttemptDtoSchema
>;

export const AiProcessingLogListItemSchema = z.object({
  jobId: UuidSchema,
  documentId: UuidSchema.nullable(),
  documentTitle: z.string().min(1).nullable(),
  providerId: UuidSchema.nullable(),
  providerName: z.string().min(1).nullable(),
  model: z.string().min(1).nullable(),
  status: AiProcessingLogStatusSchema,
  startedAt: IsoDateTimeSchema.nullable(),
  finishedAt: IsoDateTimeSchema.nullable(),
  durationMs: z.number().int().nonnegative().nullable(),
  attemptCount: z.number().int().nonnegative(),
  failedAttemptCount: z.number().int().nonnegative(),
  errorCode: AiProcessingErrorCodeSchema.nullable(),
  errorMessage: z.string().nullable(),
  hasDetailedDiagnostics: z.boolean(),
});
export type AiProcessingLogListItem = z.infer<
  typeof AiProcessingLogListItemSchema
>;

export const AiProcessingLogListResponseSchema = z.object({
  items: z.array(AiProcessingLogListItemSchema),
  pagination: PaginationMetaSchema,
});
export type AiProcessingLogListResponse = z.infer<
  typeof AiProcessingLogListResponseSchema
>;

export const AiProcessingLogDetailSchema = AiProcessingLogListItemSchema.extend(
  {
    attempts: z.array(AiProcessingAttemptDtoSchema),
  },
);
export type AiProcessingLogDetail = z.infer<typeof AiProcessingLogDetailSchema>;

export const AiProcessingLogQuerySchema = PaginationRequestSchema.extend({
  status: AiProcessingLogStatusSchema.optional(),
  providerId: UuidSchema.optional(),
  errorCode: AiProcessingErrorCodeSchema.optional(),
  from: IsoDateTimeSchema.optional(),
  to: IsoDateTimeSchema.optional(),
}).refine(
  (value) => !value.from || !value.to || value.from <= value.to,
  'The start of the diagnostic period must not be after its end.',
);
export type AiProcessingLogQuery = z.infer<typeof AiProcessingLogQuerySchema>;

export const AiProviderModelDtoSchema = z.object({
  name: z.string().min(1),
  model: z.string().min(1),
  createdAt: IsoDateTimeSchema.nullable(),
  ownedBy: z.string().min(1).nullable(),
});
export type AiProviderModelDto = z.infer<typeof AiProviderModelDtoSchema>;

export const AiProviderDtoSchema = z.object({
  id: UuidSchema,
  name: z.string().min(1),
  type: AiProviderTypeSchema,
  baseUrl: z.string().url(),
  selectedModel: z.string().min(1).nullable(),
  selectedMetadataModel: z.string().min(1).nullable(),
  priority: z.number().int().positive(),
  isActive: z.boolean(),
  status: AiProviderStatusSchema,
  lastCheckedAt: IsoDateTimeSchema.nullable(),
  lastError: z.string().nullable(),
  availableModels: z.array(AiProviderModelDtoSchema),
  hasApiKey: z.boolean(),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
  isAvailable: z.boolean(),
});
export type AiProviderDto = z.infer<typeof AiProviderDtoSchema>;

export const AiAvailabilityResponseSchema = z.object({
  enabled: z.boolean(),
  providers: z.array(AiProviderDtoSchema),
});
export type AiAvailabilityResponse = z.infer<
  typeof AiAvailabilityResponseSchema
>;

export const LoadAiProviderModelsRequestSchema = z
  .object({
    baseUrl: z.string().trim().url().max(1000),
    apiKey: z.string().min(1).max(4000).nullable().optional(),
  })
  .strict();
export type LoadAiProviderModelsRequest = z.infer<
  typeof LoadAiProviderModelsRequestSchema
>;

export const AiProviderModelsResponseSchema = z.object({
  models: z.array(AiProviderModelDtoSchema),
});
export type AiProviderModelsResponse = z.infer<
  typeof AiProviderModelsResponseSchema
>;

const AiProviderBaseRequestSchema = z.object({
  name: z.string().trim().min(1).max(160),
  baseUrl: z.string().trim().url().max(1000),
  selectedModel: z.string().trim().min(1).max(200).nullable().optional(),
  selectedMetadataModel: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .nullable()
    .optional(),
  apiKey: z.string().min(1).max(4000).nullable().optional(),
  priority: z.number().int().positive().optional(),
  isActive: z.boolean().optional(),
});

export const CreateAiProviderRequestSchema =
  AiProviderBaseRequestSchema.strict().refine(
    (value) =>
      Boolean(
        value.selectedMetadataModel?.trim() || value.selectedModel?.trim(),
      ),
    {
      message: 'A selected AI provider model must be provided.',
    },
  );
export type CreateAiProviderRequest = z.infer<
  typeof CreateAiProviderRequestSchema
>;

export const UpdateAiProviderRequestSchema =
  AiProviderBaseRequestSchema.partial()
    .strict()
    .refine((value) => Object.keys(value).length > 0, {
      message: 'At least one field must be provided.',
    });
export type UpdateAiProviderRequest = z.infer<
  typeof UpdateAiProviderRequestSchema
>;

export const ReorderAiProvidersRequestSchema = z.object({
  providerIds: z.array(UuidSchema).min(1),
});
export type ReorderAiProvidersRequest = z.infer<
  typeof ReorderAiProvidersRequestSchema
>;

export const AiExtractedDocumentAttributeSchema = z.object({
  key: z.string().trim().min(1).max(100),
  value: z.union([z.string(), z.number(), z.boolean()]),
  valueType: DocumentAttributeValueTypeSchema,
});
export type AiExtractedDocumentAttribute = z.infer<
  typeof AiExtractedDocumentAttributeSchema
>;

export const AiMetadataPromptScopeSchema = z.enum([
  'TITLE',
  'DOCUMENT_TYPE',
  'SUMMARY',
  'TAGS',
  'PARTIES',
  'DOCUMENT_DATE',
  'PAYMENTS',
  'REFERENCES',
  'ATTRIBUTES',
  'CALENDAR_EVENTS',
]);
export type AiMetadataPromptScope = z.infer<typeof AiMetadataPromptScopeSchema>;

export const AiMetadataPromptKeySchema = z.enum([
  'CORE_METADATA',
  'TITLE',
  'DOCUMENT_TYPE',
  'SUMMARY',
  'TAGS',
  'PARTIES',
  'DOCUMENT_DATE',
  'PAYMENTS',
  'REFERENCES',
  'ATTRIBUTES',
  'CALENDAR_EVENTS',
]);
export type AiMetadataPromptKey = z.infer<typeof AiMetadataPromptKeySchema>;

export const AiMetadataPromptDtoSchema = z.object({
  key: AiMetadataPromptScopeSchema,
  label: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(500),
  promptText: z.string().min(1).max(12000),
  defaultPromptText: z.string().min(1).max(12000),
  displayOrder: z.number().int(),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});
export type AiMetadataPromptDto = z.infer<typeof AiMetadataPromptDtoSchema>;

export const UpdateAiMetadataPromptRequestSchema = z.object({
  promptText: z.string().trim().min(1).max(12000),
});
export type UpdateAiMetadataPromptRequest = z.infer<
  typeof UpdateAiMetadataPromptRequestSchema
>;

const AiMetadataExtractionResultBaseSchema = z.object({
  title: z.string().trim().min(1).max(500).optional(),
  documentTypeKey: z.string().trim().min(1).max(100).optional(),
  documentDate: IsoDateTimeSchema.optional(),
  summary: z.string().trim().max(4000).optional(),
  sender: z.string().trim().max(300).optional(),
  recipient: z.string().trim().max(300).optional(),
  note: z.string().trim().max(4000).optional(),
  payments: z.array(DocumentPaymentInputSchema).optional(),
  references: z.array(DocumentReferenceInputSchema).optional(),
  tags: z.array(z.string().trim().min(1).max(80)).optional(),
  attributes: z.array(AiExtractedDocumentAttributeSchema).optional(),
  calendarEvents: z.array(AiExtractedCalendarEventSchema).optional(),
});

export const AiMetadataExtractionResultSchema =
  AiMetadataExtractionResultBaseSchema.refine(hasExtractedMetadata, {
    message: 'At least one metadata field must be extracted.',
  });
export type AiMetadataExtractionResult = z.infer<
  typeof AiMetadataExtractionResultSchema
>;

export const AiMetadataPromptStepSchema = z.object({
  key: AiMetadataPromptKeySchema,
  text: z.string().min(1),
  resultSchema: z.record(z.string(), z.unknown()),
});
export type AiMetadataPromptStep = z.infer<typeof AiMetadataPromptStepSchema>;

export const AiMetadataPromptSequenceSchema = z
  .array(AiMetadataPromptStepSchema)
  .min(1);
export type AiMetadataPromptSequence = z.infer<
  typeof AiMetadataPromptSequenceSchema
>;

export const AiSourceTextFormatSchema = z.enum(['PLAIN_TEXT', 'MARKDOWN']);
export type AiSourceTextFormat = z.infer<typeof AiSourceTextFormatSchema>;

export const AiMetadataExtractionJobPayloadSchema = z.object({
  documentId: UuidSchema,
  ocrText: z.string().min(1),
  sourceTextFormat: AiSourceTextFormatSchema.default('PLAIN_TEXT'),
  metadata: z.object({
    title: z.string(),
    originalFileName: z.string(),
    documentDate: IsoDateTimeSchema.nullable(),
    ocrLanguage: z.string().nullable(),
    aiMetadataLanguage: z.string().nullable().optional(),
    sender: z.string().nullable(),
    recipient: z.string().nullable(),
  }),
  documentTypes: z.array(DocumentTypeDtoSchema.pick({ key: true, name: true })),
  fieldDefinitions: z.array(
    DocumentFieldDefinitionDtoSchema.pick({
      key: true,
      label: true,
      valueType: true,
    }),
  ),
  scopes: z.array(AiMetadataPromptScopeSchema).optional(),
  promptTemplates: z
    .array(
      AiMetadataPromptDtoSchema.pick({
        key: true,
        label: true,
        description: true,
        promptText: true,
        displayOrder: true,
      }),
    )
    .optional(),
  prompts: AiMetadataPromptSequenceSchema,
});
export type AiMetadataExtractionJobPayload = z.infer<
  typeof AiMetadataExtractionJobPayloadSchema
>;

function hasExtractedMetadata(
  value: z.infer<typeof AiMetadataExtractionResultBaseSchema>,
): boolean {
  return (
    hasText(value.title) ||
    hasText(value.documentTypeKey) ||
    hasText(value.documentDate) ||
    hasText(value.summary) ||
    hasText(value.sender) ||
    hasText(value.recipient) ||
    hasText(value.note) ||
    hasItems(value.payments) ||
    hasItems(value.references) ||
    hasItems(value.tags) ||
    hasItems(value.attributes) ||
    hasItems(value.calendarEvents)
  );
}

function hasText(value: string | undefined): boolean {
  return Boolean(value?.trim());
}

function hasItems(value: unknown[] | undefined): boolean {
  return Array.isArray(value) && value.length > 0;
}
