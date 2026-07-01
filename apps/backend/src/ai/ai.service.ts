import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { AiMetadataExtractionResultSchema } from '@smart-dms/shared-dto';
import type {
  AiAvailabilityResponse,
  AiMetadataPromptScope,
  DocumentEntrySource,
  AiExtractedCalendarEvent,
  DocumentPaymentInput,
  DocumentReferenceInput,
} from '@smart-dms/shared-dto';
import { CalendarService } from '../calendar/calendar.service';
import { parseIsoDate } from '../common/date-mapper';
import { DocumentHistoryService } from '../document-history/document-history.service';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeEventsService } from '../realtime/realtime-events.service';
import { RealtimeNotificationsService } from '../realtime/realtime-notifications.service';
import { toAiProviderDto } from '../ai-providers/ai-provider.mapper';

type ResolvedAiCalendarEvent = Omit<
  AiExtractedCalendarEvent,
  'date' | 'relativeDate'
> & {
  date: string;
};

interface CoreMetadataForAi {
  readonly title: string | null;
  readonly titleSource: DocumentEntrySource;
  readonly documentTypeId: string | null;
  readonly documentTypeSource: DocumentEntrySource;
  readonly documentDate: Date | null;
  readonly documentDateSource: DocumentEntrySource;
  readonly sender: string | null;
  readonly senderSource: DocumentEntrySource;
}

interface AiCoreMetadataCandidate {
  title?: string | null;
  documentTypeId?: string | null;
  documentDate?: Date | null;
  sender?: string | null;
}

interface NormalizedPaymentEntry {
  readonly iban: string | null;
  readonly recipient: string | null;
  readonly purpose: string | null;
  readonly amount: number | null;
  readonly currency: string;
  readonly dueDate: string | null;
  readonly dueDateSourceText: string | null;
}

interface PaymentKeyInput {
  readonly iban: string | null;
  readonly recipient: string | null;
  readonly purpose: string | null;
  readonly amount: unknown;
  readonly currency: string | null;
  readonly dueDate?: string | null;
}

interface NormalizedReferenceEntry {
  readonly referenceNumber: string;
  readonly referenceType: string;
}

const RECENT_CALENDAR_EVENT_WINDOW_MONTHS = 6;
const PAYMENT_SCHEDULE_MIN_ENTRIES = 4;
const PAYMENT_SCHEDULE_STRONG_MIN_ENTRIES = 8;
const PAYMENT_SCHEDULE_PURPOSE_PATTERN =
  /\b(?:rate|raten|ratenplan|zahlungsplan|tilgung|annuitaet|annuität|installment|instalment|amortisation|amortization|repayment|loan|kredit|leasing|monatlich|monthly)\b/i;
const PAYMENT_SCHEDULE_DATE_PATTERN =
  /\b(?:\d{1,2}[./-]\d{1,2}[./-]\d{2,4}|\d{1,2}[./-]\d{4}|(?:jan(?:uar|uary)?|feb(?:ruar|ruary)?|maerz|märz|mar(?:ch)?|apr(?:il)?|mai|may|jun(?:i|e)?|jul(?:i|y)?|aug(?:ust)?|sep(?:tember)?|okt(?:ober)?|oct(?:ober)?|nov(?:ember)?|dez(?:ember)?|dec(?:ember)?)\s+\d{4})\b/i;
const INVOICE_REFERENCE_TYPE_PATTERN =
  /\b(?:invoice|rechnung|rechnungs[\s.-]*(?:nr|nummer)|facture|factura|fattura|fatura)\b/i;

@Injectable()
export class AiService {
  constructor(
    private readonly calendarService: CalendarService,
    private readonly prisma: PrismaService,
    private readonly notifications: RealtimeNotificationsService,
    private readonly documentHistory: DocumentHistoryService,
    private readonly realtimeEvents?: RealtimeEventsService,
  ) {}

  async availability(): Promise<AiAvailabilityResponse> {
    const providers = await this.prisma.aiProvider.findMany({
      orderBy: [{ priority: 'asc' }, { name: 'asc' }],
    });
    const providerDtos = providers.map(toAiProviderDto);
    const availableProviders = providerDtos.filter(
      (provider) => provider.isAvailable,
    );

    return {
      enabled: availableProviders.length > 0,
      providers: providerDtos,
    };
  }

  async applyMetadataExtractionResult(
    documentId: string,
    result: unknown,
    jobId?: string,
    scopes?: readonly AiMetadataPromptScope[],
  ): Promise<void> {
    if (scopes?.length) {
      await this.applyScopedMetadataExtractionResult(
        documentId,
        result,
        scopes,
        jobId,
      );
      return;
    }

    const parsed = AiMetadataExtractionResultSchema.parse(
      normalizeAiExtractionResultForValidation(result),
    );
    const tenantId = await this.documentTenantId(documentId);
    const coreMetadata = await this.coreMetadataForAi(documentId);
    const needsExistingDocumentDate =
      !parsed.documentDate &&
      Boolean(parsed.calendarEvents?.some((event) => event.relativeDate));
    const documentDateForRelativeDates = needsExistingDocumentDate
      ? (coreMetadata?.documentDate ?? null)
      : null;
    const documentType = parsed.documentTypeKey
      ? await this.prisma.documentType.findFirst({
          where: { key: parsed.documentTypeKey, active: true },
        })
      : null;
    if (parsed.documentTypeKey && !documentType) {
      throw new Error(
        `Unknown or inactive document type key: ${parsed.documentTypeKey}`,
      );
    }

    const aiFieldDefinitions =
      parsed.attributes && parsed.attributes.length > 0
        ? await this.prisma.documentFieldDefinition.findMany({
            where: {
              key: { in: parsed.attributes.map((attribute) => attribute.key) },
              active: true,
              includeInAiExtraction: true,
            },
          })
        : [];
    const aiFieldDefinitionsByKey = new Map(
      aiFieldDefinitions.map((definition) => [definition.key, definition]),
    );
    let resolvedCalendarEvents = filterRecentOrUpcomingCalendarEvents(
      resolveAiCalendarEvents(
        parsed.calendarEvents ?? [],
        parsed.documentDate
          ? new Date(parsed.documentDate)
          : documentDateForRelativeDates,
      ),
    );
    const normalizedReferences = normalizeAiReferences(parsed.references ?? []);
    const invoiceReferencePurpose =
      uniqueInvoiceReferencePurpose(normalizedReferences);
    const normalizedPayments = applyPaymentPurposeFallback(
      normalizeAiPayments(parsed.payments ?? []),
      invoiceReferencePurpose,
    );
    let appliedPaymentCount = 0;
    const aiPaymentDueDates: { date: string; sourceText: string | null }[] = [];

    await this.prisma.$transaction(async (tx) => {
      await tx.document.update({
        where: { id: documentId },
        data: {
          ...this.aiCoreMetadataUpdateData(coreMetadata, {
            title: parsed.title,
            documentTypeId: parsed.documentTypeKey
              ? (documentType?.id ?? null)
              : undefined,
            documentDate: parsed.documentDate
              ? new Date(parsed.documentDate)
              : undefined,
            sender: parsed.sender,
          }),
          status: 'READY',
          aiProcessedAt: new Date(),
          failedReason: null,
          summary: parsed.summary,
          recipient: parsed.recipient,
          note: parsed.note,
        },
      });

      const manualPayments = normalizedPayments.length
        ? await tx.documentPayment.findMany({
            where: { documentId, source: 'MANUAL' },
            select: {
              iban: true,
              recipient: true,
              purpose: true,
              amount: true,
              currency: true,
            },
          })
        : [];
      const manualPaymentKeys = new Set(manualPayments.map(paymentKey));
      const aiPayments = normalizedPayments.filter(
        (payment) => !manualPaymentKeys.has(paymentKey(payment)),
      );
      appliedPaymentCount = aiPayments.length;

      await tx.documentPayment.deleteMany({
        where: { documentId, source: 'AI_EXTRACTED' },
      });
      const hasPaymentDueDates = aiPayments.some((payment) => payment.dueDate);
      if (!hasPaymentDueDates && aiPayments.length > 0) {
        await tx.documentPayment.createMany({
          data: aiPayments.map((payment, index) => ({
            documentId,
            iban: payment.iban,
            recipient: payment.recipient,
            purpose: payment.purpose,
            amount: payment.amount,
            currency: payment.currency,
            source: 'AI_EXTRACTED',
            displayOrder: index,
          })),
        });
      } else {
        for (const [index, payment] of aiPayments.entries()) {
          const createdPayment = await tx.documentPayment.create({
            data: {
              documentId,
              iban: payment.iban,
              recipient: payment.recipient,
              purpose: payment.purpose,
              amount: payment.amount,
              currency: payment.currency,
              source: 'AI_EXTRACTED',
              displayOrder: index,
            },
            select: { id: true },
          });
          if (payment.dueDate) {
            const paymentCalendarEvent = takePaymentDueDateCalendarEvent(
              resolvedCalendarEvents,
              payment,
            );
            resolvedCalendarEvents = paymentCalendarEvent.remainingEvents;
            await tx.documentCalendarEvent.create({
              data: {
                documentId,
                paymentId: createdPayment.id,
                kind: 'DUE_DATE',
                title: paymentCalendarEvent.event?.title ?? 'Payment due',
                description:
                  paymentCalendarEvent.event?.description ?? payment.purpose,
                date: parseIsoDate(payment.dueDate),
                time: null,
                endDate: null,
                endTime: null,
                source: 'AI_EXTRACTED',
                sourceText:
                  paymentCalendarEvent.event?.sourceText ??
                  payment.dueDateSourceText,
              },
            });
            aiPaymentDueDates.push({
              date: payment.dueDate,
              sourceText:
                paymentCalendarEvent.event?.sourceText ??
                payment.dueDateSourceText,
            });
          }
        }
      }

      if (parsed.references) {
        const manualReferences = normalizedReferences.length
          ? await tx.documentReference.findMany({
              where: { documentId, source: 'MANUAL' },
              select: {
                referenceNumber: true,
                referenceType: true,
              },
            })
          : [];
        const manualReferenceKeys = new Set(manualReferences.map(referenceKey));
        const aiReferences = normalizedReferences.filter(
          (reference) => !manualReferenceKeys.has(referenceKey(reference)),
        );

        await tx.documentReference.deleteMany({
          where: { documentId, source: 'AI_EXTRACTED' },
        });
        if (aiReferences.length > 0) {
          await tx.documentReference.createMany({
            data: aiReferences.map((reference, index) => ({
              documentId,
              referenceNumber: reference.referenceNumber,
              referenceType: reference.referenceType,
              source: 'AI_EXTRACTED',
              displayOrder: index,
            })),
          });
        }
      }

      if (parsed.attributes) {
        const attributes = parsed.attributes
          .map((attribute) => ({
            attribute,
            definition: aiFieldDefinitionsByKey.get(attribute.key),
          }))
          .filter((entry) => entry.definition);

        for (const entry of attributes) {
          await tx.documentAttribute.upsert({
            where: {
              documentId_key: {
                documentId,
                key: entry.attribute.key,
              },
            },
            create: {
              documentId,
              fieldDefinitionId: entry.definition?.id,
              key: entry.attribute.key,
              value: String(entry.attribute.value),
              valueType:
                entry.definition?.valueType ?? entry.attribute.valueType,
              source: 'AI_EXTRACTED',
            },
            update: {
              fieldDefinitionId: entry.definition?.id,
              value: String(entry.attribute.value),
              valueType:
                entry.definition?.valueType ?? entry.attribute.valueType,
              source: 'AI_EXTRACTED',
            },
          });
        }
      }

      if (parsed.tags) {
        const tagNames = [
          ...new Set(parsed.tags.map((tag) => tag.trim()).filter(Boolean)),
        ];
        const manualTags = tagNames.length
          ? await tx.documentTag.findMany({
              where: { documentId, source: 'MANUAL' },
              include: { tag: true },
            })
          : [];
        const manualTagNames = new Set(
          manualTags.map((entry) => entry.tag.name),
        );
        const aiTagNames = tagNames.filter(
          (tagName) => !manualTagNames.has(tagName),
        );

        await tx.documentTag.deleteMany({
          where: { documentId, source: 'AI_EXTRACTED' },
        });
        for (const tagName of aiTagNames) {
          const tag = await tx.tag.upsert({
            where: { tenantId_name: { tenantId, name: tagName } },
            create: { tenantId, name: tagName },
            update: {},
          });
          await tx.documentTag.create({
            data: {
              documentId,
              tagId: tag.id,
              source: 'AI_EXTRACTED',
            },
          });
        }
      }
    });
    await this.calendarService.replaceAiExtractedEvents(
      documentId,
      resolvedCalendarEvents,
      aiPaymentDueDates,
    );
    const document = await this.prisma.document.findUnique({
      where: { id: documentId },
      select: {
        tenantId: true,
        title: true,
        originalFileName: true,
        status: true,
      },
    });
    await this.documentHistory.record({
      documentId,
      type: 'AI_METADATA_EXTRACTED',
      summary: 'AI-Metadaten wurden übernommen.',
      metadata: {
        calendarEventCount: resolvedCalendarEvents.length,
        paymentCount: appliedPaymentCount,
        referenceCount: parsed.references?.length ?? 0,
        status: document?.status,
      },
    });
    await this.notifications.publish({
      type: 'ai.metadata_extracted',
      severity: 'success',
      title: 'AI-Daten extrahiert',
      message: `${displayAiDocumentTitle(document)} wurde durch den AI Provider ausgewertet.`,
      documentId,
      tenantId: document?.tenantId,
      documentTitle: displayAiDocumentTitle(document),
      status: document?.status,
    });
    if (document) {
      await this.realtimeEvents?.documentChanged({
        documentId,
        tenantId: document.tenantId,
        jobId,
        status: document.status,
        reason: 'AI_METADATA_EXTRACTED',
      });
    }
  }

  private async applyScopedMetadataExtractionResult(
    documentId: string,
    result: unknown,
    scopes: readonly AiMetadataPromptScope[],
    jobId?: string,
  ): Promise<void> {
    const raw = isRecord(result) ? result : {};
    const scopeSet = new Set(scopes);
    const tenantId = await this.documentTenantId(documentId);
    const coreMetadata = await this.coreMetadataForAi(documentId);
    const coreUpdateCandidate: AiCoreMetadataCandidate = {};
    const documentUpdate: Record<string, unknown> = {
      status: 'READY',
      aiProcessedAt: new Date(),
      failedReason: null,
    };

    if (scopeSet.has('TITLE') && hasTextValue(raw.title)) {
      coreUpdateCandidate.title = raw.title.trim();
    }
    if (scopeSet.has('SUMMARY')) {
      documentUpdate.summary = nullableTextValue(raw.summary);
    }
    if (scopeSet.has('PARTIES')) {
      coreUpdateCandidate.sender = nullableTextValue(raw.sender);
      documentUpdate.recipient = nullableTextValue(raw.recipient);
    }
    if (scopeSet.has('DOCUMENT_DATE')) {
      const normalizedDocumentDate = normalizeDocumentDateForValidation(
        raw.documentDate,
      );
      coreUpdateCandidate.documentDate = hasTextValue(normalizedDocumentDate)
        ? new Date(normalizedDocumentDate)
        : null;
    }

    let documentTypeId: string | null | undefined;
    if (scopeSet.has('DOCUMENT_TYPE')) {
      const documentTypeKey = nullableTextValue(raw.documentTypeKey);
      const documentType = documentTypeKey
        ? await this.prisma.documentType.findFirst({
            where: { key: documentTypeKey, active: true },
          })
        : null;
      if (documentTypeKey && !documentType) {
        throw new Error(
          `Unknown or inactive document type key: ${documentTypeKey}`,
        );
      }
      documentTypeId = documentType?.id ?? null;
      coreUpdateCandidate.documentTypeId = documentTypeId;
    }

    const documentForRelativeDates =
      scopeSet.has('CALENDAR_EVENTS') &&
      Array.isArray(raw.calendarEvents) &&
      raw.calendarEvents.some(
        (event) => isRecord(event) && isRecord(event.relativeDate),
      )
        ? await this.prisma.document.findUnique({
            where: { id: documentId },
            select: { documentDate: true },
          })
        : null;

    await this.prisma.$transaction(async (tx) => {
      await tx.document.update({
        where: { id: documentId },
        data: {
          ...documentUpdate,
          ...this.aiCoreMetadataUpdateData(coreMetadata, coreUpdateCandidate),
        },
      });

      if (scopeSet.has('PAYMENTS')) {
        const invoiceReferencePurpose = scopeSet.has('REFERENCES')
          ? uniqueInvoiceReferencePurpose(
              normalizeAiReferences(
                Array.isArray(raw.references)
                  ? (raw.references as DocumentReferenceInput[])
                  : [],
              ),
            )
          : null;
        const normalizedPayments = normalizeAiPayments(
          Array.isArray(raw.payments)
            ? (raw.payments as DocumentPaymentInput[])
            : [],
        );
        const manualPayments = normalizedPayments.length
          ? await tx.documentPayment.findMany({
              where: { documentId, source: 'MANUAL' },
              select: {
                iban: true,
                recipient: true,
                purpose: true,
                amount: true,
                currency: true,
              },
            })
          : [];
        const manualPaymentKeys = new Set(manualPayments.map(paymentKey));
        const aiPayments = applyPaymentPurposeFallback(
          normalizedPayments.filter(
            (payment) => !manualPaymentKeys.has(paymentKey(payment)),
          ),
          invoiceReferencePurpose,
        );

        await tx.documentPayment.deleteMany({
          where: { documentId, source: 'AI_EXTRACTED' },
        });
        if (aiPayments.length > 0) {
          await tx.documentPayment.createMany({
            data: aiPayments.map((payment, index) => ({
              documentId,
              iban: payment.iban,
              recipient: payment.recipient,
              purpose: payment.purpose,
              amount: payment.amount,
              currency: payment.currency,
              source: 'AI_EXTRACTED',
              displayOrder: index,
            })),
          });
        }
      }

      if (scopeSet.has('REFERENCES')) {
        const normalizedReferences = normalizeAiReferences(
          Array.isArray(raw.references)
            ? (raw.references as DocumentReferenceInput[])
            : [],
        );
        const manualReferences = normalizedReferences.length
          ? await tx.documentReference.findMany({
              where: { documentId, source: 'MANUAL' },
              select: {
                referenceNumber: true,
                referenceType: true,
              },
            })
          : [];
        const manualReferenceKeys = new Set(manualReferences.map(referenceKey));
        const aiReferences = normalizedReferences.filter(
          (reference) => !manualReferenceKeys.has(referenceKey(reference)),
        );

        await tx.documentReference.deleteMany({
          where: { documentId, source: 'AI_EXTRACTED' },
        });
        if (aiReferences.length > 0) {
          await tx.documentReference.createMany({
            data: aiReferences.map((reference, index) => ({
              documentId,
              referenceNumber: reference.referenceNumber,
              referenceType: reference.referenceType,
              source: 'AI_EXTRACTED',
              displayOrder: index,
            })),
          });
        }
      }

      if (scopeSet.has('TAGS')) {
        const tagNames = [
          ...new Set(
            (Array.isArray(raw.tags) ? raw.tags : [])
              .map((tag) => (typeof tag === 'string' ? tag.trim() : ''))
              .filter(Boolean),
          ),
        ];
        const manualTags = tagNames.length
          ? await tx.documentTag.findMany({
              where: { documentId, source: 'MANUAL' },
              include: { tag: true },
            })
          : [];
        const manualTagNames = new Set(
          manualTags.map((entry) => entry.tag.name),
        );
        const aiTagNames = tagNames.filter(
          (tagName) => !manualTagNames.has(tagName),
        );

        await tx.documentTag.deleteMany({
          where: { documentId, source: 'AI_EXTRACTED' },
        });
        for (const tagName of aiTagNames) {
          const tag = await tx.tag.upsert({
            where: { tenantId_name: { tenantId, name: tagName } },
            create: { tenantId, name: tagName },
            update: {},
          });
          await tx.documentTag.create({
            data: {
              documentId,
              tagId: tag.id,
              source: 'AI_EXTRACTED',
            },
          });
        }
      }

      if (scopeSet.has('ATTRIBUTES')) {
        await this.replaceScopedAiAttributes(
          tx,
          documentId,
          Array.isArray(raw.attributes) ? raw.attributes : [],
          documentTypeId,
        );
      }
    });

    const calendarEvents = scopeSet.has('CALENDAR_EVENTS')
      ? filterRecentOrUpcomingCalendarEvents(
          resolveAiCalendarEvents(
            Array.isArray(raw.calendarEvents)
              ? (raw.calendarEvents as AiExtractedCalendarEvent[])
              : [],
            documentForRelativeDates?.documentDate ?? null,
          ),
        )
      : null;
    if (calendarEvents) {
      await this.calendarService.replaceAiExtractedEvents(
        documentId,
        calendarEvents,
      );
    }

    const document = await this.prisma.document.findUnique({
      where: { id: documentId },
      select: {
        tenantId: true,
        title: true,
        originalFileName: true,
        status: true,
      },
    });
    await this.documentHistory.record({
      documentId,
      type: 'AI_METADATA_EXTRACTED',
      summary: 'AI-Metadaten wurden aktualisiert.',
      metadata: {
        scopes,
        calendarEventCount: calendarEvents?.length ?? undefined,
        status: document?.status,
      },
    });
    await this.notifications.publish({
      type: 'ai.metadata_extracted',
      severity: 'success',
      title: 'AI-Daten aktualisiert',
      message: `${displayAiDocumentTitle(document)} wurde durch den AI Provider aktualisiert.`,
      documentId,
      tenantId: document?.tenantId,
      documentTitle: displayAiDocumentTitle(document),
      status: document?.status,
    });
    if (document) {
      await this.realtimeEvents?.documentChanged({
        documentId,
        tenantId: document.tenantId,
        jobId,
        status: document.status,
        reason: 'AI_METADATA_EXTRACTED',
      });
    }
  }

  private async coreMetadataForAi(
    documentId: string,
  ): Promise<CoreMetadataForAi | null> {
    return this.prisma.document.findUnique({
      where: { id: documentId },
      select: {
        title: true,
        titleSource: true,
        documentTypeId: true,
        documentTypeSource: true,
        documentDate: true,
        documentDateSource: true,
        sender: true,
        senderSource: true,
      },
    });
  }

  private aiCoreMetadataUpdateData(
    current: CoreMetadataForAi | null,
    candidate: AiCoreMetadataCandidate,
  ): Record<string, unknown> {
    const data: Record<string, unknown> = {};

    if (
      candidate.title !== undefined &&
      this.canApplyAiCoreField(current?.titleSource, current?.title)
    ) {
      data.title = this.normalizedAiText(candidate.title);
      data.titleSource = 'AI_EXTRACTED';
    }

    if (
      candidate.documentTypeId !== undefined &&
      this.canApplyAiCoreField(
        current?.documentTypeSource,
        current?.documentTypeId,
      )
    ) {
      data.documentTypeId = candidate.documentTypeId;
      data.documentTypeSource = 'AI_EXTRACTED';
    }

    if (
      candidate.documentDate !== undefined &&
      this.canApplyAiCoreField(
        current?.documentDateSource,
        current?.documentDate,
      )
    ) {
      data.documentDate = candidate.documentDate;
      data.documentDateSource = 'AI_EXTRACTED';
    }

    if (
      candidate.sender !== undefined &&
      this.canApplyAiCoreField(current?.senderSource, current?.sender)
    ) {
      data.sender = this.normalizedAiText(candidate.sender);
      data.senderSource = 'AI_EXTRACTED';
    }

    return data;
  }

  private canApplyAiCoreField(
    source: DocumentEntrySource | undefined,
    currentValue: string | Date | null | undefined,
  ): boolean {
    return (
      source !== 'MANUAL' || currentValue === null || currentValue === undefined
    );
  }

  private normalizedAiText(value: string | null): string | null {
    const trimmedValue = value?.trim() ?? '';
    return trimmedValue || null;
  }
  private async replaceScopedAiAttributes(
    tx: Prisma.TransactionClient,
    documentId: string,
    rawAttributes: unknown[],
    documentTypeId: string | null | undefined,
  ): Promise<void> {
    let effectiveDocumentTypeId = documentTypeId;
    if (effectiveDocumentTypeId === undefined) {
      const document = await tx.document.findUnique({
        where: { id: documentId },
        select: { documentTypeId: true },
      });
      effectiveDocumentTypeId = document?.documentTypeId ?? null;
    }
    const attributes = rawAttributes
      .filter(isRecord)
      .map((attribute) => ({
        key: nullableTextValue(attribute.key),
        value: attribute.value,
        valueType: nullableTextValue(attribute.valueType),
      }))
      .filter(
        (
          attribute,
        ): attribute is {
          key: string;
          value: string | number | boolean;
          valueType: 'TEXT' | 'NUMBER' | 'DATE' | 'BOOLEAN';
        } =>
          Boolean(attribute.key) &&
          ['TEXT', 'NUMBER', 'DATE', 'BOOLEAN'].includes(
            attribute.valueType ?? '',
          ) &&
          (typeof attribute.value === 'string' ||
            typeof attribute.value === 'number' ||
            typeof attribute.value === 'boolean'),
      );
    const keys = [...new Set(attributes.map((attribute) => attribute.key))];
    const definitions = keys.length
      ? await tx.documentFieldDefinition.findMany({
          where: {
            key: { in: keys },
            active: true,
            includeInAiExtraction: true,
          },
          include: { documentTypes: true },
        })
      : [];
    const definitionsByKey = new Map(
      definitions
        .filter(
          (definition) =>
            definition.appliesToAllDocumentTypes ||
            !effectiveDocumentTypeId ||
            definition.documentTypes.some(
              (scope) => scope.documentTypeId === effectiveDocumentTypeId,
            ),
        )
        .map((definition) => [definition.key, definition]),
    );

    await tx.documentAttribute.deleteMany({
      where: {
        documentId,
        source: 'AI_EXTRACTED',
        key: { notIn: keys },
      },
    });

    for (const attribute of attributes) {
      const definition = definitionsByKey.get(attribute.key);
      if (!definition) {
        continue;
      }

      const existing = await tx.documentAttribute.findUnique({
        where: {
          documentId_key: {
            documentId,
            key: attribute.key,
          },
        },
      });
      if (existing?.source === 'MANUAL') {
        continue;
      }

      await tx.documentAttribute.upsert({
        where: {
          documentId_key: {
            documentId,
            key: attribute.key,
          },
        },
        create: {
          documentId,
          fieldDefinitionId: definition.id,
          key: attribute.key,
          value: String(attribute.value),
          valueType: definition.valueType,
          source: 'AI_EXTRACTED',
        },
        update: {
          fieldDefinitionId: definition.id,
          value: String(attribute.value),
          valueType: definition.valueType,
          source: 'AI_EXTRACTED',
        },
      });
    }
  }

  private async documentTenantId(documentId: string): Promise<string> {
    const document = await this.prisma.document.findUnique({
      where: { id: documentId },
      select: { tenantId: true },
    });
    if (!document) {
      throw new Error(`Document ${documentId} not found.`);
    }
    return document.tenantId;
  }
}

function normalizeAiPayments(
  payments: DocumentPaymentInput[],
): NormalizedPaymentEntry[] {
  const normalizedPayments = dedupeByKey(
    payments
      .map(
        (payment): NormalizedPaymentEntry => ({
          iban: nullableText(payment.iban),
          recipient: nullableText(payment.recipient),
          purpose: nullableText(payment.purpose),
          amount: payment.amount ?? null,
          currency: nullableText(payment.currency) ?? 'EUR',
          dueDate: payment.dueDate ?? null,
          dueDateSourceText: nullableText(payment.dueDateSourceText),
        }),
      )
      .filter(
        (payment) =>
          payment.iban ||
          payment.recipient ||
          payment.purpose ||
          payment.amount !== null ||
          payment.dueDate,
      ),
    (payment) => paymentKey(payment),
  );

  return withoutPaymentScheduleRows(normalizedPayments);
}

function applyPaymentPurposeFallback(
  payments: NormalizedPaymentEntry[],
  fallbackPurpose: string | null,
): NormalizedPaymentEntry[] {
  if (!fallbackPurpose) {
    return payments;
  }

  return payments.map((payment) =>
    payment.purpose
      ? payment
      : {
          ...payment,
          purpose: fallbackPurpose,
        },
  );
}

function withoutPaymentScheduleRows(
  payments: NormalizedPaymentEntry[],
): NormalizedPaymentEntry[] {
  if (payments.length < PAYMENT_SCHEDULE_MIN_ENTRIES) {
    return payments;
  }

  const scheduleKeys = paymentScheduleKeys(payments);
  if (scheduleKeys.size === 0) {
    return payments;
  }

  return payments.filter((payment) => !scheduleKeys.has(paymentKey(payment)));
}

function paymentScheduleKeys(payments: NormalizedPaymentEntry[]): Set<string> {
  const scheduleKeys = new Set<string>();
  const groupedPayments = groupBy(payments, paymentScheduleGroupKey);

  for (const group of groupedPayments.values()) {
    if (group.length < PAYMENT_SCHEDULE_MIN_ENTRIES) {
      continue;
    }

    const purposeScheduleRows = group.filter(isPaymentScheduleRow);
    if (purposeScheduleRows.length >= PAYMENT_SCHEDULE_MIN_ENTRIES) {
      for (const payment of purposeScheduleRows) {
        scheduleKeys.add(paymentKey(payment));
      }
      continue;
    }

    for (const amountGroup of groupBy(group, (payment) =>
      amountKey(payment.amount),
    ).values()) {
      if (
        amountGroup.length >= PAYMENT_SCHEDULE_MIN_ENTRIES &&
        isRepeatedAmountSchedule(amountGroup)
      ) {
        for (const payment of amountGroup) {
          scheduleKeys.add(paymentKey(payment));
        }
      }
    }
  }

  return scheduleKeys;
}

function paymentScheduleGroupKey(payment: NormalizedPaymentEntry): string {
  return [payment.iban ?? '', payment.recipient ?? '', payment.currency].join(
    '\u001f',
  );
}

function isRepeatedAmountSchedule(payments: NormalizedPaymentEntry[]): boolean {
  return (
    payments.length >= PAYMENT_SCHEDULE_STRONG_MIN_ENTRIES ||
    payments.filter(isPaymentScheduleRow).length >=
      PAYMENT_SCHEDULE_MIN_ENTRIES ||
    payments.filter(hasScheduleDateInPurpose).length >=
      PAYMENT_SCHEDULE_MIN_ENTRIES
  );
}

function isPaymentScheduleRow(payment: NormalizedPaymentEntry): boolean {
  const purpose = payment.purpose ?? '';
  return (
    PAYMENT_SCHEDULE_PURPOSE_PATTERN.test(purpose) ||
    hasScheduleDateInPurpose(payment)
  );
}

function hasScheduleDateInPurpose(payment: NormalizedPaymentEntry): boolean {
  return PAYMENT_SCHEDULE_DATE_PATTERN.test(payment.purpose ?? '');
}

function groupBy<T>(
  items: readonly T[],
  keyForItem: (item: T) => string,
): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const item of items) {
    const key = keyForItem(item);
    const group = grouped.get(key);
    if (group) {
      group.push(item);
    } else {
      grouped.set(key, [item]);
    }
  }

  return grouped;
}

function normalizeAiReferences(
  references: DocumentReferenceInput[],
): NormalizedReferenceEntry[] {
  return dedupeByKey(
    references
      .map((reference) => ({
        referenceNumber: reference.referenceNumber.trim(),
        referenceType: reference.referenceType.trim(),
      }))
      .filter(
        (reference) => reference.referenceNumber && reference.referenceType,
      ),
    referenceKey,
  );
}

function uniqueInvoiceReferencePurpose(
  references: NormalizedReferenceEntry[],
): string | null {
  const invoiceReferenceNumbers = new Set(
    references
      .filter((reference) => isInvoiceReferenceType(reference.referenceType))
      .map((reference) => reference.referenceNumber),
  );

  return invoiceReferenceNumbers.size === 1
    ? [...invoiceReferenceNumbers][0]
    : null;
}

function isInvoiceReferenceType(referenceType: string): boolean {
  return INVOICE_REFERENCE_TYPE_PATTERN.test(
    normalizedReferenceType(referenceType),
  );
}

function normalizedReferenceType(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

function dedupeByKey<T>(items: T[], keyForItem: (item: T) => string): T[] {
  const seen = new Set<string>();
  const result: T[] = [];

  for (const item of items) {
    const key = keyForItem(item);
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(item);
  }

  return result;
}

function paymentKey(payment: PaymentKeyInput): string {
  return [
    payment.iban ?? '',
    payment.recipient ?? '',
    payment.purpose ?? '',
    amountKey(payment.amount),
    nullableText(payment.currency) ?? 'EUR',
    payment.dueDate ?? '',
  ].join('\u001f');
}

function referenceKey(reference: NormalizedReferenceEntry): string {
  return [reference.referenceNumber, reference.referenceType].join('\u001f');
}

function amountKey(amount: unknown): string {
  if (amount === null || amount === undefined) {
    return '';
  }

  if (typeof amount === 'string') {
    return amount;
  }
  if (
    typeof amount === 'number' ||
    typeof amount === 'bigint' ||
    typeof amount === 'boolean'
  ) {
    return `${amount}`;
  }

  return decimalStringValue(amount) ?? '';
}

function decimalStringValue(value: unknown): string | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const decimalLike = value as { toFixed?: unknown };
  if (typeof decimalLike.toFixed !== 'function') {
    return null;
  }

  return (value as { toFixed: () => string }).toFixed();
}

function nullableText(value: string | null | undefined): string | null {
  const trimmedValue = value?.trim() ?? '';
  return trimmedValue || null;
}

function nullableTextValue(value: unknown): string | null {
  return typeof value === 'string' ? nullableText(value) : null;
}

function resolveAiCalendarEvents(
  events: AiExtractedCalendarEvent[],
  documentDate: Date | null,
): ResolvedAiCalendarEvent[] {
  const resolved: ResolvedAiCalendarEvent[] = [];

  for (const event of events) {
    const { date, relativeDate, ...persistedEvent } = event;
    if (date) {
      resolved.push({ ...persistedEvent, date });
      continue;
    }

    if (!relativeDate || !documentDate) {
      continue;
    }

    resolved.push({
      ...persistedEvent,
      date: addRelativeDateOffset(
        documentDate,
        relativeDate.amount,
        relativeDate.unit,
      ),
    });
  }

  return resolved;
}

function filterRecentOrUpcomingCalendarEvents(
  events: ResolvedAiCalendarEvent[],
  now: Date = new Date(),
): ResolvedAiCalendarEvent[] {
  const oldestAllowedDate = isoDateMonthsBefore(
    now,
    RECENT_CALENDAR_EVENT_WINDOW_MONTHS,
  );

  return events.filter((event) => event.date >= oldestAllowedDate);
}

function isoDateMonthsBefore(date: Date, months: number): string {
  const targetYear = date.getUTCFullYear();
  const targetMonth = date.getUTCMonth() - months;
  const targetMonthDays = new Date(
    Date.UTC(targetYear, targetMonth + 1, 0),
  ).getUTCDate();
  const targetDay = Math.min(date.getUTCDate(), targetMonthDays);

  return new Date(Date.UTC(targetYear, targetMonth, targetDay))
    .toISOString()
    .slice(0, 10);
}

function addRelativeDateOffset(
  baseDate: Date,
  amount: number,
  unit: 'DAYS' | 'WEEKS',
): string {
  const offsetDays = unit === 'WEEKS' ? amount * 7 : amount;
  const startOfBaseDate = Date.UTC(
    baseDate.getUTCFullYear(),
    baseDate.getUTCMonth(),
    baseDate.getUTCDate(),
  );
  const result = new Date(startOfBaseDate + offsetDays * 24 * 60 * 60 * 1000);

  return result.toISOString().slice(0, 10);
}

function normalizeAiExtractionResultForValidation(result: unknown): unknown {
  if (!isRecord(result)) {
    return result;
  }

  const normalizedDocumentDate = normalizeDocumentDateForValidation(
    result.documentDate,
  );
  const calendarEvents = Array.isArray(result.calendarEvents)
    ? result.calendarEvents.filter(
        (event) =>
          isRecord(event) &&
          (hasTextValue(event.date) || isRecord(event.relativeDate)),
      )
    : result.calendarEvents;

  if (
    normalizedDocumentDate === result.documentDate &&
    calendarEvents === result.calendarEvents
  ) {
    return result;
  }

  return {
    ...result,
    documentDate: normalizedDocumentDate,
    calendarEvents,
  };
}

function takePaymentDueDateCalendarEvent(
  events: readonly ResolvedAiCalendarEvent[],
  payment: Pick<NormalizedPaymentEntry, 'dueDate' | 'dueDateSourceText'>,
): {
  readonly event: ResolvedAiCalendarEvent | null;
  readonly remainingEvents: ResolvedAiCalendarEvent[];
} {
  if (!payment.dueDate) {
    return { event: null, remainingEvents: [...events] };
  }

  const matchingPaymentDueDate = (event: ResolvedAiCalendarEvent) =>
    event.kind === 'DUE_DATE' && event.date === payment.dueDate;
  const exactSourceTextIndex = payment.dueDateSourceText
    ? events.findIndex(
        (event) =>
          matchingPaymentDueDate(event) &&
          normalizedText(event.sourceText) ===
            normalizedText(payment.dueDateSourceText),
      )
    : -1;
  const matchingIndex =
    exactSourceTextIndex >= 0
      ? exactSourceTextIndex
      : events.findIndex(matchingPaymentDueDate);

  if (matchingIndex < 0) {
    return { event: null, remainingEvents: [...events] };
  }

  return {
    event: events[matchingIndex],
    remainingEvents: events.filter((_, index) => index !== matchingIndex),
  };
}

function normalizedText(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? '';
}

function normalizeDocumentDateForValidation(value: unknown): unknown {
  if (!hasTextValue(value)) {
    return value;
  }

  const trimmed = value.trim();
  const germanDateTime = trimmed.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})(T.+)$/);
  if (germanDateTime) {
    return `${germanDateTime[3]}-${padDatePart(germanDateTime[2])}-${padDatePart(
      germanDateTime[1],
    )}${ensureDateTimeOffset(germanDateTime[4])}`;
  }

  const isoDate = trimmed.match(/^(\d{4}-\d{2}-\d{2})$/);
  if (isoDate) {
    return `${isoDate[1]}T00:00:00.000Z`;
  }

  const germanDate = trimmed.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (germanDate) {
    return `${germanDate[3]}-${padDatePart(germanDate[2])}-${padDatePart(
      germanDate[1],
    )}T00:00:00.000Z`;
  }

  if (/^\d{4}-\d{2}-\d{2}T.+$/.test(trimmed)) {
    return ensureDateTimeOffset(trimmed);
  }

  return trimmed;
}

function ensureDateTimeOffset(value: string): string {
  return /(?:Z|[+-]\d{2}:\d{2})$/.test(value) ? value : `${value}Z`;
}

function padDatePart(value: string): string {
  return value.padStart(2, '0');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function hasTextValue(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function displayAiDocumentTitle(
  document:
    | { readonly title: string | null; readonly originalFileName: string }
    | null
    | undefined,
): string {
  return document?.title?.trim() || document?.originalFileName || 'Dokument';
}
