import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import type { CreateTenantRequest, TenantDto, UpdateTenantRequest } from '@smart-dms/shared-dto';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzCheckboxModule } from 'ng-zorro-antd/checkbox';
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzModalModule } from 'ng-zorro-antd/modal';
import { NzRadioModule } from 'ng-zorro-antd/radio';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzTableModule } from 'ng-zorro-antd/table';
import { NzTooltipModule } from 'ng-zorro-antd/tooltip';
import { finalize, forkJoin, of, type Observable } from 'rxjs';
import {
  type DeleteTenantDocumentAction,
  type TenantWithCounts,
  TenantApiService,
} from '../../core/api/tenant-api.service';
import { type PendingChangesAware } from '../../shared/navigation/pending-changes.guard';
import { UnsavedChangesWarningDirective } from '../../shared/navigation/unsaved-changes-warning.directive';
import { InfiniteTableScrollDirective } from '../../shared/table/infinite-table-scroll.directive';
import { TableCreateDialogComponent } from '../../shared/table/table-create-dialog.component';
import { TableActionsComponent } from '../../shared/table/table-actions.component';
import { TablePanelComponent } from '../../shared/table/table-panel.component';

type TenantEditForm = FormGroup<{
  key: FormControl<string>;
  name: FormControl<string>;
  scannerImportPath: FormControl<string>;
  isDisabled: FormControl<boolean>;
}>;

type DeleteTenantForm = FormGroup<{
  confirmationName: FormControl<string>;
  documentAction: FormControl<DeleteTenantDocumentAction | null>;
  targetTenantId: FormControl<string>;
}>;

interface EditableTenantRow {
  readonly id: string;
  readonly form: TenantEditForm;
  readonly original: TenantEditValue;
  readonly userCount: number;
  readonly documentCount: number;
}

interface TenantEditValue {
  readonly key: string;
  readonly name: string;
  readonly scannerImportPath: string;
  readonly isDisabled: boolean;
}

const KEY_MAX_LENGTH = 80;
const NAME_MAX_LENGTH = 200;
const SCANNER_IMPORT_PATH_MAX_LENGTH = 1000;
const TENANT_KEY_PATTERN = /^[a-z0-9][a-z0-9_-]*$/;

@Component({
  selector: 'app-settings-tenants',
  imports: [
    ReactiveFormsModule,
    TranslatePipe,
    NzAlertModule,
    NzButtonModule,
    NzCheckboxModule,
    NzFormModule,
    NzIconModule,
    NzInputModule,
    NzModalModule,
    NzRadioModule,
    NzSelectModule,
    NzTableModule,
    NzTooltipModule,
    InfiniteTableScrollDirective,
    TableCreateDialogComponent,
    TableActionsComponent,
    TablePanelComponent,
    UnsavedChangesWarningDirective,
  ],
  templateUrl: './settings-tenants.component.html',
  styleUrls: ['./settings-page.scss', './settings-tenants.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsTenantsComponent implements OnInit, PendingChangesAware {
  private readonly tenantsApi = inject(TenantApiService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly editRevision = signal(0);

  readonly rows = signal<EditableTenantRow[]>([]);
  readonly isLoading = signal(false);
  readonly isSaving = signal(false);
  readonly isCreating = signal(false);
  readonly isDeleting = signal(false);
  readonly isCreateDialogOpen = signal(false);
  readonly isEditDialogOpen = signal(false);
  readonly error = signal<string | null>(null);
  readonly deleteTenant = signal<EditableTenantRow | null>(null);
  readonly editingTenantId = signal<string | null>(null);
  readonly hasTenantChanges = computed(() => {
    this.editRevision();
    return this.rows().some((row) => this.hasRowChanges(row));
  });
  readonly hasInvalidTenantChanges = computed(() => {
    this.editRevision();
    return this.rows().some((row) => this.hasRowChanges(row) && this.hasInvalidRow(row));
  });
  readonly deleteTargetOptions = computed(() => {
    const deletingId = this.deleteTenant()?.id;
    return this.rows().filter((row) => row.id !== deletingId);
  });

  readonly createForm: TenantEditForm = this.tenantForm(
    {
      key: '',
      name: '',
      scannerImportPath: '',
      isDisabled: false,
    },
    { syncGeneratedFieldsFromName: true },
  );
  readonly editForm: TenantEditForm = this.tenantForm({
    key: '',
    name: '',
    scannerImportPath: '',
    isDisabled: false,
  });

  readonly deleteForm: DeleteTenantForm = new FormGroup({
    confirmationName: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    documentAction: new FormControl<DeleteTenantDocumentAction | null>(null, {
      validators: [Validators.required],
    }),
    targetTenantId: new FormControl('', { nonNullable: true }),
  });

  ngOnInit(): void {
    this.load();
  }

  hasPendingChanges(): boolean {
    return false;
  }

  load(): void {
    this.isLoading.set(true);
    this.error.set(null);
    this.tenantsApi
      .list()
      .pipe(finalize(() => this.isLoading.set(false)))
      .subscribe({
        next: (response) => {
          this.rows.set(response.items.map((tenant) => this.tenantRow(tenant)));
          this.editRevision.update((revision) => revision + 1);
        },
        error: () => this.error.set('tenants.errors.loadFailed'),
      });
  }

  openCreateDialog(): void {
    if (this.isSaving() || this.isCreating()) {
      return;
    }

    this.resetCreateForm();
    this.error.set(null);
    this.isCreateDialogOpen.set(true);
  }

  closeCreateDialog(): void {
    if (this.isCreating()) {
      return;
    }

    this.isCreateDialogOpen.set(false);
    this.resetCreateForm();
  }

  openEditDialog(row: EditableTenantRow): void {
    if (this.isSaving() || this.isDeleting()) {
      return;
    }

    this.editingTenantId.set(row.id);
    this.editForm.reset({
      key: row.original.key,
      name: row.original.name,
      scannerImportPath: row.original.scannerImportPath,
      isDisabled: row.original.isDisabled,
    });
    this.error.set(null);
    this.isEditDialogOpen.set(true);
    this.editRevision.update((revision) => revision + 1);
  }

  closeEditDialog(): void {
    if (this.isSaving()) {
      return;
    }

    this.isEditDialogOpen.set(false);
    this.editingTenantId.set(null);
    this.editForm.reset({
      key: '',
      name: '',
      scannerImportPath: '',
      isDisabled: false,
    });
    this.editRevision.update((revision) => revision + 1);
  }

  saveEditDialog(): void {
    if (this.isSaving()) {
      return;
    }

    const row = this.editingTenant();
    if (!row) {
      return;
    }

    if (this.hasInvalidTenantForm(this.editForm)) {
      this.editForm.markAllAsTouched();
      this.editRevision.update((revision) => revision + 1);
      return;
    }

    const changes = this.tenantChanges(row.original, this.editForm.getRawValue());
    if (Object.keys(changes).length === 0) {
      this.closeEditDialog();
      return;
    }

    this.isSaving.set(true);
    this.error.set(null);
    this.tenantsApi
      .update(row.id, changes)
      .pipe(finalize(() => this.isSaving.set(false)))
      .subscribe({
        next: (tenant) => {
          this.rows.update((rows) =>
            rows.map((entry) =>
              entry.id === row.id
                ? this.tenantRow({
                    ...tenant,
                    userCount: row.userCount,
                    documentCount: row.documentCount,
                  })
                : entry,
            ),
          );
          this.isEditDialogOpen.set(false);
          this.editingTenantId.set(null);
          this.editForm.reset({
            key: '',
            name: '',
            scannerImportPath: '',
            isDisabled: false,
          });
          this.editRevision.update((revision) => revision + 1);
        },
        error: () => this.error.set('tenants.errors.saveFailed'),
      });
  }

  createTenant(): void {
    if (this.isCreating()) {
      return;
    }

    if (this.createForm.invalid || this.hasInvalidCreateTenant()) {
      this.createForm.markAllAsTouched();
      this.editRevision.update((revision) => revision + 1);
      return;
    }

    this.isCreating.set(true);
    this.error.set(null);
    this.tenantsApi
      .create(this.createInput(this.createForm))
      .pipe(finalize(() => this.isCreating.set(false)))
      .subscribe({
        next: (tenant) => {
          this.rows.update((rows) => [
            ...rows,
            this.tenantRow({ ...tenant, userCount: 0, documentCount: 0 }),
          ]);
          this.isCreateDialogOpen.set(false);
          this.resetCreateForm();
          this.editRevision.update((revision) => revision + 1);
        },
        error: () => this.error.set('tenants.errors.createFailed'),
      });
  }

  openDeleteDialog(row: EditableTenantRow): void {
    if (this.isSaving() || this.isDeleting()) {
      return;
    }

    this.deleteTenant.set(row);
    this.deleteForm.reset({
      confirmationName: '',
      documentAction: null,
      targetTenantId: '',
    });
    this.error.set(null);
    this.editRevision.update((revision) => revision + 1);
  }

  closeDeleteDialog(): void {
    if (this.isDeleting()) {
      return;
    }

    this.deleteTenant.set(null);
    this.deleteForm.reset({
      confirmationName: '',
      documentAction: null,
      targetTenantId: '',
    });
    this.editRevision.update((revision) => revision + 1);
  }

  canDeleteTenant(): boolean {
    this.editRevision();
    const row = this.deleteTenant();
    if (!row || this.deleteForm.invalid || this.isDeleting()) {
      return false;
    }

    const value = this.deleteForm.getRawValue();
    if (value.confirmationName !== this.tenantName(row)) {
      return false;
    }

    return (
      value.documentAction !== 'MOVE' ||
      (value.targetTenantId.length > 0 && value.targetTenantId !== row.id)
    );
  }

  confirmDeleteTenant(): void {
    const row = this.deleteTenant();
    if (!row || !this.canDeleteTenant()) {
      this.deleteForm.markAllAsTouched();
      this.editRevision.update((revision) => revision + 1);
      return;
    }

    const value = this.deleteForm.getRawValue();
    const request =
      value.documentAction === 'MOVE'
        ? {
            confirmationName: value.confirmationName,
            documentAction: 'MOVE' as const,
            targetTenantId: value.targetTenantId,
            userAction: 'REMOVE_ASSIGNMENTS' as const,
          }
        : {
            confirmationName: value.confirmationName,
            documentAction: 'DELETE' as const,
            userAction: 'REMOVE_ASSIGNMENTS' as const,
          };
    this.isDeleting.set(true);
    this.error.set(null);
    this.tenantsApi
      .delete(row.id, request)
      .pipe(finalize(() => this.isDeleting.set(false)))
      .subscribe({
        next: () => {
          this.rows.update((rows) => rows.filter((entry) => entry.id !== row.id));
          this.deleteTenant.set(null);
          this.editRevision.update((revision) => revision + 1);
        },
        error: () => this.error.set('tenants.errors.deleteFailed'),
      });
  }

  saveChanges(): void {
    if (this.isSaving() || !this.hasTenantChanges()) {
      return;
    }

    if (this.hasInvalidTenantChanges()) {
      for (const row of this.rows()) {
        if (this.hasRowChanges(row)) {
          row.form.markAllAsTouched();
        }
      }
      this.editRevision.update((revision) => revision + 1);
      return;
    }

    const updateRows = this.rows().filter((row) => this.hasRowChanges(row));
    this.isSaving.set(true);
    this.error.set(null);
    runRequests(updateRows.map((row) => this.tenantsApi.update(row.id, this.changedFields(row))))
      .pipe(finalize(() => this.isSaving.set(false)))
      .subscribe({
        next: () => {
          this.load();
        },
        error: () => this.error.set('tenants.errors.saveFailed'),
      });
  }

  revertChanges(): void {
    this.rows.update((rows) =>
      rows.map((row) => {
        row.form.reset({
          key: row.original.key,
          name: row.original.name,
          scannerImportPath: row.original.scannerImportPath,
          isDisabled: row.original.isDisabled,
        });
        return row;
      }),
    );
    this.editRevision.update((revision) => revision + 1);
  }

  tenantName(row: EditableTenantRow): string {
    return row.original.name;
  }

  editingTenant(): EditableTenantRow | null {
    const tenantId = this.editingTenantId();
    return this.rows().find((row) => row.id === tenantId) ?? null;
  }

  isTenantFieldChanged(row: EditableTenantRow, field: keyof TenantEditValue): boolean {
    this.editRevision();
    const original = row.original;
    if (!original) {
      return false;
    }

    const value = row.form.getRawValue();
    if (field === 'scannerImportPath') {
      return (
        nullableTrimmed(value.scannerImportPath) !== nullableTrimmed(original.scannerImportPath)
      );
    }

    if (field === 'key' || field === 'name') {
      return value[field].trim() !== original[field];
    }

    return value[field] !== original[field];
  }

  isMoveDocumentAction(): boolean {
    this.editRevision();
    return this.deleteForm.controls.documentAction.value === 'MOVE';
  }

  private tenantRow(tenant: TenantWithCounts): EditableTenantRow {
    const original = tenantEditValue(tenant);
    return {
      id: tenant.id,
      form: this.tenantForm(original),
      original,
      userCount: tenant.userCount,
      documentCount: tenant.documentCount,
    };
  }

  private tenantForm(
    value: TenantEditValue,
    options: { readonly syncGeneratedFieldsFromName?: boolean } = {},
  ): TenantEditForm {
    const form = new FormGroup({
      key: new FormControl(value.key, {
        nonNullable: true,
        validators: [
          Validators.required,
          Validators.maxLength(KEY_MAX_LENGTH),
          Validators.pattern(TENANT_KEY_PATTERN),
        ],
      }),
      name: new FormControl(value.name, {
        nonNullable: true,
        validators: [Validators.required, Validators.maxLength(NAME_MAX_LENGTH)],
      }),
      scannerImportPath: new FormControl(value.scannerImportPath, {
        nonNullable: true,
        validators: [Validators.maxLength(SCANNER_IMPORT_PATH_MAX_LENGTH)],
      }),
      isDisabled: new FormControl(value.isDisabled, { nonNullable: true }),
    });

    form.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.editRevision.update((revision) => revision + 1);
    });

    if (options.syncGeneratedFieldsFromName) {
      let previousGeneratedValue = tenantKeyFromName(value.name);
      form.controls.name.valueChanges
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe((name) => {
          const generatedValue = tenantKeyFromName(name);
          const key = form.controls.key.value.trim();
          const scannerImportPath = form.controls.scannerImportPath.value.trim();

          if (key === '' || key === previousGeneratedValue) {
            form.controls.key.setValue(generatedValue, { emitEvent: false });
          }

          if (scannerImportPath === '' || scannerImportPath === previousGeneratedValue) {
            form.controls.scannerImportPath.setValue(generatedValue, { emitEvent: false });
          }

          previousGeneratedValue = generatedValue;
        });
    }

    return form;
  }

  private createInput(form: TenantEditForm): CreateTenantRequest {
    const value = form.getRawValue();
    return {
      key: value.key.trim(),
      name: value.name.trim(),
      scannerImportPath: nullableTrimmed(value.scannerImportPath),
      isActive: !value.isDisabled,
    };
  }

  private changedFields(row: EditableTenantRow): UpdateTenantRequest {
    return this.tenantChanges(row.original, row.form.getRawValue());
  }

  private tenantChanges(
    original: TenantEditValue,
    value: ReturnType<TenantEditForm['getRawValue']>,
  ): UpdateTenantRequest {
    const changes: UpdateTenantRequest = {};

    if (value.key.trim() !== original.key) {
      changes.key = value.key.trim();
    }

    if (value.name.trim() !== original.name) {
      changes.name = value.name.trim();
    }

    if (nullableTrimmed(value.scannerImportPath) !== nullableTrimmed(original.scannerImportPath)) {
      changes.scannerImportPath = nullableTrimmed(value.scannerImportPath);
    }

    if (value.isDisabled !== original.isDisabled) {
      changes.isActive = !value.isDisabled;
    }

    return changes;
  }

  private hasRowChanges(row: EditableTenantRow): boolean {
    const original = row.original;
    const value = row.form.getRawValue();
    return (
      value.key.trim() !== original.key ||
      value.name.trim() !== original.name ||
      nullableTrimmed(value.scannerImportPath) !== nullableTrimmed(original.scannerImportPath) ||
      value.isDisabled !== original.isDisabled
    );
  }

  private hasInvalidRow(row: EditableTenantRow): boolean {
    return this.hasInvalidTenantForm(row.form);
  }

  private hasInvalidCreateTenant(): boolean {
    return this.hasInvalidTenantForm(this.createForm);
  }

  private hasInvalidTenantForm(form: TenantEditForm): boolean {
    const value = form.getRawValue();
    return form.invalid || value.key.trim().length === 0 || value.name.trim().length === 0;
  }

  private resetCreateForm(): void {
    this.createForm.reset({
      key: '',
      name: '',
      scannerImportPath: '',
      isDisabled: false,
    });
    this.editRevision.update((revision) => revision + 1);
  }
}

function tenantEditValue(tenant: TenantDto): TenantEditValue {
  return {
    key: tenant.key,
    name: tenant.name,
    scannerImportPath: tenant.scannerImportPath ?? '',
    isDisabled: !tenant.isActive,
  };
}

function nullableTrimmed(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function tenantKeyFromName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, KEY_MAX_LENGTH);
}

function runRequests<T>(requests: readonly Observable<T>[]): Observable<T[]> {
  return requests.length === 0 ? of([] as T[]) : forkJoin([...requests]);
}
