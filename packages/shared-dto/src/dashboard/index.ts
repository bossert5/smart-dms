import { z } from 'zod';
import {
  IsoDateSchema,
  IsoDateTimeSchema,
  LocalTimeSchema,
  UuidSchema,
} from '../common';
import { CalendarEventKindSchema } from '../calendar';
import {
  DocumentSourceSchema,
  DocumentStatusSchema,
} from '../documents';
import { TenantSummaryDtoSchema } from '../tenants';
import { UserAssigneeDtoSchema } from '../users';

export const DashboardMoneyTotalDtoSchema = z.object({
  currency: z.string().trim().min(1).max(3),
  amount: z.number(),
});
export type DashboardMoneyTotalDto = z.infer<
  typeof DashboardMoneyTotalDtoSchema
>;

export const DashboardKpisDtoSchema = z.object({
  inboxTotal: z.number().int().nonnegative(),
  inboxReady: z.number().int().nonnegative(),
  dueThisWeek: z.number().int().nonnegative(),
  overdue: z.number().int().nonnegative(),
  openPaymentCount: z.number().int().nonnegative(),
  openPaymentTotals: z.array(DashboardMoneyTotalDtoSchema),
  failedProcessing: z.number().int().nonnegative(),
  failedOcr: z.number().int().nonnegative(),
  missingMetadata: z.number().int().nonnegative(),
});
export type DashboardKpisDto = z.infer<typeof DashboardKpisDtoSchema>;

export const DashboardActionItemTypeSchema = z.enum([
  'INBOX_READY',
  'PROCESSING_FAILED',
  'OPEN_PAYMENT',
  'MISSING_METADATA',
]);
export type DashboardActionItemType = z.infer<
  typeof DashboardActionItemTypeSchema
>;

export const DashboardActionItemPrioritySchema = z.enum([
  'HIGH',
  'MEDIUM',
  'LOW',
]);
export type DashboardActionItemPriority = z.infer<
  typeof DashboardActionItemPrioritySchema
>;

export const DashboardActionItemDtoSchema = z.object({
  id: z.string().min(1),
  type: DashboardActionItemTypeSchema,
  priority: DashboardActionItemPrioritySchema,
  tenant: TenantSummaryDtoSchema,
  documentId: UuidSchema,
  paymentId: UuidSchema.nullable().optional(),
  calendarEventId: UuidSchema.nullable().optional(),
  title: z.string().min(1),
  subtitle: z.string().nullable(),
  dueDate: IsoDateSchema.nullable(),
  amount: z.number().nullable(),
  currency: z.string().nullable(),
  status: DocumentStatusSchema.nullable(),
  assignedTo: UserAssigneeDtoSchema.nullable().optional(),
  createdAt: IsoDateTimeSchema,
});
export type DashboardActionItemDto = z.infer<
  typeof DashboardActionItemDtoSchema
>;

export const DashboardUpcomingEventDtoSchema = z.object({
  id: UuidSchema,
  paymentId: UuidSchema.nullable().optional(),
  tenant: TenantSummaryDtoSchema,
  documentId: UuidSchema,
  documentTitle: z.string().min(1),
  documentSender: z.string().nullable(),
  kind: CalendarEventKindSchema,
  title: z.string().min(1),
  date: IsoDateSchema,
  time: LocalTimeSchema.nullable(),
  isOverdue: z.boolean(),
  assignedTo: UserAssigneeDtoSchema.nullable().optional(),
});
export type DashboardUpcomingEventDto = z.infer<
  typeof DashboardUpcomingEventDtoSchema
>;

export const DashboardDateEntryDtoSchema = DashboardUpcomingEventDtoSchema;
export type DashboardDateEntryDto = z.infer<
  typeof DashboardDateEntryDtoSchema
>;

export const DashboardDateEntryBucketsDtoSchema = z.object({
  overdue: z.array(DashboardDateEntryDtoSchema),
  upcoming: z.array(DashboardDateEntryDtoSchema),
});
export type DashboardDateEntryBucketsDto = z.infer<
  typeof DashboardDateEntryBucketsDtoSchema
>;

export const DashboardPaymentEntryDtoSchema = z.object({
  id: UuidSchema,
  calendarEventId: UuidSchema.nullable().optional(),
  tenant: TenantSummaryDtoSchema,
  documentId: UuidSchema,
  documentTitle: z.string().min(1),
  documentSender: z.string().nullable(),
  recipient: z.string().nullable(),
  purpose: z.string().nullable(),
  dueDate: IsoDateSchema,
  amount: z.number().nullable(),
  currency: z.string().nullable(),
  isOverdue: z.boolean(),
  assignedTo: UserAssigneeDtoSchema.nullable().optional(),
});
export type DashboardPaymentEntryDto = z.infer<
  typeof DashboardPaymentEntryDtoSchema
>;

export const DashboardPaymentBucketsDtoSchema = z.object({
  overdue: z.array(DashboardPaymentEntryDtoSchema),
  upcoming: z.array(DashboardPaymentEntryDtoSchema),
});
export type DashboardPaymentBucketsDto = z.infer<
  typeof DashboardPaymentBucketsDtoSchema
>;

export const DashboardCombinedEntryDtoSchema = z.object({
  id: z.string().min(1),
  tenant: TenantSummaryDtoSchema,
  documentId: UuidSchema,
  documentTitle: z.string().min(1),
  documentSender: z.string().nullable(),
  date: IsoDateSchema,
  isOverdue: z.boolean(),
  dateEntries: z.array(DashboardDateEntryDtoSchema),
  payments: z.array(DashboardPaymentEntryDtoSchema),
});
export type DashboardCombinedEntryDto = z.infer<
  typeof DashboardCombinedEntryDtoSchema
>;

export const DashboardInboxOverviewDtoSchema = z.object({
  ready: z.number().int().nonnegative(),
  open: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
});
export type DashboardInboxOverviewDto = z.infer<
  typeof DashboardInboxOverviewDtoSchema
>;

export const DashboardAiWorkersDtoSchema = z.object({
  connected: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
});
export type DashboardAiWorkersDto = z.infer<
  typeof DashboardAiWorkersDtoSchema
>;

export const DashboardEmailOverviewDtoSchema = z.object({
  accounts: z.number().int().nonnegative(),
  processed: z.number().int().nonnegative(),
  open: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
});
export type DashboardEmailOverviewDto = z.infer<
  typeof DashboardEmailOverviewDtoSchema
>;

export const DashboardFactsDtoSchema = z.object({
  documents: z.number().int().nonnegative(),
  users: z.number().int().nonnegative(),
  openPayments: z.number().int().nonnegative(),
  openDateEntries: z.number().int().nonnegative(),
  inbox: DashboardInboxOverviewDtoSchema,
  emails: DashboardEmailOverviewDtoSchema,
  aiWorkers: DashboardAiWorkersDtoSchema,
});
export type DashboardFactsDto = z.infer<typeof DashboardFactsDtoSchema>;

export const DashboardRecentDocumentDtoSchema = z.object({
  id: UuidSchema,
  tenant: TenantSummaryDtoSchema,
  title: z.string().min(1),
  source: DocumentSourceSchema,
  status: DocumentStatusSchema,
  createdAt: IsoDateTimeSchema,
  acceptedAt: IsoDateTimeSchema.nullable(),
  documentDate: IsoDateTimeSchema.nullable(),
});
export type DashboardRecentDocumentDto = z.infer<
  typeof DashboardRecentDocumentDtoSchema
>;

export const DashboardRecentCompletedItemTypeSchema = z.enum([
  'PAYMENT',
  'CALENDAR_EVENT',
]);
export type DashboardRecentCompletedItemType = z.infer<
  typeof DashboardRecentCompletedItemTypeSchema
>;

export const DashboardRecentCompletedItemDtoSchema = z.object({
  id: z.string().min(1),
  type: DashboardRecentCompletedItemTypeSchema,
  tenant: TenantSummaryDtoSchema,
  documentId: UuidSchema,
  title: z.string().min(1),
  subtitle: z.string().nullable(),
  completedAt: IsoDateTimeSchema,
  amount: z.number().nullable(),
  currency: z.string().nullable(),
  completedBy: UserAssigneeDtoSchema.nullable().optional(),
});
export type DashboardRecentCompletedItemDto = z.infer<
  typeof DashboardRecentCompletedItemDtoSchema
>;

export const DashboardEmailSyncErrorDtoSchema = z.object({
  mailboxId: UuidSchema,
  tenant: TenantSummaryDtoSchema,
  mailboxName: z.string().min(1),
  lastSyncAt: IsoDateTimeSchema.nullable(),
  lastSyncError: z.string().min(1),
});
export type DashboardEmailSyncErrorDto = z.infer<
  typeof DashboardEmailSyncErrorDtoSchema
>;

export const DashboardTenantBreakdownDtoSchema = z.object({
  tenant: TenantSummaryDtoSchema,
  inboxTotal: z.number().int().nonnegative(),
  failedProcessing: z.number().int().nonnegative(),
  openPaymentCount: z.number().int().nonnegative(),
  dueThisWeek: z.number().int().nonnegative(),
});
export type DashboardTenantBreakdownDto = z.infer<
  typeof DashboardTenantBreakdownDtoSchema
>;

export const DashboardProcessingHealthDtoSchema = z.object({
  waitingJobs: z.number().int().nonnegative(),
  activeJobs: z.number().int().nonnegative(),
  failedJobs: z.number().int().nonnegative(),
  failedOcrJobs: z.number().int().nonnegative(),
  aiProvidersAvailable: z.number().int().nonnegative(),
  aiProvidersTotal: z.number().int().nonnegative(),
  emailSyncErrors: z.array(DashboardEmailSyncErrorDtoSchema),
  tenantBreakdown: z.array(DashboardTenantBreakdownDtoSchema),
});
export type DashboardProcessingHealthDto = z.infer<
  typeof DashboardProcessingHealthDtoSchema
>;

export const DashboardSummaryDtoSchema = z.object({
  generatedAt: IsoDateTimeSchema,
  kpis: DashboardKpisDtoSchema,
  dateEntries: DashboardDateEntryBucketsDtoSchema,
  payments: DashboardPaymentBucketsDtoSchema,
  combinedEntries: z.array(DashboardCombinedEntryDtoSchema),
  inboxOverview: DashboardInboxOverviewDtoSchema,
  aiWorkers: DashboardAiWorkersDtoSchema,
  facts: DashboardFactsDtoSchema,
  upcomingEvents: z.array(DashboardUpcomingEventDtoSchema),
  actionItems: z.array(DashboardActionItemDtoSchema),
  recentCompleted: z.array(DashboardRecentCompletedItemDtoSchema).optional(),
  recentDocuments: z.array(DashboardRecentDocumentDtoSchema),
  processingHealth: DashboardProcessingHealthDtoSchema.nullable(),
});
export type DashboardSummaryDto = z.infer<typeof DashboardSummaryDtoSchema>;
