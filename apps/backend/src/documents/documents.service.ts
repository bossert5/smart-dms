import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  AcceptInboxDocumentsResponse,
  AiMetadataPromptScope,
  DocumentEntrySource,
  DocumentAttributeInput,
  DocumentCalendarEventInput,
  DeleteDocumentResponse,
  DocumentHistoryChangeDto,
  DocumentHistoryResponse,
  DocumentMetadataUpdateRequest,
  MoveDocumentToTenantRequest,
  MoveDocumentToTenantResponse,
  DocumentPaymentStatus,
  DocumentSearchFacetsResponse,
  DocumentSearchField,
  DocumentSearchRequest,
  DocumentSearchResponse,
  DocumentSearchSortBy,
  DocumentTaskUpdateRequest,
  MoveDocumentToInboxResponse,
  PaginationRequest,
  ReprocessDocumentRequest,
  ReprocessDocumentResponse,
  TriggerBulkAiProcessingResponse,
  TriggerDocumentAiProcessingResponse,
  UpdateDocumentTagsRequest,
} from '@smart-dms/shared-dto';
import { Prisma } from '@prisma/client';
import { AiProcessingService } from '../ai/ai-processing.service';
import { AuditService } from '../audit/audit.service';
import type { AuthenticatedUser } from '../common/authenticated-user';
import { parseIsoDate } from '../common/date-mapper';
import { DocumentHistoryService } from '../document-history/document-history.service';
import { PrismaService } from '../prisma/prisma.service';
import { ProcessingJobsService } from '../processing/processing-jobs.service';
import { RealtimeEventsService } from '../realtime/realtime-events.service';
import { RealtimeNotificationsService } from '../realtime/realtime-notifications.service';
import { SettingsService } from '../settings/settings.service';
import { StorageService } from '../storage/storage.service';
import {
  documentDisplayTitle,
  toDocumentDetailDto,
  type DocumentFieldDefinitionWithScopes,
  type DocumentWithSummaryRelations,
  toDocumentSummaryDto,
  toDocumentTypeDto,
  toTagDto,
} from './document.mapper';

interface DocumentSearchIdRow {
  id: string;
}

interface DocumentSearchCountRow {
  count: number | bigint | string;
}

interface SenderFacetRow {
  sender: string;
}

interface MetadataHistorySnapshot {
  title: string | null;
  documentTypeId: string | null;
  documentDate: Date | null;
  summary: string | null;
  sender: string | null;
  recipient: string | null;
  note: string | null;
  payments: Array<{
    id: string;
    iban: string | null;
    recipient: string | null;
    purpose: string | null;
    amount: Prisma.Decimal | null;
    currency: string | null;
    status: DocumentPaymentStatus;
    paidAt: Date | null;
    source: DocumentEntrySource;
    calendarEvents?: Array<{
      id: string;
      kind: string;
      date: Date;
      completedAt: Date | null;
    }>;
  }>;
  references: Array<{
    id: string;
    referenceNumber: string;
    referenceType: string;
    source: DocumentEntrySource;
  }>;
  calendarEvents?: Array<{
    id: string;
    kind: DocumentCalendarEventInput['kind'];
    title: string;
    description: string | null;
    date: Date;
    time: string | null;
    endDate: Date | null;
    endTime: string | null;
    source: DocumentEntrySource;
    sourceText: string | null;
    paymentId?: string | null;
  }>;
  attributes: Array<{
    key: string;
    value: string;
  }>;
}

interface TagHistorySnapshot {
  tags: Array<{
    source: DocumentEntrySource;
    tag: {
      name: string;
    };
  }>;
}

interface NormalizedPaymentInput {
  readonly id?: string;
  readonly iban: string | null;
  readonly recipient: string | null;
  readonly purpose: string | null;
  readonly amount: number | null;
  readonly currency: string;
  readonly status: DocumentPaymentStatus;
  readonly paidAt: Date | null;
  readonly dueDate?: string | null;
  readonly dueDateSourceText: string | null;
}

interface PaymentValueInput {
  readonly iban: string | null;
  readonly recipient: string | null;
  readonly purpose: string | null;
  readonly amount: Prisma.Decimal | number | null;
  readonly currency: string | null;
  readonly status?: DocumentPaymentStatus;
  readonly paidAt?: Date | null;
  readonly dueDate?: string | null;
  readonly calendarEvents?: Array<{
    readonly id: string;
    readonly kind: string;
    readonly date: Date;
    readonly completedAt: Date | null;
  }>;
}

interface NormalizedReferenceInput {
  readonly id?: string;
  readonly referenceNumber: string;
  readonly referenceType: string;
}

interface NormalizedCalendarEventInput {
  readonly id?: string;
  readonly kind: DocumentCalendarEventInput['kind'];
  readonly title: string;
  readonly description: string | null;
  readonly date: string;
  readonly time: string | null;
  readonly endDate: string | null;
  readonly endTime: string | null;
  readonly sourceText: string | null;
}

interface MetadataContainsSearchToken {
  readonly value: string;
  readonly pattern: string;
}

const METADATA_CONTAINS_MIN_TOKEN_LENGTH = 3;
const SQL_LIKE_ESCAPE = '\\';
type DocumentSearchScope = 'accepted' | 'inbox';

@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly processingJobs: ProcessingJobsService,
    private readonly audit: AuditService,
    private readonly realtimeEvents: RealtimeEventsService,
    private readonly notifications: RealtimeNotificationsService,
    private readonly documentHistory: DocumentHistoryService,
    private readonly aiProcessing: AiProcessingService,
    private readonly settings: SettingsService,
  ) {}

  async search(
    request: DocumentSearchRequest,
    tenantIds: readonly string[],
  ): Promise<DocumentSearchResponse> {
    return this.searchInScope(request, 'accepted', tenantIds);
  }

  async searchInbox(
    request: DocumentSearchRequest,
    tenantIds: readonly string[],
  ): Promise<DocumentSearchResponse> {
    return this.searchInScope(request, 'inbox', tenantIds);
  }

  private async searchInScope(
    request: DocumentSearchRequest,
    scope: DocumentSearchScope,
    tenantIds: readonly string[],
  ): Promise<DocumentSearchResponse> {
    const page = request.page;
    const pageSize = request.pageSize;
    const { ids, totalItems } = await this.searchDocumentIds(
      request,
      scope,
      tenantIds,
    );
    const items = ids.length
      ? await this.prisma.document.findMany({
          where: { id: { in: ids } },
          select: {
            id: true,
            tenantId: true,
            title: true,
            titleSource: true,
            documentTypeId: true,
            documentTypeSource: true,
            originalFileName: true,
            source: true,
            mimeType: true,
            status: true,
            createdAt: true,
            updatedAt: true,
            acceptedAt: true,
            acceptedById: true,
            aiProcessedAt: true,
            thumbnailPath: true,
            documentDate: true,
            documentDateSource: true,
            summary: true,
            sender: true,
            senderSource: true,
            recipient: true,
            note: true,
            fileSize: true,
            pageCount: true,
            aiDeferredByEditLock: true,
            tenant: {
              select: { id: true, key: true, name: true, isActive: true },
            },
            documentType: true,
            tags: { include: { tag: true } },
            calendarEvents: { select: { kind: true } },
          },
        })
      : [];
    const order = new Map(ids.map((id, index) => [id, index]));
    items.sort(
      (left, right) =>
        (order.get(left.id) ?? Number.MAX_SAFE_INTEGER) -
        (order.get(right.id) ?? Number.MAX_SAFE_INTEGER),
    );

    return {
      items: items.map((document) =>
        toDocumentSummaryDto(
          document as DocumentWithSummaryRelations,
          this.storage,
        ),
      ),
      meta: {
        page,
        pageSize,
        totalItems,
        totalPages: Math.ceil(totalItems / pageSize),
      },
    };
  }

  async searchFacets(
    tenantIds: readonly string[],
  ): Promise<DocumentSearchFacetsResponse> {
    const [tags, senderRows, documentTypes] = await Promise.all([
      this.prisma.tag.findMany({
        where: { tenantId: { in: [...tenantIds] } },
        orderBy: { name: 'asc' },
      }),
      this.prisma.$queryRaw<SenderFacetRow[]>(Prisma.sql`
        SELECT DISTINCT trim("sender") AS sender
        FROM "Document"
        WHERE "sender" IS NOT NULL
        AND trim("sender") <> ''
        AND "tenantId" IN (${this.uuidListSql(tenantIds)})
        ORDER BY sender ASC
      `),
      this.prisma.documentType.findMany({
        where: { active: true },
        orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
      }),
    ]);

    return {
      tags: tags.map(toTagDto),
      senders: senderRows.map((row) => row.sender),
      documentTypes: documentTypes.map(toDocumentTypeDto),
    };
  }

  private async searchDocumentIds(
    request: DocumentSearchRequest,
    scope: DocumentSearchScope,
    tenantIds: readonly string[],
  ): Promise<{ ids: string[]; totalItems: number }> {
    const searchQuery = request.query?.trim();
    const hasSearchQuery = Boolean(searchQuery);
    const baseConditions = this.buildSqlConditions(request, scope, tenantIds);
    const offset = (request.page - 1) * request.pageSize;
    const orderBy = this.buildSqlOrderBy(request, hasSearchQuery);

    if (searchQuery) {
      const metadataContainsTokens =
        this.metadataContainsSearchTokens(searchQuery);
      const where = this.combineSqlConditions([
        ...baseConditions,
        this.searchMatchSql(request.searchFields, metadataContainsTokens),
      ]);
      const [rows, countRows] = await Promise.all([
        this.prisma.$queryRaw<DocumentSearchIdRow[]>(Prisma.sql`
          WITH q AS (
            SELECT websearch_to_tsquery('simple', ${searchQuery}) AS query
          )
          SELECT
            d.id::text AS id,
            ${this.searchRankSql(request.searchFields, metadataContainsTokens)} AS relevance
          FROM "Document" d
          CROSS JOIN q
          WHERE ${where}
          ORDER BY ${orderBy}
          LIMIT ${request.pageSize}
          OFFSET ${offset}
        `),
        this.prisma.$queryRaw<DocumentSearchCountRow[]>(Prisma.sql`
          WITH q AS (
            SELECT websearch_to_tsquery('simple', ${searchQuery}) AS query
          )
          SELECT COUNT(*)::int AS count
          FROM "Document" d
          CROSS JOIN q
          WHERE ${where}
        `),
      ]);

      return {
        ids: rows.map((row) => row.id),
        totalItems: this.countFromRows(countRows),
      };
    }

    const where = this.combineSqlConditions(baseConditions);
    const [rows, countRows] = await Promise.all([
      this.prisma.$queryRaw<DocumentSearchIdRow[]>(Prisma.sql`
        SELECT d.id::text AS id
        FROM "Document" d
        WHERE ${where}
        ORDER BY ${orderBy}
        LIMIT ${request.pageSize}
        OFFSET ${offset}
      `),
      this.prisma.$queryRaw<DocumentSearchCountRow[]>(Prisma.sql`
        SELECT COUNT(*)::int AS count
        FROM "Document" d
        WHERE ${where}
      `),
    ]);

    return {
      ids: rows.map((row) => row.id),
      totalItems: this.countFromRows(countRows),
    };
  }

  async getDetail(id: string, tenantIds: readonly string[]) {
    const document = await this.prisma.document.findFirst({
      where: { id, tenantId: { in: [...tenantIds] } },
      include: {
        tenant: true,
        documentType: true,
        tags: { include: { tag: true } },
        attributes: {
          include: { fieldDefinition: true },
          orderBy: { key: 'asc' },
        },
        payments: {
          include: {
            assignedTo: {
              select: { id: true, username: true, displayName: true },
            },
            calendarEvents: {
              where: { kind: 'DUE_DATE' },
              orderBy: [{ date: 'asc' }, { time: 'asc' }, { createdAt: 'asc' }],
              take: 1,
            },
          },
          orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
        },
        references: {
          orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
        },
        artifacts: { orderBy: { createdAt: 'asc' } },
        calendarEvents: {
          include: {
            assignedTo: {
              select: { id: true, username: true, displayName: true },
            },
          },
          orderBy: [{ date: 'asc' }, { time: 'asc' }, { title: 'asc' }],
        },
      },
    });

    if (!document) {
      throw new NotFoundException('Document not found.');
    }

    const fieldDefinitions = await this.fieldDefinitionsForDocument(
      document.documentTypeId,
    );
    const documentTypes = await this.activeDocumentTypes();

    return toDocumentDetailDto(
      document,
      this.storage,
      fieldDefinitions,
      documentTypes,
    );
  }

  history(
    id: string,
    request: PaginationRequest,
    tenantIds: readonly string[],
  ): Promise<DocumentHistoryResponse> {
    return this.assertDocumentInTenantScope(id, tenantIds).then(() =>
      this.documentHistory.listForDocument(id, request),
    );
  }

  async updateMetadata(
    id: string,
    input: DocumentMetadataUpdateRequest,
    user: AuthenticatedUser,
    tenantIds: readonly string[],
  ) {
    const before = await this.prisma.document.findFirst({
      where: { id, tenantId: { in: [...tenantIds] } },
      select: {
        title: true,
        titleSource: true,
        documentTypeId: true,
        documentTypeSource: true,
        documentDate: true,
        documentDateSource: true,
        summary: true,
        sender: true,
        senderSource: true,
        acceptedAt: true,
        recipient: true,
        note: true,
        status: true,
        tenantId: true,
        payments: {
          select: {
            id: true,
            iban: true,
            recipient: true,
            purpose: true,
            amount: true,
            currency: true,
            status: true,
            paidAt: true,
            source: true,
            calendarEvents: {
              where: { kind: 'DUE_DATE' },
              select: {
                id: true,
                kind: true,
                date: true,
                completedAt: true,
              },
              orderBy: [{ date: 'asc' }, { time: 'asc' }, { createdAt: 'asc' }],
              take: 1,
            },
          },
          orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
        },
        references: {
          select: {
            id: true,
            referenceNumber: true,
            referenceType: true,
            source: true,
          },
          orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
        },
        calendarEvents: {
          where: { paymentId: null },
          select: {
            id: true,
            kind: true,
            title: true,
            description: true,
            date: true,
            time: true,
            endDate: true,
            endTime: true,
            source: true,
            sourceText: true,
            paymentId: true,
          },
          orderBy: [{ date: 'asc' }, { time: 'asc' }, { title: 'asc' }],
        },
        attributes: {
          select: {
            key: true,
            value: true,
          },
          orderBy: { key: 'asc' },
        },
      },
    });

    if (!before) {
      throw new NotFoundException('Document not found.');
    }
    this.aiProcessing.assertDocumentIsNotAiRunning(before.status);

    const document = await this.prisma.$transaction(async (tx) => {
      await tx.document.update({
        where: { id },
        data: {
          ...this.coreMetadataUpdateData(input, before),
          summary: input.summary,
          recipient: input.recipient,
          note: input.note,
        },
      });

      if (input.payments) {
        const payments = this.normalizedPaymentInputs(input.payments);
        const existingPaymentsById = new Map(
          before.payments.map((payment) => [payment.id, payment]),
        );
        const retainedPaymentIds = payments
          .map((payment) => payment.id)
          .filter(
            (paymentId): paymentId is string =>
              typeof paymentId === 'string' &&
              existingPaymentsById.has(paymentId),
          );

        await tx.documentPayment.deleteMany({
          where: {
            documentId: id,
            ...(retainedPaymentIds.length
              ? { id: { notIn: retainedPaymentIds } }
              : {}),
          },
        });
        for (const [index, payment] of payments.entries()) {
          const existingPayment = payment.id
            ? existingPaymentsById.get(payment.id)
            : undefined;
          const source =
            existingPayment && this.samePayment(existingPayment, payment)
              ? existingPayment.source
              : 'MANUAL';
          const data = {
            iban: payment.iban,
            recipient: payment.recipient,
            purpose: payment.purpose,
            amount: payment.amount,
            currency: payment.currency,
            status: payment.status,
            paidAt: payment.paidAt,
            source,
            displayOrder: index,
          };

          let persistedPaymentId: string;
          if (existingPayment) {
            const updatedPayment = await tx.documentPayment.update({
              where: { id: existingPayment.id },
              data,
              select: { id: true },
            });
            persistedPaymentId = updatedPayment.id;
          } else {
            const createdPayment = await tx.documentPayment.create({
              data: {
                documentId: id,
                ...data,
              },
              select: { id: true },
            });
            persistedPaymentId = createdPayment.id;
          }
          if (payment.dueDate !== undefined) {
            await this.syncPaymentDueDateEvent(
              tx,
              id,
              persistedPaymentId,
              payment,
              source,
            );
          }
        }
      }

      if (input.references) {
        const references = this.normalizedReferenceInputs(input.references);
        const existingReferencesById = new Map(
          before.references.map((reference) => [reference.id, reference]),
        );
        const retainedReferenceIds = references
          .map((reference) => reference.id)
          .filter(
            (referenceId): referenceId is string =>
              typeof referenceId === 'string' &&
              existingReferencesById.has(referenceId),
          );

        await tx.documentReference.deleteMany({
          where: {
            documentId: id,
            ...(retainedReferenceIds.length
              ? { id: { notIn: retainedReferenceIds } }
              : {}),
          },
        });
        for (const [index, reference] of references.entries()) {
          const existingReference = reference.id
            ? existingReferencesById.get(reference.id)
            : undefined;
          const source =
            existingReference &&
            this.sameReference(existingReference, reference)
              ? existingReference.source
              : 'MANUAL';
          const data = {
            referenceNumber: reference.referenceNumber,
            referenceType: reference.referenceType,
            source,
            displayOrder: index,
          };

          if (existingReference) {
            await tx.documentReference.update({
              where: { id: existingReference.id },
              data,
            });
          } else {
            await tx.documentReference.create({
              data: {
                documentId: id,
                ...data,
              },
            });
          }
        }
      }

      if (input.calendarEvents) {
        const calendarEvents = this.normalizedCalendarEventInputs(
          input.calendarEvents,
        );
        const existingEventsById = new Map(
          before.calendarEvents.map((event) => [event.id, event]),
        );
        const retainedEventIds = calendarEvents
          .map((event) => event.id)
          .filter(
            (eventId): eventId is string =>
              typeof eventId === 'string' && existingEventsById.has(eventId),
          );

        await tx.documentCalendarEvent.deleteMany({
          where: {
            documentId: id,
            paymentId: null,
            ...(retainedEventIds.length
              ? { id: { notIn: retainedEventIds } }
              : {}),
          },
        });
        for (const event of calendarEvents) {
          const existingEvent = event.id
            ? existingEventsById.get(event.id)
            : undefined;
          const source =
            existingEvent && this.sameCalendarEvent(existingEvent, event)
              ? existingEvent.source
              : 'MANUAL';
          const data = {
            kind: event.kind,
            title: event.title,
            description: event.description,
            date: parseIsoDate(event.date),
            time: event.time,
            endDate: event.endDate ? parseIsoDate(event.endDate) : null,
            endTime: event.endTime,
            source,
            sourceText: event.sourceText,
          };

          if (existingEvent) {
            await tx.documentCalendarEvent.update({
              where: { id: existingEvent.id },
              data,
            });
          } else {
            await tx.documentCalendarEvent.create({
              data: {
                documentId: id,
                ...data,
              },
            });
          }
        }
      }

      if (input.attributes) {
        const updatedDocumentTypeId =
          input.documentTypeId !== undefined
            ? input.documentTypeId
            : before.documentTypeId;
        const attributes = await this.validatedAttributes(
          input.attributes,
          updatedDocumentTypeId,
          tx,
        );
        await tx.documentAttribute.deleteMany({ where: { documentId: id } });
        if (attributes.length > 0) {
          await tx.documentAttribute.createMany({
            data: attributes.map((attribute) => ({
              documentId: id,
              fieldDefinitionId: attribute.fieldDefinitionId,
              key: attribute.key,
              value: String(attribute.value),
              valueType: attribute.valueType,
            })),
          });
        }
      }

      const updatedDocument = await tx.document.findUniqueOrThrow({
        where: { id },
        include: {
          tenant: true,
          documentType: true,
          tags: { include: { tag: true } },
          attributes: {
            include: { fieldDefinition: true },
            orderBy: { key: 'asc' },
          },
          payments: {
            include: {
              assignedTo: {
                select: { id: true, username: true, displayName: true },
              },
              calendarEvents: {
                where: { kind: 'DUE_DATE' },
                orderBy: [
                  { date: 'asc' },
                  { time: 'asc' },
                  { createdAt: 'asc' },
                ],
                take: 1,
              },
            },
            orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
          },
          references: {
            orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
          },
          artifacts: { orderBy: { createdAt: 'asc' } },
          calendarEvents: {
            include: {
              assignedTo: {
                select: { id: true, username: true, displayName: true },
              },
            },
            orderBy: [{ date: 'asc' }, { time: 'asc' }, { title: 'asc' }],
          },
        },
      });
      const changes = this.metadataChanges(before, updatedDocument);
      if (changes.length > 0) {
        await this.documentHistory.record(
          {
            documentId: id,
            actorUserId: user.id,
            type: 'DOCUMENT_METADATA_UPDATED',
            summary: 'Metadata changed.',
            changes,
          },
          tx,
        );
      }

      return updatedDocument;
    });

    await this.audit.record({
      actorUserId: user.id,
      action: 'DOCUMENT_METADATA_UPDATED',
      entityType: 'Document',
      entityId: id,
    });
    const fieldDefinitions = await this.fieldDefinitionsForDocument(
      document.documentTypeId,
    );
    const documentTypes = await this.activeDocumentTypes();

    return toDocumentDetailDto(
      document,
      this.storage,
      fieldDefinitions,
      documentTypes,
    );
  }

  async updatePaymentTask(
    id: string,
    paymentId: string,
    input: DocumentTaskUpdateRequest,
    user: AuthenticatedUser,
    tenantIds: readonly string[],
  ) {
    const document = await this.prisma.document.findFirst({
      where: { id, tenantId: { in: [...tenantIds] } },
      select: {
        id: true,
        tenantId: true,
        status: true,
        payments: {
          where: { id: paymentId },
          select: { id: true },
        },
      },
    });

    if (!document || document.payments.length === 0) {
      throw new NotFoundException('Payment not found.');
    }
    this.aiProcessing.assertDocumentIsNotAiRunning(document.status);

    const taskUpdatedAt = new Date();
    await this.prisma.$transaction(async (tx) => {
      const assignedToId =
        input.assignedToId === undefined
          ? undefined
          : await this.validatedAssigneeId(
              tx,
              document.tenantId,
              input.assignedToId,
            );
      await tx.documentPayment.update({
        where: { id: paymentId },
        data: this.paymentTaskUpdateData(
          input,
          assignedToId,
          taskUpdatedAt,
          user.id,
        ),
      });

      const linkedDueDateUpdate = await tx.documentCalendarEvent.updateMany({
        where: {
          documentId: id,
          paymentId,
          kind: 'DUE_DATE',
        },
        data: this.calendarEventTaskUpdateData(
          input,
          assignedToId,
          taskUpdatedAt,
          user.id,
        ),
      });

      if (input.completed && linkedDueDateUpdate.count === 0) {
        const dueDate = await this.fallbackUnlinkedPaymentDueDate(tx, id);
        if (dueDate) {
          await tx.documentCalendarEvent.update({
            where: { id: dueDate.id },
            data: { completedAt: taskUpdatedAt, completedById: user.id },
          });
        }
      }
    });

    await this.audit.record({
      actorUserId: user.id,
      action: 'DOCUMENT_TASK_UPDATED',
      entityType: 'DocumentPayment',
      entityId: paymentId,
    });
    await this.realtimeEvents.documentChanged({
      documentId: id,
      tenantId: document.tenantId,
      status: document.status,
      reason: 'DOCUMENT_TASK_UPDATED',
    });

    return this.getDetail(id, tenantIds);
  }

  async updateCalendarEventTask(
    id: string,
    eventId: string,
    input: DocumentTaskUpdateRequest,
    user: AuthenticatedUser,
    tenantIds: readonly string[],
  ) {
    const event = await this.prisma.documentCalendarEvent.findFirst({
      where: {
        id: eventId,
        documentId: id,
        document: { tenantId: { in: [...tenantIds] } },
      },
      select: {
        id: true,
        kind: true,
        paymentId: true,
        document: {
          select: {
            id: true,
            tenantId: true,
            status: true,
          },
        },
      },
    });

    if (!event) {
      throw new NotFoundException('Calendar event not found.');
    }
    this.aiProcessing.assertDocumentIsNotAiRunning(event.document.status);
    if (event.kind === 'APPOINTMENT' && input.completed !== undefined) {
      throw new BadRequestException('Appointments cannot be marked completed.');
    }

    const taskUpdatedAt = new Date();
    await this.prisma.$transaction(async (tx) => {
      const assignedToId =
        input.assignedToId === undefined
          ? undefined
          : await this.validatedAssigneeId(
              tx,
              event.document.tenantId,
              input.assignedToId,
            );
      const calendarEventData = this.calendarEventTaskUpdateData(
        input,
        assignedToId,
        taskUpdatedAt,
        user.id,
      );

      if (event.kind === 'DUE_DATE' && event.paymentId) {
        await tx.documentCalendarEvent.updateMany({
          where: {
            documentId: id,
            paymentId: event.paymentId,
            kind: 'DUE_DATE',
          },
          data: calendarEventData,
        });
        await tx.documentPayment.updateMany({
          where: {
            id: event.paymentId,
            status: { not: 'IGNORED' },
          },
          data: this.paymentTaskUpdateData(
            input,
            assignedToId,
            taskUpdatedAt,
            user.id,
          ),
        });
      } else {
        await tx.documentCalendarEvent.update({
          where: { id: eventId },
          data: calendarEventData,
        });
      }
    });

    await this.audit.record({
      actorUserId: user.id,
      action: 'DOCUMENT_TASK_UPDATED',
      entityType: 'DocumentCalendarEvent',
      entityId: eventId,
    });
    await this.realtimeEvents.documentChanged({
      documentId: id,
      tenantId: event.document.tenantId,
      status: event.document.status,
      reason: 'DOCUMENT_TASK_UPDATED',
    });

    return this.getDetail(id, tenantIds);
  }

  async updateTags(
    id: string,
    input: UpdateDocumentTagsRequest,
    user: AuthenticatedUser,
    tenantIds: readonly string[],
  ) {
    const before = await this.prisma.document.findFirst({
      where: { id, tenantId: { in: [...tenantIds] } },
      select: {
        status: true,
        tenantId: true,
        tags: {
          include: { tag: true },
        },
      },
    });

    if (!before) {
      throw new NotFoundException('Document not found.');
    }
    this.aiProcessing.assertDocumentIsNotAiRunning(before.status);

    const normalizedTags = [
      ...new Set(input.tags.map((tag) => tag.trim()).filter(Boolean)),
    ];
    const previousTags = this.sortedTagNames(before);
    const previousTagSourcesByName = new Map(
      before.tags.map((entry) => [entry.tag.name, entry.source]),
    );

    const document = await this.prisma.$transaction(async (tx) => {
      await tx.documentTag.deleteMany({ where: { documentId: id } });

      for (const tagName of normalizedTags) {
        const tag = await tx.tag.upsert({
          where: {
            tenantId_name: {
              tenantId: before.tenantId,
              name: tagName,
            },
          },
          create: {
            tenantId: before.tenantId,
            name: tagName,
            createdBy: user.id,
          },
          update: {},
        });
        await tx.documentTag.create({
          data: {
            documentId: id,
            tagId: tag.id,
            source: previousTagSourcesByName.get(tagName) ?? 'MANUAL',
          },
        });
      }

      const updatedDocument = await tx.document.findUniqueOrThrow({
        where: { id },
        include: {
          tenant: true,
          documentType: true,
          tags: { include: { tag: true } },
          attributes: {
            include: { fieldDefinition: true },
            orderBy: { key: 'asc' },
          },
          payments: {
            include: {
              calendarEvents: {
                where: { kind: 'DUE_DATE' },
                orderBy: [
                  { date: 'asc' },
                  { time: 'asc' },
                  { createdAt: 'asc' },
                ],
                take: 1,
              },
            },
            orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
          },
          references: {
            orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
          },
          artifacts: { orderBy: { createdAt: 'asc' } },
          calendarEvents: {
            orderBy: [{ date: 'asc' }, { time: 'asc' }, { title: 'asc' }],
          },
        },
      });
      const nextTags = this.sortedTagNames(updatedDocument);
      if (!this.sameValues(previousTags, nextTags)) {
        await this.documentHistory.record(
          {
            documentId: id,
            actorUserId: user.id,
            type: 'DOCUMENT_TAGS_UPDATED',
            summary: 'Tags changed.',
            changes: [
              {
                field: 'tags',
                label: 'Tags',
                oldValue: previousTags,
                newValue: nextTags,
              },
            ],
          },
          tx,
        );
      }

      return updatedDocument;
    });

    await this.audit.record({
      actorUserId: user.id,
      action: 'DOCUMENT_TAGS_UPDATED',
      entityType: 'Document',
      entityId: id,
      metadata: { tags: normalizedTags },
    });
    const fieldDefinitions = await this.fieldDefinitionsForDocument(
      document.documentTypeId,
    );
    const documentTypes = await this.activeDocumentTypes();

    return toDocumentDetailDto(
      document,
      this.storage,
      fieldDefinitions,
      documentTypes,
    );
  }

  async acceptInboxDocument(
    id: string,
    user: AuthenticatedUser,
    tenantIds: readonly string[],
  ): Promise<AcceptInboxDocumentsResponse> {
    const response = await this.acceptInboxDocuments([id], user, tenantIds);
    if (response.acceptedCount === 0) {
      throw new NotFoundException('Inbox document not found.');
    }
    return response;
  }

  async acceptInboxDocuments(
    documentIds: readonly string[],
    user: AuthenticatedUser,
    tenantIds: readonly string[],
  ): Promise<AcceptInboxDocumentsResponse> {
    const uniqueDocumentIds = [...new Set(documentIds)];
    if (uniqueDocumentIds.length === 0) {
      throw new BadRequestException('At least one document id is required.');
    }
    const settings = await this.settings.getSettings();
    const documents = await this.prisma.document.findMany({
      where: {
        id: { in: uniqueDocumentIds },
        tenantId: { in: [...tenantIds] },
        acceptedAt: null,
        status: { not: 'ARCHIVED' },
      },
      include: {
        tenant: true,
        documentType: true,
        tags: { include: { tag: true } },
        calendarEvents: { select: { kind: true } },
      },
    });

    if (documents.length !== uniqueDocumentIds.length) {
      throw new BadRequestException(
        'All selected documents must be pending inbox documents.',
      );
    }

    const blockedDocument = documents.find(
      (document) =>
        !this.canAcceptDocument(
          document,
          settings.documentsRequireAiMetadataBeforeAcceptance,
        ),
    );
    if (blockedDocument) {
      throw new BadRequestException(
        `Document ${blockedDocument.id} cannot be accepted in status ${blockedDocument.status}.`,
      );
    }

    const acceptedAt = new Date();
    const acceptedDocuments = await this.prisma.$transaction(async (tx) => {
      await tx.document.updateMany({
        where: {
          id: { in: uniqueDocumentIds },
          tenantId: { in: [...tenantIds] },
          acceptedAt: null,
        },
        data: {
          acceptedAt,
          acceptedById: user.id,
        },
      });

      for (const document of documents) {
        await this.documentHistory.record(
          {
            documentId: document.id,
            actorUserId: user.id,
            type: 'DOCUMENT_ACCEPTED',
            summary: 'Document accepted.',
            metadata: {
              status: document.status,
              acceptedAt: acceptedAt.toISOString(),
            },
          },
          tx,
        );
      }

      return tx.document.findMany({
        where: { id: { in: uniqueDocumentIds } },
        include: {
          tenant: true,
          documentType: true,
          tags: { include: { tag: true } },
          calendarEvents: { select: { kind: true } },
        },
      });
    });

    const acceptedDocumentById = new Map(
      acceptedDocuments.map((document) => [document.id, document]),
    );
    const orderedAcceptedDocuments = uniqueDocumentIds
      .map((id) => acceptedDocumentById.get(id))
      .filter((document): document is (typeof acceptedDocuments)[number] =>
        Boolean(document),
      );

    await Promise.all(
      orderedAcceptedDocuments.flatMap((document) => [
        this.audit.record({
          actorUserId: user.id,
          action: 'DOCUMENT_ACCEPTED',
          entityType: 'Document',
          entityId: document.id,
        }),
        this.notifications.publish({
          type: 'document.accepted',
          severity: 'success',
          documentId: document.id,
          documentTitle: documentDisplayTitle(document),
          tenantId: document.tenantId,
          status: document.status,
        }),
        this.realtimeEvents.documentChanged({
          documentId: document.id,
          tenantId: document.tenantId,
          status: document.status,
          reason: 'DOCUMENT_ACCEPTED',
        }),
      ]),
    );

    return {
      acceptedCount: orderedAcceptedDocuments.length,
      documents: orderedAcceptedDocuments.map((document) =>
        toDocumentSummaryDto(
          document as DocumentWithSummaryRelations,
          this.storage,
        ),
      ),
    };
  }

  async archive(
    id: string,
    user: AuthenticatedUser,
    tenantIds: readonly string[],
  ) {
    const before = await this.prisma.document.findFirst({
      where: { id, tenantId: { in: [...tenantIds] } },
      select: { status: true, tenantId: true },
    });
    if (!before) {
      throw new NotFoundException('Document not found.');
    }
    this.aiProcessing.assertDocumentIsNotAiRunning(before.status);

    const document = await this.prisma.$transaction(async (tx) => {
      const updatedDocument = await tx.document.update({
        where: { id },
        data: { status: 'ARCHIVED' },
        include: {
          tenant: true,
          documentType: true,
          tags: { include: { tag: true } },
          calendarEvents: { select: { kind: true } },
        },
      });
      await this.documentHistory.record(
        {
          documentId: id,
          actorUserId: user.id,
          type: 'DOCUMENT_ARCHIVED',
          summary: 'Document archived.',
          changes: [
            {
              field: 'status',
              label: 'Status',
              oldValue: null,
              newValue: 'ARCHIVED',
            },
          ],
        },
        tx,
      );
      return updatedDocument;
    });

    await this.audit.record({
      actorUserId: user.id,
      action: 'DOCUMENT_ARCHIVED',
      entityType: 'Document',
      entityId: id,
    });
    await this.notifications.publish({
      type: 'document.archived',
      severity: 'warning',
      documentId: document.id,
      documentTitle: documentDisplayTitle(document),
      tenantId: document.tenantId,
      status: document.status,
    });
    await this.realtimeEvents.documentChanged({
      documentId: document.id,
      tenantId: document.tenantId,
      status: document.status,
      reason: 'DOCUMENT_ARCHIVED',
    });

    return toDocumentSummaryDto(document, this.storage);
  }

  async moveToInbox(
    id: string,
    user: AuthenticatedUser,
    tenantIds: readonly string[],
  ): Promise<MoveDocumentToInboxResponse> {
    const before = await this.prisma.document.findFirst({
      where: { id, tenantId: { in: [...tenantIds] } },
      select: {
        id: true,
        status: true,
        tenantId: true,
        title: true,
        originalFileName: true,
        acceptedAt: true,
        acceptedById: true,
      },
    });
    if (!before) {
      throw new NotFoundException('Document not found.');
    }
    this.aiProcessing.assertDocumentIsNotAiRunning(before.status);
    if (before.status === 'ARCHIVED') {
      throw new BadRequestException(
        'Archived documents cannot be moved to inbox.',
      );
    }
    if (before.acceptedAt === null) {
      throw new BadRequestException('Document is already in inbox.');
    }
    const previousAcceptedAt = before.acceptedAt;

    const document = await this.prisma.$transaction(async (tx) => {
      const updatedDocument = await tx.document.update({
        where: { id },
        data: {
          acceptedAt: null,
          acceptedById: null,
        },
        include: {
          tenant: true,
          documentType: true,
          tags: { include: { tag: true } },
          calendarEvents: { select: { kind: true } },
        },
      });
      await this.documentHistory.record(
        {
          documentId: id,
          actorUserId: user.id,
          type: 'DOCUMENT_MOVED_TO_INBOX',
          summary: 'Document moved to the inbox.',
          changes: [
            {
              field: 'acceptedAt',
              label: 'Accepted at',
              oldValue: previousAcceptedAt.toISOString(),
              newValue: null,
            },
          ],
          metadata: {
            status: before.status,
            acceptedById: before.acceptedById,
          },
        },
        tx,
      );
      return updatedDocument;
    });

    await this.audit.record({
      actorUserId: user.id,
      action: 'DOCUMENT_MOVED_TO_INBOX',
      entityType: 'Document',
      entityId: id,
    });
    await this.notifications.publish({
      type: 'document.moved_to_inbox',
      severity: 'info',
      documentId: document.id,
      documentTitle: documentDisplayTitle(document),
      tenantId: document.tenantId,
      status: document.status,
    });
    await this.realtimeEvents.documentChanged({
      documentId: document.id,
      tenantId: document.tenantId,
      status: document.status,
      reason: 'DOCUMENT_MOVED_TO_INBOX',
    });

    return {
      document: toDocumentSummaryDto(document, this.storage),
    };
  }

  async moveToTenant(
    id: string,
    input: MoveDocumentToTenantRequest,
    user: AuthenticatedUser,
    tenantIds: readonly string[],
  ): Promise<MoveDocumentToTenantResponse> {
    const before = await this.prisma.document.findFirst({
      where: { id, tenantId: { in: [...tenantIds] } },
      select: {
        id: true,
        status: true,
        tenantId: true,
        title: true,
        originalFileName: true,
        acceptedAt: true,
        tags: {
          select: {
            source: true,
            tag: { select: { name: true } },
          },
        },
        payments: {
          select: { id: true, assignedToId: true },
        },
        calendarEvents: {
          select: { id: true, assignedToId: true },
        },
      },
    });
    if (!before) {
      throw new NotFoundException('Document not found.');
    }
    this.aiProcessing.assertDocumentIsNotAiRunning(before.status);
    if (before.status === 'ARCHIVED') {
      throw new BadRequestException(
        'Archived documents cannot be moved to another tenant.',
      );
    }
    if (before.acceptedAt !== null) {
      throw new BadRequestException('Only inbox documents can be moved.');
    }
    if (before.tenantId === input.targetTenantId) {
      throw new BadRequestException(
        'Target tenant must differ from the current tenant.',
      );
    }

    const activeTenants = await this.prisma.tenant.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
    });
    if (activeTenants.length < 2) {
      throw new BadRequestException(
        'At least two active tenants are required to move documents.',
      );
    }
    const sourceTenant = activeTenants.find(
      (tenant) => tenant.id === before.tenantId,
    );
    const targetTenant = activeTenants.find(
      (tenant) => tenant.id === input.targetTenantId,
    );
    if (!targetTenant) {
      throw new BadRequestException('Target tenant must be active.');
    }

    const document = await this.prisma.$transaction(async (tx) => {
      const validAssigneeIds = await this.validAssigneeIdsForTenant(
        tx,
        input.targetTenantId,
        [
          ...before.payments.map((payment) => payment.assignedToId),
          ...before.calendarEvents.map((event) => event.assignedToId),
        ],
      );
      const invalidPaymentIds = before.payments
        .filter(
          (payment) =>
            payment.assignedToId && !validAssigneeIds.has(payment.assignedToId),
        )
        .map((payment) => payment.id);
      const invalidCalendarEventIds = before.calendarEvents
        .filter(
          (event) =>
            event.assignedToId && !validAssigneeIds.has(event.assignedToId),
        )
        .map((event) => event.id);

      if (invalidPaymentIds.length > 0) {
        await tx.documentPayment.updateMany({
          where: { id: { in: invalidPaymentIds } },
          data: { assignedToId: null, assignedAt: null },
        });
      }
      if (invalidCalendarEventIds.length > 0) {
        await tx.documentCalendarEvent.updateMany({
          where: { id: { in: invalidCalendarEventIds } },
          data: { assignedToId: null, assignedAt: null },
        });
      }

      await tx.documentTag.deleteMany({ where: { documentId: id } });
      for (const entry of before.tags) {
        const tag = await tx.tag.upsert({
          where: {
            tenantId_name: {
              tenantId: input.targetTenantId,
              name: entry.tag.name,
            },
          },
          create: {
            tenantId: input.targetTenantId,
            name: entry.tag.name,
            createdBy: user.id,
          },
          update: {},
        });
        await tx.documentTag.create({
          data: {
            documentId: id,
            tagId: tag.id,
            source: entry.source,
          },
        });
      }

      const updatedDocument = await tx.document.update({
        where: { id },
        data: { tenantId: input.targetTenantId },
        include: {
          tenant: true,
          documentType: true,
          tags: { include: { tag: true } },
          calendarEvents: { select: { kind: true } },
        },
      });
      await this.documentHistory.record(
        {
          documentId: id,
          actorUserId: user.id,
          type: 'DOCUMENT_MOVED_TO_TENANT',
          summary: 'Document moved to another tenant.',
          changes: [
            {
              field: 'tenant',
              label: 'Tenant',
              oldValue: sourceTenant?.name ?? before.tenantId,
              newValue: targetTenant.name,
            },
          ],
          metadata: {
            status: before.status,
            sourceTenantId: before.tenantId,
            targetTenantId: input.targetTenantId,
          },
        },
        tx,
      );

      return updatedDocument;
    });

    await this.audit.record({
      actorUserId: user.id,
      action: 'DOCUMENT_MOVED_TO_TENANT',
      entityType: 'Document',
      entityId: id,
      metadata: {
        sourceTenantId: before.tenantId,
        targetTenantId: input.targetTenantId,
      },
    });
    await this.notifications.publish({
      type: 'document.moved_to_tenant',
      severity: 'info',
      documentId: document.id,
      documentTitle: documentDisplayTitle(document),
      targetTenantName: targetTenant.name,
      tenantId: document.tenantId,
      status: document.status,
    });
    await Promise.all([
      this.realtimeEvents.documentChanged({
        documentId: document.id,
        tenantId: before.tenantId,
        status: document.status,
        reason: 'DOCUMENT_MOVED_TO_TENANT',
      }),
      this.realtimeEvents.documentChanged({
        documentId: document.id,
        tenantId: document.tenantId,
        status: document.status,
        reason: 'DOCUMENT_MOVED_TO_TENANT',
      }),
    ]);

    return {
      document: toDocumentSummaryDto(document, this.storage),
    };
  }

  async delete(
    id: string,
    user: AuthenticatedUser,
    tenantIds: readonly string[],
  ): Promise<DeleteDocumentResponse> {
    const document = await this.prisma.document.findFirst({
      where: { id, tenantId: { in: [...tenantIds] } },
      select: {
        id: true,
        tenantId: true,
        title: true,
        originalFileName: true,
        status: true,
        pdfPath: true,
        thumbnailPath: true,
        artifacts: {
          select: {
            path: true,
          },
        },
      },
    });
    if (!document) {
      throw new NotFoundException('Document not found.');
    }
    this.aiProcessing.assertDocumentIsNotAiRunning(document.status);

    await Promise.all(
      this.documentStoragePaths(document).map((path) =>
        this.storage.deleteStoredFile(path),
      ),
    );
    await this.storage.deleteDocumentTemporaryFiles(id);
    await this.prisma.document.delete({ where: { id } });

    await this.audit.record({
      actorUserId: user.id,
      action: 'DOCUMENT_DELETED',
      entityType: 'Document',
      entityId: id,
    });
    await this.notifications.publish({
      type: 'document.deleted',
      severity: 'warning',
      documentId: document.id,
      documentTitle: documentDisplayTitle(document),
      tenantId: document.tenantId,
      status: document.status,
    });
    await this.realtimeEvents.documentChanged({
      documentId: document.id,
      tenantId: document.tenantId,
      status: document.status,
      reason: 'DOCUMENT_DELETED',
    });

    return { deleted: true, documentId: id };
  }

  async reprocess(
    id: string,
    user: AuthenticatedUser,
    tenantIds: readonly string[],
    input: ReprocessDocumentRequest = { action: 'OCR' },
  ): Promise<ReprocessDocumentResponse> {
    const before = await this.prisma.document.findFirst({
      where: { id, tenantId: { in: [...tenantIds] } },
      select: {
        id: true,
        status: true,
        tenantId: true,
        mimeType: true,
        acceptedAt: true,
      },
    });
    if (!before) {
      throw new NotFoundException('Document not found.');
    }
    this.aiProcessing.assertDocumentIsNotAiRunning(before.status);
    if (before.acceptedAt !== null || before.status === 'ARCHIVED') {
      throw new BadRequestException(
        'Only pending inbox documents can be reprocessed.',
      );
    }
    if (
      input.action === 'ROTATE_180' &&
      before.mimeType !== 'application/pdf'
    ) {
      throw new BadRequestException('Only PDF documents can be rotated.');
    }
    const processingOptions =
      input.action === 'ROTATE_180'
        ? ({ rotationDegrees: 180, forceOcr: true } as const)
        : undefined;

    const document = await this.prisma.document.update({
      where: { id },
      data: {
        status: 'OCR_PENDING',
        failedReason: null,
        aiProcessedAt: null,
      },
      select: {
        id: true,
        tenantId: true,
        title: true,
        originalFileName: true,
        status: true,
      },
    });
    const job = await this.processingJobs.enqueueDocumentProcessing(
      id,
      'OCR_DOCUMENT',
      processingOptions,
    );
    const reprocessMetadata: Record<string, unknown> = {
      jobId: job.id,
      jobType: 'OCR_DOCUMENT',
      action: input.action,
    };
    if (processingOptions) {
      reprocessMetadata.processingOptions = processingOptions;
    }
    await this.documentHistory.record({
      documentId: id,
      actorUserId: user.id,
      type: 'DOCUMENT_REPROCESS_REQUESTED',
      summary: 'Reprocessing requested.',
      changes: [
        {
          field: 'status',
          label: 'Status',
          oldValue: before.status,
          newValue: document.status,
        },
      ],
      metadata: reprocessMetadata,
    });
    const queuedMetadata: Record<string, unknown> = {
      ...reprocessMetadata,
      status: document.status,
    };
    await this.documentHistory.record({
      documentId: id,
      actorUserId: user.id,
      type: 'DOCUMENT_PROCESSING_QUEUED',
      summary: 'Document queued for OCR processing.',
      metadata: queuedMetadata,
    });

    await this.audit.record({
      actorUserId: user.id,
      action: 'DOCUMENT_REPROCESS_REQUESTED',
      entityType: 'Document',
      entityId: id,
      metadata: reprocessMetadata,
    });
    await this.notifications.publish({
      type: 'document.reprocess_queued',
      severity: 'info',
      documentId: document.id,
      documentTitle: documentDisplayTitle(document),
      tenantId: document.tenantId,
      jobId: job.id,
      status: document.status,
    });
    await this.realtimeEvents.documentChanged({
      documentId: document.id,
      tenantId: document.tenantId,
      jobId: job.id,
      status: document.status,
      reason: 'DOCUMENT_REPROCESS_REQUESTED',
    });

    return {
      documentId: id,
      jobId: job.id,
      status: 'OCR_PENDING',
    };
  }

  triggerAiExtraction(
    id: string,
    user: AuthenticatedUser,
    tenantIds: readonly string[],
  ): Promise<TriggerDocumentAiProcessingResponse> {
    return this.assertDocumentInTenantScope(id, tenantIds).then(() =>
      this.aiProcessing.triggerDocumentAiExtraction(id, user.id),
    );
  }

  triggerScopedAiExtraction(
    id: string,
    scope: AiMetadataPromptScope,
    user: AuthenticatedUser,
    tenantIds: readonly string[],
  ): Promise<TriggerDocumentAiProcessingResponse> {
    return this.assertDocumentInTenantScope(id, tenantIds).then(() =>
      this.aiProcessing.triggerDocumentAiExtraction(id, user.id, [scope]),
    );
  }

  triggerBulkAiExtraction(
    user: AuthenticatedUser,
    tenantIds: readonly string[],
  ): Promise<TriggerBulkAiProcessingResponse> {
    return this.aiProcessing.triggerBulkAiExtraction(user.id, tenantIds);
  }

  async getArtifactForDownload(
    id: string,
    type: 'pdf' | 'thumbnail',
    tenantIds: readonly string[],
  ): Promise<{ path: string; mimeType: string; fileName: string }> {
    const document = await this.prisma.document.findFirst({
      where: { id, tenantId: { in: [...tenantIds] } },
    });
    if (!document) {
      throw new NotFoundException('Document not found.');
    }

    const relativePath =
      type === 'pdf' ? document.pdfPath : document.thumbnailPath;
    if (!relativePath) {
      throw new NotFoundException('Document artifact not available.');
    }

    return {
      path: this.storage.resolveRelativePath(relativePath),
      mimeType: type === 'pdf' ? 'application/pdf' : 'image/jpeg',
      fileName:
        type === 'pdf'
          ? `${document.title || document.originalFileName}.pdf`
          : `${document.title || document.originalFileName}.jpg`,
    };
  }

  private async fieldDefinitionsForDocument(
    documentTypeId: string | null,
  ): Promise<DocumentFieldDefinitionWithScopes[]> {
    return this.prisma.documentFieldDefinition.findMany({
      where: {
        active: true,
        OR: [
          { appliesToAllDocumentTypes: true },
          documentTypeId
            ? { documentTypes: { some: { documentTypeId } } }
            : { id: { in: [] } },
        ],
      },
      include: { documentTypes: true },
      orderBy: [{ displayOrder: 'asc' }, { label: 'asc' }],
    });
  }

  private async assertDocumentInTenantScope(
    id: string,
    tenantIds: readonly string[],
  ): Promise<void> {
    const document = await this.prisma.document.findFirst({
      where: { id, tenantId: { in: [...tenantIds] } },
      select: { id: true },
    });

    if (!document) {
      throw new NotFoundException('Document not found.');
    }
  }

  private activeDocumentTypes() {
    return this.prisma.documentType.findMany({
      where: { active: true },
      orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
    });
  }

  private async validatedAttributes(
    input: DocumentAttributeInput[],
    documentTypeId: string | null,
    tx: Prisma.TransactionClient,
  ): Promise<
    Array<
      DocumentAttributeInput & {
        fieldDefinitionId: string | null;
      }
    >
  > {
    const keys = input.map((attribute) => attribute.key);
    const definitions = keys.length
      ? await tx.documentFieldDefinition.findMany({
          where: { key: { in: keys } },
          include: { documentTypes: true },
        })
      : [];
    const definitionsByKey = new Map(
      definitions.map((definition) => [definition.key, definition]),
    );
    const inputByKey = new Map(
      input.map((attribute) => [attribute.key, attribute]),
    );

    for (const definition of definitions) {
      if (!definition.active) {
        throw new BadRequestException(
          `Field definition '${definition.key}' is inactive.`,
        );
      }

      if (!this.definitionAppliesToDocumentType(definition, documentTypeId)) {
        throw new BadRequestException(
          `Field definition '${definition.key}' does not apply to this document type.`,
        );
      }
    }

    const requiredDefinitions = await tx.documentFieldDefinition.findMany({
      where: {
        active: true,
        required: true,
        OR: [
          { appliesToAllDocumentTypes: true },
          documentTypeId
            ? { documentTypes: { some: { documentTypeId } } }
            : { id: { in: [] } },
        ],
      },
      include: { documentTypes: true },
    });

    for (const definition of requiredDefinitions) {
      const value = inputByKey.get(definition.key)?.value;
      if (value === undefined || String(value).trim() === '') {
        throw new BadRequestException(
          `Required field '${definition.label}' is missing.`,
        );
      }
    }

    return input
      .filter((attribute) => String(attribute.value).trim() !== '')
      .map((attribute) => {
        const definition = definitionsByKey.get(attribute.key);
        return {
          ...attribute,
          valueType: definition?.valueType ?? attribute.valueType,
          fieldDefinitionId:
            definition?.id ?? attribute.fieldDefinitionId ?? null,
        };
      });
  }

  private async validatedAssigneeId(
    repository: Pick<PrismaService | Prisma.TransactionClient, 'user'>,
    tenantId: string,
    assignedToId: string | null,
  ): Promise<string | null> {
    if (assignedToId === null) {
      return null;
    }

    const assignee = await repository.user.findFirst({
      where: {
        id: assignedToId,
        isActive: true,
        tenantMemberships: {
          some: { tenantId },
        },
      },
      select: { id: true },
    });

    if (!assignee) {
      throw new ConflictException(
        'Assigned user is not active in this tenant.',
      );
    }

    return assignee.id;
  }

  private async validAssigneeIdsForTenant(
    repository: Pick<PrismaService | Prisma.TransactionClient, 'user'>,
    tenantId: string,
    assignedToIds: readonly (string | null)[],
  ): Promise<Set<string>> {
    const uniqueAssigneeIds = [
      ...new Set(
        assignedToIds.filter((assigneeId): assigneeId is string =>
          Boolean(assigneeId),
        ),
      ),
    ];
    if (uniqueAssigneeIds.length === 0) {
      return new Set();
    }

    const assignees = await repository.user.findMany({
      where: {
        id: { in: uniqueAssigneeIds },
        isActive: true,
        tenantMemberships: {
          some: { tenantId },
        },
      },
      select: { id: true },
    });

    return new Set(assignees.map((assignee) => assignee.id));
  }

  private paymentTaskUpdateData(
    input: DocumentTaskUpdateRequest,
    assignedToId: string | null | undefined,
    taskUpdatedAt: Date,
    actorUserId: string,
  ): Prisma.DocumentPaymentUncheckedUpdateManyInput {
    return {
      assignedToId,
      assignedAt:
        input.assignedToId === undefined
          ? undefined
          : assignedToId
            ? taskUpdatedAt
            : null,
      ...(input.completed === undefined
        ? {}
        : input.completed
          ? { status: 'PAID', paidAt: taskUpdatedAt, paidById: actorUserId }
          : { status: 'OPEN', paidAt: null, paidById: null }),
    };
  }

  private calendarEventTaskUpdateData(
    input: DocumentTaskUpdateRequest,
    assignedToId: string | null | undefined,
    taskUpdatedAt: Date,
    actorUserId: string,
  ): Prisma.DocumentCalendarEventUncheckedUpdateManyInput {
    return {
      assignedToId,
      assignedAt:
        input.assignedToId === undefined
          ? undefined
          : assignedToId
            ? taskUpdatedAt
            : null,
      ...(input.completed === undefined
        ? {}
        : input.completed
          ? { completedAt: taskUpdatedAt, completedById: actorUserId }
          : { completedAt: null, completedById: null }),
    };
  }

  private definitionAppliesToDocumentType(
    definition: DocumentFieldDefinitionWithScopes,
    documentTypeId: string | null,
  ): boolean {
    return (
      definition.appliesToAllDocumentTypes ||
      Boolean(
        documentTypeId &&
        definition.documentTypes.some(
          (scope) => scope.documentTypeId === documentTypeId,
        ),
      )
    );
  }

  private metadataChanges(
    before: MetadataHistorySnapshot,
    after: MetadataHistorySnapshot,
  ): DocumentHistoryChangeDto[] {
    const changes: DocumentHistoryChangeDto[] = [];
    this.addChange(
      changes,
      'title',
      'Document name',
      before.title,
      after.title,
    );
    this.addChange(
      changes,
      'documentTypeId',
      'Document type',
      before.documentTypeId,
      after.documentTypeId,
    );
    this.addChange(
      changes,
      'documentDate',
      'Document date',
      this.dateValue(before.documentDate),
      this.dateValue(after.documentDate),
    );
    this.addChange(
      changes,
      'summary',
      'Summary',
      before.summary,
      after.summary,
    );
    this.addChange(changes, 'sender', 'Sender', before.sender, after.sender);
    this.addChange(
      changes,
      'recipient',
      'Recipient',
      before.recipient,
      after.recipient,
    );
    this.addChange(changes, 'note', 'Note', before.note, after.note);

    const previousPayments = this.paymentValues(before.payments);
    const nextPayments = this.paymentValues(after.payments);
    if (!this.sameValues(previousPayments, nextPayments)) {
      changes.push({
        field: 'payments',
        label: 'Payment details',
        oldValue: previousPayments,
        newValue: nextPayments,
      });
    }

    const previousReferences = this.referenceValues(before.references);
    const nextReferences = this.referenceValues(after.references);
    if (!this.sameValues(previousReferences, nextReferences)) {
      changes.push({
        field: 'references',
        label: 'References',
        oldValue: previousReferences,
        newValue: nextReferences,
      });
    }

    const previousCalendarEvents = this.calendarEventValues(
      before.calendarEvents,
    );
    const nextCalendarEvents = this.calendarEventValues(after.calendarEvents);
    if (!this.sameValues(previousCalendarEvents, nextCalendarEvents)) {
      changes.push({
        field: 'calendarEvents',
        label: 'Calendar events',
        oldValue: previousCalendarEvents,
        newValue: nextCalendarEvents,
      });
    }

    const previousAttributes = this.attributeValues(before.attributes);
    const nextAttributes = this.attributeValues(after.attributes);
    if (!this.sameValues(previousAttributes, nextAttributes)) {
      changes.push({
        field: 'attributes',
        label: 'Attribute',
        oldValue: previousAttributes,
        newValue: nextAttributes,
      });
    }

    return changes;
  }

  private addChange(
    changes: DocumentHistoryChangeDto[],
    field: string,
    label: string,
    oldValue: string | null,
    newValue: string | null,
  ): void {
    if (oldValue === newValue) {
      return;
    }

    changes.push({
      field,
      label,
      oldValue,
      newValue,
    });
  }

  private dateValue(value: Date | null): string | null {
    return value ? value.toISOString().slice(0, 10) : null;
  }

  private nullableText(value: string | null | undefined): string | null {
    const trimmedValue = value?.trim() ?? '';
    return trimmedValue || null;
  }

  private coreMetadataUpdateData(
    input: DocumentMetadataUpdateRequest,
    before: {
      readonly title: string | null;
      readonly documentTypeId: string | null;
      readonly documentDate: Date | null;
      readonly sender: string | null;
      readonly acceptedAt: Date | null;
      readonly status: string;
    },
  ): Record<string, unknown> {
    const isInboxDocument = this.isInboxDocumentState(before);
    const next = {
      title:
        input.title === undefined
          ? before.title
          : this.normalizedCoreText(input.title),
      documentTypeId:
        input.documentTypeId === undefined
          ? before.documentTypeId
          : input.documentTypeId,
      documentDate:
        input.documentDate === undefined
          ? before.documentDate
          : input.documentDate
            ? new Date(input.documentDate)
            : null,
      sender:
        input.sender === undefined
          ? before.sender
          : this.normalizedCoreText(input.sender),
    };

    if (!isInboxDocument && !this.hasRequiredCoreMetadata(next)) {
      throw new BadRequestException(
        'Document name, sender, document type, and date are required outside the inbox.',
      );
    }

    const data: Record<string, unknown> = {};
    if (input.title !== undefined) {
      data.title = next.title;
      data.titleSource = next.title ? 'MANUAL' : 'AI_EXTRACTED';
    }
    if (input.documentTypeId !== undefined) {
      data.documentTypeId = next.documentTypeId;
      data.documentTypeSource = next.documentTypeId ? 'MANUAL' : 'AI_EXTRACTED';
    }
    if (input.documentDate !== undefined) {
      data.documentDate = next.documentDate;
      data.documentDateSource = next.documentDate ? 'MANUAL' : 'AI_EXTRACTED';
    }
    if (input.sender !== undefined) {
      data.sender = next.sender;
      data.senderSource = next.sender ? 'MANUAL' : 'AI_EXTRACTED';
    }

    return data;
  }

  private isInboxDocumentState(document: {
    readonly acceptedAt: Date | null;
    readonly status: string;
  }): boolean {
    return document.acceptedAt === null && document.status !== 'ARCHIVED';
  }

  private hasRequiredCoreMetadata(document: {
    readonly title: string | null;
    readonly documentTypeId: string | null;
    readonly documentDate: Date | null;
    readonly sender: string | null;
  }): boolean {
    return Boolean(
      document.title?.trim() &&
      document.sender?.trim() &&
      document.documentTypeId &&
      document.documentDate,
    );
  }

  private normalizedCoreText(value: string | null | undefined): string | null {
    const trimmedValue = value?.trim() ?? '';
    return trimmedValue || null;
  }
  private normalizedPaymentInputs(
    payments: NonNullable<DocumentMetadataUpdateRequest['payments']>,
  ): NormalizedPaymentInput[] {
    return payments
      .map((payment) => ({
        id: payment.id,
        iban: this.nullableText(payment.iban),
        recipient: this.nullableText(payment.recipient),
        purpose: this.nullableText(payment.purpose),
        amount: payment.amount ?? null,
        currency: this.nullableText(payment.currency) ?? 'EUR',
        status: payment.status ?? 'OPEN',
        paidAt: payment.paidAt ? new Date(payment.paidAt) : null,
        dueDate: payment.dueDate === undefined ? undefined : payment.dueDate,
        dueDateSourceText: this.nullableText(payment.dueDateSourceText),
      }))
      .filter(
        (payment) =>
          payment.iban ||
          payment.recipient ||
          payment.purpose ||
          payment.amount !== null ||
          payment.dueDate,
      );
  }

  private async syncPaymentDueDateEvent(
    tx: Prisma.TransactionClient,
    documentId: string,
    paymentId: string,
    payment: Pick<
      NormalizedPaymentInput,
      'dueDate' | 'dueDateSourceText' | 'purpose'
    >,
    source: DocumentEntrySource,
  ): Promise<void> {
    const existingEvents = await tx.documentCalendarEvent.findMany({
      where: { paymentId, kind: 'DUE_DATE' },
      orderBy: [{ date: 'asc' }, { time: 'asc' }, { createdAt: 'asc' }],
      select: { id: true, completedAt: true },
    });

    if (!payment.dueDate) {
      for (const event of existingEvents) {
        if (event.completedAt) {
          await tx.documentCalendarEvent.update({
            where: { id: event.id },
            data: { paymentId: null },
          });
        } else {
          await tx.documentCalendarEvent.delete({ where: { id: event.id } });
        }
      }
      return;
    }

    const data = {
      documentId,
      paymentId,
      kind: 'DUE_DATE' as const,
      title: 'Payment due',
      description: payment.purpose,
      date: parseIsoDate(payment.dueDate),
      time: null,
      endDate: null,
      endTime: null,
      source,
      sourceText: payment.dueDateSourceText,
    };

    const [primaryEvent, ...duplicateEvents] = existingEvents;
    if (primaryEvent) {
      await tx.documentCalendarEvent.update({
        where: { id: primaryEvent.id },
        data,
      });
    } else {
      await tx.documentCalendarEvent.create({ data });
    }

    for (const event of duplicateEvents) {
      if (event.completedAt) {
        await tx.documentCalendarEvent.update({
          where: { id: event.id },
          data: { paymentId: null },
        });
      } else {
        await tx.documentCalendarEvent.delete({ where: { id: event.id } });
      }
    }
  }

  private async fallbackUnlinkedPaymentDueDate(
    tx: Prisma.TransactionClient,
    documentId: string,
  ): Promise<{ id: string } | null> {
    const paymentCount = await tx.documentPayment.count({
      where: { documentId, status: { not: 'IGNORED' } },
    });
    if (paymentCount !== 1) {
      return null;
    }

    return tx.documentCalendarEvent.findFirst({
      where: {
        documentId,
        paymentId: null,
        kind: 'DUE_DATE',
        completedAt: null,
      },
      orderBy: [{ date: 'asc' }, { time: 'asc' }, { createdAt: 'asc' }],
      select: { id: true },
    });
  }

  private normalizedReferenceInputs(
    references: NonNullable<DocumentMetadataUpdateRequest['references']>,
  ): NormalizedReferenceInput[] {
    return references
      .map((reference) => ({
        id: reference.id,
        referenceNumber: reference.referenceNumber.trim(),
        referenceType: reference.referenceType.trim(),
      }))
      .filter(
        (reference) => reference.referenceNumber && reference.referenceType,
      );
  }

  private normalizedCalendarEventInputs(
    events: NonNullable<DocumentMetadataUpdateRequest['calendarEvents']>,
  ): NormalizedCalendarEventInput[] {
    return events
      .map((event) => ({
        id: event.id,
        kind: event.kind,
        title: event.title.trim(),
        description: this.nullableText(event.description),
        date: event.date,
        time: this.nullableText(event.time),
        endDate: event.endDate ?? null,
        endTime: this.nullableText(event.endTime),
        sourceText: this.nullableText(event.sourceText),
      }))
      .filter((event) => event.title && event.date);
  }

  private samePayment(
    left: PaymentValueInput,
    right: PaymentValueInput,
  ): boolean {
    const includeDueDate = right.dueDate !== undefined;
    return (
      this.paymentValue(left, includeDueDate) ===
      this.paymentValue(right, includeDueDate)
    );
  }

  private sameReference(
    left: NormalizedReferenceInput,
    right: NormalizedReferenceInput,
  ): boolean {
    return this.referenceValue(left) === this.referenceValue(right);
  }

  private sameCalendarEvent(
    left: NonNullable<MetadataHistorySnapshot['calendarEvents']>[number],
    right: NormalizedCalendarEventInput,
  ): boolean {
    return this.calendarEventValue(left) === this.calendarEventValue(right);
  }

  private attributeValues(
    attributes: Array<{ key: string; value: string }>,
  ): string[] {
    return attributes
      .map((attribute) => `${attribute.key}=${attribute.value}`)
      .sort((left, right) => left.localeCompare(right, 'de'));
  }

  private paymentValues(
    payments: MetadataHistorySnapshot['payments'],
  ): string[] {
    return payments.map((payment) => this.paymentValue(payment));
  }

  private paymentValue(
    payment: PaymentValueInput,
    includeDueDate = true,
  ): string {
    const dueDateValue =
      payment.dueDate ??
      this.dateValue(payment.calendarEvents?.[0]?.date ?? null) ??
      '';

    return [
      payment.iban ?? '',
      payment.recipient ?? '',
      payment.purpose ?? '',
      payment.amount?.toString() ?? '',
      payment.currency ?? '',
      payment.status ?? '',
      this.dateValue(payment.paidAt ?? null),
      includeDueDate ? dueDateValue : '',
    ].join('|');
  }

  private referenceValues(
    references: MetadataHistorySnapshot['references'],
  ): string[] {
    return references.map((reference) => this.referenceValue(reference));
  }

  private referenceValue(reference: NormalizedReferenceInput): string {
    return `${reference.referenceType}=${reference.referenceNumber}`;
  }

  private calendarEventValues(
    events: MetadataHistorySnapshot['calendarEvents'] = [],
  ): string[] {
    return events
      .filter((event) => !event.paymentId)
      .map((event) => this.calendarEventValue(event))
      .sort((left, right) => left.localeCompare(right, 'de'));
  }

  private calendarEventValue(
    event:
      | NonNullable<MetadataHistorySnapshot['calendarEvents']>[number]
      | NormalizedCalendarEventInput,
  ): string {
    return [
      event.kind,
      event.title,
      event.description ?? '',
      typeof event.date === 'string' ? event.date : this.dateValue(event.date),
      event.time ?? '',
      event.endDate
        ? typeof event.endDate === 'string'
          ? event.endDate
          : this.dateValue(event.endDate)
        : '',
      event.endTime ?? '',
      event.sourceText ?? '',
    ].join('|');
  }

  private sortedTagNames(document: TagHistorySnapshot): string[] {
    return document.tags
      .map((entry) => entry.tag.name)
      .sort((left, right) => left.localeCompare(right, 'de'));
  }

  private sameValues(left: string[], right: string[]): boolean {
    return (
      left.length === right.length &&
      left.every((value, index) => value === right[index])
    );
  }

  private canAcceptDocument(
    document: {
      status: string;
      aiProcessedAt: Date | null;
      title: string | null;
      documentTypeId: string | null;
      documentDate: Date | null;
      sender: string | null;
    },
    requireAiMetadata: boolean,
  ): boolean {
    return (
      document.status === 'READY' &&
      (!requireAiMetadata || document.aiProcessedAt !== null) &&
      this.hasRequiredCoreMetadata(document)
    );
  }

  private buildSqlConditions(
    request: DocumentSearchRequest,
    scope: DocumentSearchScope = 'accepted',
    tenantIds: readonly string[] = [],
  ): Prisma.Sql[] {
    const filters = request.filters;
    const conditions: Prisma.Sql[] = [];

    conditions.push(
      tenantIds.length
        ? Prisma.sql`d."tenantId" IN (${this.uuidListSql(tenantIds)})`
        : Prisma.sql`FALSE`,
    );

    conditions.push(
      scope === 'accepted'
        ? Prisma.sql`d."acceptedAt" IS NOT NULL`
        : Prisma.sql`d."acceptedAt" IS NULL`,
    );

    if (scope === 'inbox') {
      conditions.push(
        Prisma.sql`d."status" <> ${this.documentStatusSql('ARCHIVED')}`,
      );
      if (filters?.statuses?.length) {
        const statuses = filters.statuses.filter(
          (status) => status !== 'ARCHIVED',
        );
        conditions.push(
          statuses.length
            ? Prisma.sql`d."status" IN (${this.documentStatusListSql(statuses)})`
            : Prisma.sql`FALSE`,
        );
      }
    } else if (!filters?.includeArchived) {
      if (filters?.statuses?.length) {
        const statuses = filters.statuses.filter(
          (status) => status !== 'ARCHIVED',
        );
        conditions.push(
          statuses.length
            ? Prisma.sql`d."status" IN (${this.documentStatusListSql(statuses)})`
            : Prisma.sql`FALSE`,
        );
      } else {
        conditions.push(
          Prisma.sql`d."status" <> ${this.documentStatusSql('ARCHIVED')}`,
        );
      }
    } else if (filters?.statuses?.length) {
      conditions.push(
        Prisma.sql`d."status" IN (${this.documentStatusListSql(filters.statuses)})`,
      );
    }

    if (filters?.sources?.length) {
      conditions.push(
        Prisma.sql`d."source" IN (${this.documentSourceListSql(filters.sources)})`,
      );
    }

    if (filters?.createdFrom || filters?.createdTo) {
      if (filters.createdFrom) {
        conditions.push(
          Prisma.sql`d."createdAt" >= ${new Date(filters.createdFrom)}`,
        );
      }
      if (filters.createdTo) {
        conditions.push(
          Prisma.sql`d."createdAt" <= ${new Date(filters.createdTo)}`,
        );
      }
    }

    if (filters?.documentDateFrom || filters?.documentDateTo) {
      if (filters.documentDateFrom) {
        conditions.push(
          Prisma.sql`d."documentDate" >= ${new Date(filters.documentDateFrom)}`,
        );
      }
      if (filters.documentDateTo) {
        conditions.push(
          Prisma.sql`d."documentDate" <= ${new Date(filters.documentDateTo)}`,
        );
      }
    }

    if (filters?.visibleDateFrom || filters?.visibleDateTo) {
      if (filters.visibleDateFrom) {
        conditions.push(
          Prisma.sql`coalesce(d."documentDate", d."createdAt") >= ${new Date(filters.visibleDateFrom)}`,
        );
      }
      if (filters.visibleDateTo) {
        conditions.push(
          Prisma.sql`coalesce(d."documentDate", d."createdAt") <= ${new Date(filters.visibleDateTo)}`,
        );
      }
    }

    if (filters?.documentTypeIds?.length) {
      conditions.push(
        Prisma.sql`d."documentTypeId" IN (${this.uuidListSql(filters.documentTypeIds)})`,
      );
    }

    if (filters?.senders?.length) {
      conditions.push(
        Prisma.sql`d."sender" IN (${Prisma.join(filters.senders)})`,
      );
    }

    if (filters?.sender?.trim()) {
      conditions.push(
        Prisma.sql`
          ${this.searchVectorSql('sender')} @@ websearch_to_tsquery('simple', ${filters.sender.trim()})
        `,
      );
    }

    if (filters?.recipient?.trim()) {
      conditions.push(
        Prisma.sql`
          to_tsvector('simple', coalesce(d."recipient", ''))
          @@ websearch_to_tsquery('simple', ${filters.recipient.trim()})
        `,
      );
    }

    const tagNames = filters?.tagNames?.length
      ? filters.tagNames
      : filters?.tags;

    if (tagNames?.length) {
      conditions.push(Prisma.sql`
        EXISTS (
          SELECT 1
          FROM "DocumentTag" dt
          JOIN "Tag" t ON t.id = dt."tagId"
          WHERE dt."documentId" = d.id
          AND t.name IN (${Prisma.join(tagNames)})
        )
      `);
    }

    return conditions;
  }

  private buildSqlOrderBy(
    request: DocumentSearchRequest,
    hasSearchQuery: boolean,
  ): Prisma.Sql {
    const direction = request.sortDirection === 'asc' ? 'ASC' : 'DESC';
    const sortBy: DocumentSearchSortBy =
      request.sortBy === 'relevance' && !hasSearchQuery
        ? 'createdAt'
        : request.sortBy;

    switch (sortBy) {
      case 'relevance':
        return Prisma.raw(
          `relevance ${direction}, d."createdAt" DESC, d.id ASC`,
        );
      case 'createdAt':
      case 'updatedAt':
      case 'title':
        return Prisma.raw(`d."${sortBy}" ${direction} NULLS LAST, d.id ASC`);
      case 'documentDate':
        return Prisma.raw(
          `coalesce(d."documentDate", d."createdAt") ${direction}, d.id ASC`,
        );
      case 'status':
        return Prisma.raw(
          `${this.statusSortExpression()} ${direction}, d.id ASC`,
        );
      case 'documentType':
        return Prisma.raw(
          `(SELECT dt.name FROM "DocumentType" dt WHERE dt.id = d."documentTypeId") ${direction} NULLS LAST, d.id ASC`,
        );
      case 'sender':
        return Prisma.raw(
          `NULLIF(trim(d."sender"), '') ${direction} NULLS LAST, d.id ASC`,
        );
      default:
        return Prisma.raw(`d."createdAt" DESC, d.id ASC`);
    }
  }

  private combineSqlConditions(conditions: Prisma.Sql[]): Prisma.Sql {
    return conditions.length
      ? Prisma.sql`${Prisma.join(conditions, ' AND ')}`
      : Prisma.sql`TRUE`;
  }

  private uuidListSql(ids: readonly string[]): Prisma.Sql {
    return Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`));
  }

  private documentStatusSql(status: string): Prisma.Sql {
    return Prisma.sql`${status}::"DocumentStatus"`;
  }

  private documentStatusListSql(statuses: readonly string[]): Prisma.Sql {
    return Prisma.join(
      statuses.map((status) => this.documentStatusSql(status)),
    );
  }

  private documentSourceListSql(sources: readonly string[]): Prisma.Sql {
    return Prisma.join(
      sources.map((source) => Prisma.sql`${source}::"DocumentSource"`),
    );
  }

  private searchVectorSql(
    field: 'title' | 'content' | 'sender' | 'tags',
  ): Prisma.Sql {
    const columnByField = {
      title: '"titleSearchVector"',
      content: '"contentSearchVector"',
      sender: '"senderSearchVector"',
      tags: '"tagSearchVector"',
    } as const;

    return Prisma.raw(`coalesce(d.${columnByField[field]}, ''::tsvector)`);
  }

  private statusSortExpression(): string {
    return `CASE d."status"
      WHEN 'AI_PENDING' THEN 1
      WHEN 'AI_RUNNING' THEN 2
      WHEN 'ARCHIVED' THEN 3
      WHEN 'FAILED' THEN 4
      WHEN 'INGESTING' THEN 5
      WHEN 'NEW' THEN 6
      WHEN 'OCR_PENDING' THEN 7
      WHEN 'OCR_RUNNING' THEN 8
      WHEN 'READY' THEN 9
      ELSE 10
    END`;
  }

  private searchMatchSql(
    fields: DocumentSearchField[],
    metadataContainsTokens: MetadataContainsSearchToken[],
  ): Prisma.Sql {
    const conditions = [
      Prisma.sql`(numnode(q.query) > 0 AND ${this.searchFtsMatchSql(fields)})`,
    ];
    const metadataContainsCondition = this.searchMetadataContainsSql(
      fields,
      metadataContainsTokens,
    );

    if (metadataContainsCondition) {
      conditions.push(metadataContainsCondition);
    }

    return Prisma.sql`(${Prisma.join(conditions, ' OR ')})`;
  }

  private searchFtsMatchSql(fields: DocumentSearchField[]): Prisma.Sql {
    const conditions: Prisma.Sql[] = [];

    if (fields.includes('title')) {
      conditions.push(Prisma.sql`${this.searchVectorSql('title')} @@ q.query`);
    }

    if (fields.includes('content')) {
      conditions.push(
        Prisma.sql`${this.searchVectorSql('content')} @@ q.query`,
      );
    }

    if (fields.includes('sender')) {
      conditions.push(Prisma.sql`${this.searchVectorSql('sender')} @@ q.query`);
    }

    if (fields.includes('tags')) {
      conditions.push(Prisma.sql`${this.searchVectorSql('tags')} @@ q.query`);
    }

    return conditions.length
      ? Prisma.sql`(${Prisma.join(conditions, ' OR ')})`
      : Prisma.sql`FALSE`;
  }

  private searchMetadataContainsSql(
    fields: DocumentSearchField[],
    metadataContainsTokens: MetadataContainsSearchToken[],
  ): Prisma.Sql | null {
    if (!metadataContainsTokens.length) {
      return null;
    }

    const tokenConditions = metadataContainsTokens
      .map((token) => {
        const fieldConditions: Prisma.Sql[] = [];

        if (fields.includes('title')) {
          fieldConditions.push(
            Prisma.sql`lower(d."title") LIKE ${token.pattern} ESCAPE ${SQL_LIKE_ESCAPE}`,
          );
        }

        if (fields.includes('sender')) {
          fieldConditions.push(Prisma.sql`
            d."sender" IS NOT NULL
            AND trim(d."sender") <> ''
            AND lower(d."sender") LIKE ${token.pattern} ESCAPE ${SQL_LIKE_ESCAPE}
          `);
        }

        if (fields.includes('tags')) {
          fieldConditions.push(Prisma.sql`EXISTS (
            SELECT 1
            FROM "DocumentTag" dt
            JOIN "Tag" t ON t.id = dt."tagId"
            WHERE dt."documentId" = d.id
            AND lower(t.name) LIKE ${token.pattern} ESCAPE ${SQL_LIKE_ESCAPE}
          )`);
        }

        return fieldConditions.length
          ? Prisma.sql`(${Prisma.join(fieldConditions, ' OR ')})`
          : null;
      })
      .filter((condition): condition is Prisma.Sql => condition !== null);

    return tokenConditions.length
      ? Prisma.sql`(${Prisma.join(tokenConditions, ' AND ')})`
      : null;
  }

  private searchRankSql(
    fields: DocumentSearchField[],
    metadataContainsTokens: MetadataContainsSearchToken[] = [],
  ): Prisma.Sql {
    const ranks: Prisma.Sql[] = [];

    if (fields.includes('title')) {
      ranks.push(
        Prisma.sql`(ts_rank_cd(${this.searchVectorSql('title')}, q.query) * 1.2)`,
      );
    }

    if (fields.includes('content')) {
      ranks.push(
        Prisma.sql`ts_rank_cd(${this.searchVectorSql('content')}, q.query)`,
      );
    }

    if (fields.includes('sender')) {
      ranks.push(
        Prisma.sql`(ts_rank_cd(${this.searchVectorSql('sender')}, q.query) * 0.9)`,
      );
    }

    if (fields.includes('tags')) {
      ranks.push(
        Prisma.sql`(ts_rank_cd(${this.searchVectorSql('tags')}, q.query) * 0.8)`,
      );
    }

    const metadataContainsRank = this.searchMetadataContainsRankSql(
      fields,
      metadataContainsTokens,
    );

    if (metadataContainsRank) {
      ranks.push(metadataContainsRank);
    }

    return ranks.length
      ? Prisma.sql`(${Prisma.join(ranks, ' + ')})`
      : Prisma.sql`0`;
  }

  private searchMetadataContainsRankSql(
    fields: DocumentSearchField[],
    metadataContainsTokens: MetadataContainsSearchToken[],
  ): Prisma.Sql | null {
    if (!metadataContainsTokens.length) {
      return null;
    }

    const ranks: Prisma.Sql[] = [];

    if (fields.includes('title')) {
      ranks.push(
        Prisma.sql`(${this.maxSimilaritySql(Prisma.sql`lower(d."title")`, metadataContainsTokens)} * 0.02)`,
      );
    }

    if (fields.includes('sender')) {
      ranks.push(
        Prisma.sql`(COALESCE(${this.maxSimilaritySql(Prisma.sql`lower(d."sender")`, metadataContainsTokens)}, 0) * 0.015)`,
      );
    }

    if (fields.includes('tags')) {
      ranks.push(Prisma.sql`(COALESCE((
        SELECT MAX(${this.maxSimilaritySql(Prisma.sql`lower(t.name)`, metadataContainsTokens)})
        FROM "DocumentTag" dt
        JOIN "Tag" t ON t.id = dt."tagId"
        WHERE dt."documentId" = d.id
      ), 0) * 0.012)`);
    }

    return ranks.length ? Prisma.sql`(${Prisma.join(ranks, ' + ')})` : null;
  }

  private maxSimilaritySql(
    expression: Prisma.Sql,
    metadataContainsTokens: MetadataContainsSearchToken[],
  ): Prisma.Sql {
    const similarities = metadataContainsTokens.map(
      (token) => Prisma.sql`CASE
        WHEN ${expression} LIKE ${token.pattern} ESCAPE ${SQL_LIKE_ESCAPE}
        THEN similarity(${expression}, ${token.value})
        ELSE 0
      END`,
    );

    return similarities.length === 1
      ? similarities[0]
      : Prisma.sql`GREATEST(${Prisma.join(similarities, ', ')})`;
  }

  private metadataContainsSearchTokens(
    searchQuery: string,
  ): MetadataContainsSearchToken[] {
    const tokens =
      searchQuery
        .toLowerCase()
        .match(/[\p{L}\p{N}]+/gu)
        ?.filter(
          (token) => token.length >= METADATA_CONTAINS_MIN_TOKEN_LENGTH,
        ) ?? [];

    return [...new Set(tokens)].map((value) => ({
      value,
      pattern: this.containsPattern(value),
    }));
  }

  private containsPattern(token: string): string {
    return `%${token.replace(/[\\%_]/g, '\\$&')}%`;
  }

  private countFromRows(rows: DocumentSearchCountRow[]): number {
    const count = rows[0]?.count ?? 0;
    return Number(count);
  }

  private documentStoragePaths(document: {
    readonly pdfPath: string | null;
    readonly thumbnailPath: string | null;
    readonly artifacts: readonly { readonly path: string }[];
  }): string[] {
    return [
      ...new Set(
        [
          document.pdfPath,
          document.thumbnailPath,
          ...document.artifacts.map((artifact) => artifact.path),
        ].filter((path): path is string => Boolean(path)),
      ),
    ];
  }
}
