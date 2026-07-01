import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  effect,
  inject,
  OnInit,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import type {
  CalendarEventKind,
  DocumentDetailDto,
  DocumentSearchFacetsResponse,
  DocumentSearchField,
  DocumentSearchResponse,
  DocumentSearchSortBy,
  DocumentStatus,
  DocumentSummaryDto,
  DocumentTypeDto,
  SortDirection,
} from '@smart-dms/shared-dto';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzCheckboxModule } from 'ng-zorro-antd/checkbox';
import {
  NzContextMenuService,
  NzDropDownModule,
  type NzDropdownMenuComponent,
} from 'ng-zorro-antd/dropdown';
import { NzEmptyModule } from 'ng-zorro-antd/empty';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzMenuModule } from 'ng-zorro-antd/menu';
import { NzModalModule } from 'ng-zorro-antd/modal';
import { NzPopoverModule } from 'ng-zorro-antd/popover';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import {
  NzTableModule,
  type NzTableFilterList,
  type NzTableFilterValue,
  type NzTableQueryParams,
  type NzTableSortOrder,
} from 'ng-zorro-antd/table';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzTooltipModule } from 'ng-zorro-antd/tooltip';
import {
  catchError,
  debounceTime,
  distinctUntilChanged,
  EMPTY,
  filter,
  finalize,
  forkJoin,
  map,
  merge,
  of,
  switchMap,
  type Observable,
} from 'rxjs';
import { AuthenticatedAssetService } from '../../core/api/authenticated-asset.service';
import { AiApiService } from '../../core/api/ai-api.service';
import { DocumentApiService, type DocumentSearchQuery } from '../../core/api/document-api.service';
import { LanguageService } from '../../core/i18n/language.service';
import { AuthService } from '../../core/services/auth.service';
import { OpenDocumentsService } from '../../core/services/open-documents.service';
import { RealtimeClientService } from '../../core/services/realtime-client.service';
import { TenantContextService } from '../../core/services/tenant-context.service';
import { localizedLongDate } from '../../shared/formatters/date.formatter';
import { InfiniteTableScrollDirective } from '../../shared/table/infinite-table-scroll.directive';
import { TablePanelComponent } from '../../shared/table/table-panel.component';
import {
  calendarEventIcon,
  calendarEventKindLabelKey,
} from '../../shared/presentation/calendar-presentation';
import { AiLogoComponent } from '../../shared/ai-logo.component';
import {
  DOCUMENT_STATUSES,
  type DocumentAiIndicator,
  documentAiIndicator,
  documentAiIndicatorLabelKey,
  documentStatusColor,
  documentStatusIcon,
  documentStatusLabelKey,
  documentTypeDisplayName,
} from '../../shared/presentation/document-presentation';

type DocumentsFilterForm = FormGroup<{
  query: FormControl<string>;
  statuses: FormControl<DocumentStatus[]>;
  tagNames: FormControl<string[]>;
  senders: FormControl<string[]>;
  documentTypeIds: FormControl<string[]>;
  datePreset: FormControl<DocumentsDatePreset>;
}>;

export type DocumentsViewMode = 'grid' | 'list';

type DocumentsDatePreset =
  | 'none'
  | 'last-week'
  | 'last-month'
  | 'last-3-months'
  | 'last-6-months'
  | 'last-year';

type DocumentBulkMoveTarget = 'inbox' | 'archive' | 'trash';

interface DatePresetOption {
  readonly value: DocumentsDatePreset;
  readonly labelKey: string;
}

interface PendingDocumentBulkMove {
  readonly target: DocumentBulkMoveTarget;
  readonly documents: readonly DocumentSummaryDto[];
}

type DocumentBulkDownloadResult =
  | {
      readonly success: true;
      readonly detail: DocumentDetailDto;
      readonly objectUrl: string;
    }
  | {
      readonly success: false;
    };

type DocumentTableSortKey = Extract<
  DocumentSearchSortBy,
  'title' | 'documentType' | 'sender' | 'documentDate'
>;

const DOCUMENTS_VIEW_MODE_STORAGE_KEY = 'smart-dms-documents-view-mode';
const DOCUMENTS_PAGE_SIZE_STORAGE_KEY = 'smart-dms-documents-page-size';
const DEFAULT_DOCUMENTS_VIEW_MODE: DocumentsViewMode = 'list';
const DEFAULT_PAGE_SIZE = 25;
const DEFAULT_SORT_BY: DocumentTableSortKey = 'documentDate';
const DEFAULT_SORT_DIRECTION: SortDirection = 'desc';
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;
const DEFAULT_SEARCH_FIELDS: readonly DocumentSearchField[] = [
  'title',
  'content',
  'sender',
  'tags',
];
const SEARCH_QUERY_DEBOUNCE_MS = 300;
const INFINITE_SCROLL_THRESHOLD_PX = 240;
const AI_LOCKED_STATUSES = new Set<DocumentStatus>(['AI_PENDING', 'AI_RUNNING']);
const THUMBNAIL_POPOVER_DELAY_SECONDS = 0.7;

const DATE_PRESET_OPTIONS: DatePresetOption[] = [
  { value: 'none', labelKey: 'documents.filters.date.none' },
  { value: 'last-week', labelKey: 'documents.filters.date.lastWeek' },
  { value: 'last-month', labelKey: 'documents.filters.date.lastMonth' },
  { value: 'last-3-months', labelKey: 'documents.filters.date.last3Months' },
  { value: 'last-6-months', labelKey: 'documents.filters.date.last6Months' },
  { value: 'last-year', labelKey: 'documents.filters.date.lastYear' },
];

const TABLE_SORT_KEYS = new Set<DocumentTableSortKey>([
  'title',
  'documentType',
  'sender',
  'documentDate',
]);

@Component({
  selector: 'app-documents',
  imports: [
    ReactiveFormsModule,
    NgTemplateOutlet,
    RouterLink,
    TranslatePipe,
    NzAlertModule,
    NzButtonModule,
    NzCheckboxModule,
    NzDropDownModule,
    NzEmptyModule,
    NzIconModule,
    NzInputModule,
    NzMenuModule,
    NzModalModule,
    NzPopoverModule,
    NzSelectModule,
    NzSpinModule,
    NzTableModule,
    NzTagModule,
    NzTooltipModule,
    AiLogoComponent,
    InfiniteTableScrollDirective,
    TablePanelComponent,
  ],
  templateUrl: './documents.component.html',
  styleUrl: './documents.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DocumentsComponent implements OnInit {
  readonly auth = inject(AuthService);
  private readonly aiApi = inject(AiApiService);
  private readonly assets = inject(AuthenticatedAssetService);
  private readonly contextMenu = inject(NzContextMenuService);
  private readonly documentsApi = inject(DocumentApiService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly language = inject(LanguageService);
  private readonly openDocuments = inject(OpenDocumentsService);
  private readonly realtime = inject(RealtimeClientService);
  private readonly tenantContext = inject(TenantContextService);
  private readonly router = inject(Router);
  private readonly translate = inject(TranslateService);
  private readonly documentTableScroller =
    viewChild<InfiniteTableScrollDirective>('documentTableScroller');
  private readonly documentGrid = viewChild<unknown, ElementRef<HTMLElement>>('documentGrid', {
    read: ElementRef,
  });
  private lastDocumentChangeKey = this.documentChangeKey(this.realtime.latestDocumentChange());
  private lastTenantScope = this.tenantContext.activeScope();
  private infiniteScrollCheckScheduled = false;
  private searchRequestId = 0;
  private activeReplaceRequestId: number | null = null;
  private activeAppendRequestId: number | null = null;
  private readonly thumbnailObjectUrls = new Map<
    string,
    { readonly source: string; readonly objectUrl: string }
  >();

  readonly filtersForm: DocumentsFilterForm = new FormGroup({
    query: new FormControl('', { nonNullable: true }),
    statuses: new FormControl<DocumentStatus[]>([], { nonNullable: true }),
    tagNames: new FormControl<string[]>([], { nonNullable: true }),
    senders: new FormControl<string[]>([], { nonNullable: true }),
    documentTypeIds: new FormControl<string[]>([], { nonNullable: true }),
    datePreset: new FormControl<DocumentsDatePreset>('none', { nonNullable: true }),
  });
  readonly filterSnapshot = signal(this.filtersForm.getRawValue());
  readonly page = signal(1);
  readonly pageSize = signal(this.readStoredPageSize());
  readonly sortBy = signal<DocumentTableSortKey | null>(DEFAULT_SORT_BY);
  readonly sortDirection = signal<SortDirection | null>(DEFAULT_SORT_DIRECTION);
  readonly documents = signal<DocumentSummaryDto[]>([]);
  readonly selectedDocumentIds = signal<ReadonlySet<string>>(new Set());
  readonly aiAvailable = signal(false);
  readonly triggeringAiDocumentIds = signal<ReadonlySet<string>>(new Set());
  readonly contextDocument = signal<DocumentSummaryDto | null>(null);
  readonly pendingBulkMove = signal<PendingDocumentBulkMove | null>(null);
  readonly thumbnailUrls = signal<Record<string, string>>({});
  readonly searchFacets = signal<DocumentSearchFacetsResponse>({
    tags: [],
    senders: [],
    documentTypes: [],
  });
  readonly meta = signal<DocumentSearchResponse['meta']>({
    page: 1,
    pageSize: this.pageSize(),
    totalItems: 0,
    totalPages: 0,
  });
  readonly isLoading = signal(false);
  readonly isLoadingMore = signal(false);
  readonly isBulkActionRunning = signal(false);
  readonly bulkError = signal<string | null>(null);
  readonly viewMode = signal<DocumentsViewMode>(this.readStoredViewMode());
  readonly selectedDocuments = computed(() => {
    const selected = this.selectedDocumentIds();
    return this.documents().filter((document) => selected.has(document.id));
  });
  readonly hasSelectedDocuments = computed(() => this.selectedDocumentIds().size > 0);
  readonly allLoadedSelected = computed(() => {
    const documents = this.documents();
    const selected = this.selectedDocumentIds();
    return documents.length > 0 && documents.every((document) => selected.has(document.id));
  });
  readonly someLoadedSelected = computed(
    () =>
      this.documents().some((document) => this.isSelected(document)) && !this.allLoadedSelected(),
  );
  readonly canBulkOpen = computed(() => this.hasSelectedDocuments());
  readonly canBulkDownload = computed(() => this.hasSelectedDocuments());
  readonly canBulkStartAi = computed(() =>
    this.selectedDocuments().some((document) => this.canTriggerAi(document)),
  );
  readonly canBulkMove = computed(
    () =>
      this.auth.canEditDocuments() &&
      this.selectedDocuments().some((document) => this.canMoveDocument(document)),
  );
  readonly pendingBulkMoveTarget = computed(() => this.pendingBulkMove()?.target ?? 'inbox');
  readonly pendingBulkMoveDocuments = computed(() => this.pendingBulkMove()?.documents ?? []);
  readonly pendingBulkMoveTitleKey = computed(
    () => `documents.bulk.moveConfirm.${this.pendingBulkMoveTarget()}.title`,
  );
  readonly pendingBulkMoveMessageKey = computed(
    () => `documents.bulk.moveConfirm.${this.pendingBulkMoveTarget()}.message`,
  );
  readonly pendingBulkMoveConfirmKey = computed(
    () => `documents.bulk.moveConfirm.${this.pendingBulkMoveTarget()}.confirm`,
  );
  readonly pendingBulkMoveIcon = computed(() => {
    switch (this.pendingBulkMoveTarget()) {
      case 'archive':
        return 'folder';
      case 'trash':
        return 'delete';
      case 'inbox':
        return 'inbox';
    }
  });
  readonly hasMoreDocuments = computed(() => this.documents().length < this.meta().totalItems);
  readonly showTenantFields = computed(() => this.tenantContext.hasMultipleActiveTenants());
  readonly hasActiveSearch = computed(() => {
    const filters = this.filterSnapshot();
    return (
      filters.query.trim().length > 0 ||
      filters.statuses.length > 0 ||
      filters.tagNames.length > 0 ||
      filters.senders.length > 0 ||
      filters.documentTypeIds.length > 0 ||
      filters.datePreset !== 'none'
    );
  });
  readonly pageSizeOptions = [...PAGE_SIZE_OPTIONS];
  readonly sortDirections: NzTableSortOrder[] = ['ascend', 'descend', null];
  readonly datePresetOptions = DATE_PRESET_OPTIONS;
  readonly thumbnailPopoverDelaySeconds = THUMBNAIL_POPOVER_DELAY_SECONDS;
  readonly statusFilters = computed<NzTableFilterList>(() => {
    const selected = new Set(this.filterSnapshot().statuses);
    return DOCUMENT_STATUSES.map((status) => ({
      text: this.translate.instant(documentStatusLabelKey(status)),
      value: status,
      byDefault: selected.has(status),
    }));
  });
  readonly senderFilters = computed<NzTableFilterList>(() => {
    const selected = new Set(this.filterSnapshot().senders);
    return this.searchFacets().senders.map((sender) => ({
      text: sender,
      value: sender,
      byDefault: selected.has(sender),
    }));
  });
  readonly documentTypeFilters = computed<NzTableFilterList>(() => {
    const selected = new Set(this.filterSnapshot().documentTypeIds);
    return this.searchFacets().documentTypes.map((documentType) => ({
      text: this.documentTypeName(documentType),
      value: documentType.id,
      byDefault: selected.has(documentType.id),
    }));
  });
  readonly dateFilters = computed<NzTableFilterList>(() => {
    const selected = this.filterSnapshot().datePreset;
    return DATE_PRESET_OPTIONS.filter((option) => option.value !== 'none').map((option) => ({
      text: this.translate.instant(option.labelKey),
      value: option.value,
      byDefault: selected === option.value,
    }));
  });
  readonly documentStatusLabelKey = documentStatusLabelKey;
  readonly calendarEventKindLabelKey = calendarEventKindLabelKey;

  constructor() {
    this.destroyRef.onDestroy(() => {
      this.clearThumbnailObjectUrls();
    });
    this.subscribeToFilterChanges();
    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => {
        if (this.viewMode() === 'list' && this.router.url.startsWith('/documents')) {
          this.scheduleTableMeasurements();
        }
      });
    effect(() => {
      const tenantScope = this.tenantContext.activeScope();
      if (tenantScope === this.lastTenantScope) {
        return;
      }

      this.lastTenantScope = tenantScope;
      untracked(() => {
        this.loadSearchFacets();
        this.reload();
      });
    });
    effect(() => {
      const event = this.realtime.latestDocumentChange();
      const eventKey = this.documentChangeKey(event);
      if (!event || eventKey === this.lastDocumentChangeKey) {
        return;
      }

      this.lastDocumentChangeKey = eventKey;
      untracked(() => this.reload());
    });
  }

  ngOnInit(): void {
    this.loadAiAvailability();
    this.loadSearchFacets();
    this.reload();
  }

  reload(): void {
    this.filterSnapshot.set(this.filtersForm.getRawValue());
    this.page.set(1);
    this.load({ scrollToTop: true });
  }

  pageSizeChanged(pageSize: number): void {
    const nextPageSize = normalizePageSize(pageSize);
    if (this.pageSize() === nextPageSize) {
      return;
    }

    this.pageSize.set(nextPageSize);
    this.persistPageSize(nextPageSize);
    this.reload();
  }

  setViewMode(mode: DocumentsViewMode): void {
    this.viewMode.set(mode);
    this.persistViewMode(mode);
    if (mode === 'list') {
      this.scheduleTableMeasurements();
    }
    this.scheduleInfiniteScrollCheck();
  }

  tableSortOrder(column: DocumentTableSortKey): NzTableSortOrder {
    if (this.sortBy() !== column) {
      return null;
    }

    return this.sortDirection() === 'asc' ? 'ascend' : 'descend';
  }

  tableQueryParamsChanged(params: NzTableQueryParams): void {
    const nextPageSize = normalizePageSize(params.pageSize);
    const activeSort = params.sort.find(
      (entry) =>
        isTableSortKey(entry.key) && (entry.value === 'ascend' || entry.value === 'descend'),
    );
    const nextSortBy: DocumentTableSortKey | null =
      activeSort && isTableSortKey(activeSort.key) ? activeSort.key : null;
    const nextSortDirection =
      activeSort?.value === 'ascend' ? 'asc' : activeSort?.value === 'descend' ? 'desc' : null;
    const isPageSizeChanged = this.pageSize() !== nextPageSize;
    const isSortChanged =
      this.sortBy() !== nextSortBy || this.sortDirection() !== nextSortDirection;

    if (!isPageSizeChanged && !isSortChanged) {
      return;
    }

    if (isPageSizeChanged) {
      this.pageSize.set(nextPageSize);
      this.persistPageSize(nextPageSize);
    }

    if (isSortChanged) {
      this.sortBy.set(nextSortBy);
      this.sortDirection.set(nextSortDirection);
    }

    this.reload();
  }

  statusFilterChanged(value: NzTableFilterValue): void {
    this.setArrayFilterValue(this.filtersForm.controls.statuses, value);
  }

  senderFilterChanged(value: NzTableFilterValue): void {
    this.setArrayFilterValue(this.filtersForm.controls.senders, value);
  }

  documentTypeFilterChanged(value: NzTableFilterValue): void {
    this.setArrayFilterValue(this.filtersForm.controls.documentTypeIds, value);
  }

  dateFilterChanged(value: NzTableFilterValue): void {
    const [datePreset] = tableFilterValues(value).filter(isDatePreset);
    const nextPreset = datePreset ?? 'none';
    if (this.filtersForm.controls.datePreset.value === nextPreset) {
      return;
    }

    this.filtersForm.controls.datePreset.setValue(nextPreset);
  }

  resetListState(): void {
    this.filtersForm.setValue(
      {
        query: '',
        statuses: [],
        tagNames: [],
        senders: [],
        documentTypeIds: [],
        datePreset: 'none',
      },
      { emitEvent: false },
    );
    this.filterSnapshot.set(this.filtersForm.getRawValue());
    this.sortBy.set(DEFAULT_SORT_BY);
    this.sortDirection.set(DEFAULT_SORT_DIRECTION);
    this.page.set(1);
    this.load({ scrollToTop: true });
  }

  load(options: { readonly scrollToTop?: boolean } = {}): void {
    this.loadPage(this.page(), { append: false, scrollToTop: options.scrollToTop ?? false });
  }

  loadNextPage(): void {
    if (this.isLoading() || this.isLoadingMore() || !this.hasMoreDocuments()) {
      return;
    }

    this.loadPage(this.page() + 1, { append: true, scrollToTop: false });
  }

  loadMoreOnScroll(event: Event): void {
    const target = event.currentTarget;
    if (target instanceof HTMLElement) {
      this.loadNextPageWhenNearBottom(target);
    }
  }

  toggleDocumentSelection(document: DocumentSummaryDto, checked: boolean): void {
    this.selectedDocumentIds.update((current) => {
      const next = new Set(current);
      if (checked) {
        next.add(document.id);
      } else {
        next.delete(document.id);
      }
      return next;
    });
  }

  toggleAllLoadedDocuments(checked: boolean): void {
    this.selectedDocumentIds.update((current) => {
      const next = new Set(current);
      for (const document of this.documents()) {
        if (checked) {
          next.add(document.id);
        } else {
          next.delete(document.id);
        }
      }
      return next;
    });
  }

  isSelected(document: DocumentSummaryDto): boolean {
    return this.selectedDocumentIds().has(document.id);
  }

  isOpenDocument(document: DocumentSummaryDto): boolean {
    return this.openDocuments.isOpen(document.id);
  }

  toggleOpenDocument(document: DocumentSummaryDto): void {
    if (this.isOpenDocument(document)) {
      this.openDocuments.close(document.id);
      return;
    }

    this.openDocument(document);
  }

  openSelectedDocuments(): void {
    for (const document of this.selectedDocuments()) {
      this.openDocument(document);
    }
  }

  downloadSelectedDocuments(): void {
    this.downloadDocuments(this.selectedDocuments());
  }

  downloadDocument(document: DocumentSummaryDto): void {
    this.downloadDocuments([document]);
  }

  startAiForSelectedDocuments(): void {
    const documents = this.selectedDocuments().filter((document) => this.canTriggerAi(document));
    this.runBulkMutation(
      documents,
      (document) => this.documentsApi.triggerAiExtraction(document.id),
      'documents.bulk.errors.aiFailed',
    );
  }

  archiveSelectedDocuments(): void {
    this.requestBulkMove('archive');
  }

  archiveDocument(document: DocumentSummaryDto): void {
    this.requestDocumentsMove('archive', [document]);
  }

  moveSelectedDocumentsToInbox(): void {
    this.requestBulkMove('inbox');
  }

  moveDocumentToInbox(document: DocumentSummaryDto): void {
    this.requestDocumentsMove('inbox', [document]);
  }

  requestTrashSelectedDocuments(): void {
    this.requestBulkMove('trash');
  }

  requestTrashDocument(document: DocumentSummaryDto): void {
    this.requestDocumentsMove('trash', [document]);
  }

  cancelBulkMove(): void {
    if (this.isBulkActionRunning()) {
      return;
    }

    this.pendingBulkMove.set(null);
  }

  confirmBulkMove(): void {
    const pendingMove = this.pendingBulkMove();
    if (!pendingMove) {
      return;
    }

    switch (pendingMove.target) {
      case 'archive':
        this.runBulkMutation(
          pendingMove.documents,
          (document) => this.documentsApi.archive(document.id),
          'documents.bulk.errors.archiveFailed',
        );
        break;
      case 'trash':
        this.runBulkMutation(
          pendingMove.documents,
          (document) => this.documentsApi.delete(document.id),
          'documents.bulk.errors.deleteFailed',
        );
        break;
      case 'inbox':
        this.runBulkMutation(
          pendingMove.documents,
          (document) => this.documentsApi.moveToInbox(document.id),
          'documents.bulk.errors.moveToInboxFailed',
        );
        break;
    }

    this.pendingBulkMove.set(null);
  }

  private requestBulkMove(target: DocumentBulkMoveTarget): void {
    this.requestDocumentsMove(target, this.selectedDocuments());
  }

  private requestDocumentsMove(
    target: DocumentBulkMoveTarget,
    documentsToMove: readonly DocumentSummaryDto[],
  ): void {
    const documents = documentsToMove.filter((document) => this.canMoveDocument(document));
    if (documents.length === 0 || this.isBulkActionRunning()) {
      return;
    }

    this.pendingBulkMove.set({ target, documents });
  }

  private loadPage(
    page: number,
    options: { readonly append: boolean; readonly scrollToTop: boolean },
  ): void {
    if (this.tenantContext.hasNoActiveTenants()) {
      this.clearTenantScopedDocumentState();
      return;
    }

    const requestId = ++this.searchRequestId;
    if (options.append) {
      this.isLoadingMore.set(true);
      this.activeAppendRequestId = requestId;
    } else {
      this.isLoading.set(true);
      this.activeReplaceRequestId = requestId;
    }

    this.documentsApi
      .search(this.searchQuery(page))
      .pipe(
        finalize(() => {
          if (options.append && this.activeAppendRequestId === requestId) {
            this.isLoadingMore.set(false);
            this.activeAppendRequestId = null;
          }

          if (!options.append && this.activeReplaceRequestId === requestId) {
            this.isLoading.set(false);
            this.activeReplaceRequestId = null;
          }
        }),
      )
      .subscribe({
        next: (response) => {
          if (requestId !== this.searchRequestId) {
            return;
          }

          this.page.set(response.meta.page);
          this.documents.set(
            options.append
              ? appendUniqueDocuments(this.documents(), response.items)
              : response.items,
          );
          this.meta.set(response.meta);
          this.syncSelectionWithDocuments(this.documents());
          this.syncThumbnailObjectUrls(this.documents());
          this.scheduleTableMeasurements();
          this.scheduleInfiniteScrollCheck();
          if (options.scrollToTop) {
            this.scrollTableToTop();
          }
        },
        error: () => {
          if (requestId !== this.searchRequestId) {
            return;
          }

          if (!options.append) {
            this.documents.set([]);
            this.selectedDocumentIds.set(new Set());
            this.syncThumbnailObjectUrls([]);
            this.scheduleTableMeasurements();
            if (options.scrollToTop) {
              this.scrollTableToTop();
            }
          }
        },
      });
  }

  triggerAi(document: DocumentSummaryDto): void {
    if (!this.canTriggerAi(document)) {
      return;
    }

    this.setDocumentAiTriggering(document.id, true);
    this.documentsApi
      .triggerAiExtraction(document.id)
      .pipe(finalize(() => this.setDocumentAiTriggering(document.id, false)))
      .subscribe({
        next: () => this.reload(),
        error: () => undefined,
      });
  }

  preventMiddleMouseNavigation(event: MouseEvent): void {
    if (event.button === 1) {
      event.preventDefault();
    }
  }

  handleDocumentAuxClick(event: MouseEvent, document: DocumentSummaryDto): void {
    if (event.button !== 1) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    this.openDocument(document);
  }

  openDocumentContextMenu(
    event: MouseEvent,
    document: DocumentSummaryDto,
    menu: NzDropdownMenuComponent,
  ): void {
    event.preventDefault();
    event.stopPropagation();
    this.contextDocument.set(document);
    this.contextMenu.create(event, menu);
  }

  showAndOpenContextDocument(): void {
    const document = this.contextDocument();
    if (!document) {
      return;
    }

    this.openDocument(document);
    this.contextMenu.close();
    void this.router.navigate(['/documents', document.id]);
  }

  thumbnailUrl(document: DocumentSummaryDto): string | null {
    return this.thumbnailUrls()[document.id] ?? null;
  }

  shortDate(value: string | null): string {
    return localizedLongDate(value, this.language.currentLocale());
  }

  statusColor(status: DocumentStatus): string {
    return documentStatusColor(status);
  }

  statusIcon(status: DocumentStatus): string {
    return documentStatusIcon(status);
  }

  aiIndicator(document: DocumentSummaryDto): DocumentAiIndicator {
    return documentAiIndicator(document);
  }

  hasAiMetadata(document: DocumentSummaryDto): boolean {
    return this.aiIndicator(document) === 'PROCESSED';
  }

  aiIndicatorTooltip(document: DocumentSummaryDto): string {
    const indicator = this.aiIndicator(document);
    const label = this.translate.instant(documentAiIndicatorLabelKey(indicator));
    if (indicator === 'PROCESSED' && document.aiProcessedAt) {
      return `${label} · ${this.shortDate(document.aiProcessedAt)}`;
    }
    return label;
  }

  documentTypeName(documentType: DocumentTypeDto): string {
    return documentTypeDisplayName(documentType, (key) => this.translate.instant(key));
  }

  calendarEventIcon(kind: CalendarEventKind): string {
    return calendarEventIcon(kind);
  }

  canTriggerAi(document: DocumentSummaryDto): boolean {
    return (
      this.auth.canEditDocuments() &&
      this.aiAvailable() &&
      document.status === 'READY' &&
      !this.triggeringAiDocumentIds().has(document.id)
    );
  }

  canMoveDocument(document: DocumentSummaryDto): boolean {
    return this.auth.canEditDocuments() && !this.isAiLocked(document);
  }

  isAiLocked(document: DocumentSummaryDto): boolean {
    return AI_LOCKED_STATUSES.has(document.status);
  }

  trackByDocument(_index: number, document: DocumentSummaryDto): string {
    return document.id;
  }

  private searchQuery(page: number): DocumentSearchQuery {
    const filters = this.filtersForm.getRawValue();
    const dateRange = this.dateRangeForPreset(filters.datePreset);
    const sortBy = this.sortBy();
    const sortDirection = this.sortDirection();

    return {
      page,
      pageSize: this.pageSize(),
      searchFields: DEFAULT_SEARCH_FIELDS,
      ...(filters.query.trim() ? { query: filters.query.trim() } : {}),
      ...(sortBy && sortDirection ? { sortBy, sortDirection } : {}),
      ...(filters.statuses.length ? { statuses: filters.statuses } : {}),
      ...(filters.tagNames.length ? { tagNames: filters.tagNames } : {}),
      ...(filters.senders.length ? { senders: filters.senders } : {}),
      ...(filters.documentTypeIds.length ? { documentTypeIds: filters.documentTypeIds } : {}),
      ...(dateRange ? { visibleDateFrom: dateRange.from, visibleDateTo: dateRange.to } : {}),
    };
  }

  private subscribeToFilterChanges(): void {
    this.filtersForm.controls.query.valueChanges
      .pipe(
        map((value) => value.trim()),
        debounceTime(SEARCH_QUERY_DEBOUNCE_MS),
        distinctUntilChanged(),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => {
        this.filterSnapshot.set(this.filtersForm.getRawValue());
        this.reload();
      });

    merge(
      this.filtersForm.controls.statuses.valueChanges,
      this.filtersForm.controls.tagNames.valueChanges,
      this.filtersForm.controls.senders.valueChanges,
      this.filtersForm.controls.documentTypeIds.valueChanges,
      this.filtersForm.controls.datePreset.valueChanges,
    )
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.filterSnapshot.set(this.filtersForm.getRawValue());
        this.reload();
      });
  }

  private setArrayFilterValue<T extends string>(
    control: FormControl<T[]>,
    value: NzTableFilterValue,
  ): void {
    const nextValues = tableFilterValues(value) as T[];
    if (sameStringValues(control.value, nextValues)) {
      return;
    }

    control.setValue(nextValues);
  }

  private loadAiAvailability(): void {
    this.aiApi
      .availability()
      .pipe(catchError(() => EMPTY))
      .subscribe((availability) => {
        this.aiAvailable.set(availability.enabled);
      });
  }

  private openDocument(document: DocumentSummaryDto): void {
    this.openDocuments.open({ id: document.id, title: document.title });
  }

  private runBulkMutation<T>(
    documents: readonly DocumentSummaryDto[],
    action: (document: DocumentSummaryDto) => Observable<T>,
    errorKey: string,
  ): void {
    if (documents.length === 0 || this.isBulkActionRunning()) {
      return;
    }

    this.startBulkAction();
    forkJoin(
      documents.map((document) =>
        action(document).pipe(
          map(() => true),
          catchError(() => of(false)),
        ),
      ),
    )
      .pipe(finalize(() => this.isBulkActionRunning.set(false)))
      .subscribe((results) => {
        const successCount = results.filter(Boolean).length;
        this.reportBulkResult(successCount, results.length - successCount, errorKey, true);
      });
  }

  private downloadDocuments(documents: readonly DocumentSummaryDto[]): void {
    if (documents.length === 0 || this.isBulkActionRunning()) {
      return;
    }

    this.startBulkAction();
    forkJoin(
      documents.map((document) =>
        this.documentsApi.detail(document.id).pipe(
          switchMap((detail) => {
            if (!detail.pdfUrl) {
              return of<DocumentBulkDownloadResult>({ success: false });
            }

            return this.assets.loadObjectUrl(detail.pdfUrl).pipe(
              map(
                (objectUrl): DocumentBulkDownloadResult => ({ success: true, detail, objectUrl }),
              ),
              catchError(() => of<DocumentBulkDownloadResult>({ success: false })),
            );
          }),
          catchError(() => of<DocumentBulkDownloadResult>({ success: false })),
        ),
      ),
    )
      .pipe(finalize(() => this.isBulkActionRunning.set(false)))
      .subscribe((results) => {
        const successfulDownloads = results.filter(
          (result): result is Extract<DocumentBulkDownloadResult, { readonly success: true }> =>
            result.success,
        );
        for (const result of successfulDownloads) {
          this.triggerPdfDownload(result.objectUrl, this.downloadFileName(result.detail));
        }

        this.reportBulkResult(
          successfulDownloads.length,
          results.length - successfulDownloads.length,
          'documents.bulk.errors.downloadFailed',
          false,
          false,
        );
      });
  }

  private reportBulkResult(
    successCount: number,
    failureCount: number,
    errorKey: string,
    reloadAfterSuccess: boolean,
    clearSelectionAfterSuccess = true,
  ): void {
    if (successCount > 0) {
      if (clearSelectionAfterSuccess) {
        this.selectedDocumentIds.set(new Set());
      }
      if (reloadAfterSuccess) {
        this.reload();
      }
    }

    if (failureCount > 0 || successCount === 0) {
      this.bulkError.set(errorKey);
    }
  }

  private startBulkAction(): void {
    this.isBulkActionRunning.set(true);
    this.bulkError.set(null);
  }

  private syncSelectionWithDocuments(documents: readonly DocumentSummaryDto[]): void {
    const currentIds = new Set(documents.map((document) => document.id));
    this.selectedDocumentIds.update(
      (selected) => new Set([...selected].filter((documentId) => currentIds.has(documentId))),
    );
  }

  private triggerPdfDownload(objectUrl: string, fileName: string): void {
    const anchor = globalThis.document?.createElement('a');
    if (!anchor) {
      this.assets.revokeObjectUrl(objectUrl);
      return;
    }

    anchor.href = objectUrl;
    anchor.download = fileName;
    anchor.style.display = 'none';
    globalThis.document.body.append(anchor);
    anchor.click();
    anchor.remove();
    globalThis.setTimeout?.(() => this.assets.revokeObjectUrl(objectUrl), 0);
  }

  private downloadFileName(document: DocumentDetailDto): string {
    const baseName = (document.originalFileName || document.title || 'document').trim();
    const safeName = baseName.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_') || 'document';
    return safeName.toLowerCase().endsWith('.pdf') ? safeName : `${safeName}.pdf`;
  }

  private loadSearchFacets(): void {
    if (this.tenantContext.hasNoActiveTenants()) {
      this.searchFacets.set({ tags: [], senders: [], documentTypes: [] });
      return;
    }

    this.documentsApi
      .searchFacets()
      .pipe(catchError(() => EMPTY))
      .subscribe((facets) => this.searchFacets.set(facets));
  }

  private clearTenantScopedDocumentState(): void {
    this.activeReplaceRequestId = null;
    this.activeAppendRequestId = null;
    this.documents.set([]);
    this.selectedDocumentIds.set(new Set());
    this.meta.set({
      page: 1,
      pageSize: this.pageSize(),
      totalItems: 0,
      totalPages: 0,
    });
    this.searchFacets.set({ tags: [], senders: [], documentTypes: [] });
    this.bulkError.set(null);
    this.isLoading.set(false);
    this.isLoadingMore.set(false);
    this.syncThumbnailObjectUrls([]);
    this.scheduleTableMeasurements();
  }

  private dateRangeForPreset(
    preset: DocumentsDatePreset,
  ): { readonly from: string; readonly to: string } | null {
    if (preset === 'none') {
      return null;
    }

    const today = new Date();
    const to = endOfLocalDay(today);
    const from = startOfLocalDay(this.datePresetStart(today, preset));

    return {
      from: from.toISOString(),
      to: to.toISOString(),
    };
  }

  private datePresetStart(today: Date, preset: Exclude<DocumentsDatePreset, 'none'>): Date {
    switch (preset) {
      case 'last-week':
        return new Date(today.getFullYear(), today.getMonth(), today.getDate() - 7);
      case 'last-month':
        return new Date(today.getFullYear(), today.getMonth() - 1, today.getDate());
      case 'last-3-months':
        return new Date(today.getFullYear(), today.getMonth() - 3, today.getDate());
      case 'last-6-months':
        return new Date(today.getFullYear(), today.getMonth() - 6, today.getDate());
      case 'last-year':
        return new Date(today.getFullYear() - 1, today.getMonth(), today.getDate());
    }

    const exhaustivePreset: never = preset;
    return exhaustivePreset;
  }

  private readStoredViewMode(): DocumentsViewMode {
    try {
      const value = globalThis.localStorage?.getItem(DOCUMENTS_VIEW_MODE_STORAGE_KEY);
      return value === 'grid' || value === 'list' ? value : DEFAULT_DOCUMENTS_VIEW_MODE;
    } catch {
      return DEFAULT_DOCUMENTS_VIEW_MODE;
    }
  }

  private persistViewMode(mode: DocumentsViewMode): void {
    try {
      globalThis.localStorage?.setItem(DOCUMENTS_VIEW_MODE_STORAGE_KEY, mode);
    } catch {
      // Ignore unavailable storage so the document overview remains usable.
    }
  }

  private readStoredPageSize(): number {
    try {
      return normalizePageSize(
        Number(globalThis.localStorage?.getItem(DOCUMENTS_PAGE_SIZE_STORAGE_KEY)),
      );
    } catch {
      return DEFAULT_PAGE_SIZE;
    }
  }

  private persistPageSize(pageSize: number): void {
    try {
      globalThis.localStorage?.setItem(DOCUMENTS_PAGE_SIZE_STORAGE_KEY, String(pageSize));
    } catch {
      // Ignore unavailable storage so the document overview remains usable.
    }
  }

  private scheduleTableMeasurements(): void {
    queueMicrotask(() => this.documentTableScroller()?.refresh());
    globalThis.setTimeout?.(() => this.documentTableScroller()?.refresh(), 0);
  }

  private scrollTableToTop(): void {
    queueMicrotask(() => {
      this.documentTableScroller()?.scrollToTop();
      this.scrollElementToTop(this.documentGrid()?.nativeElement);
    });
  }

  private scrollElementToTop(element: HTMLElement | null | undefined): void {
    if (!element) {
      return;
    }

    if (typeof element.scrollTo === 'function') {
      element.scrollTo({ top: 0, left: 0 });
      return;
    }

    element.scrollTop = 0;
    element.scrollLeft = 0;
  }

  private scheduleInfiniteScrollCheck(): void {
    if (this.infiniteScrollCheckScheduled) {
      return;
    }

    this.infiniteScrollCheckScheduled = true;
    globalThis.setTimeout?.(() => {
      this.infiniteScrollCheckScheduled = false;
      if (this.viewMode() === 'list') {
        this.documentTableScroller()?.checkNearEnd();
        return;
      }
      const grid = this.documentGrid()?.nativeElement;
      if (grid) {
        this.loadNextPageWhenNearBottom(grid);
      }
    }, 0);
  }

  private loadNextPageWhenNearBottom(container: HTMLElement): void {
    const distanceToBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    if (distanceToBottom <= INFINITE_SCROLL_THRESHOLD_PX) {
      this.loadNextPage();
    }
  }

  private setDocumentAiTriggering(documentId: string, isTriggering: boolean): void {
    this.triggeringAiDocumentIds.update((current) => {
      const next = new Set(current);
      if (isTriggering) {
        next.add(documentId);
      } else {
        next.delete(documentId);
      }

      return next;
    });
  }

  private syncThumbnailObjectUrls(documents: DocumentSummaryDto[]): void {
    const currentSources = new Map(
      documents
        .filter((document) => document.thumbnailUrl)
        .map((document) => [document.id, document.thumbnailUrl as string]),
    );

    for (const [documentId, thumbnail] of this.thumbnailObjectUrls) {
      if (currentSources.get(documentId) !== thumbnail.source) {
        this.assets.revokeObjectUrl(thumbnail.objectUrl);
        this.thumbnailObjectUrls.delete(documentId);
      }
    }

    this.publishThumbnailUrls();

    for (const [documentId, source] of currentSources) {
      if (this.thumbnailObjectUrls.has(documentId)) {
        continue;
      }

      this.assets
        .loadObjectUrl(source)
        .pipe(
          takeUntilDestroyed(this.destroyRef),
          catchError(() => EMPTY),
        )
        .subscribe((objectUrl) => {
          if (
            this.documents().find((document) => document.id === documentId)?.thumbnailUrl !== source
          ) {
            this.assets.revokeObjectUrl(objectUrl);
            return;
          }

          this.thumbnailObjectUrls.set(documentId, { source, objectUrl });
          this.publishThumbnailUrls();
        });
    }
  }

  private publishThumbnailUrls(): void {
    this.thumbnailUrls.set(
      Object.fromEntries(
        [...this.thumbnailObjectUrls.entries()].map(([documentId, thumbnail]) => [
          documentId,
          thumbnail.objectUrl,
        ]),
      ),
    );
  }

  private clearThumbnailObjectUrls(): void {
    for (const thumbnail of this.thumbnailObjectUrls.values()) {
      this.assets.revokeObjectUrl(thumbnail.objectUrl);
    }

    this.thumbnailObjectUrls.clear();
    this.publishThumbnailUrls();
  }

  private documentChangeKey(
    event: ReturnType<RealtimeClientService['latestDocumentChange']>,
  ): string | null {
    return event
      ? [event.documentId, event.reason, event.jobId ?? '', event.changedAt].join('|')
      : null;
  }
}

function startOfLocalDay(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate(), 0, 0, 0, 0);
}

function endOfLocalDay(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate(), 23, 59, 59, 999);
}

function normalizePageSize(value: number): number {
  return PAGE_SIZE_OPTIONS.includes(value as (typeof PAGE_SIZE_OPTIONS)[number])
    ? value
    : DEFAULT_PAGE_SIZE;
}

function isTableSortKey(value: string): value is DocumentTableSortKey {
  return TABLE_SORT_KEYS.has(value as DocumentTableSortKey);
}

function tableFilterValues(value: NzTableFilterValue): string[] {
  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0);
  }

  return typeof value === 'string' && value.length > 0 ? [value] : [];
}

function isDatePreset(value: string): value is Exclude<DocumentsDatePreset, 'none'> {
  return DATE_PRESET_OPTIONS.some((option) => option.value === value && option.value !== 'none');
}

function appendUniqueDocuments(
  current: readonly DocumentSummaryDto[],
  next: readonly DocumentSummaryDto[],
): DocumentSummaryDto[] {
  const documentIds = new Set(current.map((document) => document.id));
  const uniqueNextDocuments = next.filter((document) => !documentIds.has(document.id));
  return [...current, ...uniqueNextDocuments];
}

function sameStringValues(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}
