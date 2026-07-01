import { z } from 'zod';
import {
  IsoDateSchema,
  IsoDateTimeSchema,
  DocumentEntrySourceSchema,
  LocalTimeSchema,
  UuidSchema,
} from '../common';
import { TenantSummaryDtoSchema } from '../tenants';
import { UserAssigneeDtoSchema } from '../users';

export const CalendarEventKindSchema = z.enum([
  'DUE_DATE',
  'DEADLINE',
  'APPOINTMENT',
]);
export type CalendarEventKind = z.infer<typeof CalendarEventKindSchema>;

export const DocumentCalendarEventDtoSchema = z.object({
  id: UuidSchema,
  documentId: UuidSchema,
  paymentId: UuidSchema.nullable().optional(),
  tenant: TenantSummaryDtoSchema,
  documentSender: z.string().nullable(),
  kind: CalendarEventKindSchema,
  title: z.string().min(1),
  description: z.string().nullable(),
  date: IsoDateSchema,
  time: LocalTimeSchema.nullable(),
  endDate: IsoDateSchema.nullable(),
  endTime: LocalTimeSchema.nullable(),
  source: DocumentEntrySourceSchema,
  sourceText: z.string().nullable(),
  assignedToId: UuidSchema.nullable().optional(),
  assignedTo: UserAssigneeDtoSchema.nullable().optional(),
  assignedAt: IsoDateTimeSchema.nullable().optional(),
  completedAt: IsoDateTimeSchema.nullable().optional(),
  completedById: UuidSchema.nullable().optional(),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});
export type DocumentCalendarEventDto = z.infer<
  typeof DocumentCalendarEventDtoSchema
>;

export const CalendarEventsRequestSchema = z
  .object({
    from: IsoDateSchema,
    to: IsoDateSchema,
    kinds: z.array(CalendarEventKindSchema).optional(),
    documentId: UuidSchema.optional(),
    includeArchived: z.boolean().default(false),
  })
  .refine((value) => value.from <= value.to, {
    message: '`from` must be before or equal to `to`.',
    path: ['to'],
  });
export type CalendarEventsRequest = z.infer<
  typeof CalendarEventsRequestSchema
>;

export const CalendarEventsResponseSchema = z.object({
  items: z.array(DocumentCalendarEventDtoSchema),
});
export type CalendarEventsResponse = z.infer<
  typeof CalendarEventsResponseSchema
>;

export const AiRelativeCalendarDateSchema = z.object({
  amount: z.number().int().positive(),
  unit: z.enum(['DAYS', 'WEEKS']),
  anchor: z.enum(['DOCUMENT_DATE']),
});
export type AiRelativeCalendarDate = z.infer<
  typeof AiRelativeCalendarDateSchema
>;

export const AiExtractedCalendarEventSchema = z
  .object({
    kind: CalendarEventKindSchema,
    title: z.string().trim().min(1).max(500),
    description: z.string().trim().max(2000).optional(),
    date: IsoDateSchema.optional(),
    relativeDate: AiRelativeCalendarDateSchema.optional(),
    time: LocalTimeSchema.optional(),
    endDate: IsoDateSchema.optional(),
    endTime: LocalTimeSchema.optional(),
    sourceText: z.string().trim().max(1000).optional(),
  })
  .refine((value) => Boolean(value.date || value.relativeDate), {
    message: 'AI calendar events require date or relativeDate.',
    path: ['date'],
  });
export type AiExtractedCalendarEvent = z.infer<
  typeof AiExtractedCalendarEventSchema
>;
