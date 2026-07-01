import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import type {
  DocumentMetadataUpdateRequest,
  DocumentSearchResponse,
  DocumentStatus,
  DocumentSummaryDto,
  DocumentTypeDto,
  ReprocessDocumentRequest,
} from '@smart-dms/shared-dto';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzCheckboxModule } from 'ng-zorro-antd/checkbox';
import { NzDropDownModule } from 'ng-zorro-antd/dropdown';
import { NzEmptyModule } from 'ng-zorro-antd/empty';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzMenuModule } from 'ng-zorro-antd/menu';
import { NzPopconfirmModule } from 'ng-zorro-antd/popconfirm';
import { NzPopoverModule } from 'ng-zorro-antd/popover';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzTableModule } from 'ng-zorro-antd/table';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzTooltipModule } from 'ng-zorro-antd/tooltip';
import {
  catchError,
  debounceTime,
  distinctUntilChanged,
  EMPTY,
  forkJoin,
  finalize,
  map,
  Subscription,
} from 'rxjs';
import { AuthenticatedAssetService } from '../../core/api/authenticated-asset.service';
import { DocumentApiService } from '../../core/api/document-api.service';
import { SettingsApiService } from '../../core/api/settings-api.service';
import { LanguageService } from '../../core/i18n/language.service';
import { AuthService } from '../../core/services/auth.service';
import { EditLockService } from '../../core/services/edit-lock.service';
import { RealtimeClientService } from '../../core/services/realtime-client.service';
import { TenantContextService } from '../../core/services/tenant-context.service';
import {
  dateInputValue,
  localizedLongDate,
  nullableIsoDateTime,
} from '../../shared/formatters/date.formatter';
import {
  documentStatusColor,
  documentStatusIcon,
  documentStatusLabelKey,
  documentTypeDisplayName,
} from '../../shared/presentation/document-presentation';
import { AiLogoComponent } from '../../shared/ai-logo.component';
import type { PendingChangesAware } from '../../shared/navigation/pending-changes.guard';
import { UnsavedChangesWarningDirective } from '../../shared/navigation/unsaved-changes-warning.directive';
import { InfiniteTableScrollDirective } from '../../shared/table/infinite-table-scroll.directive';
import { TablePanelComponent } from '../../shared/table/table-panel.component';

const DEFAULT_PAGE_SIZE = 50;
const SEARCH_QUERY_DEBOUNCE_MS = 300;
const DEFAULT_SEARCH_FIELDS = ['title', 'content', 'sender', 'tags'] as const;
const DEFAULT_SORT_BY = 'documentDate';
const DEFAULT_SORT_DIRECTION = 'desc';
const REPROCESS_BLOCKED_STATUSES = new Set<DocumentStatus>(['AI_PENDING', 'AI_RUNNING']);
const THUMBNAIL_POPOVER_DELAY_SECONDS = 0.7;

type InboxMetadataField = 'title' | 'sender' | 'documentTypeId' | 'documentDate';

type InboxMetadataForm = FormGroup<{
  title: FormControl<string>;
  sender: FormControl<string>;
  documentTypeId: FormControl<string | null>;
  documentDate: FormControl<string>;
}>;

interface InboxMetadataValue {
  readonly title: string;
  readonly sender: string;
  readonly documentTypeId: string;
  readonly documentDate: string;
}

interface InboxRow {
  readonly id: string;
  readonly document: DocumentSummaryDto;
  readonly original: InboxMetadataValue;
  readonly form: InboxMetadataForm;
}

interface ThumbnailObjectUrl {
  readonly source: string;
  readonly objectUrl: string;
}

@Component({
  selector: 'app-inbox',
  imports: [
    NgTemplateOutlet,
    RouterLink,
    ReactiveFormsModule,
    TranslatePipe,
    NzAlertModule,
    NzButtonModule,
    NzCheckboxModule,
    NzDropDownModule,
    NzEmptyModule,
    NzIconModule,
    NzInputModule,
    NzMenuModule,
    NzPopconfirmModule,
    NzPopoverModule,
    NzSelectModule,
    NzTableModule,
    NzTagModule,
    NzTooltipModule,
    AiLogoComponent,
    InfiniteTableScrollDirective,
    TablePanelComponent,
    UnsavedChangesWarningDirective,
  ],
  templateUrl: './inbox.component.html',
  styleUrl: './inbox.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InboxComponent implements PendingChangesAware {
  private readonly auth = inject(AuthService);
  private readonly assets = inject(AuthenticatedAssetService);
  private readonly documentsApi = inject(DocumentApiService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly editLocks = inject(EditLockService);
  private readonly language = inject(LanguageService);
  private readonly realtime = inject(RealtimeClientService);
  private readonly settingsApi = inject(SettingsApiService);
  private readonly tenantContext = inject(TenantContextService);
  private readonly translate = inject(TranslateService);
  private lastDocumentChangeKey = this.documentChangeKey(this.realtime.latestDocumentChange());
  private lastTenantScope = this.tenantContext.activeScope();
  private searchRequestId = 0;
  private activeReplaceRequestId: number | null = null;
  private activeAppendRequestId: number | null = null;
  private hasDeferredReload = false;
  private editLockHeartbeat: Subscription | null = null;
  private readonly acceptanceFailedDocumentIds = signal<ReadonlySet<string>>(new Set());
  private readonly thumbnailObjectUrls = new Map<string, ThumbnailObjectUrl>();
  private readonly beforeUnloadHandler = (): void => {
    this.editLocks.releaseBeforeUnload(this.editLockId());
  };

  readonly rows = signal<InboxRow[]>([]);
  readonly documents = computed(() => this.rows().map((row) => row.document));
  readonly activeDocumentTypes = signal<DocumentTypeDto[]>([]);
  readonly selectedDocumentIds = signal<ReadonlySet<string>>(new Set());
  readonly isLoading = signal(false);
  readonly isLoadingMore = signal(false);
  readonly isReprocessing = signal(false);
  readonly isDeleting = signal(false);
  readonly isEditMode = signal(false);
  readonly isStartingEdit = signal(false);
  readonly isSavingMetadata = signal(false);
  readonly editLockId = signal<string | null>(null);
  readonly searchControl = new FormControl('', { nonNullable: true });
  readonly activeSearchQuery = signal('');
  readonly error = signal<string | null>(null);
  readonly thumbnailUrls = signal<Record<string, string>>({});
  readonly editRevision = signal(0);
  readonly page = signal(1);
  readonly pageSize = signal(DEFAULT_PAGE_SIZE);
  readonly isRealtimeConnected = this.realtime.isConnected;
  readonly meta = signal<DocumentSearchResponse['meta']>({
    page: 1,
    pageSize: DEFAULT_PAGE_SIZE,
    totalItems: 0,
    totalPages: 0,
  });

  readonly canEdit = computed(() => this.auth.canEditDocuments());
  readonly canReprocessDocuments = computed(() => this.auth.isAdmin());
  readonly hasSelectedDocuments = computed(() => this.selectedDocumentIds().size > 0);
  readonly eligibleDocuments = computed(() =>
    this.documents().filter((document) => this.canAccept(document)),
  );
  readonly reprocessableDocuments = computed(() =>
    this.documents().filter((document) => this.canReprocess(document)),
  );
  readonly hasSelectableDocuments = computed(() =>
    this.documents().some((document) => this.canSelect(document)),
  );
  readonly eligibleSelectedDocumentIds = computed(() => {
    const selected = this.selectedDocumentIds();
    return this.eligibleDocuments()
      .map((document) => document.id)
      .filter((documentId) => selected.has(documentId));
  });
  readonly reprocessableSelectedDocumentIds = computed(() => {
    const selected = this.selectedDocumentIds();
    return this.reprocessableDocuments()
      .map((document) => document.id)
      .filter((documentId) => selected.has(documentId));
  });
  readonly rotateReprocessableSelectedDocumentIds = computed(() => {
    const selected = this.selectedDocumentIds();
    return this.documents()
      .filter((document) => this.canRotateReprocess(document))
      .map((document) => document.id)
      .filter((documentId) => selected.has(documentId));
  });
  readonly aiReprocessableSelectedDocumentIds = computed(() => {
    const selected = this.selectedDocumentIds();
    return this.documents()
      .filter((document) => this.canReprocessAi(document))
      .map((document) => document.id)
      .filter((documentId) => selected.has(documentId));
  });
  readonly hasSelectedEligibleDocuments = computed(
    () => this.eligibleSelectedDocumentIds().length > 0,
  );
  readonly hasSelectedReprocessableDocuments = computed(
    () => this.reprocessableSelectedDocumentIds().length > 0,
  );
  readonly hasSelectedRotateReprocessableDocuments = computed(
    () => this.rotateReprocessableSelectedDocumentIds().length > 0,
  );
  readonly hasSelectedAiReprocessableDocuments = computed(
    () => this.aiReprocessableSelectedDocumentIds().length > 0,
  );
  readonly allEligibleSelected = computed(() => {
    const selectableIds = this.selectableDocuments().map((document) => document.id);
    const selected = this.selectedDocumentIds();
    return selectableIds.length > 0 && selectableIds.every((id) => selected.has(id));
  });
  readonly someEligibleSelected = computed(
    () =>
      this.selectableDocuments().some((document) => this.isSelected(document)) &&
      !this.allEligibleSelected(),
  );
  readonly hasMoreDocuments = computed(() => this.documents().length < this.meta().totalItems);
  readonly showTenantNameChip = computed(
    () => this.tenantContext.isAllTenants() && this.tenantContext.hasMultipleActiveTenants(),
  );
  readonly hasActiveSearch = computed(() => this.activeSearchQuery().length > 0);
  readonly hasInboxChanges = computed(() => {
    this.editRevision();
    return this.rows().some((row) => this.hasRowChanges(row));
  });
  readonly hasInvalidInboxChanges = computed(() => {
    this.editRevision();
    return this.rows().some((row) => row.form.invalid);
  });
  readonly hasAiProcessingDocuments = computed(() =>
    this.documents().some(
      (document) => document.status === 'AI_PENDING' || document.status === 'AI_RUNNING',
    ),
  );
  readonly canStartEdit = computed(
    () =>
      this.canEdit() &&
      this.realtime.isConnected() &&
      !this.hasAiProcessingDocuments() &&
      !this.isLoading() &&
      !this.isSavingMetadata() &&
      !this.isEditMode(),
  );

  readonly documentStatusLabelKey = documentStatusLabelKey;
  readonly thumbnailPopoverDelaySeconds = THUMBNAIL_POPOVER_DELAY_SECONDS;

  constructor() {
    this.destroyRef.onDestroy(() => {
      this.activeReplaceRequestId = null;
      this.activeAppendRequestId = null;
      this.releaseEditLock();
      this.clearThumbnailObjectUrls();
    });
    this.searchControl.valueChanges
      .pipe(
        map((value) => value.trim()),
        debounceTime(SEARCH_QUERY_DEBOUNCE_MS),
        distinctUntilChanged(),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => this.requestReload());
    effect(() => {
      const tenantScope = this.tenantContext.activeScope();
      if (tenantScope === this.lastTenantScope) {
        return;
      }

      this.lastTenantScope = tenantScope;
      untracked(() => this.requestReload());
    });
    effect(() => {
      const event = this.realtime.latestDocumentChange();
      const eventKey = this.documentChangeKey(event);
      if (!event || eventKey === this.lastDocumentChangeKey) {
        return;
      }
      this.lastDocumentChangeKey = eventKey;
      untracked(() => this.requestReload());
    });
    effect(() => {
      if (this.realtime.isConnected()) {
        return;
      }

      untracked(() => this.handleEditLockLost('inbox.errors.editLockLost'));
    });
    effect(() => {
      const event = this.realtime.latestEditLockChange();
      const lockId = this.editLockId();
      if (!event || !lockId || event.lock.id !== lockId) {
        return;
      }

      if (event.action === 'RELEASED' || event.action === 'EXPIRED') {
        untracked(() => this.handleEditLockLost('inbox.errors.editLockLost'));
      }
    });
    this.loadDocumentTypes();
    this.reload();
  }

  load(): void {
    this.requestReload();
  }

  submitSearch(): void {
    this.requestReload();
  }

  reload(): void {
    this.acceptanceFailedDocumentIds.set(new Set());
    this.activeSearchQuery.set(this.searchControl.value.trim());
    this.page.set(1);
    this.loadPage(1, { append: false });
  }

  loadNextPage(): void {
    if (
      this.isEditMode() ||
      this.hasInboxChanges() ||
      this.isLoading() ||
      this.isLoadingMore() ||
      !this.hasMoreDocuments()
    ) {
      return;
    }

    this.loadPage(this.page() + 1, { append: true });
  }

  toggleDocument(document: DocumentSummaryDto, checked: boolean): void {
    if (!this.canSelect(document)) {
      return;
    }

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

  toggleAllEligible(checked: boolean): void {
    this.selectedDocumentIds.update((current) => {
      const next = new Set(current);
      for (const document of this.selectableDocuments()) {
        if (checked) {
          next.add(document.id);
        } else {
          next.delete(document.id);
        }
      }
      return next;
    });
  }

  acceptSelected(): void {
    this.acceptDocuments(this.eligibleSelectedDocumentIds());
  }

  reprocessSelected(): void {
    this.reprocessDocuments(this.reprocessableSelectedDocumentIds());
  }

  reprocessSelectedRotated(): void {
    this.reprocessDocuments(this.rotateReprocessableSelectedDocumentIds(), {
      action: 'ROTATE_180',
    });
  }

  reprocessSelectedAi(): void {
    this.startAiForDocuments(this.aiReprocessableSelectedDocumentIds());
  }

  reprocessDocument(document: DocumentSummaryDto): void {
    if (!this.canReprocessDocumentRow(document)) {
      return;
    }

    this.reprocessDocuments([document.id]);
  }

  reprocessDocumentRotated(document: DocumentSummaryDto): void {
    if (!this.canRotateReprocessDocumentRow(document)) {
      return;
    }

    this.reprocessDocuments([document.id], { action: 'ROTATE_180' });
  }

  reprocessDocumentAi(document: DocumentSummaryDto): void {
    if (!this.canReprocessAiDocumentRow(document)) {
      return;
    }

    this.startAiForDocuments([document.id]);
  }

  saveChanges(): void {
    if (
      !this.isEditMode() ||
      !this.hasInboxChanges() ||
      this.hasInvalidInboxChanges() ||
      this.isSavingMetadata()
    ) {
      return;
    }

    const changedRows = this.rows().filter((row) => this.hasRowChanges(row));
    this.isSavingMetadata.set(true);
    this.error.set(null);
    forkJoin(
      changedRows.map((row) =>
        this.documentsApi.updateMetadata(row.id, this.changedMetadataRequest(row)),
      ),
    )
      .pipe(finalize(() => this.isSavingMetadata.set(false)))
      .subscribe({
        next: () => {
          this.hasDeferredReload = false;
          this.acceptanceFailedDocumentIds.set(new Set());
          this.selectedDocumentIds.set(new Set());
          this.stopEditing({ releaseLock: true });
          this.reload();
        },
        error: () => this.error.set('inbox.errors.saveMetadataFailed'),
      });
  }

  revertChanges(): void {
    this.revertRows();

    if (this.hasDeferredReload) {
      this.hasDeferredReload = false;
      this.reload();
    }
  }

  startEdit(): void {
    if (!this.canStartEdit() || this.isStartingEdit()) {
      return;
    }

    this.isStartingEdit.set(true);
    this.error.set(null);
    this.editLocks
      .acquire('INBOX', this.tenantContext.activeScope())
      .pipe(finalize(() => this.isStartingEdit.set(false)))
      .subscribe({
        next: (response) => {
          this.editLockId.set(response.lock.id);
          this.editLockHeartbeat = this.editLocks.startHeartbeat(response.lock.id, () =>
            this.handleEditLockLost('inbox.errors.editLockLost'),
          );
          globalThis.addEventListener?.('beforeunload', this.beforeUnloadHandler);
          this.selectedDocumentIds.set(new Set());
          this.isEditMode.set(true);
        },
        error: () => this.error.set('inbox.errors.editLockFailed'),
      });
  }

  cancelEdit(): void {
    if (!this.isEditMode()) {
      return;
    }

    this.revertRows();
    this.stopEditing({ releaseLock: true });
    this.reload();
  }

  resetField(row: InboxRow, field: InboxMetadataField): void {
    row.form.controls[field].setValue(row.original[field], { emitEvent: false });
    row.form.controls[field].markAsPristine();
    this.editRevision.update((revision) => revision + 1);
  }

  acceptAllLoaded(): void {
    this.acceptDocuments(this.eligibleDocuments().map((document) => document.id));
  }

  canAccept(document: DocumentSummaryDto): boolean {
    return this.canEdit() && document.status === 'READY';
  }

  canReprocess(document: DocumentSummaryDto): boolean {
    return this.canReprocessDocuments() && !REPROCESS_BLOCKED_STATUSES.has(document.status);
  }

  canRotateReprocess(document: DocumentSummaryDto): boolean {
    return this.canReprocess(document) && document.mimeType === 'application/pdf';
  }

  canReprocessAi(document: DocumentSummaryDto): boolean {
    return this.canReprocessDocuments() && document.status === 'READY';
  }

  canReprocessDocumentRow(document: DocumentSummaryDto): boolean {
    return this.canRunRowActions() && this.canReprocess(document);
  }

  canRotateReprocessDocumentRow(document: DocumentSummaryDto): boolean {
    return this.canRunRowActions() && this.canRotateReprocess(document);
  }

  canReprocessAiDocumentRow(document: DocumentSummaryDto): boolean {
    return this.canRunRowActions() && this.canReprocessAi(document);
  }

  canDeleteDocumentRow(document: DocumentSummaryDto): boolean {
    return this.canRunRowActions() && this.canEdit() && Boolean(document.id);
  }

  canRunRowActions(): boolean {
    return (
      !this.isEditMode() &&
      !this.hasInboxChanges() &&
      !this.isLoading() &&
      !this.isReprocessing() &&
      !this.isDeleting()
    );
  }

  canSelect(document: DocumentSummaryDto): boolean {
    return (
      !this.isEditMode() &&
      !this.hasInboxChanges() &&
      (this.canAccept(document) || this.canReprocess(document) || this.canReprocessAi(document))
    );
  }

  isSelected(document: DocumentSummaryDto): boolean {
    return this.selectedDocumentIds().has(document.id);
  }

  statusColor(status: DocumentStatus): string {
    return documentStatusColor(status);
  }

  statusIcon(status: DocumentStatus): string {
    return documentStatusIcon(status);
  }

  documentTypeName(document: DocumentSummaryDto): string {
    if (!document.documentType) {
      return this.translate.instant('common.emptyValue');
    }
    return documentTypeDisplayName(document.documentType, (key) => this.translate.instant(key));
  }

  documentTypeDisplayName(documentType: DocumentTypeDto): string {
    return documentTypeDisplayName(documentType, (key) => this.translate.instant(key));
  }

  documentDisplayTitle(document: DocumentSummaryDto): string {
    return document.displayTitle ?? document.title ?? document.originalFileName;
  }

  isInboxFieldChanged(row: InboxRow, field: InboxMetadataField): boolean {
    this.editRevision();
    return this.currentRowValue(row)[field] !== row.original[field];
  }

  isMissingRequiredField(row: InboxRow, field: InboxMetadataField): boolean {
    this.editRevision();
    if (!this.acceptanceFailedDocumentIds().has(row.id)) {
      return false;
    }

    const value = this.currentRowValue(row);
    switch (field) {
      case 'title':
      case 'sender':
        return value[field].trim().length === 0;
      case 'documentTypeId':
      case 'documentDate':
        return value[field].length === 0;
    }
  }

  hasPendingChanges(): boolean {
    return this.hasInboxChanges();
  }

  thumbnailUrl(document: DocumentSummaryDto): string | null {
    return this.thumbnailUrls()[document.id] ?? null;
  }

  shortDate(value: string | null): string {
    return localizedLongDate(value, this.language.currentLocale());
  }

  deleteDocument(document: DocumentSummaryDto): void {
    if (!this.canDeleteDocumentRow(document)) {
      return;
    }

    this.isDeleting.set(true);
    this.error.set(null);
    this.documentsApi
      .delete(document.id)
      .pipe(finalize(() => this.isDeleting.set(false)))
      .subscribe({
        next: () => {
          this.selectedDocumentIds.update((selected) => {
            const next = new Set(selected);
            next.delete(document.id);
            return next;
          });
          this.reload();
        },
        error: () => this.error.set('inbox.errors.deleteFailed'),
      });
  }

  private loadPage(page: number, options: { readonly append: boolean }): void {
    if (this.tenantContext.hasNoActiveTenants()) {
      this.clearTenantScopedState();
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
    this.error.set(null);

    this.documentsApi
      .searchInbox({
        page,
        pageSize: this.pageSize(),
        searchFields: DEFAULT_SEARCH_FIELDS,
        sortBy: DEFAULT_SORT_BY,
        sortDirection: DEFAULT_SORT_DIRECTION,
        ...(this.searchControl.value.trim() ? { query: this.searchControl.value.trim() } : {}),
      })
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
          const nextRows = options.append
            ? this.appendUniqueRows(this.rows(), response.items)
            : response.items.map((document) => this.createRow(document));
          this.rows.set(nextRows);
          this.meta.set(response.meta);
          this.syncSelectionWithDocuments(nextRows.map((row) => row.document));
          this.syncThumbnailObjectUrls(nextRows.map((row) => row.document));
        },
        error: () => {
          if (requestId !== this.searchRequestId) {
            return;
          }

          this.error.set('inbox.errors.loadFailed');
          if (!options.append) {
            this.rows.set([]);
            this.selectedDocumentIds.set(new Set());
            this.syncThumbnailObjectUrls([]);
          }
        },
      });
  }

  private acceptDocuments(documentIds: readonly string[]): void {
    if (documentIds.length === 0) {
      return;
    }

    this.error.set(null);
    this.documentsApi.acceptInboxDocuments(documentIds).subscribe({
      next: () => {
        this.acceptanceFailedDocumentIds.set(new Set());
        this.selectedDocumentIds.set(new Set());
        this.reload();
      },
      error: () => {
        this.acceptanceFailedDocumentIds.set(new Set(documentIds));
        this.error.set('inbox.errors.acceptFailed');
      },
    });
  }

  private reprocessDocuments(
    documentIds: readonly string[],
    request?: ReprocessDocumentRequest,
  ): void {
    if (documentIds.length === 0 || this.isReprocessing()) {
      return;
    }

    this.isReprocessing.set(true);
    this.error.set(null);
    forkJoin(
      documentIds.map((documentId) =>
        request
          ? this.documentsApi.reprocess(documentId, request)
          : this.documentsApi.reprocess(documentId),
      ),
    )
      .pipe(
        finalize(() => {
          this.isReprocessing.set(false);
        }),
      )
      .subscribe({
        next: () => {
          this.selectedDocumentIds.set(new Set());
          this.reload();
        },
        error: () => this.error.set('inbox.errors.reprocessFailed'),
      });
  }

  private startAiForDocuments(documentIds: readonly string[]): void {
    if (documentIds.length === 0 || this.isReprocessing()) {
      return;
    }

    this.isReprocessing.set(true);
    this.error.set(null);
    forkJoin(documentIds.map((documentId) => this.documentsApi.triggerAiExtraction(documentId)))
      .pipe(
        finalize(() => {
          this.isReprocessing.set(false);
        }),
      )
      .subscribe({
        next: () => {
          this.selectedDocumentIds.set(new Set());
          this.reload();
        },
        error: () => this.error.set('inbox.errors.reprocessFailed'),
      });
  }

  private requestReload(): void {
    if (this.isEditMode() || this.hasInboxChanges()) {
      this.hasDeferredReload = true;
      return;
    }

    this.reload();
  }

  private loadDocumentTypes(): void {
    this.settingsApi
      .documentTypes()
      .pipe(
        catchError(() => EMPTY),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((documentTypes) => {
        this.activeDocumentTypes.set(documentTypes.filter((documentType) => documentType.active));
      });
  }

  private clearTenantScopedState(): void {
    this.activeReplaceRequestId = null;
    this.activeAppendRequestId = null;
    this.rows.set([]);
    this.acceptanceFailedDocumentIds.set(new Set());
    this.selectedDocumentIds.set(new Set());
    this.meta.set({
      page: 1,
      pageSize: this.pageSize(),
      totalItems: 0,
      totalPages: 0,
    });
    this.error.set(null);
    this.isLoading.set(false);
    this.isLoadingMore.set(false);
    this.syncThumbnailObjectUrls([]);
  }

  private selectableDocuments(): DocumentSummaryDto[] {
    return this.documents().filter((document) => this.canSelect(document));
  }

  private createRow(document: DocumentSummaryDto): InboxRow {
    const original = this.rowValue(document);
    const form: InboxMetadataForm = new FormGroup({
      title: new FormControl(original.title, {
        nonNullable: true,
        validators: [Validators.maxLength(500)],
      }),
      sender: new FormControl(original.sender, {
        nonNullable: true,
        validators: [Validators.maxLength(300)],
      }),
      documentTypeId: new FormControl<string | null>(original.documentTypeId || null),
      documentDate: new FormControl(original.documentDate, { nonNullable: true }),
    });
    form.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.editRevision.update((revision) => revision + 1);
    });

    return { id: document.id, document, original, form };
  }

  private appendUniqueRows(
    current: readonly InboxRow[],
    next: readonly DocumentSummaryDto[],
  ): InboxRow[] {
    const documentIds = new Set(current.map((row) => row.id));
    return [
      ...current,
      ...next
        .filter((document) => !documentIds.has(document.id))
        .map((document) => this.createRow(document)),
    ];
  }

  private rowValue(document: DocumentSummaryDto): InboxMetadataValue {
    return {
      title: document.title ?? '',
      sender: document.sender ?? '',
      documentTypeId: document.documentType?.id ?? '',
      documentDate: dateInputValue(document.documentDate),
    };
  }

  private currentRowValue(row: InboxRow): InboxMetadataValue {
    return {
      title: row.form.controls.title.value,
      sender: row.form.controls.sender.value,
      documentTypeId: row.form.controls.documentTypeId.value ?? '',
      documentDate: row.form.controls.documentDate.value,
    };
  }

  private hasRowChanges(row: InboxRow): boolean {
    const value = this.currentRowValue(row);
    return (
      value.title !== row.original.title ||
      value.sender !== row.original.sender ||
      value.documentTypeId !== row.original.documentTypeId ||
      value.documentDate !== row.original.documentDate
    );
  }

  private changedMetadataRequest(row: InboxRow): DocumentMetadataUpdateRequest {
    const value = this.currentRowValue(row);
    const request: DocumentMetadataUpdateRequest = {};

    if (value.title !== row.original.title) {
      request.title = nullableText(value.title);
    }
    if (value.sender !== row.original.sender) {
      request.sender = nullableText(value.sender);
    }
    if (value.documentTypeId !== row.original.documentTypeId) {
      request.documentTypeId = value.documentTypeId || null;
    }
    if (value.documentDate !== row.original.documentDate) {
      request.documentDate = nullableIsoDateTime(value.documentDate);
    }

    return request;
  }

  private syncSelectionWithDocuments(documents: readonly DocumentSummaryDto[]): void {
    this.selectedDocumentIds.update((selected) => {
      const currentIds = new Set(documents.map((document) => document.id));
      return new Set([...selected].filter((id) => currentIds.has(id)));
    });
  }

  private syncThumbnailObjectUrls(documents: readonly DocumentSummaryDto[]): void {
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

  private revertRows(): void {
    for (const row of this.rows()) {
      row.form.setValue(row.original, { emitEvent: false });
      row.form.markAsPristine();
    }
    this.editRevision.update((revision) => revision + 1);
  }

  private stopEditing(options: { readonly releaseLock: boolean }): void {
    const lockId = this.editLockId();
    this.editLockHeartbeat?.unsubscribe();
    this.editLockHeartbeat = null;
    this.editLockId.set(null);
    this.isEditMode.set(false);
    globalThis.removeEventListener?.('beforeunload', this.beforeUnloadHandler);

    if (options.releaseLock) {
      this.editLocks.releaseBestEffort(lockId);
    }
  }

  private releaseEditLock(): void {
    this.stopEditing({ releaseLock: true });
  }

  private handleEditLockLost(errorKey: string): void {
    if (!this.editLockId()) {
      return;
    }

    this.revertRows();
    this.stopEditing({ releaseLock: false });
    this.error.set(errorKey);
    this.reload();
  }
}

function nullableText(value: string): string | null {
  const trimmedValue = value.trim();
  return trimmedValue || null;
}
