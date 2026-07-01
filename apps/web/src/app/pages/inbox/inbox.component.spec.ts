import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import {
  CheckCircleOutline,
  CheckOutline,
  CheckSquareOutline,
  CloseOutline,
  DeleteOutline,
  DownOutline,
  EditOutline,
  EyeOutline,
  RotateRightOutline,
  SaveOutline,
  ScanOutline,
  SearchOutline,
  SyncOutline,
  UndoOutline,
} from '@ant-design/icons-angular/icons';
import type {
  DocumentSearchResponse,
  DocumentSummaryDto,
  RealtimeDocumentChangedEvent,
} from '@smart-dms/shared-dto';
import { provideNzIcons } from 'ng-zorro-antd/icon';
import { of, throwError } from 'rxjs';
import { AuthenticatedAssetService } from '../../core/api/authenticated-asset.service';
import { DocumentApiService } from '../../core/api/document-api.service';
import { SettingsApiService } from '../../core/api/settings-api.service';
import { LanguageService } from '../../core/i18n/language.service';
import { AuthService } from '../../core/services/auth.service';
import { EditLockService } from '../../core/services/edit-lock.service';
import { RealtimeClientService } from '../../core/services/realtime-client.service';
import { TenantContextService } from '../../core/services/tenant-context.service';
import { provideI18nTesting } from '../../testing/i18n-testing';
import { InboxComponent } from './inbox.component';

const documentType = {
  id: '018f1a44-9093-7f55-a515-278f4d9bd992',
  key: 'invoice',
  name: 'Invoice',
  active: true,
  isSystem: true,
  displayOrder: 10,
  createdAt: '2026-05-07T18:00:00.000Z',
  updatedAt: '2026-05-07T18:00:00.000Z',
};

const tenant = {
  id: '00000000-0000-4000-8000-000000000010',
  key: 'default',
  name: 'Default',
  isActive: true,
};

const documentSummary: DocumentSummaryDto = {
  id: '018f1a44-9093-7f55-a515-278f4d9bd99f',
  title: 'Invoice',
  tenant,
  documentType,
  originalFileName: 'invoice.pdf',
  source: 'UPLOAD',
  mimeType: 'application/pdf',
  status: 'READY',
  createdAt: '2026-05-07T18:00:00.000Z',
  updatedAt: '2026-05-07T18:00:00.000Z',
  acceptedAt: null,
  acceptedById: null,
  aiProcessedAt: null,
  documentDate: null,
  summary: null,
  sender: 'Sender GmbH',
  recipient: null,
  note: null,
  fileSize: 1234,
  pageCount: 1,
  tags: [],
  thumbnailUrl: null,
  calendarEventKinds: [],
};

const response: DocumentSearchResponse = {
  items: [documentSummary],
  meta: {
    page: 1,
    pageSize: 50,
    totalItems: 1,
    totalPages: 1,
  },
};

async function createComponent(
  options: {
    readonly isAdmin?: boolean;
    readonly hasNoActiveTenants?: boolean;
    readonly hasMultipleActiveTenants?: boolean;
    readonly isAllTenantsScope?: boolean;
    readonly locale?: string;
    readonly searchResponse?: DocumentSearchResponse;
  } = {},
) {
  const latestDocumentChange = signal<RealtimeDocumentChangedEvent | null>(null);
  const latestEditLockChange = signal(null);
  const documentsApi = {
    searchInbox: vi.fn().mockReturnValue(of(options.searchResponse ?? response)),
    acceptInboxDocuments: vi.fn().mockReturnValue(
      of({
        acceptedCount: 1,
        documents: [documentSummary],
      }),
    ),
    updateMetadata: vi.fn().mockReturnValue(of(documentSummary)),
    delete: vi.fn().mockReturnValue(of({ deleted: true, documentId: documentSummary.id })),
    reprocess: vi.fn().mockReturnValue(
      of({
        documentId: documentSummary.id,
        jobId: '018f1a44-9093-7f55-a515-278f4d9bd9aa',
        status: 'OCR_PENDING',
      }),
    ),
    triggerAiExtraction: vi.fn().mockReturnValue(of({ documentId: documentSummary.id })),
  };
  const settingsApi = {
    documentTypes: vi.fn().mockReturnValue(of([documentType])),
  };
  const assets = {
    loadObjectUrl: vi.fn((url: string) => of(`blob:${url}`)),
    revokeObjectUrl: vi.fn(),
  };
  const editLocks = {
    acquire: vi.fn().mockReturnValue(
      of({
        lock: {
          id: '018f1a44-9093-7f55-a515-278f4d9bd911',
          scope: 'INBOX',
          resourceId: tenant.id,
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

  await TestBed.configureTestingModule({
    imports: [InboxComponent],
    providers: [
      provideRouter([]),
      provideI18nTesting(),
      provideNzIcons([
        CheckCircleOutline,
        CheckOutline,
        CheckSquareOutline,
        CloseOutline,
        DeleteOutline,
        DownOutline,
        EditOutline,
        EyeOutline,
        RotateRightOutline,
        SaveOutline,
        ScanOutline,
        SearchOutline,
        SyncOutline,
        UndoOutline,
      ]),
      {
        provide: AuthService,
        useValue: {
          canEditDocuments: () => true,
          isAdmin: () => options.isAdmin ?? true,
        },
      },
      {
        provide: TenantContextService,
        useValue: {
          activeScope: () =>
            options.hasNoActiveTenants || options.isAllTenantsScope ? 'all' : tenant.id,
          hasNoActiveTenants: () => options.hasNoActiveTenants ?? false,
          hasMultipleActiveTenants: () => options.hasMultipleActiveTenants ?? false,
          isAllTenants: () => options.hasNoActiveTenants || options.isAllTenantsScope || false,
        },
      },
      { provide: DocumentApiService, useValue: documentsApi },
      { provide: SettingsApiService, useValue: settingsApi },
      { provide: LanguageService, useValue: { currentLocale: signal(options.locale ?? 'en-US') } },
      { provide: AuthenticatedAssetService, useValue: assets },
      { provide: EditLockService, useValue: editLocks },
      {
        provide: RealtimeClientService,
        useValue: {
          isConnected: signal(true),
          latestDocumentChange,
          latestEditLockChange,
        },
      },
    ],
  }).compileComponents();

  const fixture = TestBed.createComponent(InboxComponent);
  fixture.detectChanges();

  return {
    component: fixture.componentInstance,
    assets,
    documentsApi,
    editLocks,
    settingsApi,
    fixture,
  };
}

describe('InboxComponent', () => {
  afterEach(() => {
    vi.useRealTimers();
    TestBed.resetTestingModule();
  });

  it('renders an infinite table without pagination or file sub text', async () => {
    const { fixture } = await createComponent();
    const compiled = fixture.nativeElement as HTMLElement;

    expect(compiled.querySelector('nz-pagination')).toBeNull();
    expect(compiled.querySelector<HTMLInputElement>('input[formcontrolname="title"]')).toBeNull();
    expect(compiled.textContent).toContain('Invoice');
    expect(compiled.textContent).not.toContain('invoice.pdf');
    expect(compiled.textContent).not.toContain('1.2');
  });

  it('opens documents through the inbox detail route from the preview and title links', async () => {
    const documentWithSummary = {
      ...documentSummary,
      summary: 'AI summary for this inbox document.',
    };
    const { fixture } = await createComponent({
      searchResponse: {
        items: [documentWithSummary],
        meta: response.meta,
      },
    });
    const compiled = fixture.nativeElement as HTMLElement;
    const previewLink = compiled.querySelector<HTMLAnchorElement>('.col-title .row-preview-link');
    const titleLink = compiled.querySelector<HTMLAnchorElement>('.col-title .metadata-link');

    if (!previewLink || !titleLink) {
      throw new Error('Expected the inbox title cell to render preview and title links.');
    }

    expect(previewLink.getAttribute('href')).toBe(`/inbox/${documentSummary.id}`);
    expect(previewLink.querySelector('.anticon-eye')).not.toBeNull();
    expect(titleLink.getAttribute('href')).toBe(`/inbox/${documentSummary.id}`);
    expect(titleLink.textContent).toContain('Invoice');
    expect(titleLink.getAttribute('title')).toBe('AI summary for this inbox document.');
  });

  it('formats inbox document dates with the selected language locale', async () => {
    const datedDocument = {
      ...documentSummary,
      documentDate: '2026-06-30T00:00:00.000Z',
    };
    const { fixture } = await createComponent({
      locale: 'de-DE',
      searchResponse: {
        items: [datedDocument],
        meta: response.meta,
      },
    });

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('30. Juni 2026');
  });

  it('does not highlight a missing inbox date before an accept failure', async () => {
    const { fixture } = await createComponent();
    const compiled = fixture.nativeElement as HTMLElement;

    expect(compiled.querySelector('td.col-date')?.classList).not.toContain(
      'is-missing-required-field',
    );
  });

  it('highlights only the missing date after an accept failure', async () => {
    const { component, documentsApi, fixture } = await createComponent();
    documentsApi.acceptInboxDocuments.mockReturnValueOnce(
      throwError(() => new Error('missing metadata')),
    );

    component.acceptAllLoaded();
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('td.col-title')?.classList).not.toContain(
      'is-missing-required-field',
    );
    expect(compiled.querySelector('td.col-sender')?.classList).not.toContain(
      'is-missing-required-field',
    );
    expect(compiled.querySelector('td.col-document-type')?.classList).not.toContain(
      'is-missing-required-field',
    );
    expect(compiled.querySelector('td.col-date')?.classList).toContain(
      'is-missing-required-field',
    );
  });

  it('highlights all missing core metadata fields after an accept failure', async () => {
    const incompleteDocument: DocumentSummaryDto = {
      ...documentSummary,
      title: '   ',
      documentType: null,
      documentDate: null,
      sender: '   ',
    };
    const { component, documentsApi, fixture } = await createComponent({
      searchResponse: {
        items: [incompleteDocument],
        meta: response.meta,
      },
    });
    documentsApi.acceptInboxDocuments.mockReturnValueOnce(
      throwError(() => new Error('missing metadata')),
    );

    component.acceptAllLoaded();
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('td.col-title')?.classList).toContain(
      'is-missing-required-field',
    );
    expect(compiled.querySelector('td.col-sender')?.classList).toContain(
      'is-missing-required-field',
    );
    expect(compiled.querySelector('td.col-document-type')?.classList).toContain(
      'is-missing-required-field',
    );
    expect(compiled.querySelector('td.col-date')?.classList).toContain(
      'is-missing-required-field',
    );
  });

  it('removes the missing required highlight when the field is filled in edit mode', async () => {
    const { component, documentsApi, fixture } = await createComponent();
    documentsApi.acceptInboxDocuments.mockReturnValueOnce(
      throwError(() => new Error('missing metadata')),
    );

    component.acceptAllLoaded();
    component.startEdit();
    component.rows()[0].form.controls.documentDate.setValue('2026-05-07');
    fixture.detectChanges();

    const dateCell = (fixture.nativeElement as HTMLElement).querySelector('td.col-date');
    expect(dateCell?.classList).not.toContain('is-missing-required-field');
    expect(dateCell?.classList).toContain('is-changed-field');
  });

  it('renders inbox search in page controls and actions above the table', async () => {
    const { fixture } = await createComponent();
    const compiled = fixture.nativeElement as HTMLElement;
    const panelActions = compiled.querySelectorAll('.app-table-panel__actions');

    expect(compiled.querySelector('.inbox-actions')).toBeNull();
    const searchInput = compiled.querySelector<HTMLElement>(
      '.inbox-controls .toolbar__search-input',
    );
    const searchSubmit = compiled.querySelector<HTMLElement>('.toolbar__search-submit');

    expect(searchInput).not.toBeNull();
    expect(searchSubmit).not.toBeNull();
    expect(
      getComputedStyle(compiled).getPropertyValue('--inbox-toolbar-control-height').trim(),
    ).toBe('32px');
    expect(getComputedStyle(searchInput!).height).toBe('var(--inbox-toolbar-control-height)');
    expect(getComputedStyle(searchSubmit!).height).toBe('28px');
    expect(compiled.querySelector('.inbox-controls')?.textContent).not.toContain(
      'Accept all documents',
    );
    expect(panelActions).toHaveLength(1);
    expect(panelActions[0].querySelector('.toolbar__search-input')).toBeNull();
    expect(panelActions[0].textContent).toContain('Accept all documents');
    expect(panelActions[0].textContent).not.toContain('Accept 0 documents');
    expect(panelActions[0].textContent).not.toContain('Reprocess');
    expect(panelActions[0].nextElementSibling?.querySelector('nz-table')).not.toBeNull();
  });

  it('searches the inbox with trimmed query text', async () => {
    vi.useFakeTimers();
    const { component, documentsApi } = await createComponent();
    documentsApi.searchInbox.mockClear();

    component.searchControl.setValue(' invoice ');
    vi.advanceTimersByTime(299);

    expect(documentsApi.searchInbox).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);

    expect(documentsApi.searchInbox).toHaveBeenCalledOnce();
    expect(documentsApi.searchInbox).toHaveBeenLastCalledWith({
      page: 1,
      pageSize: 50,
      query: 'invoice',
      searchFields: ['title', 'content', 'sender', 'tags'],
      sortBy: 'documentDate',
      sortDirection: 'desc',
    });
  });

  it('loads the inbox sorted by date descending by default', async () => {
    const { documentsApi } = await createComponent();

    expect(documentsApi.searchInbox).toHaveBeenCalledWith({
      page: 1,
      pageSize: 50,
      searchFields: ['title', 'content', 'sender', 'tags'],
      sortBy: 'documentDate',
      sortDirection: 'desc',
    });
  });

  it('does not load inbox documents or show a load error without active tenants', async () => {
    const { component, documentsApi, fixture } = await createComponent({
      hasNoActiveTenants: true,
    });
    fixture.detectChanges();

    expect(documentsApi.searchInbox).not.toHaveBeenCalled();
    expect(component.documents()).toEqual([]);
    expect(component.error()).toBeNull();
    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain(
      'Inbox could not be loaded.',
    );
  });

  it('keeps the table visible when an active search has no matches', async () => {
    const { component, fixture } = await createComponent({
      searchResponse: {
        items: [],
        meta: {
          page: 1,
          pageSize: 50,
          totalItems: 0,
          totalPages: 0,
        },
      },
    });

    component.searchControl.setValue('missing', { emitEvent: false });
    component.reload();
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('nz-table.inbox-table')).not.toBeNull();
    expect(compiled.querySelector('nz-empty.page-empty-state')).toBeNull();
    expect(compiled.textContent).toContain('No results found');
  });

  it('keeps the inbox date column content-sized', async () => {
    const { component, fixture } = await createComponent();
    const compiled = fixture.nativeElement as HTMLElement;

    expect('tableColumnWidths' in component).toBe(false);
    expect('tableScrollX' in component).toBe(false);
    expect(compiled.querySelector('th.col-date')?.getAttribute('aria-sort')).toBe('descending');
    expect(compiled.querySelector('th.col-status')).toBeNull();
    expect(compiled.querySelector('td.col-status')).toBeNull();
  });

  it('renders non-ready status chips next to the inbox document title only', async () => {
    const processingDocument = {
      ...documentSummary,
      id: '018f1a44-9093-7f55-a515-278f4d9bd9a0',
      status: 'AI_RUNNING' as const,
    };
    const { fixture } = await createComponent({
      searchResponse: {
        items: [documentSummary, processingDocument],
        meta: {
          page: 1,
          pageSize: 50,
          totalItems: 2,
          totalPages: 1,
        },
      },
    });
    const compiled = fixture.nativeElement as HTMLElement;

    expect(compiled.querySelectorAll('.col-title .row-status')).toHaveLength(1);
    expect(compiled.querySelector('.col-title .row-status')?.textContent).toContain('AI running');
  });

  it('renders tenant chips next to document titles in the all tenants scope', async () => {
    const { fixture } = await createComponent({
      hasMultipleActiveTenants: true,
      isAllTenantsScope: true,
    });
    const compiled = fixture.nativeElement as HTMLElement;
    const tenantChip = compiled.querySelector<HTMLElement>('.col-title .row-tenant');

    expect(tenantChip).not.toBeNull();
    expect(tenantChip?.textContent).toContain('Default');
    expect(tenantChip?.getAttribute('title')).toBe('Default');
  });

  it('does not render tenant chips for a specific tenant scope', async () => {
    const { fixture } = await createComponent({
      hasMultipleActiveTenants: true,
    });
    const compiled = fixture.nativeElement as HTMLElement;

    expect(compiled.querySelector('.col-title .row-tenant')).toBeNull();
  });

  it('renders row actions with reprocess and delete buttons', async () => {
    const { fixture } = await createComponent();
    const compiled = fixture.nativeElement as HTMLElement;
    const rowActionButtons = compiled.querySelectorAll<HTMLButtonElement>('td.col-actions button');

    const actionsHeader = compiled.querySelector('th.col-actions');

    expect(actionsHeader).not.toBeNull();
    expect(actionsHeader?.textContent?.trim()).toBe('');
    expect(actionsHeader?.getAttribute('aria-label')).toBe('Actions');
    expect(compiled.querySelector('td.col-actions')).not.toBeNull();
    expect(rowActionButtons).toHaveLength(2);
    expect(rowActionButtons[0].querySelector('.anticon-sync')).not.toBeNull();
    expect(rowActionButtons[0].getAttribute('aria-label')).toBe('Reprocess Invoice');
    expect(rowActionButtons[1].querySelector('.anticon-delete')).not.toBeNull();
    expect(rowActionButtons[1].getAttribute('aria-label')).toBe('Delete Invoice');
  });

  it('vertically centers table cells with row action buttons', async () => {
    const { fixture } = await createComponent();
    const compiled = fixture.nativeElement as HTMLElement;
    const titleCell = compiled.querySelector<HTMLElement>('td.col-title');
    const actionsCell = compiled.querySelector<HTMLElement>('td.col-actions');

    expect(titleCell).not.toBeNull();
    expect(actionsCell).not.toBeNull();
    expect(getComputedStyle(titleCell!).verticalAlign).toBe('middle');
    expect(getComputedStyle(actionsCell!).verticalAlign).toBe('middle');
  });

  it('does not render tenant or AI processed table columns', async () => {
    const { fixture } = await createComponent();
    const compiled = fixture.nativeElement as HTMLElement;

    expect(compiled.querySelector('th.col-tenant')).toBeNull();
    expect(compiled.querySelector('td.col-tenant')).toBeNull();
    expect(compiled.querySelector('th.col-ai')).toBeNull();
    expect(compiled.querySelector('td.col-ai')).toBeNull();
    expect(compiled.textContent).not.toContain('Tenant');
    expect(compiled.textContent).not.toContain('AI processed');
  });

  it('shows selection actions only after a document is selected', async () => {
    const { component, fixture } = await createComponent();
    const leftActionButtons = () =>
      Array.from(
        (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>(
          '.app-table-panel__actions-group--left button',
        ),
      );
    const rightActionButtons = () =>
      Array.from(
        (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>(
          '.app-table-panel__actions-group--right button',
        ),
      );

    expect(fixture.nativeElement.textContent).toContain('Accept all documents');
    expect(fixture.nativeElement.textContent).not.toContain('Accept 0 documents');
    expect(fixture.nativeElement.textContent).not.toContain('Reprocess');
    expect(leftActionButtons()).toHaveLength(1);
    expect(rightActionButtons()).toHaveLength(1);
    expect(leftActionButtons()[0].textContent).toContain('Edit');
    expect(rightActionButtons()[0].textContent).toContain('Accept all documents');
    expect(leftActionButtons()[0].disabled).toBe(false);

    component.toggleDocument(documentSummary, true);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Accept 1 documents');
    expect(fixture.nativeElement.textContent).toContain('Reprocess');
    expect(leftActionButtons()).toHaveLength(2);
    expect(rightActionButtons()).toHaveLength(2);
    expect(leftActionButtons()[0].textContent).toContain('Edit');
    expect(leftActionButtons()[1].textContent).toContain('Reprocess');
    expect(rightActionButtons()[0].textContent).toContain('Accept 1 documents');
    expect(rightActionButtons()[1].textContent).toContain('Accept all documents');
    expect(leftActionButtons()[0].disabled).toBe(false);
    expect(leftActionButtons()[1].disabled).toBe(false);
    expect(leftActionButtons()[0].classList.contains('ant-btn')).toBe(true);
    expect(rightActionButtons()[0].disabled).toBe(false);
  });

  it('reprocesses selected documents through the existing document endpoint', async () => {
    const { component, documentsApi } = await createComponent();
    component.toggleDocument(documentSummary, true);

    component.reprocessSelected();

    expect(documentsApi.reprocess).toHaveBeenCalledWith(documentSummary.id);
    expect(component.selectedDocumentIds().size).toBe(0);
  });

  it('rotates selected PDF documents through the reprocess endpoint', async () => {
    const { component, documentsApi } = await createComponent();
    component.toggleDocument(documentSummary, true);

    component.reprocessSelectedRotated();

    expect(documentsApi.reprocess).toHaveBeenCalledWith(documentSummary.id, {
      action: 'ROTATE_180',
    });
  });

  it('reprocesses one row document through the row action methods', async () => {
    const { component, documentsApi } = await createComponent();

    component.reprocessDocument(documentSummary);
    component.reprocessDocumentRotated(documentSummary);
    component.reprocessDocumentAi(documentSummary);

    expect(documentsApi.reprocess).toHaveBeenCalledWith(documentSummary.id);
    expect(documentsApi.reprocess).toHaveBeenCalledWith(documentSummary.id, {
      action: 'ROTATE_180',
    });
    expect(documentsApi.triggerAiExtraction).toHaveBeenCalledWith(documentSummary.id);
  });

  it('deletes one row document and reloads the inbox', async () => {
    const { component, documentsApi } = await createComponent();
    documentsApi.searchInbox.mockClear();

    component.deleteDocument(documentSummary);

    expect(documentsApi.delete).toHaveBeenCalledWith(documentSummary.id);
    expect(documentsApi.searchInbox).toHaveBeenCalledOnce();
  });

  it('loads and revokes thumbnail object URLs for inbox previews', async () => {
    const thumbnailDocument = {
      ...documentSummary,
      thumbnailUrl: '/documents/document-id/thumbnail',
    };
    const { assets, component, documentsApi } = await createComponent({
      searchResponse: {
        items: [thumbnailDocument],
        meta: response.meta,
      },
    });

    expect(assets.loadObjectUrl).toHaveBeenCalledWith('/documents/document-id/thumbnail');
    expect(component.thumbnailUrl(thumbnailDocument)).toBe('blob:/documents/document-id/thumbnail');

    documentsApi.searchInbox.mockReturnValueOnce(
      of({
        items: [],
        meta: {
          page: 1,
          pageSize: 50,
          totalItems: 0,
          totalPages: 0,
        },
      }),
    );
    component.reload();

    expect(assets.revokeObjectUrl).toHaveBeenCalledWith('blob:/documents/document-id/thumbnail');
  });

  it('loads and appends the next inbox page', async () => {
    const { component, documentsApi } = await createComponent();
    const nextDocument = {
      ...documentSummary,
      id: '018f1a44-9093-7f55-a515-278f4d9bd9a2',
      title: 'Receipt',
    };
    component.meta.set({
      page: 1,
      pageSize: 50,
      totalItems: 2,
      totalPages: 2,
    });
    documentsApi.searchInbox.mockClear();
    documentsApi.searchInbox.mockReturnValueOnce(
      of({
        items: [nextDocument],
        meta: {
          page: 2,
          pageSize: 50,
          totalItems: 2,
          totalPages: 2,
        },
      }),
    );

    component.loadNextPage();

    expect(documentsApi.searchInbox).toHaveBeenCalledWith(
      expect.objectContaining({ page: 2, pageSize: 50 }),
    );
    expect(component.documents().map((document) => document.title)).toEqual(['Invoice', 'Receipt']);
  });

  it('renders editable metadata controls and the searchable document type dropdown', async () => {
    const { component, fixture } = await createComponent();
    component.startEdit();
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;

    expect(compiled.querySelector<HTMLInputElement>('input[formcontrolname="title"]')?.value).toBe(
      'Invoice',
    );
    expect(compiled.querySelector<HTMLInputElement>('input[formcontrolname="sender"]')?.value).toBe(
      'Sender GmbH',
    );
    expect(compiled.querySelector('nz-select[formcontrolname="documentTypeId"]')).not.toBeNull();
    expect(compiled.querySelector('nz-select[nzshowsearch]')).not.toBeNull();
    expect(
      compiled.querySelector<HTMLInputElement>('input[formcontrolname="documentDate"]'),
    ).not.toBeNull();
  });

  it('shows save and revert actions while hiding accept and reprocess actions on changes', async () => {
    const { component, fixture } = await createComponent();

    component.startEdit();
    component.rows()[0].form.controls.title.setValue('Updated invoice');
    fixture.detectChanges();

    const leftActionButtons = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>(
        '.app-table-panel__actions-group--left button',
      ),
    );
    const rightActionButtons = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>(
        '.app-table-panel__actions-group--right button',
      ),
    );

    expect(fixture.nativeElement.textContent).toContain('Save changes');
    expect(fixture.nativeElement.textContent).toContain('Revert changes');
    expect(fixture.nativeElement.textContent).not.toContain('Accept all documents');
    expect(fixture.nativeElement.textContent).not.toContain('Reprocess');
    expect(leftActionButtons).toHaveLength(1);
    expect(rightActionButtons).toHaveLength(2);
    expect(leftActionButtons[0].textContent).toContain('Cancel edit');
    expect(rightActionButtons[0].textContent).toContain('Revert changes');
    expect(rightActionButtons[1].textContent).toContain('Save changes');
  });

  it('saves cleared inbox fields as null values', async () => {
    const datedDocument = {
      ...documentSummary,
      documentDate: '2026-05-07T00:00:00.000Z',
    };
    const { component, documentsApi } = await createComponent({
      searchResponse: {
        items: [datedDocument],
        meta: response.meta,
      },
    });
    const row = component.rows()[0];
    component.startEdit();
    row.form.controls.title.setValue('');
    row.form.controls.sender.setValue('');
    row.form.controls.documentTypeId.setValue(null);
    row.form.controls.documentDate.setValue('');

    component.saveChanges();

    expect(documentsApi.updateMetadata).toHaveBeenCalledWith(datedDocument.id, {
      title: null,
      sender: null,
      documentTypeId: null,
      documentDate: null,
    });
  });

  it('highlights changed fields and reverts to original values', async () => {
    const { component, fixture } = await createComponent();
    const row = component.rows()[0];
    row.form.controls.sender.setValue('New Sender');
    fixture.detectChanges();

    expect(
      (fixture.nativeElement as HTMLElement).querySelector('td.col-sender')?.classList,
    ).toContain('is-changed-field');

    component.revertChanges();
    fixture.detectChanges();

    expect(row.form.controls.sender.value).toBe('Sender GmbH');
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('td.col-sender')?.classList,
    ).not.toContain('is-changed-field');
  });
});
