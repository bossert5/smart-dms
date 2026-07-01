import type {
  CalendarEventKind,
  DocumentAttributeValueType,
  DocumentDetailDto,
  DocumentMetadataUpdateRequest,
  DocumentPaymentStatus,
  UpdateDocumentTagsRequest,
} from '@smart-dms/shared-dto';
import { dateInputValue, nullableIsoDateTime } from '../../shared/formatters/date.formatter';

export interface DocumentDetailFormValue {
  readonly title: string;
  readonly documentTypeId: string;
  readonly documentDate: string;
  readonly summary: string;
  readonly sender: string;
  readonly recipient: string;
  readonly note: string;
  readonly payments: DocumentPaymentFormValue[];
  readonly calendarEvents: DocumentCalendarEventFormValue[];
  readonly references: DocumentReferenceFormValue[];
  readonly attributes: DocumentAttributeFormValue[];
  readonly tagText: string;
}

export interface DocumentPaymentFormValue {
  readonly id: string;
  readonly iban: string;
  readonly recipient: string;
  readonly purpose: string;
  readonly amount: number | null;
  readonly currency: string;
  readonly status?: DocumentPaymentStatus;
  readonly paidAt?: string | null;
  readonly assignedToId?: string;
  readonly dueDate?: string | null;
}

export interface DocumentCalendarEventFormValue {
  readonly id: string;
  readonly kind: CalendarEventKind;
  readonly title: string;
  readonly description: string;
  readonly date: string;
  readonly time: string;
  readonly endDate: string;
  readonly endTime: string;
  readonly sourceText: string;
  readonly assignedToId?: string;
  readonly completedAt?: string | null;
}

export interface DocumentReferenceFormValue {
  readonly id: string;
  readonly referenceNumber: string;
  readonly referenceType: string;
}

export interface DocumentAttributeFormValue {
  readonly fieldDefinitionId: string | null;
  readonly key: string;
  readonly value: string;
  readonly valueType: DocumentAttributeValueType;
}

export function documentMetadataFormValue(document: DocumentDetailDto): DocumentDetailFormValue {
  return {
    title: document.title ?? '',
    documentTypeId: document.documentType?.id ?? '',
    documentDate: dateInputValue(document.documentDate),
    summary: document.summary ?? '',
    sender: document.sender ?? '',
    recipient: document.recipient ?? '',
    note: document.note ?? '',
    payments: document.payments.map((payment) => ({
      id: payment.id,
      iban: payment.iban ?? '',
      recipient: payment.recipient ?? '',
      purpose: payment.purpose ?? '',
      amount: payment.amount,
      currency: payment.currency ?? 'EUR',
      status: payment.status,
      paidAt: payment.paidAt,
      assignedToId: payment.assignedToId ?? '',
      dueDate: payment.dueDate ?? '',
    })),
    calendarEvents: document.calendarEvents
      .filter((event) => !event.paymentId)
      .map((event) => ({
        id: event.id,
        kind: event.kind,
        title: event.title,
        description: event.description ?? '',
        date: dateInputValue(event.date),
        time: event.time ?? '',
        endDate: dateInputValue(event.endDate),
        endTime: event.endTime ?? '',
        sourceText: event.sourceText ?? '',
        assignedToId: event.assignedToId ?? '',
        completedAt: event.completedAt ?? null,
      })),
    references: document.references.map((reference) => ({
      id: reference.id,
      referenceNumber: reference.referenceNumber,
      referenceType: reference.referenceType,
    })),
    attributes: document.fieldDefinitions.map((definition) => {
      const value = document.attributes.find((attribute) => attribute.key === definition.key);
      return {
        fieldDefinitionId: definition.id,
        key: definition.key,
        value: value ? String(value.value) : '',
        valueType: definition.valueType,
      };
    }),
    tagText: document.tags.map((tag) => tag.name).join(', '),
  };
}

export function metadataUpdateRequest(
  value: DocumentDetailFormValue,
): DocumentMetadataUpdateRequest {
  return {
    title: nullableText(value.title),
    documentTypeId: value.documentTypeId || null,
    documentDate: nullableIsoDateTime(value.documentDate),
    summary: nullableText(value.summary),
    sender: nullableText(value.sender),
    recipient: nullableText(value.recipient),
    note: nullableText(value.note),
    payments: value.payments
      .map((payment) => ({
        id: payment.id || undefined,
        iban: nullableText(payment.iban),
        recipient: nullableText(payment.recipient),
        purpose: nullableText(payment.purpose),
        amount: payment.amount,
        currency: nullableText(payment.currency) ?? 'EUR',
        status: payment.status ?? 'OPEN',
        paidAt: payment.paidAt ?? null,
        dueDate: nullableText(payment.dueDate ?? ''),
      }))
      .filter(
        (payment) =>
          payment.iban ||
          payment.recipient ||
          payment.purpose ||
          payment.amount !== null ||
          payment.dueDate,
      ),
    calendarEvents: value.calendarEvents
      .map((event) => ({
        id: event.id || undefined,
        kind: event.kind,
        title: event.title.trim(),
        description: nullableText(event.description),
        date: event.date.trim(),
        time: nullableText(event.time),
        endDate: nullableText(event.endDate),
        endTime: nullableText(event.endTime),
        sourceText: nullableText(event.sourceText),
      }))
      .filter((event) => event.title && event.date),
    references: value.references
      .map((reference) => ({
        id: reference.id || undefined,
        referenceNumber: reference.referenceNumber.trim(),
        referenceType: reference.referenceType.trim(),
      }))
      .filter((reference) => reference.referenceNumber && reference.referenceType),
    attributes: value.attributes
      .filter((attribute) => attribute.value.trim() !== '')
      .map((attribute) => ({
        fieldDefinitionId: attribute.fieldDefinitionId,
        key: attribute.key,
        value: typedAttributeValue(attribute.value, attribute.valueType),
        valueType: attribute.valueType,
      })),
  };
}

export function tagsUpdateRequest(value: string): UpdateDocumentTagsRequest {
  return {
    tags: uniqueTags(value),
  };
}

function nullableText(value: string): string | null {
  const trimmedValue = value.trim();
  return trimmedValue || null;
}

function typedAttributeValue(
  value: string,
  valueType: DocumentAttributeValueType,
): string | number | boolean {
  if (valueType === 'NUMBER') {
    return Number(value);
  }

  if (valueType === 'BOOLEAN') {
    return value === 'true';
  }

  return value.trim();
}

function uniqueTags(value: string): string[] {
  return [
    ...new Set(
      value
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean),
    ),
  ];
}
