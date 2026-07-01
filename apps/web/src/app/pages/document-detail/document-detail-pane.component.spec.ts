import { Component, input, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import {
  CloseOutline,
  CheckCircleOutline,
  CopyOutline,
  DeleteOutline,
  DownOutline,
  DownloadOutline,
  EditOutline,
  FileTextOutline,
  CheckSquareOutline,
  FolderOpenOutline,
  FolderOutline,
  InboxOutline,
  LeftOutline,
  PlusOutline,
  PushpinOutline,
  SaveOutline,
  SyncOutline,
  TeamOutline,
  UndoOutline,
} from '@ant-design/icons-angular/icons';
import type { DocumentDetailDto, DocumentHistoryResponse } from '@smart-dms/shared-dto';
import { provideNzIcons } from 'ng-zorro-antd/icon';
import { of, throwError } from 'rxjs';
import { AuthenticatedAssetService } from '../../core/api/authenticated-asset.service';
import { AiApiService } from '../../core/api/ai-api.service';
import { DocumentApiService } from '../../core/api/document-api.service';
import { TenantApiService } from '../../core/api/tenant-api.service';
import { LanguageService } from '../../core/i18n/language.service';
import { AuthService } from '../../core/services/auth.service';
import { EditLockService } from '../../core/services/edit-lock.service';
import { OpenDocumentsService } from '../../core/services/open-documents.service';
import { RealtimeClientService } from '../../core/services/realtime-client.service';
import { provideI18nTesting } from '../../testing/i18n-testing';
import { DocumentDetailPaneComponent } from './document-detail-pane.component';
import { PdfDocumentViewerComponent } from './pdf-document-viewer.component';

@Component({
  selector: 'app-pdf-document-viewer',
  template: '<section class="fake-pdf-viewer"></section>',
})
class FakePdfDocumentViewerComponent {
  readonly src = input<string | null>(null);
  readonly title = input('');
}

const documentId = '018f1a44-9093-7f55-a515-278f4d9bd99f';
const secondDocumentId = '018f1a44-9093-7f55-a515-278f4d9bd9aa';
const now = '2026-05-08T09:00:00.000Z';
const tenant = {
  id: '00000000-0000-4000-8000-000000000010',
  key: 'default',
  name: 'Default',
  isActive: true,
};
const targetTenant = {
  id: '00000000-0000-4000-8000-000000000011',
  key: 'target',
  name: 'Target',
  isActive: true,
};

const documentDetail: DocumentDetailDto = {
  id: documentId,
  title: 'Invoice',
  tenant,
  documentType: null,
  originalFileName: 'invoice.pdf',
  source: 'UPLOAD',
  mimeType: 'application/pdf',
  status: 'READY',
  createdAt: now,
  updatedAt: '2026-05-08T09:05:00.000Z',
  acceptedAt: now,
  acceptedById: null,
  aiProcessedAt: null,
  documentDate: null,
  summary: null,
  sender: null,
  recipient: null,
  note: null,
  fileSize: 1234,
  pageCount: 1,
  tags: [],
  thumbnailUrl: null,
  calendarEventKinds: [],
  ocrText: null,
  failedReason: null,
  pdfUrl: null,
  attributes: [],
  payments: [],
  references: [],
  fieldDefinitions: [],
  documentTypes: [
    {
      id: '018f1a44-9093-7f55-a515-278f4d9bd998',
      key: 'invoice',
      name: 'Rechnung',
      active: true,
      isSystem: true,
      displayOrder: 10,
      createdAt: now,
      updatedAt: now,
    },
  ],
  artifacts: [],
  calendarEvents: [],
};

const documentCalendarEvent: DocumentDetailDto['calendarEvents'][number] = {
  id: '018f1a44-9093-7f55-a515-278f4d9bd9c0',
  documentId,
  tenant,
  documentSender: 'Sender GmbH',
  kind: 'APPOINTMENT',
  title: 'Consultation',
  description: null,
  date: '2026-05-12',
  time: '14:30',
  endDate: null,
  endTime: null,
  source: 'AI_EXTRACTED',
  sourceText: null,
  createdAt: now,
  updatedAt: now,
};

const documentTag: DocumentDetailDto['tags'][number] = {
  id: '018f1a44-9093-7f55-a515-278f4d9bd9d0',
  name: 'finance',
  createdAt: now,
  createdBy: null,
  source: 'AI_EXTRACTED',
};

const historyResponse: DocumentHistoryResponse = {
  items: [
    {
      id: '018f1a44-9093-7f55-a515-278f4d9bd990',
      documentId,
      type: 'DOCUMENT_METADATA_UPDATED',
      summary: 'Metadata changed.',
      actor: {
        id: '018f1a44-9093-7f55-a515-278f4d9bd991',
        username: 'admin',
        displayName: 'Admin',
      },
      changes: [
        {
          field: 'title',
          label: 'Titel',
          oldValue: 'Alt',
          newValue: 'Neu',
        },
      ],
      metadata: { status: 'READY' },
      createdAt: '2026-05-08T10:00:00.000Z',
    },
  ],
  meta: {
    page: 1,
    pageSize: 100,
    totalItems: 1,
    totalPages: 1,
  },
};

function documentWith(id: string, title: string): DocumentDetailDto {
  return { ...documentDetail, id, title };
}

function documentApiForDetail(
  detail: DocumentDetailDto,
  overrides: Record<string, ReturnType<typeof vi.fn>> = {},
) {
  return {
    detail: vi.fn().mockReturnValue(of(detail)),
    history: vi.fn().mockReturnValue(of(historyResponse)),
    updateMetadata: vi.fn().mockReturnValue(of(detail)),
    updateTags: vi.fn().mockReturnValue(of(detail)),
    updatePaymentTask: vi.fn().mockReturnValue(of(detail)),
    updateCalendarEventTask: vi.fn().mockReturnValue(of(detail)),
    archive: vi.fn().mockReturnValue(of(undefined)),
    acceptInboxDocument: vi.fn().mockReturnValue(of({ acceptedCount: 1, documents: [] })),
    moveToInbox: vi.fn().mockReturnValue(of({ document: { ...detail, acceptedAt: null } })),
    moveToTenant: vi
      .fn()
      .mockReturnValue(of({ document: { ...detail, tenant: targetTenant, acceptedAt: null } })),
    delete: vi.fn().mockReturnValue(of({ deleted: true, documentId: detail.id })),
    reprocess: vi
      .fn()
      .mockReturnValue(of({ documentId: detail.id, jobId: detail.id, status: 'OCR_PENDING' })),
    triggerAiExtraction: vi
      .fn()
      .mockReturnValue(
        of({ documentId: detail.id, jobId: detail.id, status: 'AI_PENDING', queuePosition: 1 }),
      ),
    triggerScopedAiExtraction: vi
      .fn()
      .mockReturnValue(
        of({ documentId: detail.id, jobId: detail.id, status: 'AI_PENDING', queuePosition: 1 }),
      ),
    ...overrides,
  };
}

async function createComponent(options?: {
  readonly documentsApi?: {
    readonly detail: ReturnType<typeof vi.fn>;
    readonly history: ReturnType<typeof vi.fn>;
    readonly updateMetadata: ReturnType<typeof vi.fn>;
    readonly updateTags: ReturnType<typeof vi.fn>;
    readonly updatePaymentTask?: ReturnType<typeof vi.fn>;
    readonly updateCalendarEventTask?: ReturnType<typeof vi.fn>;
    readonly archive: ReturnType<typeof vi.fn>;
    readonly acceptInboxDocument?: ReturnType<typeof vi.fn>;
    readonly moveToInbox?: ReturnType<typeof vi.fn>;
    readonly moveToTenant?: ReturnType<typeof vi.fn>;
    readonly delete?: ReturnType<typeof vi.fn>;
    readonly reprocess: ReturnType<typeof vi.fn>;
    readonly triggerAiExtraction: ReturnType<typeof vi.fn>;
    readonly triggerScopedAiExtraction: ReturnType<typeof vi.fn>;
  };
  readonly tenantsApi?: {
    readonly listActive: ReturnType<typeof vi.fn>;
  };
  readonly auth?: {
    readonly canEditDocuments: () => boolean;
    readonly isAdmin: () => boolean;
  };
  readonly assets?: {
    readonly loadObjectUrl: ReturnType<typeof vi.fn>;
    readonly revokeObjectUrl: ReturnType<typeof vi.fn>;
  };
  readonly documentId?: string;
  readonly backLink?: string;
  readonly locale?: string;
  readonly openDocumentIds?: readonly string[];
}) {
  const initialDocumentId = options?.documentId ?? documentId;
  const openDocumentIds = signal(options?.openDocumentIds ?? []);
  const documentsApi = options?.documentsApi ?? {
    detail: vi.fn().mockReturnValue(of(documentDetail)),
    history: vi.fn().mockReturnValue(of(historyResponse)),
    updateMetadata: vi.fn().mockReturnValue(of(documentDetail)),
    updateTags: vi.fn().mockReturnValue(of(documentDetail)),
    updatePaymentTask: vi.fn().mockReturnValue(of(documentDetail)),
    updateCalendarEventTask: vi.fn().mockReturnValue(of(documentDetail)),
    archive: vi.fn().mockReturnValue(of(undefined)),
    acceptInboxDocument: vi.fn().mockReturnValue(of({ acceptedCount: 1, documents: [] })),
    moveToInbox: vi.fn().mockReturnValue(of({ document: { ...documentDetail, acceptedAt: null } })),
    moveToTenant: vi
      .fn()
      .mockReturnValue(of({ document: { ...documentDetail, tenant: targetTenant, acceptedAt: null } })),
    delete: vi.fn().mockReturnValue(of({ deleted: true, documentId })),
    reprocess: vi
      .fn()
      .mockReturnValue(of({ documentId, jobId: documentId, status: 'OCR_PENDING' })),
    triggerAiExtraction: vi
      .fn()
      .mockReturnValue(
        of({ documentId, jobId: documentId, status: 'AI_PENDING', queuePosition: 1 }),
      ),
    triggerScopedAiExtraction: vi
      .fn()
      .mockReturnValue(
        of({ documentId, jobId: documentId, status: 'AI_PENDING', queuePosition: 1 }),
      ),
  };
  const assets = options?.assets ?? {
    loadObjectUrl: vi.fn(),
    revokeObjectUrl: vi.fn(),
  };
  const auth = options?.auth ?? {
    canEditDocuments: () => true,
    isAdmin: () => true,
  };
  const tenantsApi = options?.tenantsApi ?? {
    listActive: vi.fn().mockReturnValue(of([tenant, targetTenant])),
  };
  const editLocks = {
    acquire: vi.fn().mockReturnValue(
      of({
        lock: {
          id: '018f1a44-9093-7f55-a515-278f4d9bd911',
          scope: 'DOCUMENT',
          resourceId: initialDocumentId,
          ownerUserId: '00000000-0000-4000-8000-000000000001',
          ownerDisplayName: 'Admin',
          clientId: 'client-id',
          socketId: 'socket-id',
          expiresAt: '2026-05-07T18:05:00.000Z',
          createdAt: '2026-05-07T18:00:00.000Z',
        },
      }),
    ),
    releaseBeforeUnload: vi.fn(),
    releaseBestEffort: vi.fn(),
    startHeartbeat: vi.fn().mockReturnValue({ unsubscribe: vi.fn() }),
  };
  const openDocuments = {
    open: vi.fn(),
    close: vi.fn().mockReturnValue(null),
    isOpen: vi.fn((id: string) => openDocumentIds().includes(id)),
    updateTitleIfOpen: vi.fn(),
  };

  await TestBed.configureTestingModule({
    imports: [DocumentDetailPaneComponent],
    providers: [
      provideRouter([]),
      provideI18nTesting(),
      provideNzIcons([
        CloseOutline,
        CheckCircleOutline,
        CopyOutline,
        DeleteOutline,
        DownOutline,
        DownloadOutline,
        EditOutline,
        FileTextOutline,
        CheckSquareOutline,
        FolderOpenOutline,
        FolderOutline,
        InboxOutline,
        LeftOutline,
        PlusOutline,
        PushpinOutline,
        SaveOutline,
        SyncOutline,
        TeamOutline,
        UndoOutline,
      ]),
      {
        provide: AiApiService,
        useValue: {
          availability: vi.fn().mockReturnValue(of({ enabled: true, providers: [] })),
        },
      },
      {
        provide: DocumentApiService,
        useValue: documentsApi,
      },
      { provide: LanguageService, useValue: { currentLocale: signal(options?.locale ?? 'en-US') } },
      {
        provide: TenantApiService,
        useValue: tenantsApi,
      },
      {
        provide: AuthenticatedAssetService,
        useValue: assets,
      },
      {
        provide: AuthService,
        useValue: auth,
      },
      {
        provide: OpenDocumentsService,
        useValue: openDocuments,
      },
      {
        provide: RealtimeClientService,
        useValue: {
          isConnected: signal(true),
          latestDocumentChange: signal(null),
          latestEditLockChange: signal(null),
        },
      },
      {
        provide: EditLockService,
        useValue: editLocks,
      },
    ],
  })
    .overrideComponent(DocumentDetailPaneComponent, {
      remove: {
        imports: [PdfDocumentViewerComponent],
      },
      add: {
        imports: [FakePdfDocumentViewerComponent],
      },
    })
    .compileComponents();

  const fixture = TestBed.createComponent(DocumentDetailPaneComponent);
  fixture.componentRef.setInput('documentId', initialDocumentId);
  fixture.componentRef.setInput('isActive', true);
  fixture.componentRef.setInput('backLink', options?.backLink ?? '/documents');
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();

  return { assets, editLocks, fixture, documentsApi, openDocuments, tenantsApi };
}

describe('DocumentDetailPaneComponent', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('loads document history for the History tab without registering an open document', async () => {
    const { fixture, documentsApi, openDocuments } = await createComponent();

    expect(documentsApi.history).toHaveBeenCalledWith(documentId, 1, 100);
    expect(openDocuments.open).not.toHaveBeenCalled();
    expect(openDocuments.updateTitleIfOpen).toHaveBeenCalledWith({
      id: documentId,
      title: 'Invoice',
    });
    expect(fixture.componentInstance.historyItems()).toEqual(historyResponse.items);
    expect(fixture.componentInstance.historyTotalItems()).toBe(1);
    expect(fixture.componentInstance.documentTypeDisplayName(documentDetail.documentTypes[0])).toBe(
      'Invoice',
    );
    expect(fixture.nativeElement.textContent).toContain('History');
  });

  it('renders a back-to-list link for directly opened documents', async () => {
    const { fixture, openDocuments } = await createComponent();

    const backLink = fixture.nativeElement.querySelector(
      '[data-testid="document-back-link"]',
    ) as HTMLAnchorElement | null;

    expect(backLink?.textContent).toContain('Back to list');
    expect(backLink?.classList).toContain('navigation-button');
    expect(backLink?.classList).toContain('ant-btn-link');
    expect(fixture.nativeElement.querySelector('[data-testid="document-close-button"]')).toBeNull();
    expect(openDocuments.close).not.toHaveBeenCalled();
  });

  it('uses the provided back link for directly opened inbox documents', async () => {
    const { fixture } = await createComponent({ backLink: '/inbox' });

    const backLink = fixture.nativeElement.querySelector(
      '[data-testid="document-back-link"]',
    ) as HTMLAnchorElement | null;

    expect(backLink?.getAttribute('href')).toBe('/inbox');
  });

  it('shows accepted document actions right-aligned and removes file names from the page header', async () => {
    const pdfDocument = { ...documentDetail, pdfUrl: '/api/documents/doc-a/pdf' };
    const documentsApi = {
      detail: vi.fn().mockReturnValue(of(pdfDocument)),
      history: vi.fn().mockReturnValue(of(historyResponse)),
      updateMetadata: vi.fn().mockReturnValue(of(pdfDocument)),
      updateTags: vi.fn().mockReturnValue(of(pdfDocument)),
      archive: vi.fn().mockReturnValue(of(undefined)),
      acceptInboxDocument: vi.fn(),
      reprocess: vi.fn(),
      triggerAiExtraction: vi.fn(),
      triggerScopedAiExtraction: vi.fn(),
    };
    const assets = {
      loadObjectUrl: vi.fn().mockReturnValue(of('blob:http://localhost/doc-a')),
      revokeObjectUrl: vi.fn(),
    };
    const { fixture } = await createComponent({
      assets,
      documentsApi,
    });

    const header = fixture.nativeElement.querySelector('.page-header') as HTMLElement | null;
    const moveTrigger = fixture.nativeElement.querySelector(
      '[data-testid="document-actions-move-trigger"]',
    ) as HTMLButtonElement | null;
    const actionLabels = Array.from(
      fixture.nativeElement.querySelectorAll(
        '.action-row > button, .action-row > a',
      ) as NodeListOf<HTMLElement>,
    ).map((action) => action.textContent?.trim());

    expect(actionLabels).toEqual(['Pin', 'Edit', 'PDF', 'Move']);
    expect(header?.textContent).toContain('Edit');
    expect(header?.textContent).not.toContain('Start AI');
    expect(header?.textContent).toContain('Move');
    expect(header?.textContent).not.toContain('Reprocess');
    expect(header?.textContent).not.toContain('Archive');
    expect(header?.textContent).not.toContain('Invoice');
    expect(header?.textContent).not.toContain('invoice.pdf');
    expect(moveTrigger).not.toBeNull();
  });

  it('shows inbox actions for inbox documents', async () => {
    const inboxDocument = {
      ...documentDetail,
      acceptedAt: null,
      ocrText: 'Invoice OCR text',
      pdfUrl: '/api/documents/doc-a/pdf',
    };
    const documentsApi = {
      detail: vi.fn().mockReturnValue(of(inboxDocument)),
      history: vi.fn().mockReturnValue(of(historyResponse)),
      updateMetadata: vi.fn().mockReturnValue(of(inboxDocument)),
      updateTags: vi.fn().mockReturnValue(of(inboxDocument)),
      archive: vi.fn(),
      acceptInboxDocument: vi.fn().mockReturnValue(of({ acceptedCount: 1, documents: [] })),
      reprocess: vi
        .fn()
        .mockReturnValue(of({ documentId, jobId: documentId, status: 'OCR_PENDING' })),
      triggerAiExtraction: vi
        .fn()
        .mockReturnValue(
          of({ documentId, jobId: documentId, status: 'AI_PENDING', queuePosition: 1 }),
        ),
      triggerScopedAiExtraction: vi.fn(),
    };
    const assets = {
      loadObjectUrl: vi.fn().mockReturnValue(of('blob:http://localhost/doc-a')),
      revokeObjectUrl: vi.fn(),
    };
    const { fixture } = await createComponent({ assets, documentsApi });

    const header = fixture.nativeElement.querySelector('.page-header') as HTMLElement | null;
    const actionLabels = Array.from(
      fixture.nativeElement.querySelectorAll(
        '.action-row > button, .action-row > a',
      ) as NodeListOf<HTMLElement>,
    ).map((action) => action.textContent?.trim());

    expect(header?.textContent).toContain('Accept');
    expect(actionLabels).toEqual(['Change tenant', 'Edit', 'PDF', 'Accept']);
    expect(header?.textContent).not.toContain('Reprocess');
    expect(header?.textContent).not.toContain('Move');
    expect(header?.textContent).not.toContain('Pin');
    expect(
      fixture.nativeElement.querySelector('[data-testid="document-actions-accept"]'),
    ).not.toBeNull();
    expect(
      fixture.nativeElement.querySelector('[data-testid="document-actions-reprocess-trigger"]'),
    ).toBeNull();
    expect(
      fixture.nativeElement.querySelector('[data-testid="document-download-pdf-link"]'),
    ).not.toBeNull();
  });

  it('renders references in the Document tab and payments in a separate tab', async () => {
    const referencedDocument: DocumentDetailDto = {
      ...documentDetail,
      tags: [documentTag],
      payments: [
        {
          id: '018f1a44-9093-7f55-a515-278f4d9bd9e0',
          iban: 'DE02120300000000202051',
          recipient: 'Sender GmbH',
          purpose: 'Invoice 100',
          amount: 120.5,
          currency: 'EUR',
          status: 'OPEN',
          paidAt: null,
          paidById: null,
          dueDate: '2026-05-29',
          source: 'AI_EXTRACTED',
          displayOrder: 0,
          createdAt: now,
          updatedAt: now,
        },
      ],
      references: [
        {
          id: '018f1a44-9093-7f55-a515-278f4d9bd9f0',
          referenceNumber: 'INV-100',
          referenceType: 'Invoice number',
          source: 'AI_EXTRACTED',
          displayOrder: 0,
          createdAt: now,
          updatedAt: now,
        },
      ],
    };
    const documentsApi = {
      detail: vi.fn().mockReturnValue(of(referencedDocument)),
      history: vi.fn().mockReturnValue(of(historyResponse)),
      updateMetadata: vi.fn().mockReturnValue(of(referencedDocument)),
      updateTags: vi.fn().mockReturnValue(of(referencedDocument)),
      archive: vi.fn().mockReturnValue(of(undefined)),
      reprocess: vi.fn(),
      triggerAiExtraction: vi.fn(),
      triggerScopedAiExtraction: vi.fn(),
    };
    const { fixture } = await createComponent({ documentsApi, locale: 'de-DE' });

    const tabs = Array.from(
      fixture.nativeElement.querySelectorAll('[role="tab"]') as NodeListOf<HTMLElement>,
    );
    const tabLabels = tabs.map(
      (tab) =>
        tab.querySelector('.detail-tab-title__text')?.textContent?.trim() ??
        tab.textContent?.trim(),
    );

    expect(tabLabels).toEqual(['Document', 'Payments', 'Calendar', 'History']);
    expect(
      tabs.find((tab) => tab.textContent?.includes('History'))?.querySelector('nz-badge'),
    ).not.toBeNull();
    expect(
      tabs.find((tab) => tab.textContent?.includes('Payments'))?.querySelector('nz-badge'),
    ).not.toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Summary');
    expect(fixture.nativeElement.textContent).not.toContain('Document data');
    expect(fixture.nativeElement.textContent).not.toContain('Content and parties');
    expect(fixture.nativeElement.querySelector('#summary')).toBeNull();
    expect(fixture.nativeElement.querySelector('#note')).toBeNull();
    expect(fixture.nativeElement.querySelector('#references-heading-read')).toBeNull();
    expect(fixture.nativeElement.querySelector('#payments-heading-read')).toBeNull();

    const documentLabels = Array.from(
      fixture.nativeElement.querySelectorAll(
        '.readonly-document .readonly-field dt',
      ) as NodeListOf<HTMLElement>,
    ).map((label) => label.textContent?.trim());
    expect(documentLabels.slice(0, 6)).toEqual([
      'Document name',
      'Sender',
      'Recipient',
      'Document type',
      'Document date',
      'Invoice number',
    ]);
    expect(documentLabels.at(-1)).toBe('Summary');
    expect(fixture.nativeElement.textContent).toContain('INV-100');

    const referenceValue = Array.from(
      fixture.nativeElement.querySelectorAll(
        '.readonly-grid--document-data .readonly-field dd',
      ) as NodeListOf<HTMLElement>,
    ).find((value) => value.textContent?.includes('INV-100'));
    const summaryField = fixture.nativeElement.querySelector(
      '.readonly-field--summary',
    ) as HTMLElement | null;
    const tagChip = fixture.nativeElement.querySelector(
      '[data-testid="document-tag-chip"]',
    ) as HTMLElement | null;
    expect(referenceValue).not.toBeNull();
    expect(summaryField).not.toBeNull();
    expect(tagChip?.textContent).toContain('finance');
    expect(
      Boolean(
        referenceValue!.compareDocumentPosition(summaryField!) & Node.DOCUMENT_POSITION_FOLLOWING,
      ),
    ).toBe(true);
    expect(
      Boolean(summaryField!.compareDocumentPosition(tagChip!) & Node.DOCUMENT_POSITION_FOLLOWING),
    ).toBe(true);

    const paymentsTab = tabs.find((tab) => tab.textContent?.includes('Payments'));
    paymentsTab?.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('#payments-heading-read')).toBeNull();
    const paymentLabels = Array.from(
      fixture.nativeElement.querySelectorAll(
        '.payment-readonly-grid .readonly-field dt',
      ) as NodeListOf<HTMLElement>,
    ).map((label) => label.textContent?.trim());
    expect(paymentLabels.slice(0, 2)).toEqual(['Due date', 'Recipient']);
    expect(fixture.nativeElement.textContent).toContain('29. Mai 2026');
    expect(fixture.nativeElement.querySelector('.payment-readonly-recipient')?.classList).toContain(
      'payment-readonly-recipient',
    );
  });

  it('copies payment amounts as raw numeric values', async () => {
    const { fixture } = await createComponent();

    expect(fixture.componentInstance.copyPaymentAmount(1234.5)).toBe('1234.5');
    expect(fixture.componentInstance.copyPaymentAmount(null)).toBe('');
  });

  it('marks paid payments as not done from the payment tab', async () => {
    const paidPayment: DocumentDetailDto['payments'][number] = {
      id: '018f1a44-9093-7f55-a515-278f4d9bd9e0',
      iban: 'DE02120300000000202051',
      recipient: 'Sender GmbH',
      purpose: 'Invoice 100',
      amount: 120.5,
      currency: 'EUR',
      status: 'PAID',
      paidAt: now,
      paidById: '018f1a44-9093-7f55-a515-278f4d9bd991',
      source: 'AI_EXTRACTED',
      displayOrder: 0,
      createdAt: now,
      updatedAt: now,
    };
    const paidDocument = { ...documentDetail, payments: [paidPayment] };
    const documentsApi = {
      detail: vi.fn().mockReturnValue(of(paidDocument)),
      history: vi.fn().mockReturnValue(of(historyResponse)),
      updateMetadata: vi.fn().mockReturnValue(of(paidDocument)),
      updateTags: vi.fn().mockReturnValue(of(paidDocument)),
      updatePaymentTask: vi.fn().mockReturnValue(
        of({
          ...paidDocument,
          payments: [{ ...paidPayment, status: 'OPEN', paidAt: null, paidById: null }],
        }),
      ),
      updateCalendarEventTask: vi.fn(),
      archive: vi.fn(),
      reprocess: vi.fn(),
      triggerAiExtraction: vi.fn(),
      triggerScopedAiExtraction: vi.fn(),
    };
    const { fixture } = await createComponent({ documentsApi });

    const paymentTab = Array.from(
      fixture.nativeElement.querySelectorAll('[role="tab"]') as NodeListOf<HTMLElement>,
    ).find((tab) => tab.textContent?.includes('Payments'));
    paymentTab?.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const undoButton = fixture.nativeElement.querySelector(
      '[data-testid="document-payment-mark-not-done"]',
    ) as HTMLButtonElement | null;
    expect(undoButton?.textContent).toContain('Mark as not done');

    undoButton?.click();

    expect(documentsApi.updatePaymentTask).toHaveBeenCalledWith(documentId, paidPayment.id, {
      completed: false,
    });
  });

  it('marks completed date entries as not done while appointments have no completion action', async () => {
    const completedDeadline: DocumentDetailDto['calendarEvents'][number] = {
      ...documentCalendarEvent,
      id: '018f1a44-9093-7f55-a515-278f4d9bd9c1',
      kind: 'DEADLINE',
      title: 'Reply deadline',
      completedAt: now,
    };
    const completedAppointment: DocumentDetailDto['calendarEvents'][number] = {
      ...documentCalendarEvent,
      id: '018f1a44-9093-7f55-a515-278f4d9bd9c2',
      completedAt: now,
    };
    const calendarDocument = {
      ...documentDetail,
      calendarEvents: [completedDeadline, completedAppointment],
    };
    const documentsApi = {
      detail: vi.fn().mockReturnValue(of(calendarDocument)),
      history: vi.fn().mockReturnValue(of(historyResponse)),
      updateMetadata: vi.fn(),
      updateTags: vi.fn(),
      updatePaymentTask: vi.fn(),
      updateCalendarEventTask: vi.fn().mockReturnValue(
        of({
          ...calendarDocument,
          calendarEvents: [{ ...completedDeadline, completedAt: null }, completedAppointment],
        }),
      ),
      archive: vi.fn(),
      reprocess: vi.fn(),
      triggerAiExtraction: vi.fn(),
      triggerScopedAiExtraction: vi.fn(),
    };
    const { fixture } = await createComponent({ documentsApi });

    const calendarTab = Array.from(
      fixture.nativeElement.querySelectorAll('[role="tab"]') as NodeListOf<HTMLElement>,
    ).find((tab) => tab.textContent?.includes('Calendar'));
    calendarTab?.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const undoButtons = fixture.nativeElement.querySelectorAll(
      '[data-testid="document-calendar-event-mark-not-done"]',
    ) as NodeListOf<HTMLButtonElement>;
    expect(undoButtons).toHaveLength(1);
    expect(undoButtons[0]?.textContent).toContain('Mark as not done');

    undoButtons[0]?.click();

    expect(documentsApi.updateCalendarEventTask).toHaveBeenCalledWith(
      documentId,
      completedDeadline.id,
      { completed: false },
    );
  });

  it('edits unlinked calendar events while keeping payment due dates readonly in edit mode', async () => {
    const unlinkedEvent: DocumentDetailDto['calendarEvents'][number] = {
      ...documentCalendarEvent,
      id: '018f1a44-9093-7f55-a515-278f4d9bd9c3',
      paymentId: null,
      kind: 'DEADLINE',
      title: 'Reply deadline',
      date: '2026-05-15',
      time: '10:30',
      sourceText: 'reply by 15 May',
    };
    const linkedPaymentDueDate: DocumentDetailDto['calendarEvents'][number] = {
      ...documentCalendarEvent,
      id: '018f1a44-9093-7f55-a515-278f4d9bd9c4',
      paymentId: '018f1a44-9093-7f55-a515-278f4d9bd9b1',
      kind: 'DUE_DATE',
      title: 'Payment due',
      date: '2026-05-29',
      time: null,
    };
    const calendarDocument: DocumentDetailDto = {
      ...documentDetail,
      acceptedAt: null,
      calendarEvents: [unlinkedEvent, linkedPaymentDueDate],
    };
    const documentsApi = {
      detail: vi.fn().mockReturnValue(of(calendarDocument)),
      history: vi.fn().mockReturnValue(of(historyResponse)),
      updateMetadata: vi.fn().mockReturnValue(of(calendarDocument)),
      updateTags: vi.fn().mockReturnValue(of(calendarDocument)),
      updatePaymentTask: vi.fn(),
      updateCalendarEventTask: vi.fn().mockReturnValue(of(calendarDocument)),
      archive: vi.fn(),
      acceptInboxDocument: vi.fn().mockReturnValue(of({ acceptedCount: 1, documents: [] })),
      moveToInbox: vi.fn(),
      delete: vi.fn(),
      reprocess: vi.fn(),
      triggerAiExtraction: vi.fn(),
      triggerScopedAiExtraction: vi.fn(),
    };
    const { fixture } = await createComponent({ documentsApi });

    const editButton = fixture.nativeElement.querySelector(
      '[data-testid="document-edit-button"]',
    ) as HTMLButtonElement;
    editButton.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const calendarTab = Array.from(
      fixture.nativeElement.querySelectorAll('[role="tab"]') as NodeListOf<HTMLElement>,
    ).find((tab) => tab.textContent?.includes('Calendar'));
    calendarTab?.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(
      fixture.nativeElement.querySelectorAll('[data-testid="document-calendar-event-edit-row"]'),
    ).toHaveLength(1);
    expect(
      fixture.nativeElement.querySelectorAll('[data-testid="document-calendar-event-linked"]'),
    ).toHaveLength(1);
    expect(
      fixture.nativeElement.querySelectorAll('[data-testid="document-calendar-event-remove"]'),
    ).toHaveLength(1);

    const component = fixture.componentInstance;
    const existingEvent = component.calendarEvents().at(0);
    existingEvent.controls.title.setValue('Updated deadline');
    component.addCalendarEvent();
    component.calendarEvents().at(1).patchValue({
      kind: 'APPOINTMENT',
      title: 'Review call',
      description: 'Discuss the document',
      date: '2026-05-20',
      time: '09:15',
      endDate: '',
      endTime: '',
      sourceText: 'call on 20 May',
    });
    fixture.detectChanges();

    const saveButton = fixture.nativeElement.querySelector(
      '[data-testid="document-save-button"]',
    ) as HTMLButtonElement;
    saveButton.click();

    expect(documentsApi.updateMetadata).toHaveBeenCalledWith(
      documentId,
      expect.objectContaining({
        calendarEvents: [
          expect.objectContaining({
            id: unlinkedEvent.id,
            kind: 'DEADLINE',
            title: 'Updated deadline',
            date: '2026-05-15',
            time: '10:30',
          }),
          expect.objectContaining({
            id: undefined,
            kind: 'APPOINTMENT',
            title: 'Review call',
            description: 'Discuss the document',
            date: '2026-05-20',
            time: '09:15',
            sourceText: 'call on 20 May',
          }),
        ],
      }),
    );
    expect(documentsApi.updateMetadata.mock.calls[0][1].calendarEvents).not.toContainEqual(
      expect.objectContaining({ id: linkedPaymentDueDate.id }),
    );
  });

  it('does not show scoped AI buttons for inbox document metadata', async () => {
    const inboxDocument: DocumentDetailDto = {
      ...documentDetail,
      acceptedAt: null,
      ocrText: 'Invoice OCR text',
      summary: 'Old summary',
    };
    const documentsApi = {
      detail: vi.fn().mockReturnValue(of(inboxDocument)),
      history: vi.fn().mockReturnValue(of(historyResponse)),
      updateMetadata: vi.fn().mockReturnValue(of(inboxDocument)),
      updateTags: vi.fn().mockReturnValue(of(inboxDocument)),
      archive: vi.fn().mockReturnValue(of(undefined)),
      reprocess: vi.fn(),
      triggerAiExtraction: vi.fn(),
      triggerScopedAiExtraction: vi
        .fn()
        .mockReturnValue(
          of({ documentId, jobId: documentId, status: 'AI_PENDING', queuePosition: 1 }),
        ),
    };
    const { fixture } = await createComponent({ documentsApi });

    const titleButton = fixture.nativeElement.querySelector(
      '[aria-label="Regenerate title with AI"]',
    ) as HTMLButtonElement | null;
    const paymentButton = fixture.nativeElement.querySelector(
      '[aria-label="Regenerate payments with AI"]',
    ) as HTMLButtonElement | null;
    const calendarButton = fixture.nativeElement.querySelector(
      '[aria-label="Regenerate calendar events with AI"]',
    ) as HTMLButtonElement | null;

    expect(titleButton).toBeNull();
    expect(paymentButton).toBeNull();
    expect(calendarButton).toBeNull();
    expect(documentsApi.triggerScopedAiExtraction).not.toHaveBeenCalled();
    expect(documentsApi.triggerAiExtraction).not.toHaveBeenCalled();
  });

  it('switches from read mode to edit mode and saves metadata from the header', async () => {
    const updatedDocument = documentWith(documentId, 'Updated invoice');
    const { fixture, documentsApi } = await createComponent();
    documentsApi.updateMetadata.mockReturnValue(of(updatedDocument));

    const editButton = fixture.nativeElement.querySelector(
      '[data-testid="document-edit-button"]',
    ) as HTMLButtonElement | null;
    editButton?.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const saveButtonBeforeChanges = fixture.nativeElement.querySelector(
      '[data-testid="document-save-button"]',
    ) as HTMLButtonElement | null;
    const cancelButton = fixture.nativeElement.querySelector(
      '[data-testid="document-cancel-edit-button"]',
    ) as HTMLButtonElement | null;
    expect(cancelButton?.textContent).toContain('Cancel Edit');
    expect(
      fixture.nativeElement.querySelector('[data-testid="document-revert-button"]'),
    ).toBeNull();
    expect(saveButtonBeforeChanges?.textContent).toContain('Save Changes');
    expect(saveButtonBeforeChanges?.disabled).toBe(true);

    const titleInput = fixture.nativeElement.querySelector('#title') as HTMLInputElement | null;
    if (!titleInput) {
      throw new Error('Expected edit controls to be rendered.');
    }

    titleInput.value = 'Updated invoice';
    titleInput.dispatchEvent(new Event('input'));
    fixture.componentInstance.metadataForm.controls.sender.setValue('Sender GmbH');
    fixture.componentInstance.metadataForm.controls.documentTypeId.setValue(
      documentDetail.documentTypes[0].id,
    );
    fixture.componentInstance.metadataForm.controls.documentDate.setValue('2026-05-07');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const saveButton = fixture.nativeElement.querySelector(
      '[data-testid="document-save-button"]',
    ) as HTMLButtonElement | null;
    const revertButton = fixture.nativeElement.querySelector(
      '[data-testid="document-revert-button"]',
    ) as HTMLButtonElement | null;
    if (!saveButton) {
      throw new Error('Expected save button to be rendered after a metadata change.');
    }

    expect(revertButton?.textContent).toContain('Revert Changes');
    expect(fixture.nativeElement.querySelector('.metadata-title-field')?.classList).toContain(
      'is-changed-field',
    );
    expect(saveButton.disabled).toBe(false);
    saveButton.click();

    expect(documentsApi.updateMetadata).toHaveBeenCalledWith(
      documentId,
      expect.objectContaining({ title: 'Updated invoice' }),
    );
  });

  it('leaves edit mode without saving when no changes are pending', async () => {
    const { fixture, documentsApi } = await createComponent();

    const editButton = fixture.nativeElement.querySelector(
      '[data-testid="document-edit-button"]',
    ) as HTMLButtonElement | null;
    editButton?.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const cancelButton = fixture.nativeElement.querySelector(
      '[data-testid="document-cancel-edit-button"]',
    ) as HTMLButtonElement | null;
    cancelButton?.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(documentsApi.updateMetadata).not.toHaveBeenCalled();
    expect(
      fixture.nativeElement.querySelector('[data-testid="document-edit-button"]'),
    ).not.toBeNull();
    expect(fixture.nativeElement.querySelector('#title')).toBeNull();
  });

  it('highlights changed document fields and reverts unsaved values', async () => {
    const taggedDocument = {
      ...documentDetail,
      sender: 'Sender GmbH',
      tags: [documentTag],
    };
    const documentsApi = {
      detail: vi.fn().mockReturnValue(of(taggedDocument)),
      history: vi.fn().mockReturnValue(of(historyResponse)),
      updateMetadata: vi.fn().mockReturnValue(of(taggedDocument)),
      updateTags: vi.fn().mockReturnValue(of(taggedDocument)),
      archive: vi.fn(),
      acceptInboxDocument: vi.fn(),
      reprocess: vi.fn(),
      triggerAiExtraction: vi.fn(),
      triggerScopedAiExtraction: vi.fn(),
    };
    const { editLocks, fixture } = await createComponent({ documentsApi });

    fixture.componentInstance.enableEditing();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    fixture.componentInstance.metadataForm.controls.sender.setValue('Changed sender');
    fixture.componentInstance.removeTag('finance');
    fixture.componentInstance.tagForm.controls.tagText.setValue('urgent');
    fixture.detectChanges();

    expect(
      (fixture.nativeElement as HTMLElement)
        .querySelector('nz-form-item.is-changed-field input#sender')
        ?.getAttribute('formcontrolname'),
    ).toBe('sender');
    expect((fixture.nativeElement as HTMLElement).querySelector('.tag-panel')?.classList).toContain(
      'is-changed-field',
    );

    fixture.componentInstance.revertChanges();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(documentsApi.updateMetadata).not.toHaveBeenCalled();
    expect(documentsApi.updateTags).not.toHaveBeenCalled();
    expect(editLocks.releaseBestEffort).toHaveBeenCalledWith(
      '018f1a44-9093-7f55-a515-278f4d9bd911',
    );
    expect(fixture.componentInstance.metadataForm.controls.sender.value).toBe('Sender GmbH');
    expect(fixture.componentInstance.tagNames()).toEqual(['finance']);
    expect(fixture.componentInstance.tagForm.controls.tagText.value).toBe('');
    expect(fixture.componentInstance.hasPendingChanges()).toBe(false);
    expect(fixture.nativeElement.querySelector('#sender')).toBeNull();
  });

  it('shows only save and cancel actions while editing without changes', async () => {
    const pdfDocument = { ...documentDetail, pdfUrl: '/api/documents/doc-a/pdf' };
    const documentsApi = {
      detail: vi.fn().mockReturnValue(of(pdfDocument)),
      history: vi.fn().mockReturnValue(of(historyResponse)),
      updateMetadata: vi.fn().mockReturnValue(of(pdfDocument)),
      updateTags: vi.fn().mockReturnValue(of(pdfDocument)),
      archive: vi.fn(),
      acceptInboxDocument: vi.fn(),
      reprocess: vi.fn(),
      triggerAiExtraction: vi.fn(),
      triggerScopedAiExtraction: vi.fn(),
    };
    const assets = {
      loadObjectUrl: vi.fn().mockReturnValue(of('blob:http://localhost/doc-a')),
      revokeObjectUrl: vi.fn(),
    };
    const { fixture } = await createComponent({ assets, documentsApi });

    fixture.componentInstance.enableEditing();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const header = fixture.nativeElement.querySelector('.page-header') as HTMLElement | null;

    expect(header?.textContent).toContain('Save Changes');
    expect(header?.textContent).toContain('Cancel Edit');
    expect(header?.textContent).not.toContain('Revert Changes');
    expect(header?.textContent).not.toContain('Back to list');
    expect(header?.textContent).not.toContain('PDF');
    expect(header?.textContent).not.toContain('Start AI');
    expect(header?.textContent).not.toContain('Move');
    expect(header?.textContent).not.toContain('Reprocess');
    expect(fixture.nativeElement.querySelector('[data-testid="document-back-link"]')).toBeNull();
    expect(
      fixture.nativeElement.querySelector('[data-testid="document-download-pdf-link"]'),
    ).toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="document-edit-button"]')).toBeNull();
  });

  it('switches cancel edit to revert changes after editing a field', async () => {
    const { fixture } = await createComponent();

    fixture.componentInstance.enableEditing();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(
      fixture.nativeElement.querySelector('[data-testid="document-cancel-edit-button"]'),
    ).not.toBeNull();

    fixture.componentInstance.metadataForm.controls.title.setValue('Changed invoice');
    fixture.detectChanges();

    expect(
      fixture.nativeElement.querySelector('[data-testid="document-cancel-edit-button"]'),
    ).toBeNull();
    expect(
      fixture.nativeElement.querySelector('[data-testid="document-revert-button"]')?.textContent,
    ).toContain('Revert Changes');
  });

  it('pins an accepted document from the detail header', async () => {
    const { fixture, openDocuments } = await createComponent();

    const pinButton = fixture.nativeElement.querySelector(
      '[data-testid="document-pin-button"]',
    ) as HTMLButtonElement | null;
    pinButton?.click();

    expect(pinButton?.textContent).toContain('Pin');
    expect(openDocuments.open).toHaveBeenCalledWith({
      id: documentId,
      title: 'Invoice',
    });
    expect(openDocuments.close).not.toHaveBeenCalled();
  });

  it('unpins an open accepted document from the detail header', async () => {
    const routerNavigate = vi.fn().mockResolvedValue(true);
    const { fixture, openDocuments } = await createComponent({
      openDocumentIds: [documentId],
    });
    vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockImplementation((url) =>
      routerNavigate(url),
    );

    const pinButton = fixture.nativeElement.querySelector(
      '[data-testid="document-pin-button"]',
    ) as HTMLButtonElement | null;
    pinButton?.click();

    expect(pinButton?.textContent).toContain('Unpin');
    expect(openDocuments.open).not.toHaveBeenCalled();
    expect(openDocuments.close).toHaveBeenCalledWith(documentId);
    expect(routerNavigate).not.toHaveBeenCalled();
  });

  it('updates the open document title after saving metadata', async () => {
    const updatedDocument = documentWith(documentId, 'Updated invoice');
    const { fixture, documentsApi, openDocuments } = await createComponent();
    documentsApi.updateMetadata.mockReturnValue(of(updatedDocument));

    fixture.componentInstance.metadataForm.controls.title.setValue('Updated invoice');
    fixture.componentInstance.metadataForm.controls.sender.setValue('Sender GmbH');
    fixture.componentInstance.metadataForm.controls.documentTypeId.setValue(
      documentDetail.documentTypes[0].id,
    );
    fixture.componentInstance.metadataForm.controls.documentDate.setValue('2026-05-07');
    fixture.componentInstance.saveMetadata();

    expect(openDocuments.open).not.toHaveBeenCalled();
    expect(openDocuments.updateTitleIfOpen).toHaveBeenLastCalledWith({
      id: documentId,
      title: 'Updated invoice',
    });
  });

  it('loads another document when the document id input changes', async () => {
    const documentsApi = {
      detail: vi.fn((id: string) =>
        of(id === secondDocumentId ? documentWith(secondDocumentId, 'Receipt') : documentDetail),
      ),
      history: vi.fn().mockReturnValue(of(historyResponse)),
      updateMetadata: vi.fn(),
      updateTags: vi.fn(),
      archive: vi.fn(),
      reprocess: vi.fn(),
      triggerAiExtraction: vi.fn(),
      triggerScopedAiExtraction: vi.fn(),
    };

    const { fixture, openDocuments } = await createComponent({ documentsApi });
    fixture.componentRef.setInput('documentId', secondDocumentId);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(documentsApi.detail).toHaveBeenCalledWith(secondDocumentId);
    expect(openDocuments.open).not.toHaveBeenCalled();
    expect(openDocuments.updateTitleIfOpen).toHaveBeenLastCalledWith({
      id: secondDocumentId,
      title: 'Receipt',
    });
  });

  it('removes archived documents from the open document list', async () => {
    const routerNavigate = vi.fn().mockResolvedValue(true);
    const { fixture, openDocuments } = await createComponent({ openDocumentIds: [documentId] });
    vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockImplementation((url) =>
      routerNavigate(url),
    );

    fixture.componentInstance.archive();

    expect(openDocuments.close).toHaveBeenCalledWith(documentId);
    expect(routerNavigate).toHaveBeenCalledWith('/documents');
  });

  it('does not reprocess accepted documents from the detail view', async () => {
    const { fixture, documentsApi } = await createComponent();

    fixture.componentInstance.reprocess();

    expect(documentsApi.reprocess).not.toHaveBeenCalled();
  });

  it('accepts an inbox document from the detail view', async () => {
    const inboxDocument = { ...documentDetail, acceptedAt: null };
    const acceptedDocument = { ...documentDetail, acceptedAt: now };
    const documentsApi = {
      detail: vi.fn().mockReturnValueOnce(of(inboxDocument)).mockReturnValue(of(acceptedDocument)),
      history: vi.fn().mockReturnValue(of(historyResponse)),
      updateMetadata: vi.fn(),
      updateTags: vi.fn(),
      archive: vi.fn(),
      acceptInboxDocument: vi.fn().mockReturnValue(of({ acceptedCount: 1, documents: [] })),
      reprocess: vi.fn(),
      triggerAiExtraction: vi.fn(),
      triggerScopedAiExtraction: vi.fn(),
    };
    const { fixture } = await createComponent({ documentsApi });

    fixture.componentInstance.acceptInboxDocument();

    expect(documentsApi.acceptInboxDocument).toHaveBeenCalledWith(documentId);
    expect(documentsApi.detail).toHaveBeenCalledTimes(2);
  });

  it('reprocesses only inbox documents from the detail view', async () => {
    const inboxDocument = { ...documentDetail, acceptedAt: null };
    const documentsApi = {
      detail: vi.fn().mockReturnValue(of(inboxDocument)),
      history: vi.fn().mockReturnValue(of(historyResponse)),
      updateMetadata: vi.fn(),
      updateTags: vi.fn(),
      archive: vi.fn(),
      acceptInboxDocument: vi.fn(),
      reprocess: vi
        .fn()
        .mockReturnValue(of({ documentId, jobId: documentId, status: 'OCR_PENDING' })),
      triggerAiExtraction: vi.fn(),
      triggerScopedAiExtraction: vi.fn(),
    };
    const { fixture } = await createComponent({ documentsApi });

    fixture.componentInstance.reprocess();

    expect(documentsApi.reprocess).toHaveBeenCalledWith(documentId);
  });

  it('shows the tenant move action only for admin inbox documents with multiple active tenants', async () => {
    const inboxDocument = { ...documentDetail, acceptedAt: null };
    const { fixture } = await createComponent({
      documentsApi: documentApiForDetail(inboxDocument),
    });

    expect(
      fixture.nativeElement.querySelector('[data-testid="document-move-tenant-button"]'),
    ).not.toBeNull();
    const markup = fixture.nativeElement.innerHTML as string;
    expect(markup.indexOf('document-move-tenant-button')).toBeLessThan(
      markup.indexOf('document-edit-button'),
    );

    TestBed.resetTestingModule();
    const accepted = await createComponent();
    expect(
      accepted.fixture.nativeElement.querySelector('[data-testid="document-move-tenant-button"]'),
    ).toBeNull();

    TestBed.resetTestingModule();
    const nonAdmin = await createComponent({
      documentsApi: documentApiForDetail(inboxDocument),
      auth: {
        canEditDocuments: () => true,
        isAdmin: () => false,
      },
    });
    expect(nonAdmin.tenantsApi.listActive).not.toHaveBeenCalled();
    expect(
      nonAdmin.fixture.nativeElement.querySelector('[data-testid="document-move-tenant-button"]'),
    ).toBeNull();

    TestBed.resetTestingModule();
    const singleTenant = await createComponent({
      documentsApi: documentApiForDetail(inboxDocument),
      tenantsApi: {
        listActive: vi.fn().mockReturnValue(of([tenant])),
      },
    });
    expect(
      singleTenant.fixture.nativeElement.querySelector(
        '[data-testid="document-move-tenant-button"]',
      ),
    ).toBeNull();
  });

  it('opens the tenant move dialog with active target tenants only', async () => {
    const inboxDocument = { ...documentDetail, acceptedAt: null };
    const { fixture } = await createComponent({
      documentsApi: documentApiForDetail(inboxDocument),
      tenantsApi: {
        listActive: vi.fn().mockReturnValue(of([tenant, targetTenant])),
      },
    });

    fixture.componentInstance.openMoveToTenantDialog();
    fixture.detectChanges();

    expect(fixture.componentInstance.isMoveTenantDialogVisible()).toBe(true);
    expect(fixture.componentInstance.selectedMoveTenantId()).toBeNull();
    expect(fixture.componentInstance.moveTenantTargetOptions()).toEqual([targetTenant]);
  });

  it('moves an inbox detail document to another tenant and navigates to inbox', async () => {
    const inboxDocument = { ...documentDetail, acceptedAt: null };
    const routerNavigate = vi.fn().mockResolvedValue(true);
    const documentsApi = documentApiForDetail(inboxDocument);
    const { fixture } = await createComponent({ documentsApi });
    vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockImplementation((url) =>
      routerNavigate(url),
    );

    fixture.componentInstance.openMoveToTenantDialog();
    fixture.componentInstance.selectedMoveTenantId.set(targetTenant.id);
    fixture.componentInstance.confirmMoveToTenant();

    expect(documentsApi.moveToTenant).toHaveBeenCalledWith(documentId, {
      targetTenantId: targetTenant.id,
    });
    expect(fixture.componentInstance.isMoveTenantDialogVisible()).toBe(false);
    expect(routerNavigate).toHaveBeenCalledWith('/inbox');
  });

  it('keeps the tenant move dialog open when moving fails', async () => {
    const inboxDocument = { ...documentDetail, acceptedAt: null };
    const documentsApi = documentApiForDetail(inboxDocument, {
      moveToTenant: vi.fn().mockReturnValue(throwError(() => new Error('failed'))),
    });
    const { fixture } = await createComponent({ documentsApi });

    fixture.componentInstance.openMoveToTenantDialog();
    fixture.componentInstance.selectedMoveTenantId.set(targetTenant.id);
    fixture.componentInstance.confirmMoveToTenant();

    expect(fixture.componentInstance.isMoveTenantDialogVisible()).toBe(true);
    expect(fixture.componentInstance.error()).toBe('documentDetail.errors.moveToTenantFailed');
  });

  it('moves an accepted detail document back to inbox and navigates to inbox', async () => {
    const routerNavigate = vi.fn().mockResolvedValue(true);
    const { fixture, documentsApi, openDocuments } = await createComponent();
    vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockImplementation((url) =>
      routerNavigate(url),
    );

    fixture.componentInstance.moveToInbox();

    expect(documentsApi.moveToInbox).toHaveBeenCalledWith(documentId);
    expect(openDocuments.close).not.toHaveBeenCalled();
    expect(routerNavigate).toHaveBeenCalledWith('/inbox');
  });

  it('deletes an accepted detail document only after confirmation', async () => {
    const routerNavigate = vi.fn().mockResolvedValue(true);
    const { fixture, documentsApi } = await createComponent();
    vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockImplementation((url) =>
      routerNavigate(url),
    );

    fixture.componentInstance.requestTrash();

    expect(fixture.componentInstance.trashDocument()).toEqual(documentDetail);
    expect(documentsApi.delete).not.toHaveBeenCalled();

    fixture.componentInstance.confirmTrash();

    expect(documentsApi.delete).toHaveBeenCalledWith(documentId);
    expect(fixture.componentInstance.trashDocument()).toBeNull();
    expect(routerNavigate).toHaveBeenCalledWith('/documents');
  });

  it('revokes the loaded PDF object URL when the pane is destroyed', async () => {
    const pdfDocument = { ...documentDetail, pdfUrl: '/api/documents/doc-a/pdf' };
    const documentsApi = {
      detail: vi.fn().mockReturnValue(of(pdfDocument)),
      history: vi.fn().mockReturnValue(of(historyResponse)),
      updateMetadata: vi.fn(),
      updateTags: vi.fn(),
      archive: vi.fn(),
      reprocess: vi.fn(),
      triggerAiExtraction: vi.fn(),
      triggerScopedAiExtraction: vi.fn(),
    };
    const assets = {
      loadObjectUrl: vi.fn().mockReturnValue(of('blob:http://localhost/doc-a')),
      revokeObjectUrl: vi.fn(),
    };
    const { fixture } = await createComponent({ assets, documentsApi });

    fixture.destroy();

    expect(assets.loadObjectUrl).toHaveBeenCalledWith('/api/documents/doc-a/pdf');
    expect(assets.revokeObjectUrl).toHaveBeenCalledWith('blob:http://localhost/doc-a');
  });

  it('renders a PDF download link with the authenticated object URL', async () => {
    const pdfDocument = {
      ...documentDetail,
      originalFileName: 'invoice:2026.pdf',
      pdfUrl: '/api/documents/doc-a/pdf',
    };
    const documentsApi = {
      detail: vi.fn().mockReturnValue(of(pdfDocument)),
      history: vi.fn().mockReturnValue(of(historyResponse)),
      updateMetadata: vi.fn(),
      updateTags: vi.fn(),
      archive: vi.fn(),
      reprocess: vi.fn(),
      triggerAiExtraction: vi.fn(),
      triggerScopedAiExtraction: vi.fn(),
    };
    const assets = {
      loadObjectUrl: vi.fn().mockReturnValue(of('blob:http://localhost/doc-a')),
      revokeObjectUrl: vi.fn(),
    };
    const { fixture } = await createComponent({ assets, documentsApi });

    const downloadLink = fixture.nativeElement.querySelector(
      '[data-testid="document-download-pdf-link"]',
    ) as HTMLAnchorElement | null;

    expect(downloadLink).not.toBeNull();
    expect(downloadLink?.getAttribute('href')).toBe('blob:http://localhost/doc-a');
    expect(downloadLink?.getAttribute('download')).toBe('invoice_2026.pdf');
    expect(downloadLink?.getAttribute('aria-label')).toBe('Download PDF Invoice');
  });

  it('edits document tags as removable chips', async () => {
    const taggedDocument = {
      ...documentDetail,
      tags: [documentTag],
    };
    const documentsApi = {
      detail: vi.fn().mockReturnValue(of(taggedDocument)),
      history: vi.fn().mockReturnValue(of(historyResponse)),
      updateMetadata: vi.fn(),
      updateTags: vi.fn().mockReturnValue(of({ ...taggedDocument, tags: [] })),
      archive: vi.fn(),
      reprocess: vi.fn(),
      triggerAiExtraction: vi.fn(),
      triggerScopedAiExtraction: vi.fn(),
    };
    const { fixture } = await createComponent({ documentsApi });

    const editButton = fixture.nativeElement.querySelector(
      '[data-testid="document-edit-button"]',
    ) as HTMLButtonElement | null;
    editButton?.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(
      fixture.nativeElement.querySelector('[data-testid="document-tag-chip"]')?.textContent,
    ).toContain('finance');

    fixture.componentInstance.removeTag('finance');
    fixture.componentInstance.tagForm.controls.tagText.setValue('urgent');
    fixture.componentInstance.addTag();
    fixture.componentInstance.saveChanges();

    expect(documentsApi.updateTags).toHaveBeenCalledWith(documentId, { tags: ['urgent'] });
  });

  it('renders document calendar events as cards without sender', async () => {
    const calendarDocument = {
      ...documentDetail,
      calendarEvents: [documentCalendarEvent],
    };
    const documentsApi = {
      detail: vi.fn().mockReturnValue(of(calendarDocument)),
      history: vi.fn().mockReturnValue(of(historyResponse)),
      updateMetadata: vi.fn(),
      updateTags: vi.fn(),
      archive: vi.fn(),
      reprocess: vi.fn(),
      triggerAiExtraction: vi.fn(),
      triggerScopedAiExtraction: vi.fn(),
    };
    const { fixture } = await createComponent({ documentsApi });

    const calendarTabs = fixture.nativeElement.querySelectorAll(
      '[role="tab"]',
    ) as NodeListOf<HTMLElement>;
    const calendarTab = Array.from(calendarTabs).find((tab) =>
      tab.textContent?.includes('Calendar'),
    );
    if (!calendarTab) {
      throw new Error('Expected the Calendar tab to be rendered.');
    }

    calendarTab.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const card = fixture.nativeElement.querySelector(
      '[data-testid="document-calendar-event"]',
    ) as HTMLElement;

    expect(card.textContent).toContain('Consultation');
    expect(card.textContent).toContain('Appointment');
    expect(card.querySelector('.calendar-event-card__title-row .ant-tag')).not.toBeNull();
    expect(card.textContent).not.toContain('Default');
    expect(card.querySelector('[data-testid="calendar-event-card-sender"]')).toBeNull();
    expect(
      card.querySelector('[data-testid="calendar-event-card-date"]')?.textContent?.trim(),
    ).toBe('May 12, 2026');
    expect(
      card.querySelector('[data-testid="calendar-event-card-time"]')?.textContent?.trim(),
    ).toBe('14:30');
  });
});
