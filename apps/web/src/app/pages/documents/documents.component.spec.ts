import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  AppstoreOutline,
  CalendarOutline,
  CheckCircleOutline,
  ClockCircleOutline,
  CloseCircleOutline,
  DeleteOutline,
  DownOutline,
  DownloadOutline,
  DollarOutline,
  EyeOutline,
  FileOutline,
  FileTextOutline,
  FireOutline,
  FolderOpenOutline,
  FolderOutline,
  InboxOutline,
  PushpinOutline,
  ScanOutline,
  SearchOutline,
  SyncOutline,
  UnorderedListOutline,
  UserOutline,
} from '@ant-design/icons-angular/icons';
import { provideRouter, Router } from '@angular/router';
import type {
  DocumentDetailDto,
  DocumentSearchFacetsResponse,
  DocumentSearchResponse,
  DocumentSummaryDto,
  RealtimeDocumentChangedEvent,
} from '@smart-dms/shared-dto';
import { NzContextMenuService, type NzDropdownMenuComponent } from 'ng-zorro-antd/dropdown';
import { provideNzIcons } from 'ng-zorro-antd/icon';
import { of } from 'rxjs';
import { AuthenticatedAssetService } from '../../core/api/authenticated-asset.service';
import { AiApiService } from '../../core/api/ai-api.service';
import { DocumentApiService } from '../../core/api/document-api.service';
import { LanguageService } from '../../core/i18n/language.service';
import { AuthService } from '../../core/services/auth.service';
import { OpenDocumentsService } from '../../core/services/open-documents.service';
import { RealtimeClientService } from '../../core/services/realtime-client.service';
import { TenantContextService } from '../../core/services/tenant-context.service';
import { provideI18nTesting } from '../../testing/i18n-testing';
import { DocumentsComponent } from './documents.component';

const documentResponse: DocumentSearchResponse = {
  items: [],
  meta: {
    page: 1,
    pageSize: 25,
    totalItems: 0,
    totalPages: 0,
  },
};

const searchFacetsResponse: DocumentSearchFacetsResponse = {
  tags: [
    {
      id: '018f1a44-9093-7f55-a515-278f4d9bd991',
      name: 'tax',
      createdAt: '2026-05-07T18:00:00.000Z',
      createdBy: null,
    },
  ],
  senders: ['Sender GmbH'],
  documentTypes: [
    {
      id: '018f1a44-9093-7f55-a515-278f4d9bd992',
      key: 'invoice',
      name: 'Invoice',
      active: true,
      isSystem: true,
      displayOrder: 10,
      createdAt: '2026-05-07T18:00:00.000Z',
      updatedAt: '2026-05-07T18:00:00.000Z',
    },
  ],
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
  documentType: searchFacetsResponse.documentTypes[0],
  originalFileName: 'invoice.pdf',
  source: 'UPLOAD',
  mimeType: 'application/pdf',
  status: 'READY',
  createdAt: '2026-05-07T18:00:00.000Z',
  updatedAt: '2026-05-07T18:00:00.000Z',
  acceptedAt: '2026-05-07T18:00:00.000Z',
  acceptedById: null,
  aiProcessedAt: null,
  documentDate: null,
  summary: null,
  sender: 'Sender GmbH',
  recipient: null,
  note: null,
  fileSize: 1234,
  pageCount: 1,
  tags: searchFacetsResponse.tags.map((tag) => ({
    ...tag,
    source: 'AI_EXTRACTED',
  })),
  thumbnailUrl: null,
  calendarEventKinds: [],
};

const documentDetail: DocumentDetailDto = {
  ...documentSummary,
  ocrText: null,
  failedReason: null,
  pdfUrl: '/api/documents/doc-a/pdf',
  attributes: [],
  payments: [],
  references: [],
  fieldDefinitions: [],
  documentTypes: searchFacetsResponse.documentTypes,
  artifacts: [],
  calendarEvents: [],
};

const documentEvent: RealtimeDocumentChangedEvent = {
  type: 'document.changed',
  documentId: '018f1a44-9093-7f55-a515-278f4d9bd990',
  tenantId: tenant.id,
  status: 'OCR_PENDING',
  reason: 'DOCUMENT_REPROCESS_REQUESTED',
  changedAt: '2026-05-07T18:05:01.000Z',
};

const documentsViewModeStorageKey = 'smart-dms-documents-view-mode';
const documentsPageSizeStorageKey = 'smart-dms-documents-page-size';

async function createComponent(
  latestDocumentChange = signal<RealtimeDocumentChangedEvent | null>(null),
  locale = 'en-US',
) {
  const documentsApi = {
    search: vi.fn().mockReturnValue(of(documentResponse)),
    searchFacets: vi.fn().mockReturnValue(of(searchFacetsResponse)),
    detail: vi.fn().mockReturnValue(of(documentDetail)),
    archive: vi.fn().mockReturnValue(of(undefined)),
    moveToInbox: vi.fn().mockReturnValue(of(undefined)),
    delete: vi.fn().mockReturnValue(of(undefined)),
    reprocess: vi.fn().mockReturnValue(
      of({
        documentId: documentSummary.id,
        jobId: '018f1a44-9093-7f55-a515-278f4d9bd9aa',
        status: 'OCR_PENDING',
      }),
    ),
    triggerAiExtraction: vi.fn().mockReturnValue(of({ documentId: documentSummary.id })),
    triggerBulkAiExtraction: vi.fn(),
  };
  const assets = {
    loadObjectUrl: vi.fn().mockReturnValue(of('blob:http://localhost/doc-a')),
    revokeObjectUrl: vi.fn(),
  };
  const openedDocumentIds = new Set<string>();
  const openDocuments = {
    open: vi.fn((document: { readonly id: string }) => {
      openedDocumentIds.add(document.id);
    }),
    close: vi.fn((documentId: string) => {
      openedDocumentIds.delete(documentId);
      return null;
    }),
    isOpen: vi.fn((documentId: string) => openedDocumentIds.has(documentId)),
  };
  const contextMenu = {
    create: vi.fn(),
    close: vi.fn(),
  };

  const testingModule = TestBed.configureTestingModule({
    imports: [DocumentsComponent],
    providers: [
      provideRouter([]),
      provideI18nTesting(),
      provideNzIcons([
        AppstoreOutline,
        CalendarOutline,
        CheckCircleOutline,
        ClockCircleOutline,
        CloseCircleOutline,
        DeleteOutline,
        DownOutline,
        DownloadOutline,
        DollarOutline,
        EyeOutline,
        FileOutline,
        FileTextOutline,
        FireOutline,
        FolderOpenOutline,
        FolderOutline,
        InboxOutline,
        PushpinOutline,
        ScanOutline,
        SearchOutline,
        SyncOutline,
        UnorderedListOutline,
        UserOutline,
      ]),
      {
        provide: AiApiService,
        useValue: {
          availability: vi.fn().mockReturnValue(of({ enabled: true, providers: [] })),
        },
      },
      {
        provide: AuthService,
        useValue: { canEditDocuments: () => true, isAdmin: () => true },
      },
      {
        provide: TenantContextService,
        useValue: {
          activeScope: () => tenant.id,
          activeTenant: () => tenant,
          hasNoActiveTenants: () => false,
          hasMultipleActiveTenants: () => false,
          isAllTenants: () => false,
          uploadTenantOptions: () => [tenant],
        },
      },
      { provide: DocumentApiService, useValue: documentsApi },
      { provide: LanguageService, useValue: { currentLocale: signal(locale) } },
      { provide: AuthenticatedAssetService, useValue: assets },
      { provide: OpenDocumentsService, useValue: openDocuments },
      {
        provide: RealtimeClientService,
        useValue: { latestDocumentChange },
      },
    ],
  });
  TestBed.overrideProvider(NzContextMenuService, { useValue: contextMenu });
  await testingModule.compileComponents();

  const fixture = TestBed.createComponent(DocumentsComponent);
  const router = TestBed.inject(Router);
  const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
  fixture.detectChanges();

  return {
    component: fixture.componentInstance,
    documentsApi,
    fixture,
    assets,
    contextMenu,
    latestDocumentChange,
    navigate,
    openDocuments,
  };
}

describe('DocumentsComponent', () => {
  afterEach(() => {
    document.documentElement.removeAttribute('data-theme');
    localStorage.removeItem(documentsViewModeStorageKey);
    localStorage.removeItem(documentsPageSizeStorageKey);
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
  });

  it('uses the table view as the default document view mode', async () => {
    const { component } = await createComponent();

    expect(component.viewMode()).toBe('list');
  });

  it('initializes the document view mode from browser storage', async () => {
    localStorage.setItem(documentsViewModeStorageKey, 'grid');

    const { component } = await createComponent();

    expect(component.viewMode()).toBe('grid');
  });

  it('falls back to the table view for invalid stored document view modes', async () => {
    localStorage.setItem(documentsViewModeStorageKey, 'compact');

    const { component } = await createComponent();

    expect(component.viewMode()).toBe('list');
  });

  it('persists the selected document view mode in browser storage', async () => {
    const { component } = await createComponent();

    component.setViewMode('grid');

    expect(localStorage.getItem(documentsViewModeStorageKey)).toBe('grid');
  });

  it('initializes and persists the selected document page size', async () => {
    localStorage.setItem(documentsPageSizeStorageKey, '50');

    const { component, documentsApi } = await createComponent();

    expect(component.pageSize()).toBe(50);
    expect(documentsApi.search).toHaveBeenLastCalledWith(expect.objectContaining({ pageSize: 50 }));

    component.pageSizeChanged(100);

    expect(component.pageSize()).toBe(100);
    expect(localStorage.getItem(documentsPageSizeStorageKey)).toBe('100');
    expect(documentsApi.search).toHaveBeenLastCalledWith(
      expect.objectContaining({ page: 1, pageSize: 100 }),
    );
  });

  it('debounces search query changes and reloads automatically', async () => {
    vi.useFakeTimers();
    const { component, documentsApi } = await createComponent();
    documentsApi.search.mockClear();
    component.page.set(3);

    component.filtersForm.controls.query.setValue(' invoice ');

    expect(documentsApi.search).not.toHaveBeenCalled();

    vi.advanceTimersByTime(299);

    expect(documentsApi.search).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);

    expect(component.page()).toBe(1);
    expect(documentsApi.search).toHaveBeenCalledOnce();
    expect(documentsApi.search).toHaveBeenLastCalledWith({
      page: 1,
      pageSize: 25,
      query: 'invoice',
      searchFields: ['title', 'content', 'sender', 'tags'],
      sortBy: 'documentDate',
      sortDirection: 'desc',
    });
  });

  it('searches title, content, sender, and tags by default and sends metadata filters to the API', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-13T10:00:00.000Z'));
    const { component, documentsApi } = await createComponent();

    component.filtersForm.controls.query.setValue('invoice');
    component.filtersForm.controls.tagNames.setValue(['tax']);
    component.filtersForm.controls.senders.setValue(['Sender GmbH']);
    component.filtersForm.controls.documentTypeIds.setValue([
      '018f1a44-9093-7f55-a515-278f4d9bd992',
    ]);
    component.filtersForm.controls.datePreset.setValue('last-week');
    component.reload();

    expect(documentsApi.search).toHaveBeenLastCalledWith({
      page: 1,
      pageSize: 25,
      query: 'invoice',
      searchFields: ['title', 'content', 'sender', 'tags'],
      sortBy: 'documentDate',
      sortDirection: 'desc',
      tagNames: ['tax'],
      senders: ['Sender GmbH'],
      documentTypeIds: ['018f1a44-9093-7f55-a515-278f4d9bd992'],
      visibleDateFrom: expect.any(String),
      visibleDateTo: expect.any(String),
    });
    const lastQuery = documentsApi.search.mock.lastCall?.[0];
    expect(lastQuery).toBeDefined();
    if (!lastQuery) {
      throw new Error('Expected a document search query.');
    }
    expect(new Date(lastQuery.visibleDateFrom!).getDate()).toBe(6);
    expect(new Date(lastQuery.visibleDateTo!).getDate()).toBe(13);
  });

  it('resets to the first page when filter values change', async () => {
    const { component, documentsApi } = await createComponent();
    component.page.set(3);

    component.filtersForm.controls.tagNames.setValue(['tax']);

    expect(component.page()).toBe(1);
    expect(documentsApi.search).toHaveBeenLastCalledWith(
      expect.objectContaining({
        page: 1,
        tagNames: ['tax'],
      }),
    );
  });

  it('applies table query sort through the backend search without table pagination', async () => {
    const { component, documentsApi } = await createComponent();

    component.tableQueryParamsChanged({
      pageIndex: 2,
      pageSize: 25,
      sort: [{ key: 'sender', value: 'ascend' }],
      filter: [],
    });

    expect(component.page()).toBe(1);
    expect(component.sortBy()).toBe('sender');
    expect(component.sortDirection()).toBe('asc');
    expect(documentsApi.search).toHaveBeenLastCalledWith(
      expect.objectContaining({
        page: 1,
        sortBy: 'sender',
        sortDirection: 'asc',
      }),
    );

    component.tableQueryParamsChanged({
      pageIndex: 2,
      pageSize: 25,
      sort: [{ key: 'sender', value: 'ascend' }],
      filter: [],
    });

    expect(component.page()).toBe(1);
    expect(documentsApi.search).toHaveBeenCalledTimes(2);
  });

  it('synchronizes table header filters with backend search filters', async () => {
    const { component, documentsApi } = await createComponent();

    component.statusFilterChanged(['READY']);
    component.senderFilterChanged(['Sender GmbH']);
    component.documentTypeFilterChanged(['018f1a44-9093-7f55-a515-278f4d9bd992']);
    component.dateFilterChanged('last-week');

    expect(component.filtersForm.controls.statuses.value).toEqual(['READY']);
    expect(documentsApi.search).toHaveBeenLastCalledWith(
      expect.objectContaining({
        page: 1,
        statuses: ['READY'],
        senders: ['Sender GmbH'],
        documentTypeIds: ['018f1a44-9093-7f55-a515-278f4d9bd992'],
        visibleDateFrom: expect.any(String),
        visibleDateTo: expect.any(String),
      }),
    );
  });

  it('resets filters, sorting, page, and scroll state without resetting page size', async () => {
    const { component, documentsApi } = await createComponent();
    component.pageSizeChanged(50);
    component.filtersForm.controls.query.setValue('invoice');
    component.filtersForm.controls.statuses.setValue(['READY']);
    component.sortBy.set('sender');
    component.sortDirection.set('asc');
    component.page.set(3);
    documentsApi.search.mockClear();

    component.resetListState();

    expect(component.filtersForm.getRawValue()).toEqual({
      query: '',
      statuses: [],
      tagNames: [],
      senders: [],
      documentTypeIds: [],
      datePreset: 'none',
    });
    expect(component.sortBy()).toBe('documentDate');
    expect(component.sortDirection()).toBe('desc');
    expect(component.page()).toBe(1);
    expect(component.pageSize()).toBe(50);
    expect(localStorage.getItem(documentsPageSizeStorageKey)).toBe('50');
    expect(documentsApi.search).toHaveBeenLastCalledWith({
      page: 1,
      pageSize: 50,
      searchFields: ['title', 'content', 'sender', 'tags'],
      sortBy: 'documentDate',
      sortDirection: 'desc',
    });
  });

  it('renders one full-width toolbar search and no toolbar filter controls', async () => {
    const { fixture } = await createComponent();
    const compiled = fixture.nativeElement as HTMLElement;

    expect(compiled.querySelector('.toolbar__search-fields')).toBeNull();
    expect(compiled.querySelector('.toolbar__filter')).toBeNull();
    expect(compiled.querySelector('.toolbar__search-group')).not.toBeNull();
  });

  it('places the document view toggle to the left of the toolbar search', async () => {
    const { fixture } = await createComponent();
    const compiled = fixture.nativeElement as HTMLElement;
    const viewToggle = compiled.querySelector<HTMLElement>('.view-toggle');
    const searchGroup = compiled.querySelector<HTMLElement>('.toolbar__search-group');
    const viewButtons = Array.from(
      compiled.querySelectorAll<HTMLButtonElement>('.view-toggle button'),
    );

    expect(viewToggle).not.toBeNull();
    expect(searchGroup).not.toBeNull();
    expect(
      viewToggle!.compareDocumentPosition(searchGroup!) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(viewButtons[0]?.getAttribute('title')).toBe('List view');
    expect(viewButtons[1]?.getAttribute('title')).toBe('Grid view');
  });

  it('renders only the empty state in list view when no documents exist', async () => {
    localStorage.setItem(documentsViewModeStorageKey, 'list');

    const { fixture } = await createComponent();
    const compiled = fixture.nativeElement as HTMLElement;

    expect(compiled.querySelector('.document-table')).toBeNull();
    expect(compiled.querySelector('.document-grid')).toBeNull();
    expect(compiled.querySelector('nz-empty')).not.toBeNull();
    expect(compiled.textContent).toContain('No documents found');
  });

  it('keeps the list table visible when an active search has no matches', async () => {
    localStorage.setItem(documentsViewModeStorageKey, 'list');

    const { component, fixture } = await createComponent();

    component.filtersForm.controls.query.setValue('missing', { emitEvent: false });
    component.reload();
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('nz-table.document-table')).not.toBeNull();
    expect(compiled.querySelector('.documents-controls .toolbar')).not.toBeNull();
    expect(compiled.querySelector('nz-empty.page-empty-state')).toBeNull();
    expect(compiled.textContent).toContain('No results found');
  });

  it('renders only the empty state in grid view when no documents exist', async () => {
    const { fixture } = await createComponent();
    const compiled = fixture.nativeElement as HTMLElement;

    expect(compiled.querySelector('.document-table')).toBeNull();
    expect(compiled.querySelector('.document-grid')).toBeNull();
    expect(compiled.querySelector('nz-empty')).not.toBeNull();
    expect(compiled.textContent).toContain('No documents found');
  });

  it('does not render the original file name in list view', async () => {
    const { component, fixture } = await createComponent();
    component.documents.set([documentSummary]);
    component.viewMode.set('list');

    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).not.toContain('invoice.pdf');
  });

  it('renders a PDF preview icon next to the document title in list view', async () => {
    const { component, fixture } = await createComponent();
    component.documents.set([documentSummary]);
    component.thumbnailUrls.set({ [documentSummary.id]: 'blob:http://localhost/thumb' });
    component.viewMode.set('list');

    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const previewLink = compiled.querySelector<HTMLAnchorElement>('.col-title .row-preview-link');

    expect(previewLink).not.toBeNull();
    expect(previewLink?.getAttribute('href')).toBe(`/documents/${documentSummary.id}`);
    expect(previewLink?.getAttribute('aria-label')).toBe('Open Invoice');
    expect(previewLink?.querySelector('.anticon-eye')).not.toBeNull();
  });

  it('renders unframed search controls without a page title', async () => {
    const { fixture } = await createComponent();
    const compiled = fixture.nativeElement as HTMLElement;
    const toolbar = compiled.querySelector('.toolbar');

    expect(compiled.querySelector('h1')).toBeNull();
    expect(compiled.querySelector('.documents-controls')).not.toBeNull();
    expect(compiled.querySelector('.toolbar')?.closest('.documents-controls')).not.toBeNull();
    expect(compiled.querySelector('.documents-header')).toBeNull();
    expect(compiled.querySelector('[data-testid="documents-upload-dropzone"]')).toBeNull();
    expect(compiled.querySelector('[data-testid="document-upload-action"]')).toBeNull();
    expect(toolbar).not.toBeNull();
    expect(['', 'none']).toContain(getComputedStyle(toolbar!).borderStyle);
    expect(['', 'rgba(0, 0, 0, 0)']).toContain(getComputedStyle(toolbar!).backgroundColor);
    expect(compiled.querySelector('.page-header')).toBeNull();
    expect(compiled.textContent).not.toContain('Search, processing, and metadata status');
    expect(compiled.textContent).not.toContain('Drop a PDF here or click to choose one.');
    expect(compiled.textContent).not.toContain('PDF up to');
    expect(compiled.textContent).not.toContain('AI for all');
    expect(compiled.textContent).not.toContain('documents.actions.aiForAll');
    expect(compiled.querySelector('a[href="/upload"]')).toBeNull();
  });

  it('keeps the reset list button aligned with adjacent toolbar controls', async () => {
    const { fixture } = await createComponent();
    const compiled = fixture.nativeElement as HTMLElement;
    const searchInput = compiled.querySelector<HTMLElement>('.toolbar__search-input');
    const resetButton = compiled.querySelector<HTMLElement>('.toolbar__action');
    const viewToggle = compiled.querySelector<HTMLElement>('.view-toggle');

    expect(searchInput).not.toBeNull();
    expect(resetButton).not.toBeNull();
    expect(viewToggle).not.toBeNull();
    expect(
      getComputedStyle(compiled).getPropertyValue('--documents-toolbar-control-height').trim(),
    ).toBe('32px');
    expect(getComputedStyle(resetButton!).height).toBe(getComputedStyle(searchInput!).height);
    expect(getComputedStyle(viewToggle!).height).toBe(getComputedStyle(searchInput!).height);
  });

  it('keeps document controls in the normal page toolbar for grid rows', async () => {
    const { component, fixture } = await createComponent();
    component.documents.set([documentSummary]);
    component.viewMode.set('grid');

    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;

    expect(compiled.querySelector('.documents-controls .toolbar')).not.toBeNull();
    expect(compiled.querySelector('.app-table-panel__actions')).toBeNull();
    expect(compiled.querySelector('.col-select')).toBeNull();
    expect(compiled.querySelector('.document-grid')).not.toBeNull();
  });

  it('keeps document controls in the normal page toolbar for list rows', async () => {
    const { component, fixture } = await createComponent();
    component.documents.set([documentSummary]);
    component.viewMode.set('list');

    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const panelActions = compiled.querySelector<HTMLElement>('.app-table-panel__actions');

    expect(compiled.querySelector('.documents-controls .toolbar')).not.toBeNull();
    expect(compiled.querySelector('.documents-controls')?.textContent).toContain('Reset filters');
    expect(panelActions).not.toBeNull();
    expect(panelActions?.textContent?.trim()).toBe('');
    expect(
      panelActions?.nextElementSibling?.querySelector('nz-table.document-table'),
    ).not.toBeNull();
    expect(getComputedStyle(panelActions!).display).not.toBe('none');
    expect(compiled.querySelector('app-table-panel nz-table.document-table')).not.toBeNull();
  });

  it('renders the list table with row actions and without tag columns', async () => {
    const { component, fixture } = await createComponent();
    component.documents.set([documentSummary]);
    component.viewMode.set('list');

    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.row-tags')).toBeNull();
    expect(compiled.querySelector('.col-ai')).toBeNull();
    expect(compiled.querySelector('.col-select')).not.toBeNull();
    const actionsHeader = compiled.querySelector('th.col-actions');
    expect(actionsHeader).not.toBeNull();
    expect(actionsHeader?.textContent?.trim()).toBe('');
    expect(actionsHeader?.getAttribute('aria-label')).toBe('Actions');
    expect(compiled.querySelector('td.col-actions .row-actions')).not.toBeNull();
    expect(compiled.querySelector('.row-thumb')).toBeNull();
    expect(compiled.querySelector('.row-thumb-link')).toBeNull();
    expect(compiled.querySelector('.col-indicators')).toBeNull();
    expect(compiled.querySelector('th[nzColumnKey="tags"]')).toBeNull();
    expect(compiled.textContent).not.toContain('tax');
  });

  it('vertically centers list table cells with row action buttons', async () => {
    const { component, fixture } = await createComponent();
    component.documents.set([documentSummary]);
    component.viewMode.set('list');

    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const titleCell = compiled.querySelector<HTMLElement>('td.col-title');
    const actionsCell = compiled.querySelector<HTMLElement>('td.col-actions');
    const titleRow = compiled.querySelector<HTMLElement>('.row-title');

    expect(titleCell).not.toBeNull();
    expect(actionsCell).not.toBeNull();
    expect(titleRow).not.toBeNull();
    expect(getComputedStyle(titleCell!).verticalAlign).toBe('middle');
    expect(getComputedStyle(actionsCell!).verticalAlign).toBe('middle');
    expect(getComputedStyle(titleRow!).alignItems).toBe('center');
  });

  it('keeps the list table responsive without horizontal scroll configuration', async () => {
    const { component } = await createComponent();

    expect('tableScroll' in component).toBe(false);
    expect('tableColumnWidths' in component).toBe(false);
  });

  it('renders checkbox selection only in the list table', async () => {
    const { component, fixture } = await createComponent();
    component.documents.set([documentSummary]);
    component.viewMode.set('list');

    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('th.col-select label[nz-checkbox]')).not.toBeNull();
    expect(compiled.querySelector('td.col-select label[nz-checkbox]')).not.toBeNull();
  });

  it('selects and clears all loaded list documents from the header checkbox', async () => {
    const { component } = await createComponent();
    const secondDocument = {
      ...documentSummary,
      id: '018f1a44-9093-7f55-a515-278f4d9bd9a2',
    };
    component.documents.set([documentSummary, secondDocument]);

    component.toggleAllLoadedDocuments(true);

    expect(component.allLoadedSelected()).toBe(true);
    expect(component.selectedDocumentIds()).toEqual(
      new Set([documentSummary.id, secondDocument.id]),
    );

    component.toggleAllLoadedDocuments(false);

    expect(component.selectedDocumentIds().size).toBe(0);
  });

  it('reports an indeterminate loaded selection state', async () => {
    const { component } = await createComponent();
    const secondDocument = {
      ...documentSummary,
      id: '018f1a44-9093-7f55-a515-278f4d9bd9a2',
    };
    component.documents.set([documentSummary, secondDocument]);

    component.toggleDocumentSelection(documentSummary, true);

    expect(component.someLoadedSelected()).toBe(true);
    expect(component.allLoadedSelected()).toBe(false);
  });

  it('syncs selected documents after a reload removes rows', async () => {
    const { component, documentsApi } = await createComponent();
    component.selectedDocumentIds.set(new Set([documentSummary.id, 'missing-document']));
    documentsApi.search.mockReturnValueOnce(
      of({
        items: [documentSummary],
        meta: {
          page: 1,
          pageSize: 25,
          totalItems: 1,
          totalPages: 1,
        },
      }),
    );

    component.reload();

    expect(component.selectedDocumentIds()).toEqual(new Set([documentSummary.id]));
  });

  it('renders an infinite loading control instead of document pagination', async () => {
    const { component, fixture } = await createComponent();
    component.documents.set([documentSummary]);
    component.meta.set({
      page: 1,
      pageSize: 25,
      totalItems: 2,
      totalPages: 2,
    });

    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('nz-pagination')).toBeNull();
    expect(compiled.querySelector('.document-pagination')).toBeNull();
    expect(compiled.querySelector('.document-infinite-loader')?.textContent).toContain('Load more');
  });

  it('loads and appends the next document page', async () => {
    const { component, documentsApi } = await createComponent();
    const nextDocument = {
      ...documentSummary,
      id: '018f1a44-9093-7f55-a515-278f4d9bd9a2',
      title: 'Receipt',
    };
    component.documents.set([documentSummary]);
    component.meta.set({
      page: 1,
      pageSize: 25,
      totalItems: 2,
      totalPages: 2,
    });
    documentsApi.search.mockClear();
    documentsApi.search.mockReturnValueOnce(
      of({
        items: [nextDocument],
        meta: {
          page: 2,
          pageSize: 25,
          totalItems: 2,
          totalPages: 2,
        },
      }),
    );

    component.loadNextPage();

    expect(documentsApi.search).toHaveBeenCalledOnce();
    expect(documentsApi.search).toHaveBeenLastCalledWith(
      expect.objectContaining({ page: 2, pageSize: 25 }),
    );
    expect(component.page()).toBe(2);
    expect(component.documents().map((document) => document.title)).toEqual(['Invoice', 'Receipt']);
    expect(component.hasMoreDocuments()).toBe(false);
  });

  it('renders status and date indicators next to the title without the AI title icon', async () => {
    const { component, fixture } = await createComponent();
    component.documents.set([
      {
        ...documentSummary,
        id: '018f1a44-9093-7f55-a515-278f4d9bd9a0',
        aiProcessedAt: '2026-05-07T19:00:00.000Z',
        calendarEventKinds: ['DEADLINE'],
      },
      {
        ...documentSummary,
        id: '018f1a44-9093-7f55-a515-278f4d9bd9a1',
        status: 'AI_RUNNING',
        aiProcessedAt: null,
      },
    ]);
    component.viewMode.set('list');

    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelectorAll('.row-ai-icon')).toHaveLength(0);
    expect(compiled.querySelectorAll('.col-title .row-status')).toHaveLength(1);
    expect(compiled.querySelector('.col-title .row-status')?.textContent).toContain('AI running');
    expect(compiled.querySelectorAll('.row-event-icon')).toHaveLength(1);
    expect(compiled.querySelector('.row-title .row-event-icon')).not.toBeNull();
    expect(compiled.querySelector('.col-ai')).toBeNull();
    expect(compiled.querySelector('th.col-status')).toBeNull();
    expect(compiled.querySelector('td.col-status')).toBeNull();
  });

  it('renders grid cards with indicators below the document date instead of tags', async () => {
    const { component, fixture } = await createComponent();
    component.documents.set([
      {
        ...documentSummary,
        aiProcessedAt: '2026-05-07T19:00:00.000Z',
        calendarEventKinds: ['DEADLINE'],
        documentDate: '2026-05-06T00:00:00.000Z',
      },
    ]);
    component.viewMode.set('grid');

    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const card = compiled.querySelector('.document-card');
    const details = card?.querySelector('.document-card__details');
    const indicators = card?.querySelector('.document-card__indicators');
    expect(card).not.toBeNull();
    expect(indicators).not.toBeNull();
    expect(details?.nextElementSibling).toBe(indicators);
    expect(indicators?.querySelector('.row-ai-icon')).not.toBeNull();
    expect(indicators?.querySelector('.row-event-icon')).not.toBeNull();
    expect(card?.querySelector('.document-card__badges')).toBeNull();
    expect(card?.querySelector('.document-card__tags')).toBeNull();
    expect(card?.querySelector('.document-card__actions')).toBeNull();
    expect(card?.textContent).not.toContain('tax');

    const detailRows = [...(card?.querySelectorAll('.document-card__detail') ?? [])];
    expect(detailRows).toHaveLength(3);
    expect(card?.textContent).not.toContain('Default');
    expect(detailRows[0].textContent).toContain('Sender GmbH');
    expect(detailRows[1].textContent).toContain('Invoice');
    expect(detailRows[2].textContent).toContain('May 6, 2026');
  });

  it('uses the dark overlay for the grid status badge in dark mode', async () => {
    document.documentElement.setAttribute('data-theme', 'dark');

    const { component, fixture } = await createComponent();
    component.documents.set([documentSummary]);
    component.viewMode.set('grid');

    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const statusBadge = compiled.querySelector<HTMLElement>('.document-card__status .ant-tag');

    expect(statusBadge).not.toBeNull();
    expect(getComputedStyle(statusBadge!).backgroundColor).toBe('rgba(26, 29, 33, 0.92)');
  });

  it('formats document table dates with the selected language locale', async () => {
    const { component, fixture } = await createComponent(undefined, 'de-DE');
    component.documents.set([
      {
        ...documentSummary,
        documentDate: '2026-06-30T00:00:00.000Z',
      },
    ]);
    component.viewMode.set('list');

    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('30. Juni 2026');
  });

  it('keeps only the combined context menu document action handler', async () => {
    const { component } = await createComponent();

    expect('showAndOpenContextDocument' in component).toBe(true);
    expect('showContextDocument' in component).toBe(false);
    expect('openContextDocument' in component).toBe(false);
  });

  it('does not create an open document entry for primary document clicks', async () => {
    const { component, openDocuments } = await createComponent();
    const event = new MouseEvent('auxclick', { button: 0, cancelable: true });

    component.handleDocumentAuxClick(event, documentSummary);

    expect(event.defaultPrevented).toBe(false);
    expect(openDocuments.open).not.toHaveBeenCalled();
  });

  it('creates an open document entry for middle-click without navigating', async () => {
    const { component, navigate, openDocuments } = await createComponent();
    const event = new MouseEvent('auxclick', { button: 1, cancelable: true });

    component.handleDocumentAuxClick(event, documentSummary);

    expect(event.defaultPrevented).toBe(true);
    expect(openDocuments.open).toHaveBeenCalledWith({
      id: documentSummary.id,
      title: documentSummary.title,
    });
    expect(navigate).not.toHaveBeenCalled();
  });

  it('opens all selected documents through the open document service', async () => {
    const { component, openDocuments } = await createComponent();
    const secondDocument = {
      ...documentSummary,
      id: '018f1a44-9093-7f55-a515-278f4d9bd9a2',
      title: 'Receipt',
    };
    component.documents.set([documentSummary, secondDocument]);
    component.toggleAllLoadedDocuments(true);

    component.openSelectedDocuments();

    expect(openDocuments.open).toHaveBeenCalledWith({
      id: documentSummary.id,
      title: documentSummary.title,
    });
    expect(openDocuments.open).toHaveBeenCalledWith({
      id: secondDocument.id,
      title: secondDocument.title,
    });
  });

  it('toggles a table row document between pinned and unpinned states', async () => {
    const { component, openDocuments } = await createComponent();

    component.toggleOpenDocument(documentSummary);
    component.toggleOpenDocument(documentSummary);

    expect(openDocuments.open).toHaveBeenCalledWith({
      id: documentSummary.id,
      title: documentSummary.title,
    });
    expect(openDocuments.close).toHaveBeenCalledWith(documentSummary.id);
  });

  it('renders compact table row action buttons for pin, download, and move', async () => {
    const { component, fixture } = await createComponent();
    component.documents.set([documentSummary]);
    component.viewMode.set('list');

    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const rowActionButtons = [
      ...(compiled.querySelectorAll<HTMLButtonElement>('td.col-actions .row-actions button') ?? []),
    ];

    expect(rowActionButtons).toHaveLength(3);
    expect(rowActionButtons.map((button) => button.getAttribute('aria-label'))).toEqual([
      'Pin Invoice',
      'Download PDF Invoice',
      'Move Invoice',
    ]);
    expect(rowActionButtons.some((button) => button.classList.contains('ant-btn-circle'))).toBe(
      false,
    );
    expect(rowActionButtons.some((button) => button.classList.contains('ant-btn-sm'))).toBe(false);
  });

  it('downloads selected PDFs and reports documents without PDFs as partial failures', async () => {
    const { assets, component, documentsApi } = await createComponent();
    const secondDocument = {
      ...documentSummary,
      id: '018f1a44-9093-7f55-a515-278f4d9bd9a2',
      title: 'Receipt',
    };
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
    component.documents.set([documentSummary, secondDocument]);
    component.toggleAllLoadedDocuments(true);
    documentsApi.detail.mockImplementation((documentId: string) =>
      of({
        ...documentDetail,
        id: documentId,
        pdfUrl: documentId === documentSummary.id ? '/api/documents/doc-a/pdf' : null,
      }),
    );

    component.downloadSelectedDocuments();

    expect(documentsApi.detail).toHaveBeenCalledTimes(2);
    expect(assets.loadObjectUrl).toHaveBeenCalledOnce();
    expect(click).toHaveBeenCalledOnce();
    expect(component.bulkError()).toBe('documents.bulk.errors.downloadFailed');
  });

  it('downloads a single table row document through the same PDF flow', async () => {
    const { assets, component, documentsApi } = await createComponent();
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);

    component.downloadDocument(documentSummary);

    expect(documentsApi.detail).toHaveBeenCalledWith(documentSummary.id);
    expect(assets.loadObjectUrl).toHaveBeenCalledWith(documentDetail.pdfUrl);
    expect(click).toHaveBeenCalledOnce();
    expect(component.bulkError()).toBeNull();
  });

  it('starts AI only for selected documents that can be processed', async () => {
    const { component, documentsApi } = await createComponent();
    const lockedDocument = {
      ...documentSummary,
      id: '018f1a44-9093-7f55-a515-278f4d9bd9a2',
      status: 'AI_RUNNING' as const,
    };
    component.documents.set([documentSummary, lockedDocument]);
    component.toggleAllLoadedDocuments(true);

    component.startAiForSelectedDocuments();

    expect(documentsApi.triggerAiExtraction).toHaveBeenCalledOnce();
    expect(documentsApi.triggerAiExtraction).toHaveBeenCalledWith(documentSummary.id);
    expect(component.selectedDocumentIds().size).toBe(0);
  });

  it('archives selected documents only after confirmation', async () => {
    const { component, documentsApi } = await createComponent();
    const lockedDocument = {
      ...documentSummary,
      id: '018f1a44-9093-7f55-a515-278f4d9bd9a2',
      status: 'AI_PENDING' as const,
    };
    component.documents.set([documentSummary, lockedDocument]);
    component.toggleAllLoadedDocuments(true);

    component.archiveSelectedDocuments();

    expect(component.pendingBulkMove()).toEqual({
      target: 'archive',
      documents: [documentSummary],
    });
    expect(documentsApi.archive).not.toHaveBeenCalled();

    component.confirmBulkMove();

    expect(documentsApi.archive).toHaveBeenCalledOnce();
    expect(documentsApi.archive).toHaveBeenCalledWith(documentSummary.id);
    expect(component.pendingBulkMove()).toBeNull();
    expect(component.selectedDocumentIds().size).toBe(0);
  });

  it('moves a single table row document only after confirmation', async () => {
    const { component, documentsApi } = await createComponent();

    component.archiveDocument(documentSummary);

    expect(component.pendingBulkMove()).toEqual({
      target: 'archive',
      documents: [documentSummary],
    });
    expect(documentsApi.archive).not.toHaveBeenCalled();

    component.confirmBulkMove();

    expect(documentsApi.archive).toHaveBeenCalledOnce();
    expect(documentsApi.archive).toHaveBeenCalledWith(documentSummary.id);
  });

  it('moves selected documents back to the inbox only after confirmation', async () => {
    const { component, documentsApi } = await createComponent();
    const lockedDocument = {
      ...documentSummary,
      id: '018f1a44-9093-7f55-a515-278f4d9bd9a2',
      status: 'AI_PENDING' as const,
    };
    component.documents.set([documentSummary, lockedDocument]);
    component.toggleAllLoadedDocuments(true);

    component.moveSelectedDocumentsToInbox();

    expect(component.pendingBulkMove()).toEqual({ target: 'inbox', documents: [documentSummary] });
    expect(documentsApi.moveToInbox).not.toHaveBeenCalled();

    component.confirmBulkMove();

    expect(documentsApi.moveToInbox).toHaveBeenCalledOnce();
    expect(documentsApi.moveToInbox).toHaveBeenCalledWith(documentSummary.id);
    expect(component.pendingBulkMove()).toBeNull();
    expect(component.selectedDocumentIds().size).toBe(0);
  });

  it('deletes selected documents only after trash confirmation', async () => {
    const { component, documentsApi } = await createComponent();
    component.documents.set([documentSummary]);
    component.toggleAllLoadedDocuments(true);

    component.requestTrashSelectedDocuments();

    expect(component.pendingBulkMove()).toEqual({ target: 'trash', documents: [documentSummary] });
    expect(documentsApi.delete).not.toHaveBeenCalled();

    component.confirmBulkMove();

    expect(documentsApi.delete).toHaveBeenCalledOnce();
    expect(documentsApi.delete).toHaveBeenCalledWith(documentSummary.id);
    expect(component.pendingBulkMove()).toBeNull();
    expect(component.selectedDocumentIds().size).toBe(0);
  });

  it('renders the bulk trash confirmation as permanent deletion', async () => {
    const { component, fixture } = await createComponent();
    component.documents.set([documentSummary]);
    component.toggleAllLoadedDocuments(true);

    component.requestTrashSelectedDocuments();
    fixture.detectChanges();

    expect(document.body.textContent).toContain(
      'Permanently delete 1 selected documents? This cannot be undone.',
    );
    expect(document.body.textContent).toContain('Delete permanently');
  });

  it('renders selected document actions right-aligned in the requested order', async () => {
    const { component, fixture } = await createComponent();
    component.documents.set([documentSummary]);
    component.viewMode.set('list');
    component.toggleAllLoadedDocuments(true);

    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const actions = compiled.querySelector<HTMLElement>('.app-table-panel__actions');
    const actionButtons = [
      ...(compiled.querySelectorAll<HTMLButtonElement>(
        '.app-table-panel__actions-group--right button',
      ) ?? []),
    ];

    expect(actions).not.toBeNull();
    expect(compiled.querySelector('.app-table-panel__actions-group--left')).toBeNull();
    expect(getComputedStyle(actions!).justifyContent).toBe('flex-end');
    expect(actionButtons.map((button) => button.textContent?.replace(/\s+/g, ' ').trim())).toEqual([
      'Pin',
      'Download',
      'Move',
    ]);
    expect(compiled.textContent).not.toContain('Start AI for selected');
    expect(compiled.textContent).not.toContain('Reprocess');
  });

  it('opens the document context menu for a selected document', async () => {
    const { component, contextMenu } = await createComponent();
    const event = new MouseEvent('contextmenu', { cancelable: true });
    const menu = {} as NzDropdownMenuComponent;

    component.openDocumentContextMenu(event, documentSummary, menu);

    expect(event.defaultPrevented).toBe(true);
    expect(component.contextDocument()).toBe(documentSummary);
    expect(contextMenu.create).toHaveBeenCalledWith(event, menu);
  });

  it('shows and opens a context document', async () => {
    const { component, navigate, openDocuments } = await createComponent();
    const event = new MouseEvent('contextmenu', { cancelable: true });

    component.openDocumentContextMenu(event, documentSummary, {} as NzDropdownMenuComponent);
    component.showAndOpenContextDocument();

    expect(openDocuments.open).toHaveBeenCalledWith({
      id: documentSummary.id,
      title: documentSummary.title,
    });
    expect(navigate).toHaveBeenCalledWith(['/documents', documentSummary.id]);
  });

  it('reloads the current list when a document change notification arrives', async () => {
    const { documentsApi, latestDocumentChange } = await createComponent();
    TestBed.flushEffects();

    expect(documentsApi.search).toHaveBeenCalledOnce();

    latestDocumentChange.set(documentEvent);
    TestBed.flushEffects();

    expect(documentsApi.search).toHaveBeenCalledTimes(2);
  });
});
