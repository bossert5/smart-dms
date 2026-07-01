import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  input,
  OnInit,
  signal,
  untracked,
} from '@angular/core';
import { ClipboardModule } from '@angular/cdk/clipboard';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  FormArray,
  FormControl,
  FormGroup,
  FormsModule,
  ReactiveFormsModule,
} from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import type {
  CalendarEventKind,
  DocumentCalendarEventDto,
  DocumentDetailDto,
  DocumentHistoryEventDto,
  DocumentHistoryEventType,
  DocumentMetadataUpdateRequest,
  DocumentAttributeValueType,
  DocumentPaymentStatus,
  DocumentStatus,
  TenantDto,
  UserAssigneeDto,
} from '@smart-dms/shared-dto';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { NzBadgeModule } from 'ng-zorro-antd/badge';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzDropDownModule } from 'ng-zorro-antd/dropdown';
import { NzEmptyModule } from 'ng-zorro-antd/empty';
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzMenuModule } from 'ng-zorro-antd/menu';
import { NzModalModule } from 'ng-zorro-antd/modal';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzSkeletonModule } from 'ng-zorro-antd/skeleton';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { NzTabsModule } from 'ng-zorro-antd/tabs';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzTimelineModule } from 'ng-zorro-antd/timeline';
import { catchError, EMPTY, finalize, of, switchMap, type Subscription } from 'rxjs';
import { AuthenticatedAssetService } from '../../core/api/authenticated-asset.service';
import { DocumentApiService } from '../../core/api/document-api.service';
import { TenantApiService } from '../../core/api/tenant-api.service';
import { UserApiService } from '../../core/api/user-api.service';
import { LanguageService } from '../../core/i18n/language.service';
import { AuthService } from '../../core/services/auth.service';
import { EditLockService } from '../../core/services/edit-lock.service';
import { OpenDocumentsService } from '../../core/services/open-documents.service';
import { RealtimeClientService } from '../../core/services/realtime-client.service';
import { CalendarEventCardComponent } from '../../shared/calendar-event-card/calendar-event-card.component';
import { localizedLongDate } from '../../shared/formatters/date.formatter';
import {
  CALENDAR_EVENT_KINDS,
  calendarEventKindLabelKey,
} from '../../shared/presentation/calendar-presentation';
import {
  documentStatusColor,
  documentStatusLabelKey,
  documentTypeDisplayName as translatedDocumentTypeDisplayName,
} from '../../shared/presentation/document-presentation';
import {
  type DocumentAttributeFormValue,
  type DocumentDetailFormValue,
  type DocumentPaymentFormValue,
  type DocumentReferenceFormValue,
  documentMetadataFormValue,
  metadataUpdateRequest,
  tagsUpdateRequest,
  type DocumentCalendarEventFormValue,
} from './document-detail.form';
import { PdfDocumentViewerComponent } from './pdf-document-viewer.component';

type MetadataForm = FormGroup<{
  title: FormControl<string>;
  documentTypeId: FormControl<string>;
  documentDate: FormControl<string>;
  summary: FormControl<string>;
  sender: FormControl<string>;
  recipient: FormControl<string>;
  note: FormControl<string>;
  payments: FormArray<PaymentForm>;
  calendarEvents: FormArray<CalendarEventForm>;
  references: FormArray<ReferenceForm>;
  attributes: FormArray<AttributeForm>;
}>;

type PaymentForm = FormGroup<{
  id: FormControl<string>;
  iban: FormControl<string>;
  recipient: FormControl<string>;
  purpose: FormControl<string>;
  amount: FormControl<number | null>;
  currency: FormControl<string>;
  status: FormControl<DocumentPaymentStatus>;
  paidAt: FormControl<string | null>;
  assignedToId: FormControl<string>;
  dueDate: FormControl<string>;
}>;

type CalendarEventForm = FormGroup<{
  id: FormControl<string>;
  kind: FormControl<CalendarEventKind>;
  title: FormControl<string>;
  description: FormControl<string>;
  date: FormControl<string>;
  time: FormControl<string>;
  endDate: FormControl<string>;
  endTime: FormControl<string>;
  sourceText: FormControl<string>;
  assignedToId: FormControl<string>;
  completedAt: FormControl<string | null>;
}>;

type ReferenceForm = FormGroup<{
  id: FormControl<string>;
  referenceNumber: FormControl<string>;
  referenceType: FormControl<string>;
}>;

type AttributeForm = FormGroup<{
  fieldDefinitionId: FormControl<string | null>;
  key: FormControl<string>;
  value: FormControl<string>;
  valueType: FormControl<DocumentAttributeValueType>;
}>;

type DocumentMetadataField = keyof Pick<
  DocumentDetailFormValue,
  'title' | 'documentTypeId' | 'documentDate' | 'summary' | 'sender' | 'recipient' | 'note'
>;
type PaymentMetadataField = keyof DocumentPaymentFormValue;
type CalendarEventMetadataField = keyof DocumentCalendarEventFormValue;
type ReferenceMetadataField = keyof DocumentReferenceFormValue;
type AttributeMetadataField = keyof DocumentAttributeFormValue;

const HISTORY_PAGE_SIZE = 100;

@Component({
  selector: 'app-document-detail-pane',
  imports: [
    ClipboardModule,
    FormsModule,
    ReactiveFormsModule,
    RouterLink,
    TranslatePipe,
    CalendarEventCardComponent,
    PdfDocumentViewerComponent,
    NzAlertModule,
    NzBadgeModule,
    NzButtonModule,
    NzCardModule,
    NzDropDownModule,
    NzEmptyModule,
    NzFormModule,
    NzIconModule,
    NzInputModule,
    NzMenuModule,
    NzModalModule,
    NzSelectModule,
    NzSkeletonModule,
    NzSpinModule,
    NzTabsModule,
    NzTagModule,
    NzTimelineModule,
  ],
  templateUrl: './document-detail-pane.component.html',
  styleUrl: './document-detail-pane.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DocumentDetailPaneComponent implements OnInit {
  readonly documentId = input.required<string>();
  readonly isActive = input(true);
  readonly backLink = input('/documents');

  readonly auth = inject(AuthService);
  private readonly assets = inject(AuthenticatedAssetService);
  private readonly documentsApi = inject(DocumentApiService);
  private readonly editLocks = inject(EditLockService);
  private readonly tenantsApi = inject(TenantApiService);
  private readonly usersApi = inject(UserApiService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly language = inject(LanguageService);
  private readonly openDocuments = inject(OpenDocumentsService);
  private readonly router = inject(Router);
  private readonly realtime = inject(RealtimeClientService);
  private readonly translate = inject(TranslateService);
  private lastDocumentChangeKey = this.documentChangeKey(this.realtime.latestDocumentChange());
  private pdfObjectUrl: { readonly source: string; readonly objectUrl: string } | null = null;
  private pdfLoadingSource: string | null = null;
  private readonly currentDocumentId = signal<string | null>(null);
  private readonly originalMetadataValue = signal<DocumentDetailFormValue | null>(null);
  private readonly metadataRevision = signal(0);
  private readonly savedTagNames = signal<string[]>([]);
  private readonly tagInputText = signal('');
  private editLockHeartbeat: Subscription | null = null;
  private readonly beforeUnloadHandler = (): void => {
    this.editLocks.releaseBeforeUnload(this.editLockId());
  };

  readonly document = signal<DocumentDetailDto | null>(null);
  readonly historyItems = signal<DocumentHistoryEventDto[]>([]);
  readonly historyPage = signal(0);
  readonly historyTotalItems = signal(0);
  readonly historyTotalPages = signal(0);
  readonly pdfUrl = signal<string | null>(null);
  readonly tagNames = signal<string[]>([]);
  readonly assignees = signal<UserAssigneeDto[]>([]);
  readonly isLoading = signal(false);
  readonly isHistoryLoading = signal(false);
  readonly isEditing = signal(false);
  readonly isStartingEdit = signal(false);
  readonly editLockId = signal<string | null>(null);
  readonly isSaving = signal(false);
  readonly isDocumentActionRunning = signal(false);
  readonly metadataDirty = signal(false);
  readonly error = signal<string | null>(null);
  readonly historyError = signal<string | null>(null);
  readonly trashDocument = signal<DocumentDetailDto | null>(null);
  readonly activeTenants = signal<TenantDto[]>([]);
  readonly isMoveTenantDialogVisible = signal(false);
  readonly selectedMoveTenantId = signal<string | null>(null);
  readonly metadataForm: MetadataForm = new FormGroup({
    title: new FormControl('', { nonNullable: true }),
    documentTypeId: new FormControl('', { nonNullable: true }),
    documentDate: new FormControl('', { nonNullable: true }),
    summary: new FormControl('', { nonNullable: true }),
    sender: new FormControl('', { nonNullable: true }),
    recipient: new FormControl('', { nonNullable: true }),
    note: new FormControl('', { nonNullable: true }),
    payments: new FormArray<PaymentForm>([]),
    calendarEvents: new FormArray<CalendarEventForm>([]),
    references: new FormArray<ReferenceForm>([]),
    attributes: new FormArray<AttributeForm>([]),
  });
  readonly tagForm = new FormGroup({
    tagText: new FormControl('', { nonNullable: true }),
  });
  readonly hasMoreHistory = computed(
    () => this.historyPage() > 0 && this.historyPage() < this.historyTotalPages(),
  );
  readonly isAiRunning = computed(() => this.document()?.status === 'AI_RUNNING');
  readonly isAiLocked = computed(() => this.isAiLockedStatus(this.document()?.status));
  readonly isOpenDocument = computed(() => this.openDocuments.isOpen(this.documentId()));
  readonly hasTagChanges = computed(
    () =>
      !this.sameTagNameList(this.tagNames(), this.savedTagNames()) ||
      Boolean(this.normalizedTagName(this.tagInputText())),
  );
  readonly hasPendingChanges = computed(() => this.metadataDirty() || this.hasTagChanges());
  readonly linkedCalendarEvents = computed(() =>
    this.document()?.calendarEvents.filter((event) => Boolean(event.paymentId)) ?? [],
  );
  readonly canEditDocument = computed(
    () =>
      this.auth.canEditDocuments() &&
      this.realtime.isConnected() &&
      !this.isAiLocked() &&
      !this.isEditing() &&
      !this.isStartingEdit(),
  );
  readonly isCurrentInboxDocument = computed(() => {
    const doc = this.document();
    return doc ? this.isInboxDocument(doc) : false;
  });
  readonly canAcceptCurrentDocument = computed(() => {
    const doc = this.document();
    return Boolean(
      doc &&
      this.auth.canEditDocuments() &&
      this.isInboxDocument(doc) &&
      doc.status === 'READY' &&
      !this.isAiLocked() &&
      !this.isDocumentActionRunning(),
    );
  });
  readonly canMoveCurrentDocument = computed(() => {
    const doc = this.document();
    return Boolean(
      doc &&
      this.auth.canEditDocuments() &&
      !this.isInboxDocument(doc) &&
      !this.isAiLocked() &&
      !this.isDocumentActionRunning(),
    );
  });
  readonly canReprocessCurrentDocument = computed(() => {
    const doc = this.document();
    return Boolean(
      doc &&
      this.auth.isAdmin() &&
      this.isInboxDocument(doc) &&
      !this.isAiLocked() &&
      !this.isDocumentActionRunning(),
    );
  });
  readonly moveTenantTargetOptions = computed(() => {
    const currentTenantId = this.document()?.tenant.id;
    return this.activeTenants().filter((tenant) => tenant.id !== currentTenantId);
  });
  readonly canShowMoveTenantAction = computed(() => {
    const doc = this.document();
    return Boolean(
      doc &&
      this.auth.isAdmin() &&
      this.isInboxDocument(doc) &&
      this.activeTenants().length > 1,
    );
  });
  readonly canMoveCurrentDocumentToTenant = computed(
    () =>
      this.canShowMoveTenantAction() &&
      !this.isAiLocked() &&
      !this.isDocumentActionRunning(),
  );
  readonly documentStatusLabelKey = documentStatusLabelKey;
  readonly calendarEventKinds = CALENDAR_EVENT_KINDS;
  readonly calendarEventKindLabelKey = calendarEventKindLabelKey;

  constructor() {
    this.destroyRef.onDestroy(() => {
      this.releaseEditLock();
      this.clearPdfObjectUrl();
    });
    this.metadataForm.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.refreshMetadataChangeState();
    });
    this.tagForm.controls.tagText.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((value) => this.tagInputText.set(value));
    effect(() => {
      const documentId = this.documentId();
      this.currentDocumentId.set(documentId);
      untracked(() => this.load(documentId));
    });
    effect(() => {
      const event = this.realtime.latestDocumentChange();
      const documentId = this.currentDocumentId();
      const eventKey = this.documentChangeKey(event);
      if (!event || eventKey === this.lastDocumentChangeKey || event.documentId !== documentId) {
        return;
      }

      this.lastDocumentChangeKey = eventKey;
      untracked(() => this.load());
    });
    effect(() => {
      if (this.realtime.isConnected()) {
        return;
      }

      untracked(() => this.handleEditLockLost('documentDetail.errors.editLockLost'));
    });
    effect(() => {
      const event = this.realtime.latestEditLockChange();
      const lockId = this.editLockId();
      if (!event || !lockId || event.lock.id !== lockId) {
        return;
      }

      if (event.action === 'RELEASED' || event.action === 'EXPIRED') {
        untracked(() => this.handleEditLockLost('documentDetail.errors.editLockLost'));
      }
    });
  }

  ngOnInit(): void {
    this.loadAssignees();
    this.loadActiveTenants();
  }

  load(id = this.currentDocumentId()): void {
    if (!id) {
      this.error.set('documentDetail.errors.missingId');
      return;
    }

    this.isLoading.set(true);
    this.error.set(null);
    this.documentsApi
      .detail(id)
      .pipe(finalize(() => this.isLoading.set(false)))
      .subscribe({
        next: (document) => {
          if (this.currentDocumentId() === document.id) {
            this.applyDocument(document);
          }
        },
        error: () => {
          if (this.currentDocumentId() === id) {
            this.error.set('documentDetail.errors.loadFailed');
          }
        },
      });
  }

  saveMetadata(): void {
    const doc = this.document();
    if (!doc || this.isAiLocked()) {
      return;
    }

    if (!this.canSaveCoreMetadata()) {
      this.error.set('documentDetail.errors.requiredCoreMetadata');
      this.markCoreMetadataTouched();
      return;
    }

    this.isSaving.set(true);
    this.documentsApi
      .updateMetadata(doc.id, this.metadataRequest())
      .pipe(finalize(() => this.isSaving.set(false)))
      .subscribe({
        next: (updated) => this.applyDocument(updated),
        error: () => this.error.set('documentDetail.errors.saveMetadataFailed'),
      });
  }

  saveChanges(): void {
    const doc = this.document();
    if (
      !doc ||
      !this.isEditing() ||
      !this.hasPendingChanges() ||
      this.isSaving() ||
      this.isAiLocked()
    ) {
      return;
    }

    const shouldSaveMetadata = this.metadataDirty();
    const shouldSaveTags = this.hasTagChanges();
    if (shouldSaveMetadata && !this.canSaveCoreMetadata()) {
      this.error.set('documentDetail.errors.requiredCoreMetadata');
      this.markCoreMetadataTouched();
      return;
    }

    this.isSaving.set(true);
    (shouldSaveMetadata
      ? this.documentsApi.updateMetadata(doc.id, this.metadataRequest())
      : of(doc)
    )
      .pipe(
        switchMap((updated) =>
          shouldSaveTags
            ? this.documentsApi.updateTags(
                updated.id,
                tagsUpdateRequest(this.tagNamesForRequest().join(', ')),
              )
            : of(updated),
        ),
        finalize(() => this.isSaving.set(false)),
      )
      .subscribe({
        next: (updated) => {
          this.releaseEditLock();
          this.applyDocument(updated);
        },
        error: () => this.error.set('documentDetail.errors.saveChangesFailed'),
      });
  }

  revertChanges(): void {
    const doc = this.document();
    if (!doc || !this.isEditing() || this.isSaving()) {
      return;
    }

    this.releaseEditLock();
    this.applyDocument(doc);
  }

  enableEditing(): void {
    if (!this.canEditDocument()) {
      return;
    }

    const doc = this.document();
    if (!doc) {
      return;
    }

    this.isStartingEdit.set(true);
    this.error.set(null);
    this.editLocks
      .acquire('DOCUMENT', doc.id)
      .pipe(finalize(() => this.isStartingEdit.set(false)))
      .subscribe({
        next: (response) => {
          this.editLockId.set(response.lock.id);
          this.editLockHeartbeat = this.editLocks.startHeartbeat(response.lock.id, () =>
            this.handleEditLockLost('documentDetail.errors.editLockLost'),
          );
          globalThis.addEventListener?.('beforeunload', this.beforeUnloadHandler);
          this.isEditing.set(true);
        },
        error: () => this.error.set('documentDetail.errors.editLockFailed'),
      });
  }

  cancelEditing(): void {
    if (
      this.hasPendingChanges() &&
      !(globalThis.confirm?.(this.translate.instant('common.unsavedChangesConfirm')) ?? true)
    ) {
      return;
    }

    const doc = this.document();
    if (doc) {
      this.applyDocument(doc);
    }
    this.releaseEditLock();
    this.isEditing.set(false);
  }

  saveTags(): void {
    const doc = this.document();
    if (!doc || this.isAiLocked()) {
      return;
    }

    this.isSaving.set(true);
    this.documentsApi
      .updateTags(doc.id, tagsUpdateRequest(this.tagNamesForRequest().join(', ')))
      .pipe(finalize(() => this.isSaving.set(false)))
      .subscribe({
        next: (updated) => this.applyDocument(updated),
        error: () => this.error.set('documentDetail.errors.saveTagsFailed'),
      });
  }

  archive(): void {
    const doc = this.document();
    if (!doc || !this.canMoveCurrentDocument()) {
      return;
    }

    this.isDocumentActionRunning.set(true);
    this.documentsApi
      .archive(doc.id)
      .pipe(finalize(() => this.isDocumentActionRunning.set(false)))
      .subscribe({
        next: () => {
          this.navigateAfterDocumentLeavesView(doc.id, '/documents');
        },
        error: () => this.error.set('documentDetail.errors.archiveFailed'),
      });
  }

  moveToInbox(): void {
    const doc = this.document();
    if (!doc || !this.canMoveCurrentDocument()) {
      return;
    }

    this.isDocumentActionRunning.set(true);
    this.documentsApi
      .moveToInbox(doc.id)
      .pipe(finalize(() => this.isDocumentActionRunning.set(false)))
      .subscribe({
        next: () => this.navigateAfterDocumentLeavesView(doc.id, '/inbox'),
        error: () => this.error.set('documentDetail.errors.moveToInboxFailed'),
      });
  }

  openMoveToTenantDialog(): void {
    if (!this.canShowMoveTenantAction()) {
      return;
    }

    this.selectedMoveTenantId.set(null);
    this.isMoveTenantDialogVisible.set(true);
  }

  cancelMoveToTenant(): void {
    if (this.isDocumentActionRunning()) {
      return;
    }

    this.isMoveTenantDialogVisible.set(false);
    this.selectedMoveTenantId.set(null);
  }

  confirmMoveToTenant(): void {
    const doc = this.document();
    const targetTenantId = this.selectedMoveTenantId();
    if (!doc || !targetTenantId || !this.canMoveCurrentDocumentToTenant()) {
      return;
    }

    this.isDocumentActionRunning.set(true);
    this.error.set(null);
    this.documentsApi
      .moveToTenant(doc.id, { targetTenantId })
      .pipe(finalize(() => this.isDocumentActionRunning.set(false)))
      .subscribe({
        next: () => {
          this.isMoveTenantDialogVisible.set(false);
          this.selectedMoveTenantId.set(null);
          this.navigateAfterDocumentLeavesView(doc.id, '/inbox');
        },
        error: () => this.error.set('documentDetail.errors.moveToTenantFailed'),
      });
  }

  requestTrash(): void {
    const doc = this.document();
    if (!doc || !this.canMoveCurrentDocument()) {
      return;
    }

    this.trashDocument.set(doc);
  }

  cancelTrash(): void {
    if (this.isDocumentActionRunning()) {
      return;
    }

    this.trashDocument.set(null);
  }

  confirmTrash(): void {
    const doc = this.trashDocument();
    if (!doc || !this.canMoveCurrentDocument()) {
      return;
    }

    this.isDocumentActionRunning.set(true);
    this.documentsApi
      .delete(doc.id)
      .pipe(finalize(() => this.isDocumentActionRunning.set(false)))
      .subscribe({
        next: () => {
          this.trashDocument.set(null);
          this.navigateAfterDocumentLeavesView(doc.id, '/documents');
        },
        error: () => this.error.set('documentDetail.errors.deleteFailed'),
      });
  }

  acceptInboxDocument(): void {
    const doc = this.document();
    if (!doc || !this.canAcceptCurrentDocument()) {
      return;
    }

    this.isDocumentActionRunning.set(true);
    this.documentsApi
      .acceptInboxDocument(doc.id)
      .pipe(finalize(() => this.isDocumentActionRunning.set(false)))
      .subscribe({
        next: () => this.load(),
        error: () => this.error.set('documentDetail.errors.acceptFailed'),
      });
  }

  reprocess(): void {
    const doc = this.document();
    if (!doc || !this.canReprocessCurrentDocument()) {
      return;
    }

    this.isDocumentActionRunning.set(true);
    this.documentsApi
      .reprocess(doc.id)
      .pipe(finalize(() => this.isDocumentActionRunning.set(false)))
      .subscribe({
        next: () => this.load(),
        error: () => this.error.set('documentDetail.errors.reprocessFailed'),
      });
  }

  closeDocument(): void {
    const documentId = this.documentId();
    if (!this.openDocuments.isOpen(documentId)) {
      void this.router.navigateByUrl('/documents');
      return;
    }

    const nextDocument = this.openDocuments.close(documentId);
    void this.router.navigateByUrl(nextDocument ? `/documents/${nextDocument.id}` : '/documents');
  }

  togglePinDocument(): void {
    const doc = this.document();
    if (!doc || this.isCurrentInboxDocument()) {
      return;
    }

    if (this.isOpenDocument()) {
      this.openDocuments.close(doc.id);
      return;
    }

    this.openDocuments.open({
      id: doc.id,
      title: this.documentDisplayTitle(doc),
    });
  }

  loadMoreHistory(): void {
    const doc = this.document();
    if (!doc || this.isHistoryLoading() || !this.hasMoreHistory()) {
      return;
    }

    this.loadHistory(doc.id, this.historyPage() + 1, false);
  }

  statusColor(status: DocumentStatus): string {
    return documentStatusColor(status);
  }

  documentTypeDisplayName(documentType: DocumentDetailDto['documentTypes'][number]): string {
    return translatedDocumentTypeDisplayName(documentType, (key) => this.translate.instant(key));
  }

  displayText(value: string | number | null | undefined): string {
    const text = value === null || value === undefined ? '' : String(value).trim();
    return text || this.translate.instant('common.empty');
  }

  displayDate(value: string | null | undefined): string {
    if (!value) {
      return this.translate.instant('common.empty');
    }

    return localizedLongDate(
      value,
      this.language.currentLocale(),
      this.translate.instant('common.empty'),
    );
  }

  displayDocumentType(document: DocumentDetailDto): string {
    const documentTypeId = this.metadataForm.controls.documentTypeId.value;
    const documentType =
      document.documentTypes.find((candidate) => candidate.id === documentTypeId) ??
      document.documentType;

    return documentType
      ? this.documentTypeDisplayName(documentType)
      : this.translate.instant('documentDetail.fields.noDocumentType');
  }

  downloadFileName(document: DocumentDetailDto): string {
    const baseName = (document.originalFileName || this.documentDisplayTitle(document)).trim();
    const safeName = baseName.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_') || 'document';

    return safeName.toLowerCase().endsWith('.pdf') ? safeName : `${safeName}.pdf`;
  }

  displayAttributeValue(attribute: AttributeForm): string {
    const value = attribute.controls.value.value.trim();
    if (!value) {
      return this.translate.instant('common.empty');
    }

    switch (attribute.controls.valueType.value) {
      case 'BOOLEAN':
        if (value === 'true') {
          return this.translate.instant('common.yes');
        }
        if (value === 'false') {
          return this.translate.instant('common.no');
        }
        return this.translate.instant('common.empty');
      case 'DATE':
        return this.displayDate(value);
      case 'NUMBER':
        return Number.isNaN(Number(value))
          ? this.displayText(value)
          : new Intl.NumberFormat(this.language.currentLocale()).format(Number(value));
      default:
        return this.displayText(value);
    }
  }

  displayPaymentAmount(amount: number | null, currency: string): string {
    if (amount === null) {
      return this.translate.instant('common.empty');
    }

    try {
      return new Intl.NumberFormat(this.language.currentLocale(), {
        style: 'currency',
        currency: currency || 'EUR',
      }).format(amount);
    } catch {
      return `${new Intl.NumberFormat(this.language.currentLocale()).format(amount)} ${currency}`;
    }
  }

  copyAria(labelKey: string): string {
    return this.translate.instant('documentDetail.actions.copyValue', {
      label: this.translate.instant(labelKey),
    });
  }

  copyPaymentAmount(amount: number | null): string {
    return amount === null ? '' : String(amount);
  }

  canSaveChanges(): boolean {
    return Boolean(
      this.isEditing() &&
      this.hasPendingChanges() &&
      !this.isSaving() &&
      !this.isAiLocked() &&
      (!this.metadataDirty() || this.canSaveCoreMetadata()),
    );
  }

  isDocumentFieldChanged(field: DocumentMetadataField): boolean {
    this.metadataRevision();
    return this.metadataForm.controls[field].value !== this.originalMetadataValue()?.[field];
  }

  isPaymentFieldChanged(index: number, field: PaymentMetadataField): boolean {
    this.metadataRevision();
    const originalPayment = this.originalMetadataValue()?.payments[index];
    const payment = this.payments().at(index);

    return !originalPayment || !payment || payment.controls[field].value !== originalPayment[field];
  }

  isCalendarEventFieldChanged(index: number, field: CalendarEventMetadataField): boolean {
    this.metadataRevision();
    const originalEvent = this.originalMetadataValue()?.calendarEvents[index];
    const event = this.calendarEvents().at(index);

    return !originalEvent || !event || event.controls[field].value !== originalEvent[field];
  }

  isReferenceFieldChanged(index: number, field: ReferenceMetadataField): boolean {
    this.metadataRevision();
    const originalReference = this.originalMetadataValue()?.references[index];
    const reference = this.references().at(index);

    return (
      !originalReference ||
      !reference ||
      reference.controls[field].value !== originalReference[field]
    );
  }

  isAttributeFieldChanged(attribute: AttributeForm, field: AttributeMetadataField): boolean {
    this.metadataRevision();
    const originalAttribute = this.originalMetadataValue()?.attributes.find(
      (candidate) => candidate.key === attribute.controls.key.value,
    );

    return !originalAttribute || attribute.controls[field].value !== originalAttribute[field];
  }

  payments(): FormArray<PaymentForm> {
    return this.metadataForm.controls.payments;
  }

  calendarEvents(): FormArray<CalendarEventForm> {
    return this.metadataForm.controls.calendarEvents;
  }

  references(): FormArray<ReferenceForm> {
    return this.metadataForm.controls.references;
  }

  attributes(): FormArray<AttributeForm> {
    return this.metadataForm.controls.attributes;
  }

  addPayment(): void {
    if (!this.isEditing() || this.isAiLocked()) {
      return;
    }

    this.payments().push(this.paymentForm());
    this.markMetadataChanged();
  }

  removePayment(index: number): void {
    if (!this.isEditing() || this.isAiLocked()) {
      return;
    }

    this.payments().removeAt(index);
    this.markMetadataChanged();
  }

  addCalendarEvent(): void {
    if (!this.isEditing() || this.isAiLocked()) {
      return;
    }

    this.calendarEvents().push(this.calendarEventForm());
    this.markMetadataChanged();
  }

  removeCalendarEvent(index: number): void {
    if (!this.isEditing() || this.isAiLocked()) {
      return;
    }

    this.calendarEvents().removeAt(index);
    this.markMetadataChanged();
  }

  updatePaymentAssignee(index: number, assignedToId: string | null): void {
    const doc = this.document();
    const payment = this.payments().at(index);
    const paymentId = payment?.controls.id.value;
    if (!doc || !paymentId || this.isAiLocked()) {
      return;
    }

    this.isSaving.set(true);
    this.documentsApi
      .updatePaymentTask(doc.id, paymentId, { assignedToId })
      .pipe(finalize(() => this.isSaving.set(false)))
      .subscribe({
        next: (updated) => this.applyDocument(updated),
        error: () => this.error.set('documentDetail.errors.saveMetadataFailed'),
      });
  }

  markPaymentCompleted(index: number): void {
    this.updatePaymentCompletion(index, true);
  }

  markPaymentNotCompleted(index: number): void {
    this.updatePaymentCompletion(index, false);
  }

  private updatePaymentCompletion(index: number, completed: boolean): void {
    const doc = this.document();
    const payment = this.payments().at(index);
    const paymentId = payment?.controls.id.value;
    if (!doc || !paymentId || this.isAiLocked()) {
      return;
    }

    this.isSaving.set(true);
    this.documentsApi
      .updatePaymentTask(doc.id, paymentId, { completed })
      .pipe(finalize(() => this.isSaving.set(false)))
      .subscribe({
        next: (updated) => this.applyDocument(updated),
        error: () => this.error.set('documentDetail.errors.saveMetadataFailed'),
      });
  }

  updateCalendarEventAssignee(event: DocumentCalendarEventDto, assignedToId: string | null): void {
    const doc = this.document();
    if (!doc || this.isAiLocked()) {
      return;
    }

    this.isSaving.set(true);
    this.documentsApi
      .updateCalendarEventTask(doc.id, event.id, { assignedToId })
      .pipe(finalize(() => this.isSaving.set(false)))
      .subscribe({
        next: (updated) => this.applyDocument(updated),
        error: () => this.error.set('documentDetail.errors.saveMetadataFailed'),
      });
  }

  updateEditableCalendarEventAssignee(index: number, assignedToId: string | null): void {
    const doc = this.document();
    const event = this.calendarEvents().at(index);
    const eventId = event?.controls.id.value;
    if (!doc || !eventId || this.isAiLocked()) {
      return;
    }

    this.isSaving.set(true);
    this.documentsApi
      .updateCalendarEventTask(doc.id, eventId, { assignedToId })
      .pipe(finalize(() => this.isSaving.set(false)))
      .subscribe({
        next: (updated) => this.applyDocument(updated),
        error: () => this.error.set('documentDetail.errors.saveMetadataFailed'),
      });
  }

  markCalendarEventCompleted(event: DocumentCalendarEventDto): void {
    this.updateCalendarEventCompletion(event, true);
  }

  markCalendarEventNotCompleted(event: DocumentCalendarEventDto): void {
    this.updateCalendarEventCompletion(event, false);
  }

  markEditableCalendarEventCompleted(index: number): void {
    this.updateEditableCalendarEventCompletion(index, true);
  }

  markEditableCalendarEventNotCompleted(index: number): void {
    this.updateEditableCalendarEventCompletion(index, false);
  }

  private updateCalendarEventCompletion(event: DocumentCalendarEventDto, completed: boolean): void {
    const doc = this.document();
    if (!doc || this.isAiLocked() || event.kind === 'APPOINTMENT') {
      return;
    }

    this.isSaving.set(true);
    this.documentsApi
      .updateCalendarEventTask(doc.id, event.id, { completed })
      .pipe(finalize(() => this.isSaving.set(false)))
      .subscribe({
        next: (updated) => this.applyDocument(updated),
        error: () => this.error.set('documentDetail.errors.saveMetadataFailed'),
      });
  }

  private updateEditableCalendarEventCompletion(index: number, completed: boolean): void {
    const doc = this.document();
    const event = this.calendarEvents().at(index);
    const eventId = event?.controls.id.value;
    if (!doc || !eventId || this.isAiLocked() || event.controls.kind.value === 'APPOINTMENT') {
      return;
    }

    this.isSaving.set(true);
    this.documentsApi
      .updateCalendarEventTask(doc.id, eventId, { completed })
      .pipe(finalize(() => this.isSaving.set(false)))
      .subscribe({
        next: (updated) => this.applyDocument(updated),
        error: () => this.error.set('documentDetail.errors.saveMetadataFailed'),
      });
  }

  assigneeName(assigneeId: string): string {
    return (
      this.assignees().find((assignee) => assignee.id === assigneeId)?.displayName ??
      this.translate.instant('common.empty')
    );
  }

  addReference(): void {
    if (!this.isEditing() || this.isAiLocked()) {
      return;
    }

    this.references().push(this.referenceForm());
    this.markMetadataChanged();
  }

  removeReference(index: number): void {
    if (!this.isEditing() || this.isAiLocked()) {
      return;
    }

    this.references().removeAt(index);
    this.markMetadataChanged();
  }

  addTag(): void {
    const nextTagName = this.normalizedTagName(this.tagForm.controls.tagText.value);
    if (!nextTagName || !this.isEditing() || this.isAiLocked()) {
      return;
    }

    this.tagNames.update((current) =>
      current.some((tagName) => this.sameTagName(tagName, nextTagName))
        ? current
        : [...current, nextTagName],
    );
    this.tagForm.controls.tagText.setValue('');
  }

  removeTag(tagName: string): void {
    if (!this.isEditing() || this.isAiLocked()) {
      return;
    }

    this.tagNames.update((current) => current.filter((currentTag) => currentTag !== tagName));
  }

  canAddTag(): boolean {
    const nextTagName = this.normalizedTagName(this.tagForm.controls.tagText.value);
    return Boolean(
      nextTagName &&
      this.isEditing() &&
      this.auth.canEditDocuments() &&
      !this.isAiLocked() &&
      !this.tagNames().some((tagName) => this.sameTagName(tagName, nextTagName)),
    );
  }

  dateTime(value: string): string {
    return new Intl.DateTimeFormat(this.language.currentLocale(), {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(new Date(value));
  }

  historyActor(event: DocumentHistoryEventDto): string {
    return event.actor?.displayName ?? this.translate.instant('common.system');
  }

  historyColor(type: DocumentHistoryEventType): string {
    switch (type) {
      case 'OCR_PROCESSING_COMPLETED':
      case 'AI_METADATA_EXTRACTED':
        return 'green';
      case 'DOCUMENT_PROCESSING_FAILED':
        return 'red';
      case 'DOCUMENT_ARCHIVED':
        return 'orange';
      default:
        return 'blue';
    }
  }

  historyContext(event: DocumentHistoryEventDto): string {
    const metadata = event.metadata ?? {};
    const parts = [
      this.contextPart('documentDetail.history.context.status', metadata['status']),
      this.contextPart('documentDetail.history.context.job', metadata['jobId']),
      this.contextPart('documentDetail.history.context.type', metadata['jobType']),
      this.contextPart(
        'documentDetail.history.context.calendarEvents',
        metadata['calendarEventCount'],
      ),
    ].filter(Boolean);

    return parts.join(' · ');
  }

  changeValue(value: DocumentHistoryEventDto['changes'][number]['oldValue']): string {
    if (value === null) {
      return this.translate.instant('common.empty');
    }

    if (Array.isArray(value)) {
      return value.length ? value.join(', ') : this.translate.instant('common.empty');
    }

    if (typeof value === 'boolean') {
      return this.translate.instant(value ? 'common.yes' : 'common.no');
    }

    return String(value);
  }

  private applyDocument(document: DocumentDetailDto): void {
    const formValue = documentMetadataFormValue(document);
    this.originalMetadataValue.set(formValue);
    this.document.set(document);
    if (document.status === 'ARCHIVED') {
      this.openDocuments.close(document.id);
    } else {
      this.openDocuments.updateTitleIfOpen({
        id: document.id,
        title: this.documentDisplayTitle(document),
      });
    }
    this.loadPdfObjectUrl(document.pdfUrl);
    this.metadataForm.patchValue({
      title: formValue.title,
      documentTypeId: formValue.documentTypeId,
      documentDate: formValue.documentDate,
      summary: formValue.summary,
      sender: formValue.sender,
      recipient: formValue.recipient,
      note: formValue.note,
    });
    this.replaceFormArray(
      this.payments(),
      formValue.payments.map((payment) => this.paymentForm(payment)),
    );
    this.replaceFormArray(
      this.calendarEvents(),
      formValue.calendarEvents.map((event) => this.calendarEventForm(event)),
    );
    this.replaceFormArray(
      this.references(),
      formValue.references.map((reference) => this.referenceForm(reference)),
    );
    this.replaceFormArray(
      this.attributes(),
      formValue.attributes.map((attribute) => this.attributeForm(attribute)),
    );
    const tagNames = this.tagNamesFromText(formValue.tagText);
    this.tagNames.set(tagNames);
    this.savedTagNames.set(tagNames);
    this.tagForm.setValue({ tagText: '' }, { emitEvent: false });
    this.tagInputText.set('');
    if (this.isAiLockedStatus(document.status)) {
      this.metadataForm.disable({ emitEvent: false });
      this.tagForm.disable({ emitEvent: false });
    } else {
      this.metadataForm.enable({ emitEvent: false });
      this.tagForm.enable({ emitEvent: false });
    }
    this.metadataForm.markAsPristine();
    this.tagForm.markAsPristine();
    this.metadataDirty.set(false);
    this.metadataRevision.update((revision) => revision + 1);
    this.isEditing.set(false);
    this.loadHistory(document.id, 1, true);
  }

  private loadAssignees(): void {
    this.usersApi
      .assignees()
      .pipe(catchError(() => EMPTY))
      .subscribe((response) => this.assignees.set(response.items));
  }

  private loadActiveTenants(): void {
    if (!this.auth.isAdmin()) {
      this.activeTenants.set([]);
      return;
    }

    this.tenantsApi.listActive().subscribe({
      next: (tenants) => this.activeTenants.set(tenants),
      error: () => this.activeTenants.set([]),
    });
  }

  private isInboxDocument(document: DocumentDetailDto): boolean {
    return document.acceptedAt === null && document.status !== 'ARCHIVED';
  }

  private navigateAfterDocumentLeavesView(
    documentId: string,
    fallbackUrl: '/documents' | '/inbox',
  ): void {
    const nextDocument = this.openDocuments.isOpen(documentId)
      ? this.openDocuments.close(documentId)
      : null;
    void this.router.navigateByUrl(nextDocument ? `/documents/${nextDocument.id}` : fallbackUrl);
  }

  private loadHistory(documentId: string, page: number, reset: boolean): void {
    this.isHistoryLoading.set(true);
    this.historyError.set(null);

    if (reset) {
      this.historyItems.set([]);
      this.historyPage.set(0);
      this.historyTotalItems.set(0);
      this.historyTotalPages.set(0);
    }

    this.documentsApi
      .history(documentId, page, HISTORY_PAGE_SIZE)
      .pipe(finalize(() => this.isHistoryLoading.set(false)))
      .subscribe({
        next: (response) => {
          this.historyItems.update((items) =>
            reset ? response.items : [...items, ...response.items],
          );
          this.historyPage.set(response.meta.page);
          this.historyTotalItems.set(response.meta.totalItems);
          this.historyTotalPages.set(response.meta.totalPages);
        },
        error: () => {
          this.historyError.set('documentDetail.history.errors.loadFailed');
        },
      });
  }

  private metadataRequest(): DocumentMetadataUpdateRequest {
    return metadataUpdateRequest({
      ...this.metadataForm.getRawValue(),
      tagText: '',
    });
  }

  private canSaveCoreMetadata(): boolean {
    if (this.isCurrentInboxDocument()) {
      return true;
    }

    const value = this.metadataForm.getRawValue();
    return Boolean(
      value.title.trim() && value.sender.trim() && value.documentTypeId && value.documentDate,
    );
  }

  private markCoreMetadataTouched(): void {
    this.metadataForm.controls.title.markAsTouched();
    this.metadataForm.controls.sender.markAsTouched();
    this.metadataForm.controls.documentTypeId.markAsTouched();
    this.metadataForm.controls.documentDate.markAsTouched();
  }

  private documentDisplayTitle(
    document: Pick<DocumentDetailDto, 'title' | 'displayTitle' | 'originalFileName'>,
  ): string {
    return document.displayTitle ?? document.title ?? document.originalFileName;
  }

  private tagNamesFromText(value: string): string[] {
    return [
      ...new Set(
        value
          .split(',')
          .map((tagName) => this.normalizedTagName(tagName))
          .filter(Boolean),
      ),
    ];
  }

  private tagNamesForRequest(): string[] {
    const pendingTagName = this.normalizedTagName(this.tagForm.controls.tagText.value);
    if (
      !pendingTagName ||
      this.tagNames().some((tagName) => this.sameTagName(tagName, pendingTagName))
    ) {
      return this.tagNames();
    }

    return [...this.tagNames(), pendingTagName];
  }

  private normalizedTagName(value: string): string {
    return value.trim();
  }

  private sameTagName(left: string, right: string): boolean {
    return left.localeCompare(right, undefined, { sensitivity: 'accent' }) === 0;
  }

  private sameTagNameList(left: readonly string[], right: readonly string[]): boolean {
    return (
      left.length === right.length &&
      left.every((tagName, index) => this.sameTagName(tagName, right[index] ?? ''))
    );
  }

  private markMetadataChanged(): void {
    this.metadataForm.markAsDirty();
    this.refreshMetadataChangeState();
  }

  private refreshMetadataChangeState(): void {
    this.metadataRevision.update((revision) => revision + 1);
    this.metadataDirty.set(this.hasMetadataChanges());
  }

  private hasMetadataChanges(): boolean {
    const original = this.originalMetadataValue();
    if (!original) {
      return false;
    }

    const value = this.metadataForm.getRawValue();
    return (
      value.title !== original.title ||
      value.documentTypeId !== original.documentTypeId ||
      value.documentDate !== original.documentDate ||
      value.summary !== original.summary ||
      value.sender !== original.sender ||
      value.recipient !== original.recipient ||
      value.note !== original.note ||
      this.hasPaymentChanges(value.payments, original.payments) ||
      this.hasCalendarEventChanges(value.calendarEvents, original.calendarEvents) ||
      this.hasReferenceChanges(value.references, original.references) ||
      this.hasAttributeChanges(value.attributes, original.attributes)
    );
  }

  private hasPaymentChanges(
    value: readonly DocumentPaymentFormValue[],
    original: readonly DocumentPaymentFormValue[],
  ): boolean {
    return (
      value.length !== original.length ||
      value.some((payment, index) => {
        const originalPayment = original[index];
        return (
          !originalPayment ||
          payment.id !== originalPayment.id ||
          payment.iban !== originalPayment.iban ||
          payment.recipient !== originalPayment.recipient ||
          payment.purpose !== originalPayment.purpose ||
          payment.amount !== originalPayment.amount ||
          payment.currency !== originalPayment.currency ||
          payment.status !== originalPayment.status ||
          payment.paidAt !== originalPayment.paidAt ||
          payment.assignedToId !== originalPayment.assignedToId ||
          payment.dueDate !== originalPayment.dueDate
        );
      })
    );
  }

  private hasCalendarEventChanges(
    value: readonly DocumentCalendarEventFormValue[],
    original: readonly DocumentCalendarEventFormValue[],
  ): boolean {
    return (
      value.length !== original.length ||
      value.some((event, index) => {
        const originalEvent = original[index];
        return (
          !originalEvent ||
          event.id !== originalEvent.id ||
          event.kind !== originalEvent.kind ||
          event.title !== originalEvent.title ||
          event.description !== originalEvent.description ||
          event.date !== originalEvent.date ||
          event.time !== originalEvent.time ||
          event.endDate !== originalEvent.endDate ||
          event.endTime !== originalEvent.endTime ||
          event.sourceText !== originalEvent.sourceText ||
          event.assignedToId !== originalEvent.assignedToId ||
          event.completedAt !== originalEvent.completedAt
        );
      })
    );
  }

  private hasReferenceChanges(
    value: readonly DocumentReferenceFormValue[],
    original: readonly DocumentReferenceFormValue[],
  ): boolean {
    return (
      value.length !== original.length ||
      value.some((reference, index) => {
        const originalReference = original[index];
        return (
          !originalReference ||
          reference.id !== originalReference.id ||
          reference.referenceNumber !== originalReference.referenceNumber ||
          reference.referenceType !== originalReference.referenceType
        );
      })
    );
  }

  private hasAttributeChanges(
    value: readonly DocumentAttributeFormValue[],
    original: readonly DocumentAttributeFormValue[],
  ): boolean {
    return (
      value.length !== original.length ||
      value.some((attribute) => {
        const originalAttribute = original.find((candidate) => candidate.key === attribute.key);
        return (
          !originalAttribute ||
          attribute.fieldDefinitionId !== originalAttribute.fieldDefinitionId ||
          attribute.value !== originalAttribute.value ||
          attribute.valueType !== originalAttribute.valueType
        );
      })
    );
  }

  private replaceFormArray<T extends FormGroup>(formArray: FormArray<T>, controls: T[]): void {
    formArray.clear();
    for (const control of controls) {
      formArray.push(control);
    }
  }

  private paymentForm(value?: {
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
  }): PaymentForm {
    return new FormGroup({
      id: new FormControl(value?.id ?? '', { nonNullable: true }),
      iban: new FormControl(value?.iban ?? '', { nonNullable: true }),
      recipient: new FormControl(value?.recipient ?? '', { nonNullable: true }),
      purpose: new FormControl(value?.purpose ?? '', { nonNullable: true }),
      amount: new FormControl<number | null>(value?.amount ?? null),
      currency: new FormControl(value?.currency ?? 'EUR', { nonNullable: true }),
      status: new FormControl(value?.status ?? 'OPEN', { nonNullable: true }),
      paidAt: new FormControl(value?.paidAt ?? null),
      assignedToId: new FormControl(value?.assignedToId ?? '', { nonNullable: true }),
      dueDate: new FormControl(value?.dueDate ?? '', { nonNullable: true }),
    });
  }

  private calendarEventForm(value?: {
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
  }): CalendarEventForm {
    return new FormGroup({
      id: new FormControl(value?.id ?? '', { nonNullable: true }),
      kind: new FormControl(value?.kind ?? 'DEADLINE', { nonNullable: true }),
      title: new FormControl(value?.title ?? '', { nonNullable: true }),
      description: new FormControl(value?.description ?? '', { nonNullable: true }),
      date: new FormControl(value?.date ?? '', { nonNullable: true }),
      time: new FormControl(value?.time ?? '', { nonNullable: true }),
      endDate: new FormControl(value?.endDate ?? '', { nonNullable: true }),
      endTime: new FormControl(value?.endTime ?? '', { nonNullable: true }),
      sourceText: new FormControl(value?.sourceText ?? '', { nonNullable: true }),
      assignedToId: new FormControl(value?.assignedToId ?? '', { nonNullable: true }),
      completedAt: new FormControl(value?.completedAt ?? null),
    });
  }

  private referenceForm(value?: {
    readonly id: string;
    readonly referenceNumber: string;
    readonly referenceType: string;
  }): ReferenceForm {
    return new FormGroup({
      id: new FormControl(value?.id ?? '', { nonNullable: true }),
      referenceNumber: new FormControl(value?.referenceNumber ?? '', {
        nonNullable: true,
      }),
      referenceType: new FormControl(value?.referenceType ?? '', {
        nonNullable: true,
      }),
    });
  }

  private attributeForm(value: {
    readonly fieldDefinitionId: string | null;
    readonly key: string;
    readonly value: string;
    readonly valueType: DocumentAttributeValueType;
  }): AttributeForm {
    return new FormGroup({
      fieldDefinitionId: new FormControl(value.fieldDefinitionId),
      key: new FormControl(value.key, { nonNullable: true }),
      value: new FormControl(value.value, { nonNullable: true }),
      valueType: new FormControl(value.valueType, { nonNullable: true }),
    });
  }

  private contextPart(labelKey: string, value: unknown): string | null {
    if (value === undefined || value === null || value === '') {
      return null;
    }

    return `${this.translate.instant(labelKey)}: ${String(value)}`;
  }

  private loadPdfObjectUrl(source: string | null): void {
    if (!source) {
      this.clearPdfObjectUrl();
      return;
    }

    if (this.pdfObjectUrl?.source === source || this.pdfLoadingSource === source) {
      return;
    }

    this.clearPdfObjectUrl();
    this.pdfLoadingSource = source;
    this.assets
      .loadObjectUrl(source)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        catchError(() => {
          if (this.document()?.pdfUrl === source) {
            this.error.set('documentDetail.errors.pdfFailed');
          }

          this.pdfLoadingSource = null;
          return EMPTY;
        }),
      )
      .subscribe((objectUrl) => {
        this.pdfLoadingSource = null;

        if (this.document()?.pdfUrl !== source) {
          this.assets.revokeObjectUrl(objectUrl);
          return;
        }

        this.pdfObjectUrl = { source, objectUrl };
        this.pdfUrl.set(objectUrl);
      });
  }

  private clearPdfObjectUrl(): void {
    this.assets.revokeObjectUrl(this.pdfObjectUrl?.objectUrl);
    this.pdfObjectUrl = null;
    this.pdfUrl.set(null);
  }

  private isAiLockedStatus(status: DocumentStatus | undefined): boolean {
    return status === 'AI_PENDING' || status === 'AI_RUNNING';
  }

  private releaseEditLock(): void {
    const lockId = this.editLockId();
    this.editLockHeartbeat?.unsubscribe();
    this.editLockHeartbeat = null;
    this.editLockId.set(null);
    globalThis.removeEventListener?.('beforeunload', this.beforeUnloadHandler);
    this.editLocks.releaseBestEffort(lockId);
  }

  private handleEditLockLost(errorKey: string): void {
    if (!this.editLockId()) {
      return;
    }

    this.editLockHeartbeat?.unsubscribe();
    this.editLockHeartbeat = null;
    this.editLockId.set(null);
    this.isEditing.set(false);
    globalThis.removeEventListener?.('beforeunload', this.beforeUnloadHandler);
    this.error.set(errorKey);
    this.load();
  }

  private documentChangeKey(
    event: ReturnType<RealtimeClientService['latestDocumentChange']>,
  ): string | null {
    return event
      ? [event.documentId, event.reason, event.jobId ?? '', event.changedAt].join('|')
      : null;
  }
}
