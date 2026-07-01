import { z } from 'zod';

export const UuidSchema = z.string().uuid();
export type Uuid = z.infer<typeof UuidSchema>;

export const IsoDateTimeSchema = z.string().datetime({ offset: true });
export type IsoDateTime = z.infer<typeof IsoDateTimeSchema>;

export const IsoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const [year, month, day] = value.split('-').map(Number);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    return (
      parsed.getUTCFullYear() === year &&
      parsed.getUTCMonth() === month - 1 &&
      parsed.getUTCDate() === day
    );
  }, 'Invalid ISO date.');
export type IsoDate = z.infer<typeof IsoDateSchema>;

export const LocalTimeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export type LocalTime = z.infer<typeof LocalTimeSchema>;

export const NonEmptyStringSchema = z.string().trim().min(1);

export const DocumentEntrySourceSchema = z.enum(['AI_EXTRACTED', 'MANUAL']);
export type DocumentEntrySource = z.infer<typeof DocumentEntrySourceSchema>;

export const SortDirectionSchema = z.enum(['asc', 'desc']);
export type SortDirection = z.infer<typeof SortDirectionSchema>;

export const PaginationRequestSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
export type PaginationRequest = z.infer<typeof PaginationRequestSchema>;

export const PaginationMetaSchema = z.object({
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
  totalItems: z.number().int().min(0),
  totalPages: z.number().int().min(0),
});
export type PaginationMeta = z.infer<typeof PaginationMetaSchema>;

export const ApiErrorSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  details: z.unknown().optional(),
  requestId: z.string().optional(),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;

export const ProcessingJobTypeSchema = z.enum([
  'INGEST_DOCUMENT',
  'OCR_DOCUMENT',
  'CREATE_THUMBNAIL',
  'EXTRACT_AI_METADATA',
]);
export type ProcessingJobType = z.infer<typeof ProcessingJobTypeSchema>;

export const ProcessingJobStatusSchema = z.enum([
  'WAITING',
  'ACTIVE',
  'COMPLETED',
  'FAILED',
]);
export type ProcessingJobStatus = z.infer<typeof ProcessingJobStatusSchema>;

export const JobProgressSchema = z.object({
  percent: z.number().min(0).max(100),
  message: z.string().optional(),
});
export type JobProgress = z.infer<typeof JobProgressSchema>;
