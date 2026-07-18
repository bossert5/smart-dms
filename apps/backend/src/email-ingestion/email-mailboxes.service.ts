import {
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import type { EmailMailbox, Prisma } from '@prisma/client';
import type {
  CreateEmailMailboxRequest,
  EmailConnectionTestResponse,
  EmailMailboxConnectionRequest,
  EmailMessagesRequest,
  EmailMessagesResponse,
  EmailRemoteFolderDto,
  EmailSyncResponse,
  UpdateEmailMailboxRequest,
} from '@smart-dms/shared-dto';
import { createHash } from 'node:crypto';
import type { Response } from 'express';
import { ImapFlow } from 'imapflow';
import { simpleParser, type Attachment, type ParsedMail } from 'mailparser';
import { AuditService } from '../audit/audit.service';
import { DocumentHistoryService } from '../document-history/document-history.service';
import { PrismaService } from '../prisma/prisma.service';
import { ProcessingJobsService } from '../processing/processing-jobs.service';
import { StorageService } from '../storage/storage.service';
import { TenantScopeService } from '../tenants/tenant-scope.service';
import { EmailCredentialService } from './email-credential.service';
import {
  emailSenderMatchesRules,
  normalizeSenderRule,
} from './email-sender-rules';
import {
  toEmailMailboxDto,
  toEmailMessageDto,
  type EmailMailboxWithRelations,
} from './email.mapper';

const SYNC_INTERVAL_MS = 5 * 60 * 1000;
const TEXT_PREVIEW_LENGTH = 1200;

interface SyncCounters {
  scannedMessages: number;
  importedAttachments: number;
  skippedMessages: number;
}

interface ParsedMessageInput {
  readonly mailbox: EmailMailbox;
  readonly folderPath: string;
  readonly uid: bigint;
  readonly uidValidity: bigint;
  readonly parsed: ParsedMail;
}

type MailboxConnection = Pick<
  EmailMailbox,
  'host' | 'port' | 'tls' | 'username' | 'encryptedPassword'
>;

@Injectable()
export class EmailMailboxesService {
  private readonly logger = new Logger(EmailMailboxesService.name);
  private syncAllRunning = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly credentials: EmailCredentialService,
    private readonly storage: StorageService,
    private readonly processingJobs: ProcessingJobsService,
    private readonly audit: AuditService,
    private readonly documentHistory: DocumentHistoryService,
    private readonly tenantScope: TenantScopeService,
  ) {}

  @Interval(SYNC_INTERVAL_MS)
  async syncActiveMailboxes(): Promise<void> {
    if (this.syncAllRunning) {
      return;
    }

    this.syncAllRunning = true;
    try {
      const mailboxes = await this.prisma.emailMailbox.findMany({
        where: { isActive: true },
      });

      for (const mailbox of mailboxes) {
        await this.syncMailbox(mailbox.id).catch((error) => {
          this.logger.warn(
            `Email sync failed for mailbox ${mailbox.id}: ${safeErrorMessage(error)}`,
          );
        });
      }
    } finally {
      this.syncAllRunning = false;
    }
  }

  async listMailboxes(tenantIds: readonly string[]) {
    const mailboxes = await this.prisma.emailMailbox.findMany({
      where: { tenantId: { in: [...tenantIds] } },
      include: mailboxRelations,
      orderBy: [{ name: 'asc' }, { createdAt: 'asc' }],
    });

    return mailboxes.map((mailbox) =>
      toEmailMailboxDto(mailbox as EmailMailboxWithRelations),
    );
  }

  async createMailbox(input: CreateEmailMailboxRequest) {
    await this.tenantScope.assertActiveTenantExists(input.tenantId);
    const mailbox = await this.prisma.$transaction(async (tx) => {
      const created = await tx.emailMailbox.create({
        data: {
          tenantId: input.tenantId,
          name: input.name,
          host: input.host,
          port: input.port,
          username: input.username,
          encryptedPassword: this.credentials.encrypt(input.password),
          tls: input.tls,
          importMode: input.importMode,
          isActive: input.isActive,
        },
      });
      await replaceFolderSelections(tx, created.id, input.selectedFolders);
      await replaceSenderRules(tx, created.id, input.senderRules);

      return tx.emailMailbox.findUniqueOrThrow({
        where: { id: created.id },
        include: mailboxRelations,
      });
    });

    await this.audit.record({
      action: 'EMAIL_MAILBOX_CREATED',
      entityType: 'EmailMailbox',
      entityId: mailbox.id,
      metadata: {
        tenantId: mailbox.tenantId,
        host: mailbox.host,
        username: mailbox.username,
      },
    });

    return toEmailMailboxDto(mailbox);
  }

  async updateMailbox(id: string, input: UpdateEmailMailboxRequest) {
    await this.assertMailboxExists(id);
    const mailbox = await this.prisma.$transaction(async (tx) => {
      await tx.emailMailbox.update({
        where: { id },
        data: {
          name: input.name,
          host: input.host,
          port: input.port,
          username: input.username,
          encryptedPassword: input.password
            ? this.credentials.encrypt(input.password)
            : undefined,
          tls: input.tls,
          importMode: input.importMode,
          isActive: input.isActive,
        },
      });

      if (input.selectedFolders) {
        await replaceFolderSelections(tx, id, input.selectedFolders);
      }
      if (input.senderRules) {
        await replaceSenderRules(tx, id, input.senderRules);
      }

      return tx.emailMailbox.findUniqueOrThrow({
        where: { id },
        include: mailboxRelations,
      });
    });

    await this.audit.record({
      action: 'EMAIL_MAILBOX_UPDATED',
      entityType: 'EmailMailbox',
      entityId: id,
    });

    return toEmailMailboxDto(mailbox);
  }

  async deleteMailbox(id: string): Promise<void> {
    await this.assertMailboxExists(id);
    await this.prisma.emailMailbox.delete({ where: { id } });
    await this.audit.record({
      action: 'EMAIL_MAILBOX_DELETED',
      entityType: 'EmailMailbox',
      entityId: id,
    });
  }

  async testConnection(id: string): Promise<EmailConnectionTestResponse> {
    const mailbox = await this.mailboxOrThrow(id);
    await this.testConnectionForMailbox(mailbox);

    return { success: true, message: 'IMAP connection successful.' };
  }

  async testConnectionInput(
    input: EmailMailboxConnectionRequest,
  ): Promise<EmailConnectionTestResponse> {
    const mailbox = await this.connectionFromInput(input);
    await this.testConnectionForMailbox(mailbox);

    return { success: true, message: 'IMAP connection successful.' };
  }

  async listFolders(id: string): Promise<EmailRemoteFolderDto[]> {
    const mailbox = await this.mailboxOrThrow(id);
    const selections = await this.prisma.emailFolderSelection.findMany({
      where: { mailboxId: id },
    });
    const selectedByPath = new Map(
      selections.map((selection) => [selection.folderPath, selection.selected]),
    );

    return this.listRemoteFolders(mailbox, selectedByPath);
  }

  async listFoldersFromConnectionInput(
    input: EmailMailboxConnectionRequest,
  ): Promise<EmailRemoteFolderDto[]> {
    const mailbox = await this.connectionFromInput(input);
    const selections = input.mailboxId
      ? await this.prisma.emailFolderSelection.findMany({
          where: { mailboxId: input.mailboxId },
        })
      : [];
    const selectedByPath = new Map(
      selections.map((selection) => [selection.folderPath, selection.selected]),
    );

    return this.listRemoteFolders(mailbox, selectedByPath);
  }

  private async listRemoteFolders(
    mailbox: MailboxConnection,
    selectedByPath: ReadonlyMap<string, boolean>,
  ): Promise<EmailRemoteFolderDto[]> {
    const folders = await this.withClient(mailbox, (client) => client.list());

    return folders
      .filter((folder) => !folder.flags?.has('\\Noselect'))
      .map((folder) => ({
        path: folder.path,
        name: folder.name || folder.path,
        delimiter: folder.delimiter ?? null,
        selected: selectedByPath.get(folder.path) ?? false,
      }))
      .sort((left, right) => left.path.localeCompare(right.path, 'de'));
  }

  async listMessages(
    mailboxId: string,
    request: EmailMessagesRequest,
    tenantIds: readonly string[],
  ): Promise<EmailMessagesResponse> {
    await this.assertMailboxExists(mailboxId, tenantIds);
    const where = {
      mailboxId,
      mailbox: { tenantId: { in: [...tenantIds] } },
      folderPath: request.folderPath,
    };
    const [items, totalItems] = await Promise.all([
      this.prisma.emailMessage.findMany({
        where,
        include: messageRelations,
        orderBy: [{ receivedAt: 'desc' }, { createdAt: 'desc' }],
        skip: (request.page - 1) * request.pageSize,
        take: request.pageSize,
      }),
      this.prisma.emailMessage.count({ where }),
    ]);

    return {
      items: items.map(toEmailMessageDto),
      meta: {
        page: request.page,
        pageSize: request.pageSize,
        totalItems,
        totalPages: Math.ceil(totalItems / request.pageSize),
      },
    };
  }

  async listAllMessages(
    request: EmailMessagesRequest,
    tenantIds: readonly string[],
  ): Promise<EmailMessagesResponse> {
    const where = {
      mailboxId: request.mailboxId,
      mailbox: { tenantId: { in: [...tenantIds] } },
      folderPath: request.folderPath,
    };
    const [items, totalItems] = await Promise.all([
      this.prisma.emailMessage.findMany({
        where,
        include: messageRelations,
        orderBy: [{ receivedAt: 'desc' }, { createdAt: 'desc' }],
        skip: (request.page - 1) * request.pageSize,
        take: request.pageSize,
      }),
      this.prisma.emailMessage.count({ where }),
    ]);

    return {
      items: items.map(toEmailMessageDto),
      meta: {
        page: request.page,
        pageSize: request.pageSize,
        totalItems,
        totalPages: Math.ceil(totalItems / request.pageSize),
      },
    };
  }

  async syncMailbox(mailboxId: string): Promise<EmailSyncResponse> {
    const mailbox = await this.mailboxOrThrow(mailboxId);
    const counters: SyncCounters = {
      scannedMessages: 0,
      importedAttachments: 0,
      skippedMessages: 0,
    };

    try {
      await this.withClient(mailbox, async (client) => {
        const folders = await this.prisma.emailFolderSelection.findMany({
          where: { mailboxId, selected: true },
          orderBy: { folderPath: 'asc' },
        });

        for (const folder of folders) {
          await this.syncFolder(mailbox, client, folder.folderPath, counters);
        }
      });

      await this.prisma.emailMailbox.update({
        where: { id: mailboxId },
        data: { lastSyncAt: new Date(), lastSyncError: null },
      });
    } catch (error) {
      const message = safeErrorMessage(error);
      await this.prisma.emailMailbox.update({
        where: { id: mailboxId },
        data: { lastSyncAt: new Date(), lastSyncError: message },
      });
      throw new ServiceUnavailableException('Email synchronization failed.');
    }

    return { mailboxId, ...counters };
  }

  async sendAttachmentPdf(
    messageId: string,
    attachmentId: string,
    tenantIds: readonly string[],
    response: Response,
  ): Promise<void> {
    const attachment = await this.prisma.emailAttachment.findFirst({
      where: { id: attachmentId, messageId },
      include: { document: true, message: { include: { mailbox: true } } },
    });
    if (
      !attachment ||
      attachment.mimeType !== 'application/pdf' ||
      !tenantIds.includes(attachment.message.mailbox.tenantId)
    ) {
      throw new NotFoundException('Email attachment not found.');
    }

    const relativePath = attachment.storagePath ?? attachment.document?.pdfPath;
    if (!relativePath) {
      throw new NotFoundException('PDF attachment file is not available.');
    }

    response.type('application/pdf');
    response.sendFile(this.storage.resolveRelativePath(relativePath));
  }

  private async syncFolder(
    mailbox: EmailMailbox,
    client: ImapFlow,
    folderPath: string,
    counters: SyncCounters,
  ): Promise<void> {
    const lock = await client.getMailboxLock(folderPath);
    try {
      const opened = await client.mailboxOpen(folderPath, { readOnly: true });
      const uidValidity = BigInt(String(opened.uidValidity ?? 0));
      const state = await this.prisma.emailFolderSelection.findUnique({
        where: {
          mailboxId_folderPath: {
            mailboxId: mailbox.id,
            folderPath,
          },
        },
      });
      const shouldResetUid = state && state.uidValidity !== uidValidity;
      const highestSeenUid = shouldResetUid
        ? 0n
        : (state?.highestSeenUid ?? 0n);
      let maxUid = highestSeenUid;
      const range = `${highestSeenUid + 1n}:*`;

      for await (const message of client.fetch(
        range,
        { uid: true, source: true },
        { uid: true },
      )) {
        const uid = BigInt(String(message.uid ?? 0));
        if (uid <= 0n) {
          continue;
        }
        maxUid = uid > maxUid ? uid : maxUid;
        if (!message.source) {
          continue;
        }
        const source = await sourceToBuffer(message.source);
        const parsed = await simpleParser(source);
        await this.recordParsedMessage(
          {
            mailbox,
            folderPath,
            uid,
            uidValidity,
            parsed,
          },
          counters,
        );
      }

      await this.prisma.emailFolderSelection.update({
        where: {
          mailboxId_folderPath: {
            mailboxId: mailbox.id,
            folderPath,
          },
        },
        data: {
          uidValidity,
          highestSeenUid: maxUid,
          lastSyncAt: new Date(),
        },
      });
    } finally {
      lock.release();
    }
  }

  private async recordParsedMessage(
    input: ParsedMessageInput,
    counters: SyncCounters,
  ): Promise<void> {
    counters.scannedMessages += 1;
    const from = input.parsed.from?.value[0];
    const fromAddress = from?.address?.toLowerCase() ?? null;
    const senderRules = await this.prisma.emailSenderRule.findMany({
      where: { mailboxId: input.mailbox.id },
      select: { normalizedPattern: true },
    });
    const senderAllowed = emailSenderMatchesRules(
      fromAddress,
      senderRules.map((rule) => rule.normalizedPattern),
    );
    const bodyText = normalizedBodyText(input.parsed);
    const skippedReason = senderAllowed
      ? input.mailbox.importMode === 'DISABLED'
        ? 'Import mode is disabled.'
        : null
      : 'Sender does not match configured rules.';

    const message = await this.prisma.emailMessage.upsert({
      where: {
        mailboxId_folderPath_uidValidity_uid: {
          mailboxId: input.mailbox.id,
          folderPath: input.folderPath,
          uidValidity: input.uidValidity,
          uid: input.uid,
        },
      },
      create: {
        mailboxId: input.mailbox.id,
        folderPath: input.folderPath,
        uidValidity: input.uidValidity,
        uid: input.uid,
        messageId: input.parsed.messageId ?? null,
        subject: input.parsed.subject ?? null,
        fromAddress,
        fromName: from?.name ?? null,
        sentAt: input.parsed.date ?? null,
        receivedAt: input.parsed.date ?? new Date(),
        textPreview: previewText(bodyText),
        bodyText,
        processedAt: null,
        skippedReason,
      },
      update: {
        messageId: input.parsed.messageId ?? null,
        subject: input.parsed.subject ?? null,
        fromAddress,
        fromName: from?.name ?? null,
        sentAt: input.parsed.date ?? null,
        receivedAt: input.parsed.date ?? undefined,
        textPreview: previewText(bodyText),
        bodyText,
        skippedReason,
      },
    });

    if (skippedReason) {
      counters.skippedMessages += 1;
      return;
    }

    for (const attachment of input.parsed.attachments) {
      if (!isPdfAttachment(attachment)) {
        continue;
      }
      const imported = await this.importPdfAttachment(
        input.mailbox,
        message.id,
        fromAddress,
        attachment,
      );
      if (imported) {
        counters.importedAttachments += 1;
      }
    }

    await this.prisma.emailMessage.update({
      where: { id: message.id },
      data: { processedAt: new Date() },
    });
  }

  private async importPdfAttachment(
    mailbox: EmailMailbox,
    messageId: string,
    fromAddress: string | null,
    attachment: Attachment,
  ): Promise<boolean> {
    const checksum = sha256(attachment.content);
    const existingInMessage = await this.prisma.emailAttachment.findFirst({
      where: {
        messageId,
        checksum,
        fileName: attachment.filename ?? 'attachment.pdf',
      },
    });
    if (existingInMessage) {
      return false;
    }

    const existingInMailbox = await this.prisma.emailAttachment.findFirst({
      where: {
        checksum,
        message: { mailboxId: mailbox.id },
        documentId: { not: null },
      },
      orderBy: { createdAt: 'asc' },
    });
    if (existingInMailbox) {
      await this.prisma.emailAttachment.create({
        data: {
          messageId,
          fileName: attachment.filename ?? existingInMailbox.fileName,
          mimeType: 'application/pdf',
          size: attachment.content.length,
          checksum,
          storagePath: existingInMailbox.storagePath,
          documentId: existingInMailbox.documentId,
        },
      });
      return false;
    }

    const fileName = attachment.filename || 'email-attachment.pdf';
    const document = await this.prisma.document.create({
      data: {
        tenantId: mailbox.tenantId,
        title: fileName.replace(/\.[^.]+$/, '') || fileName,
        originalFileName: fileName,
        source: 'EMAIL',
        mimeType: 'application/pdf',
        status: 'INGESTING',
        sender: fromAddress,
        recipient: mailbox.username,
        fileSize: attachment.content.length,
        autoAiAfterOcr: mailbox.importMode === 'OCR_AND_AI',
      },
    });
    const storedEmailAttachment = await this.storage.writeEmailAttachment(
      messageId,
      fileName,
      attachment.content,
    );
    const storedOriginal = await this.storage.copyStoredFileToOriginal(
      storedEmailAttachment.relativePath,
      document.id,
      fileName,
    );

    const pendingJob = await this.prisma.$transaction(async (tx) => {
      await tx.fileArtifact.create({
        data: {
          documentId: document.id,
          artifactType: 'ORIGINAL',
          path: storedOriginal.relativePath,
          mimeType: 'application/pdf',
          size: storedOriginal.size,
          checksum: storedOriginal.checksum,
        },
      });
      await tx.emailAttachment.create({
        data: {
          messageId,
          fileName,
          mimeType: 'application/pdf',
          size: storedEmailAttachment.size,
          checksum: storedEmailAttachment.checksum,
          storagePath: storedEmailAttachment.relativePath,
          documentId: document.id,
        },
      });
      await tx.document.update({
        where: { id: document.id },
        data: {
          status: 'OCR_PENDING',
          checksum: storedOriginal.checksum,
          fileSize: storedOriginal.size,
        },
      });
      await this.documentHistory.record(
        {
          documentId: document.id,
          type: 'EMAIL_ATTACHMENT_IMPORTED',
          summary: 'PDF attachment imported from email.',
          metadata: {
            tenantId: mailbox.tenantId,
            mailboxId: mailbox.id,
            messageId,
            originalFileName: fileName,
            importMode: mailbox.importMode,
          },
        },
        tx,
      );

      return this.processingJobs.createDocumentProcessingJob(
        document.id,
        'OCR_DOCUMENT',
      );
    });
    await this.processingJobs.enqueueCreatedDocumentProcessingJob(pendingJob);
    await this.audit.record({
      action: 'EMAIL_ATTACHMENT_IMPORTED',
      entityType: 'Document',
      entityId: document.id,
      metadata: {
        tenantId: mailbox.tenantId,
        mailboxId: mailbox.id,
        messageId,
        fileName,
        importMode: mailbox.importMode,
      },
    });

    return true;
  }

  private mailboxOrThrow(
    id: string,
    tenantIds?: readonly string[],
  ): Promise<EmailMailbox> {
    return this.prisma.emailMailbox
      .findUnique({ where: { id } })
      .then((mailbox) => {
        if (!mailbox || (tenantIds && !tenantIds.includes(mailbox.tenantId))) {
          throw new NotFoundException('Email mailbox not found.');
        }

        return mailbox;
      });
  }

  private async assertMailboxExists(
    id: string,
    tenantIds?: readonly string[],
  ): Promise<void> {
    await this.mailboxOrThrow(id, tenantIds);
  }

  private async withClient<T>(
    mailbox: MailboxConnection,
    fn: (client: ImapFlow) => Promise<T>,
  ): Promise<T> {
    const client = new ImapFlow({
      host: mailbox.host,
      port: mailbox.port,
      secure: mailbox.tls,
      auth: {
        user: mailbox.username,
        pass: this.credentials.decrypt(mailbox.encryptedPassword),
      },
      logger: false,
    });
    await client.connect();
    try {
      return await fn(client);
    } finally {
      await client.logout().catch(() => undefined);
    }
  }

  private async testConnectionForMailbox(
    mailbox: MailboxConnection,
  ): Promise<void> {
    await this.withClient(mailbox, async (client) => {
      await client.list();
    });
  }

  private async connectionFromInput(
    input: EmailMailboxConnectionRequest,
  ): Promise<MailboxConnection> {
    const storedMailbox = input.mailboxId
      ? await this.mailboxOrThrow(input.mailboxId)
      : null;

    return {
      host: input.host,
      port: input.port,
      tls: input.tls,
      username: input.username,
      encryptedPassword: input.password
        ? this.credentials.encrypt(input.password)
        : (storedMailbox?.encryptedPassword ?? ''),
    };
  }
}

const mailboxRelations = {
  tenant: true,
  folders: { orderBy: { folderPath: 'asc' } },
  senderRules: { orderBy: { pattern: 'asc' } },
} as const;

const messageRelations = {
  mailbox: { include: { tenant: true } },
  attachments: {
    include: { document: { select: { status: true } } },
    orderBy: { createdAt: 'asc' },
  },
} as const;

async function replaceFolderSelections(
  tx: PrismaTransaction,
  mailboxId: string,
  folderPaths: readonly string[],
): Promise<void> {
  const selectedFolders = [
    ...new Set(folderPaths.map((path) => path.trim()).filter(Boolean)),
  ];
  await tx.emailFolderSelection.updateMany({
    where: { mailboxId },
    data: { selected: false },
  });

  for (const folderPath of selectedFolders) {
    await tx.emailFolderSelection.upsert({
      where: { mailboxId_folderPath: { mailboxId, folderPath } },
      create: { mailboxId, folderPath, selected: true },
      update: { selected: true },
    });
  }
}

async function replaceSenderRules(
  tx: PrismaTransaction,
  mailboxId: string,
  patterns: readonly string[],
): Promise<void> {
  const uniquePatterns = [...new Set(patterns.map(normalizeSenderRule))];
  await tx.emailSenderRule.deleteMany({ where: { mailboxId } });
  if (uniquePatterns.length === 0) {
    return;
  }

  await tx.emailSenderRule.createMany({
    data: uniquePatterns.map((normalizedPattern) => ({
      mailboxId,
      pattern: normalizedPattern,
      normalizedPattern,
    })),
    skipDuplicates: true,
  });
}

type PrismaTransaction = Prisma.TransactionClient;

function normalizedBodyText(parsed: ParsedMail): string | null {
  const text = parsed.text?.trim() || htmlToPlainText(parsed.html);
  return text || null;
}

function htmlToPlainText(html: ParsedMail['html']): string | null {
  if (typeof html !== 'string') {
    return null;
  }

  const text = html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return text || null;
}

function previewText(text: string | null): string | null {
  return text ? text.slice(0, TEXT_PREVIEW_LENGTH) : null;
}

function isPdfAttachment(attachment: Attachment): boolean {
  return (
    attachment.contentType === 'application/pdf' ||
    attachment.filename?.toLowerCase().endsWith('.pdf') === true
  );
}

async function sourceToBuffer(
  source: Buffer | Uint8Array | NodeJS.ReadableStream,
): Promise<Buffer> {
  if (Buffer.isBuffer(source)) {
    return source;
  }
  if (source instanceof Uint8Array) {
    return Buffer.from(source);
  }

  const chunks: Buffer[] = [];
  for await (const chunk of source) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }

  return Buffer.concat(chunks);
}

function sha256(content: Buffer): string {
  return createHash('sha256').update(content).digest('hex');
}

function safeErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
