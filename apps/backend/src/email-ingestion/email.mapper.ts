import type {
  EmailAttachment,
  EmailFolderSelection,
  EmailMailbox,
  EmailMessage,
  EmailSenderRule,
  Document,
  Tenant,
} from '@prisma/client';
import type {
  EmailAttachmentDto,
  EmailFolderSelectionDto,
  EmailMailboxDto,
  EmailMessageDto,
  EmailSenderRuleDto,
} from '@smart-dms/shared-dto';
import { API_ROUTE_PREFIX } from '../common/api-prefix';
import { toIsoDateTime } from '../common/date-mapper';
import { toTenantSummaryDto } from '../tenants/tenant.mapper';

export type EmailMailboxWithRelations = EmailMailbox & {
  tenant: Pick<Tenant, 'id' | 'key' | 'name' | 'isActive'>;
  folders: EmailFolderSelection[];
  senderRules: EmailSenderRule[];
};

export type EmailMessageWithAttachments = EmailMessage & {
  mailbox: Pick<EmailMailbox, 'name'> & {
    tenant: Pick<Tenant, 'id' | 'key' | 'name' | 'isActive'>;
  };
  attachments: Array<
    EmailAttachment & { document: Pick<Document, 'status'> | null }
  >;
};

type EmailAttachmentWithDocument = EmailAttachment & {
  document: Pick<Document, 'status'> | null;
};

export function toEmailMailboxDto(
  mailbox: EmailMailboxWithRelations,
): EmailMailboxDto {
  return {
    id: mailbox.id,
    tenant: toTenantSummaryDto(mailbox.tenant),
    name: mailbox.name,
    host: mailbox.host,
    port: mailbox.port,
    username: mailbox.username,
    tls: mailbox.tls,
    importMode: mailbox.importMode,
    isActive: mailbox.isActive,
    lastSyncAt: toIsoDateTime(mailbox.lastSyncAt),
    lastSyncError: mailbox.lastSyncError,
    createdAt: toIsoDateTime(mailbox.createdAt),
    updatedAt: toIsoDateTime(mailbox.updatedAt),
    folders: mailbox.folders.map(toEmailFolderSelectionDto),
    senderRules: mailbox.senderRules.map(toEmailSenderRuleDto),
  };
}

export function toEmailFolderSelectionDto(
  folder: EmailFolderSelection,
): EmailFolderSelectionDto {
  return {
    id: folder.id,
    folderPath: folder.folderPath,
    selected: folder.selected,
    uidValidity: folder.uidValidity.toString(),
    highestSeenUid: folder.highestSeenUid.toString(),
    lastSyncAt: toIsoDateTime(folder.lastSyncAt),
    createdAt: toIsoDateTime(folder.createdAt),
    updatedAt: toIsoDateTime(folder.updatedAt),
  };
}

export function toEmailSenderRuleDto(
  rule: EmailSenderRule,
): EmailSenderRuleDto {
  return {
    id: rule.id,
    pattern: rule.pattern,
    createdAt: toIsoDateTime(rule.createdAt),
  };
}

export function toEmailMessageDto(
  message: EmailMessageWithAttachments,
): EmailMessageDto {
  return {
    id: message.id,
    tenant: toTenantSummaryDto(message.mailbox.tenant),
    mailboxId: message.mailboxId,
    mailboxName: message.mailbox.name,
    folderPath: message.folderPath,
    uid: message.uid.toString(),
    uidValidity: message.uidValidity.toString(),
    messageId: message.messageId,
    subject: message.subject,
    fromAddress: message.fromAddress,
    fromName: message.fromName,
    sentAt: toIsoDateTime(message.sentAt),
    receivedAt: toIsoDateTime(message.receivedAt),
    textPreview: message.textPreview,
    bodyText: message.bodyText,
    processedAt: toIsoDateTime(message.processedAt),
    skippedReason: message.skippedReason,
    createdAt: toIsoDateTime(message.createdAt),
    updatedAt: toIsoDateTime(message.updatedAt),
    attachments: message.attachments.map(toEmailAttachmentDto),
  };
}

export function toEmailAttachmentDto(
  attachment: EmailAttachmentWithDocument,
): EmailAttachmentDto {
  const isPdf = attachment.mimeType === 'application/pdf';

  return {
    id: attachment.id,
    fileName: attachment.fileName,
    mimeType: attachment.mimeType,
    size: attachment.size,
    checksum: attachment.checksum,
    documentId: attachment.documentId,
    documentStatus: attachment.document?.status ?? null,
    pdfUrl: isPdf
      ? `${API_ROUTE_PREFIX}/email-mailboxes/messages/${attachment.messageId}/attachments/${attachment.id}/pdf`
      : null,
    createdAt: toIsoDateTime(attachment.createdAt),
  };
}
