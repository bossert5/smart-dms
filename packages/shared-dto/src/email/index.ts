import { z } from "zod";
import {
  IsoDateTimeSchema,
  PaginationMetaSchema,
  PaginationRequestSchema,
  UuidSchema,
} from "../common";
import { DocumentStatusSchema } from "../documents";
import { TenantSummaryDtoSchema } from "../tenants";

export const EmailImportModeSchema = z.enum([
  "DISABLED",
  "OCR_ONLY",
  "OCR_AND_AI",
]);
export type EmailImportMode = z.infer<typeof EmailImportModeSchema>;

export const EmailSenderRuleDtoSchema = z.object({
  id: UuidSchema,
  pattern: z.string().min(1),
  createdAt: IsoDateTimeSchema,
});
export type EmailSenderRuleDto = z.infer<typeof EmailSenderRuleDtoSchema>;

export const EmailFolderSelectionDtoSchema = z.object({
  id: UuidSchema,
  folderPath: z.string().min(1),
  selected: z.boolean(),
  uidValidity: z.string().nullable(),
  highestSeenUid: z.string().nullable(),
  lastSyncAt: IsoDateTimeSchema.nullable(),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});
export type EmailFolderSelectionDto = z.infer<
  typeof EmailFolderSelectionDtoSchema
>;

export const EmailMailboxDtoSchema = z.object({
  id: UuidSchema,
  tenant: TenantSummaryDtoSchema,
  name: z.string().min(1),
  host: z.string().min(1),
  port: z.number().int().positive(),
  username: z.string().min(1),
  tls: z.boolean(),
  importMode: EmailImportModeSchema,
  isActive: z.boolean(),
  lastSyncAt: IsoDateTimeSchema.nullable(),
  lastSyncError: z.string().nullable(),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
  folders: z.array(EmailFolderSelectionDtoSchema),
  senderRules: z.array(EmailSenderRuleDtoSchema),
});
export type EmailMailboxDto = z.infer<typeof EmailMailboxDtoSchema>;

export const EmailRemoteFolderDtoSchema = z.object({
  path: z.string().min(1),
  name: z.string().min(1),
  delimiter: z.string().nullable(),
  selected: z.boolean(),
});
export type EmailRemoteFolderDto = z.infer<typeof EmailRemoteFolderDtoSchema>;

export const EmailAttachmentDtoSchema = z.object({
  id: UuidSchema,
  fileName: z.string().min(1),
  mimeType: z.string().min(1),
  size: z.number().int().nonnegative(),
  checksum: z.string().nullable(),
  documentId: UuidSchema.nullable(),
  documentStatus: DocumentStatusSchema.nullable(),
  pdfUrl: z.string().nullable(),
  createdAt: IsoDateTimeSchema,
});
export type EmailAttachmentDto = z.infer<typeof EmailAttachmentDtoSchema>;

export const EmailMessageDtoSchema = z.object({
  id: UuidSchema,
  tenant: TenantSummaryDtoSchema,
  mailboxId: UuidSchema,
  mailboxName: z.string().min(1),
  folderPath: z.string().min(1),
  uid: z.string(),
  uidValidity: z.string(),
  messageId: z.string().nullable(),
  subject: z.string().nullable(),
  fromAddress: z.string().nullable(),
  fromName: z.string().nullable(),
  sentAt: IsoDateTimeSchema.nullable(),
  receivedAt: IsoDateTimeSchema.nullable(),
  textPreview: z.string().nullable(),
  bodyText: z.string().nullable(),
  processedAt: IsoDateTimeSchema.nullable(),
  skippedReason: z.string().nullable(),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
  attachments: z.array(EmailAttachmentDtoSchema),
});
export type EmailMessageDto = z.infer<typeof EmailMessageDtoSchema>;

const SenderRulePatternSchema = z
  .string()
  .trim()
  .min(1)
  .max(320)
  .regex(
    /^(\*@[\w.-]+\.[A-Za-z]{2,}|[^\s@]+@[\w.-]+\.[A-Za-z]{2,})$/,
    "Use an email address or a domain wildcard like *@example.com.",
  );

export const CreateEmailMailboxRequestSchema = z.object({
  tenantId: UuidSchema,
  name: z.string().trim().min(1).max(200),
  host: z.string().trim().min(1).max(255),
  port: z.number().int().min(1).max(65535).default(993),
  username: z.string().trim().min(1).max(320),
  password: z.string().min(1).max(2000),
  tls: z.boolean().default(true),
  importMode: EmailImportModeSchema.default("OCR_ONLY"),
  isActive: z.boolean().default(true),
  selectedFolders: z.array(z.string().trim().min(1).max(500)).default([]),
  senderRules: z.array(SenderRulePatternSchema).max(200).default([]),
});
export type CreateEmailMailboxRequest = z.infer<
  typeof CreateEmailMailboxRequestSchema
>;

export const UpdateEmailMailboxRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    host: z.string().trim().min(1).max(255).optional(),
    port: z.number().int().min(1).max(65535).optional(),
    username: z.string().trim().min(1).max(320).optional(),
    password: z.string().min(1).max(2000).optional(),
    tls: z.boolean().optional(),
    importMode: EmailImportModeSchema.optional(),
    isActive: z.boolean().optional(),
    selectedFolders: z.array(z.string().trim().min(1).max(500)).optional(),
    senderRules: z.array(SenderRulePatternSchema).max(200).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided.",
  });
export type UpdateEmailMailboxRequest = z.infer<
  typeof UpdateEmailMailboxRequestSchema
>;

export const EmailMailboxConnectionRequestSchema = z
  .object({
    mailboxId: UuidSchema.optional(),
    host: z.string().trim().min(1).max(255),
    port: z.number().int().min(1).max(65535).default(993),
    username: z.string().trim().min(1).max(320),
    password: z.string().min(1).max(2000).optional(),
    tls: z.boolean().default(true),
  })
  .refine((value) => value.mailboxId || value.password, {
    message: "A password is required for unsaved email mailbox connections.",
    path: ["password"],
  });
export type EmailMailboxConnectionRequest = z.infer<
  typeof EmailMailboxConnectionRequestSchema
>;

export const EmailMessagesRequestSchema = PaginationRequestSchema.extend({
  tenantId: UuidSchema.optional(),
  mailboxId: UuidSchema.optional(),
  folderPath: z.string().trim().min(1).optional(),
});
export type EmailMessagesRequest = z.infer<typeof EmailMessagesRequestSchema>;

export const EmailMessagesResponseSchema = z.object({
  items: z.array(EmailMessageDtoSchema),
  meta: PaginationMetaSchema,
});
export type EmailMessagesResponse = z.infer<typeof EmailMessagesResponseSchema>;

export const EmailSyncResponseSchema = z.object({
  mailboxId: UuidSchema,
  scannedMessages: z.number().int().nonnegative(),
  importedAttachments: z.number().int().nonnegative(),
  skippedMessages: z.number().int().nonnegative(),
});
export type EmailSyncResponse = z.infer<typeof EmailSyncResponseSchema>;

export const EmailConnectionTestResponseSchema = z.object({
  success: z.boolean(),
  message: z.string().min(1),
});
export type EmailConnectionTestResponse = z.infer<
  typeof EmailConnectionTestResponseSchema
>;
