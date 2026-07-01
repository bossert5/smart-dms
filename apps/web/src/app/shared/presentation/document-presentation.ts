import type {
  DocumentAttributeValueType,
  DocumentSearchSortBy,
  DocumentSource,
  DocumentStatus,
  DocumentSummaryDto,
  DocumentTypeDto,
} from '@smart-dms/shared-dto';

export const DOCUMENT_STATUSES = [
  'NEW',
  'INGESTING',
  'OCR_PENDING',
  'OCR_RUNNING',
  'READY',
  'AI_PENDING',
  'AI_RUNNING',
  'FAILED',
  'ARCHIVED',
] as const satisfies readonly DocumentStatus[];

export const DOCUMENT_SOURCES = ['UPLOAD', 'SCANNER', 'EMAIL'] as const satisfies readonly DocumentSource[];

export interface DocumentSortOption {
  readonly value: DocumentSearchSortBy;
  readonly labelKey: string;
}

export const DOCUMENT_SORT_OPTIONS: readonly DocumentSortOption[] = [
  { value: 'relevance', labelKey: 'documents.sort.relevance' },
  { value: 'createdAt', labelKey: 'documents.sort.createdAt' },
  { value: 'updatedAt', labelKey: 'documents.sort.updatedAt' },
  { value: 'documentDate', labelKey: 'documents.sort.documentDate' },
  { value: 'title', labelKey: 'documents.sort.title' },
  { value: 'status', labelKey: 'documents.sort.status' },
  { value: 'documentType', labelKey: 'documents.sort.documentType' },
  { value: 'sender', labelKey: 'documents.sort.sender' },
];

const DOCUMENT_STATUS_COLORS: Record<DocumentStatus, string> = {
  NEW: 'blue',
  INGESTING: 'blue',
  OCR_PENDING: 'blue',
  OCR_RUNNING: 'blue',
  READY: 'green',
  AI_PENDING: 'purple',
  AI_RUNNING: 'purple',
  FAILED: 'red',
  ARCHIVED: 'default',
};

const DOCUMENT_STATUS_ICONS: Record<DocumentStatus, string> = {
  NEW: 'inbox',
  INGESTING: 'cloud-upload',
  OCR_PENDING: 'clock-circle',
  OCR_RUNNING: 'scan',
  READY: 'check-circle',
  AI_PENDING: 'clock-circle',
  AI_RUNNING: 'sync',
  FAILED: 'close-circle',
  ARCHIVED: 'inbox',
};

export function documentStatusColor(status: DocumentStatus): string {
  return DOCUMENT_STATUS_COLORS[status];
}

export function documentStatusIcon(status: DocumentStatus): string {
  return DOCUMENT_STATUS_ICONS[status];
}

export function documentStatusLabelKey(status: DocumentStatus): string {
  return `enums.documentStatus.${status}`;
}

export type DocumentAiIndicator = 'PROCESSED' | 'IN_PROGRESS' | 'QUEUED' | 'NOT_PROCESSED' | 'NONE';

export function documentAiIndicator(
  document: Pick<DocumentSummaryDto, 'status' | 'aiProcessedAt'>,
): DocumentAiIndicator {
  if (document.status === 'AI_RUNNING') {
    return 'IN_PROGRESS';
  }
  if (document.status === 'AI_PENDING') {
    return 'QUEUED';
  }
  if (document.aiProcessedAt !== null) {
    return 'PROCESSED';
  }
  if (document.status === 'READY') {
    return 'NOT_PROCESSED';
  }
  return 'NONE';
}

export function documentAiIndicatorLabelKey(indicator: DocumentAiIndicator): string {
  return `documents.ai.${indicator}`;
}

export function documentSourceLabelKey(source: DocumentSource): string {
  return `enums.documentSource.${source}`;
}

export function documentAttributeValueTypeLabelKey(valueType: DocumentAttributeValueType): string {
  return `enums.documentAttributeValueType.${valueType}`;
}

export function documentTypeSystemLabelKey(documentType: Pick<DocumentTypeDto, 'key'>): string {
  return `settings.documents.systemDocumentTypes.${documentType.key}`;
}

export function documentTypeDisplayName(
  documentType: Pick<DocumentTypeDto, 'isSystem' | 'key' | 'name'>,
  translate: (key: string) => string,
): string {
  if (!documentType.isSystem) {
    return documentType.name;
  }

  const labelKey = documentTypeSystemLabelKey(documentType);
  const translatedName = translate(labelKey);
  return translatedName && translatedName !== labelKey ? translatedName : documentType.name;
}
