import type {
  Document,
  DocumentAttribute,
  DocumentCalendarEvent,
  DocumentFieldDefinition,
  DocumentFieldDefinitionScope,
  DocumentPayment,
  DocumentReference,
  DocumentType,
  DocumentTag,
  FileArtifact,
  Tag,
  Tenant,
  User,
} from '@prisma/client';
import type {
  CalendarEventKind,
  DocumentAttributeDto,
  DocumentDetailDto,
  DocumentFieldDefinitionDto,
  DocumentPaymentDto,
  DocumentReferenceDto,
  DocumentEntrySource,
  DocumentSummaryDto,
  DocumentTagDto,
  DocumentTypeDto,
  FileArtifactDto,
  TagDto,
} from '@smart-dms/shared-dto';
import { toIsoDate, toIsoDateTime } from '../common/date-mapper';
import { StorageService } from '../storage/storage.service';
import { toDocumentCalendarEventDto } from '../calendar/calendar.mapper';
import { toTenantSummaryDto } from '../tenants/tenant.mapper';

export type DocumentWithSummaryRelations = Omit<Document, 'title'> & {
  title: string | null;
  titleSource?: DocumentEntrySource;
  documentTypeSource?: DocumentEntrySource;
  documentDateSource?: DocumentEntrySource;
  senderSource?: DocumentEntrySource;
  tenant: Pick<Tenant, 'id' | 'key' | 'name' | 'isActive'>;
  documentType: DocumentType | null;
  tags: Array<DocumentTag & { tag: Tag }>;
  calendarEvents: Array<Pick<DocumentCalendarEvent, 'kind'>>;
};

export type DocumentWithDetailRelations = Omit<
  DocumentWithSummaryRelations,
  'calendarEvents'
> & {
  attributes: Array<
    DocumentAttribute & { fieldDefinition: DocumentFieldDefinition | null }
  >;
  payments: Array<
    DocumentPayment & {
      assignedTo?: Pick<User, 'id' | 'username' | 'displayName'> | null;
      calendarEvents?: Array<
        Pick<DocumentCalendarEvent, 'id' | 'date' | 'kind' | 'completedAt'>
      >;
    }
  >;
  references: DocumentReference[];
  artifacts: FileArtifact[];
  calendarEvents: DocumentCalendarEvent[];
};

export type DocumentFieldDefinitionWithScopes = DocumentFieldDefinition & {
  documentTypes: DocumentFieldDefinitionScope[];
};

export function toDocumentSummaryDto(
  document: DocumentWithSummaryRelations,
  storage: StorageService,
): DocumentSummaryDto {
  return {
    id: document.id,
    tenant: toTenantSummaryDto(document.tenant),
    title: document.title,
    displayTitle: documentDisplayTitle(document),
    documentType: document.documentType
      ? toDocumentTypeDto(document.documentType)
      : null,
    originalFileName: document.originalFileName,
    source: document.source,
    mimeType: document.mimeType,
    status: document.status,
    createdAt: toIsoDateTime(document.createdAt),
    updatedAt: toIsoDateTime(document.updatedAt),
    acceptedAt: toIsoDateTime(document.acceptedAt),
    acceptedById: document.acceptedById,
    aiProcessedAt: toIsoDateTime(document.aiProcessedAt),
    aiDeferredByEditLock:
      (document as { aiDeferredByEditLock?: boolean }).aiDeferredByEditLock ??
      false,
    documentDate: toIsoDateTime(document.documentDate),
    summary: document.summary,
    sender: document.sender,
    recipient: document.recipient,
    note: document.note,
    fileSize: document.fileSize,
    pageCount: document.pageCount,
    tags: document.tags.map(toDocumentTagDto),
    thumbnailUrl: document.thumbnailPath
      ? storage.documentThumbnailUrl(document.id)
      : null,
    calendarEventKinds: distinctCalendarEventKinds(document.calendarEvents),
    metadataSources: {
      title: document.titleSource ?? metadataSourceForText(document.title),
      documentType:
        document.documentTypeSource ??
        metadataSourceForNullable(document.documentType),
      documentDate:
        document.documentDateSource ??
        metadataSourceForNullable(document.documentDate),
      sender: document.senderSource ?? metadataSourceForText(document.sender),
    },
  };
}

export function documentDisplayTitle(
  document: Pick<DocumentWithSummaryRelations, 'title' | 'originalFileName'>,
): string {
  return document.title?.trim() || document.originalFileName;
}

function metadataSourceForText(value: string | null): DocumentEntrySource {
  return value?.trim() ? 'MANUAL' : 'AI_EXTRACTED';
}

function metadataSourceForNullable(value: unknown): DocumentEntrySource {
  return value === null ? 'AI_EXTRACTED' : 'MANUAL';
}

const CALENDAR_EVENT_KIND_ORDER: readonly CalendarEventKind[] = [
  'DEADLINE',
  'DUE_DATE',
  'APPOINTMENT',
];

function distinctCalendarEventKinds(
  events: Array<Pick<DocumentCalendarEvent, 'kind'>>,
): CalendarEventKind[] {
  const present = new Set(events.map((event) => event.kind));
  return CALENDAR_EVENT_KIND_ORDER.filter((kind) => present.has(kind));
}

export function toDocumentDetailDto(
  document: DocumentWithDetailRelations,
  storage: StorageService,
  fieldDefinitions: DocumentFieldDefinitionWithScopes[] = [],
  documentTypes: DocumentType[] = [],
): DocumentDetailDto {
  return {
    ...toDocumentSummaryDto(document, storage),
    ocrText: document.ocrText,
    failedReason: document.failedReason,
    pdfUrl: document.pdfPath ? storage.documentPdfUrl(document.id) : null,
    attributes: document.attributes.map(toDocumentAttributeDto),
    payments: document.payments.map(toDocumentPaymentDto),
    references: document.references.map(toDocumentReferenceDto),
    fieldDefinitions: fieldDefinitions.map(toDocumentFieldDefinitionDto),
    documentTypes: documentTypes.map(toDocumentTypeDto),
    artifacts: document.artifacts.map((artifact) =>
      toFileArtifactDto(artifact, document.id, storage),
    ),
    calendarEvents: document.calendarEvents.map((event) =>
      toDocumentCalendarEventDto(event, document.sender, document.tenant),
    ),
  };
}

export function toDocumentTypeDto(documentType: DocumentType): DocumentTypeDto {
  return {
    id: documentType.id,
    key: documentType.key,
    name: documentType.name,
    active: documentType.active,
    isSystem: documentType.isSystem,
    displayOrder: documentType.displayOrder,
    createdAt: toIsoDateTime(documentType.createdAt),
    updatedAt: toIsoDateTime(documentType.updatedAt),
  };
}

export function toDocumentFieldDefinitionDto(
  definition: DocumentFieldDefinitionWithScopes,
): DocumentFieldDefinitionDto {
  return {
    id: definition.id,
    key: definition.key,
    label: definition.label,
    valueType: definition.valueType,
    required: definition.required,
    active: definition.active,
    displayOrder: definition.displayOrder,
    appliesToAllDocumentTypes: definition.appliesToAllDocumentTypes,
    documentTypeIds: definition.documentTypes.map(
      (scope) => scope.documentTypeId,
    ),
    includeInFullTextSearch: definition.includeInFullTextSearch,
    includeInAiExtraction: definition.includeInAiExtraction,
    createdAt: toIsoDateTime(definition.createdAt),
    updatedAt: toIsoDateTime(definition.updatedAt),
  };
}

export function toTagDto(tag: Tag): TagDto {
  return {
    id: tag.id,
    name: tag.name,
    createdAt: toIsoDateTime(tag.createdAt),
    createdBy: tag.createdBy,
  };
}

function toDocumentTagDto(entry: DocumentTag & { tag: Tag }): DocumentTagDto {
  return {
    ...toTagDto(entry.tag),
    source: entry.source,
  };
}

function toDocumentAttributeDto(
  attribute: DocumentAttribute & {
    fieldDefinition?: DocumentFieldDefinition | null;
  },
): DocumentAttributeDto {
  return {
    id: attribute.id,
    fieldDefinitionId: attribute.fieldDefinitionId,
    key: attribute.key,
    label: attribute.fieldDefinition?.label ?? null,
    value: parseAttributeValue(attribute.value, attribute.valueType),
    valueType: attribute.valueType,
    source: attribute.source,
    createdAt: toIsoDateTime(attribute.createdAt),
    updatedAt: toIsoDateTime(attribute.updatedAt),
  };
}

function toDocumentPaymentDto(
  payment: DocumentPayment & {
    assignedTo?: Pick<User, 'id' | 'username' | 'displayName'> | null;
    calendarEvents?: Array<
      Pick<DocumentCalendarEvent, 'id' | 'date' | 'kind' | 'completedAt'>
    >;
  },
): DocumentPaymentDto {
  const dueDateEvent = payment.calendarEvents?.find(
    (event) => event.kind === 'DUE_DATE',
  );
  return {
    id: payment.id,
    iban: payment.iban,
    recipient: payment.recipient,
    purpose: payment.purpose,
    amount: payment.amount === null ? null : Number(payment.amount),
    currency: payment.currency,
    status: payment.status,
    paidAt: toIsoDateTime(payment.paidAt),
    paidById: payment.paidById,
    assignedToId: payment.assignedToId,
    assignedTo: payment.assignedTo
      ? toUserAssigneeDto(payment.assignedTo)
      : null,
    assignedAt: toIsoDateTime(payment.assignedAt),
    dueDate: toIsoDate(dueDateEvent?.date),
    dueDateEventId: dueDateEvent?.id ?? null,
    source: payment.source,
    displayOrder: payment.displayOrder,
    createdAt: toIsoDateTime(payment.createdAt),
    updatedAt: toIsoDateTime(payment.updatedAt),
  };
}

function toUserAssigneeDto(
  user: Pick<User, 'id' | 'username' | 'displayName'>,
) {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
  };
}

function toDocumentReferenceDto(
  reference: DocumentReference,
): DocumentReferenceDto {
  return {
    id: reference.id,
    referenceNumber: reference.referenceNumber,
    referenceType: reference.referenceType,
    source: reference.source,
    displayOrder: reference.displayOrder,
    createdAt: toIsoDateTime(reference.createdAt),
    updatedAt: toIsoDateTime(reference.updatedAt),
  };
}

function toFileArtifactDto(
  artifact: FileArtifact,
  documentId: string,
  storage: StorageService,
): FileArtifactDto {
  return {
    id: artifact.id,
    artifactType: artifact.artifactType,
    mimeType: artifact.mimeType,
    size: artifact.size,
    checksum: artifact.checksum,
    url:
      artifact.artifactType === 'FINAL_PDF'
        ? storage.documentPdfUrl(documentId)
        : artifact.artifactType === 'THUMBNAIL'
          ? storage.documentThumbnailUrl(documentId)
          : undefined,
    createdAt: toIsoDateTime(artifact.createdAt),
  };
}

function parseAttributeValue(
  value: string,
  valueType: DocumentAttribute['valueType'],
): string | number | boolean {
  if (valueType === 'NUMBER') {
    return Number(value);
  }

  if (valueType === 'BOOLEAN') {
    return value === 'true';
  }

  return value;
}
