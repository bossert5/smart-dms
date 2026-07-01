import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import type { TenantDto, UpdateUserRequest, UserDto, UserRole } from '@smart-dms/shared-dto';
import { TranslatePipe } from '@ngx-translate/core';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzCheckboxModule } from 'ng-zorro-antd/checkbox';
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzModalModule } from 'ng-zorro-antd/modal';
import { NzPopconfirmModule } from 'ng-zorro-antd/popconfirm';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzTableModule } from 'ng-zorro-antd/table';
import { NzTooltipModule } from 'ng-zorro-antd/tooltip';
import { finalize } from 'rxjs';
import { UserApiService } from '../../core/api/user-api.service';
import { TenantApiService } from '../../core/api/tenant-api.service';
import { AuthService } from '../../core/services/auth.service';
import {
  buildPasswordRequirements,
  PASSWORD_DIGIT_PATTERN,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  type PasswordRequirement,
  passwordRequirementsMet,
  PASSWORD_SPECIAL_PATTERN,
} from '../../shared/presentation/password-requirements';
import { USER_ROLES, userRoleLabelKey } from '../../shared/presentation/user-presentation';
import { type PendingChangesAware } from '../../shared/navigation/pending-changes.guard';
import { UnsavedChangesWarningDirective } from '../../shared/navigation/unsaved-changes-warning.directive';
import { InfiniteTableScrollDirective } from '../../shared/table/infinite-table-scroll.directive';
import { TableActionsComponent } from '../../shared/table/table-actions.component';
import { TablePanelComponent } from '../../shared/table/table-panel.component';

const USERNAME_MAX_LENGTH = 100;
const DISPLAY_NAME_MAX_LENGTH = 200;
const ACTIVE_ADMIN_REQUIRED_ERROR = 'At least one active admin is required.';
const PAGE_SIZE = 50;

type CreateUserForm = FormGroup<{
  username: FormControl<string>;
  displayName: FormControl<string>;
  password: FormControl<string>;
  confirmPassword: FormControl<string>;
  role: FormControl<UserRole>;
  tenantIds: FormControl<string[]>;
}>;

type UserEditForm = FormGroup<{
  displayName: FormControl<string>;
  role: FormControl<UserRole>;
  isDisabled: FormControl<boolean>;
  tenantIds: FormControl<string[]>;
}>;

interface EditableUserRow {
  readonly id: string;
  readonly username: string;
  readonly form: UserEditForm;
  readonly original: UserEditValue;
}

interface UserEditValue {
  readonly displayName: string;
  readonly role: UserRole;
  readonly isDisabled: boolean;
  readonly tenantIds: readonly string[];
}

@Component({
  selector: 'app-users',
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
    NzPopconfirmModule,
    NzSelectModule,
    NzTableModule,
    NzTooltipModule,
    InfiniteTableScrollDirective,
    TableActionsComponent,
    TablePanelComponent,
    UnsavedChangesWarningDirective,
  ],
  templateUrl: './users.component.html',
  styleUrl: './users.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UsersComponent implements OnInit, PendingChangesAware {
  private readonly usersApi = inject(UserApiService);
  private readonly tenantsApi = inject(TenantApiService);
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);
  private requestId = 0;
  private activeReplaceRequestId: number | null = null;
  private activeAppendRequestId: number | null = null;
  private readonly editRevision = signal(0);

  readonly rows = signal<EditableUserRow[]>([]);
  readonly tenants = signal<TenantDto[]>([]);
  readonly hasMultipleTenants = computed(() => this.tenants().length > 1);
  readonly isLoading = signal(false);
  readonly isLoadingMore = signal(false);
  readonly isCreateDialogOpen = signal(false);
  readonly isEditDialogOpen = signal(false);
  readonly isCreating = signal(false);
  readonly isSaving = signal(false);
  readonly isDeleting = signal(false);
  readonly error = signal<string | null>(null);
  readonly editingUserId = signal<string | null>(null);
  readonly page = signal(1);
  readonly pageSize = signal(PAGE_SIZE);
  readonly totalUsers = signal(0);
  readonly roles = USER_ROLES;
  readonly userRoleLabelKey = userRoleLabelKey;
  readonly hasUserChanges = computed(() => {
    this.editRevision();
    return this.rows().some((row) => this.hasRowChanges(row));
  });
  readonly hasInvalidUserChanges = computed(() => {
    this.editRevision();
    return this.rows().some((row) => this.hasRowChanges(row) && row.form.invalid);
  });
  readonly createUserForm: CreateUserForm = new FormGroup({
    username: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(USERNAME_MAX_LENGTH)],
    }),
    displayName: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(DISPLAY_NAME_MAX_LENGTH)],
    }),
    password: new FormControl('', {
      nonNullable: true,
      validators: [
        Validators.required,
        Validators.minLength(PASSWORD_MIN_LENGTH),
        Validators.maxLength(PASSWORD_MAX_LENGTH),
        Validators.pattern(PASSWORD_DIGIT_PATTERN),
        Validators.pattern(PASSWORD_SPECIAL_PATTERN),
      ],
    }),
    confirmPassword: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    role: new FormControl<UserRole>('User', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    tenantIds: new FormControl<string[]>([], {
      nonNullable: true,
      validators: [Validators.required],
    }),
  });
  readonly editUserForm: UserEditForm = this.createEditForm({
    displayName: '',
    role: 'User',
    isDisabled: false,
    tenantIds: [],
  });
  createPasswordRequirements(): readonly PasswordRequirement[] {
    return buildPasswordRequirements(
      this.createUserForm.controls.password.value,
      this.createUserForm.controls.confirmPassword.value,
    );
  }

  canCreateUser(): boolean {
    return (
      this.createUserForm.valid &&
      passwordRequirementsMet(this.createPasswordRequirements()) &&
      !this.isCreating()
    );
  }

  ngOnInit(): void {
    this.loadTenants();
    this.reload();
  }

  load(): void {
    this.reload();
  }

  reload(): void {
    this.page.set(1);
    this.loadPage(1, { append: false });
  }

  loadNextPage(): void {
    if (this.isLoading() || this.isLoadingMore() || !this.hasMoreUsers()) {
      return;
    }

    this.loadPage(this.page() + 1, { append: true });
  }

  hasMoreUsers(): boolean {
    return this.rows().length < this.totalUsers();
  }

  private loadPage(page: number, options: { readonly append: boolean }): void {
    const requestId = ++this.requestId;
    if (options.append) {
      this.isLoadingMore.set(true);
      this.activeAppendRequestId = requestId;
    } else {
      this.isLoading.set(true);
      this.activeReplaceRequestId = requestId;
    }
    this.error.set(null);
    this.usersApi
      .list(page, this.pageSize())
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
          if (requestId !== this.requestId) {
            return;
          }

          this.page.set(response.meta.page);
          this.totalUsers.set(response.meta.totalItems);
          const nextRows = response.items.map((user) => this.editableRow(user));
          this.rows.set(options.append ? appendUniqueRows(this.rows(), nextRows) : nextRows);
        },
        error: () => this.error.set('users.errors.loadFailed'),
      });
  }

  openCreateDialog(): void {
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

  openEditDialog(row: EditableUserRow): void {
    if (this.isSaving() || this.isDeleting()) {
      return;
    }

    this.editingUserId.set(row.id);
    this.editUserForm.reset({
      displayName: row.original.displayName,
      role: row.original.role,
      isDisabled: row.original.isDisabled,
      tenantIds: [...row.original.tenantIds],
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
    this.editingUserId.set(null);
    this.editUserForm.reset({
      displayName: '',
      role: 'User',
      isDisabled: false,
      tenantIds: [],
    });
    this.editRevision.update((revision) => revision + 1);
  }

  saveEditDialog(): void {
    if (this.isSaving()) {
      return;
    }

    const row = this.editingUser();
    if (!row) {
      return;
    }

    if (this.editUserForm.invalid) {
      this.editUserForm.markAllAsTouched();
      this.editRevision.update((revision) => revision + 1);
      return;
    }

    const changes = this.changedUserFields(row.original, this.editUserForm.getRawValue());
    if (Object.keys(changes).length === 0) {
      this.closeEditDialog();
      return;
    }

    this.error.set(null);
    this.isSaving.set(true);
    this.usersApi
      .bulkUpdate({ updates: [{ id: row.id, changes }] })
      .pipe(finalize(() => this.isSaving.set(false)))
      .subscribe({
        next: (response) => {
          this.replaceSavedRows(response.users);
          this.isEditDialogOpen.set(false);
          this.editingUserId.set(null);
          this.editUserForm.reset({
            displayName: '',
            role: 'User',
            isDisabled: false,
            tenantIds: [],
          });
          this.editRevision.update((revision) => revision + 1);
        },
        error: (error: unknown) => this.error.set(this.saveErrorMessage(error)),
      });
  }

  create(): void {
    if (this.isCreating()) {
      return;
    }

    if (!this.canCreateUser()) {
      this.createUserForm.markAllAsTouched();
      return;
    }

    const formValue = this.createUserForm.getRawValue();
    const input = {
      username: formValue.username,
      displayName: formValue.displayName,
      password: formValue.password,
      role: formValue.role,
      tenantIds: formValue.tenantIds,
      defaultTenantId: formValue.tenantIds[0],
    };
    this.error.set(null);
    this.isCreating.set(true);
    this.usersApi
      .create(input)
      .pipe(finalize(() => this.isCreating.set(false)))
      .subscribe({
        next: () => {
          this.isCreateDialogOpen.set(false);
          this.resetCreateForm();
          this.load();
        },
        error: () => this.error.set('users.errors.createFailed'),
      });
  }

  hasPendingChanges(): boolean {
    return false;
  }

  saveChanges(): void {
    if (this.isSaving()) {
      return;
    }

    const updates = this.changedRows().map((row) => ({
      id: row.id,
      changes: this.changedFields(row),
    }));
    if (updates.length === 0) {
      return;
    }

    if (this.hasInvalidUserChanges()) {
      for (const row of this.changedRows()) {
        row.form.markAllAsTouched();
      }
      return;
    }

    this.error.set(null);
    this.isSaving.set(true);
    this.usersApi
      .bulkUpdate({ updates })
      .pipe(finalize(() => this.isSaving.set(false)))
      .subscribe({
        next: (response) => this.replaceSavedRows(response.users),
        error: (error: unknown) => this.error.set(this.saveErrorMessage(error)),
      });
  }

  revertChanges(): void {
    for (const row of this.rows()) {
      row.form.reset({
        displayName: row.original.displayName,
        role: row.original.role,
        isDisabled: row.original.isDisabled,
        tenantIds: [...row.original.tenantIds],
      });
    }
    this.editRevision.update((revision) => revision + 1);
  }

  isUserFieldChanged(row: EditableUserRow, field: keyof UserEditValue): boolean {
    this.editRevision();
    const value = row.form.getRawValue();

    if (field === 'tenantIds') {
      return !sameStringSet(value.tenantIds, row.original.tenantIds);
    }

    return value[field] !== row.original[field];
  }

  editingUser(): EditableUserRow | null {
    const userId = this.editingUserId();
    return this.rows().find((row) => row.id === userId) ?? null;
  }

  userTenantNames(row: EditableUserRow): string {
    const tenantNames = row.original.tenantIds
      .map((tenantId) => this.tenants().find((tenant) => tenant.id === tenantId)?.name)
      .filter((name): name is string => Boolean(name));
    return tenantNames.join(', ');
  }

  private replaceSavedRows(savedUsers: readonly UserDto[]): void {
    const savedById = new Map(savedUsers.map((user) => [user.id, user]));
    this.rows.update((rows) =>
      rows.map((row) => {
        const saved = savedById.get(row.id);
        return saved ? this.editableRow(saved) : row;
      }),
    );
    this.editRevision.update((revision) => revision + 1);
  }

  private changedRows(): EditableUserRow[] {
    return this.rows().filter((row) => this.hasRowChanges(row));
  }

  private changedFields(row: EditableUserRow): UpdateUserRequest {
    return this.changedUserFields(row.original, row.form.getRawValue());
  }

  private changedUserFields(
    original: UserEditValue,
    value: ReturnType<UserEditForm['getRawValue']>,
  ): UpdateUserRequest {
    const changes: UpdateUserRequest = {};

    if (value.displayName !== original.displayName) {
      changes.displayName = value.displayName;
    }

    if (value.role !== original.role) {
      changes.role = value.role;
    }

    if (value.isDisabled !== original.isDisabled) {
      changes.isActive = !value.isDisabled;
    }

    if (!sameStringSet(value.tenantIds, original.tenantIds)) {
      changes.tenantIds = value.tenantIds;
    }

    return changes;
  }

  private hasRowChanges(row: EditableUserRow): boolean {
    const value = row.form.getRawValue();
    return (
      value.displayName !== row.original.displayName ||
      value.role !== row.original.role ||
      value.isDisabled !== row.original.isDisabled ||
      !sameStringSet(value.tenantIds, row.original.tenantIds)
    );
  }

  private editableRow(user: UserDto): EditableUserRow {
    const original = userEditValue(user);
    const form = this.createEditForm(original);

    return {
      id: user.id,
      username: user.username,
      form,
      original,
    };
  }

  private createEditForm(value: UserEditValue): UserEditForm {
    const form = new FormGroup({
      displayName: new FormControl(value.displayName, {
        nonNullable: true,
        validators: [Validators.required],
      }),
      role: new FormControl(value.role, { nonNullable: true }),
      isDisabled: new FormControl(value.isDisabled, { nonNullable: true }),
      tenantIds: new FormControl<string[]>([...value.tenantIds], {
        nonNullable: true,
        validators: [Validators.required],
      }),
    });

    form.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.editRevision.update((revision) => revision + 1);
    });

    return form;
  }

  isLastActiveAdminSelf(row: EditableUserRow): boolean {
    return (
      this.auth.user()?.id === row.id && this.isActiveAdmin(row) && this.activeAdminCount() === 1
    );
  }

  deleteUser(row: EditableUserRow): void {
    if (this.isDeleting() || this.isLastActiveAdminSelf(row)) {
      return;
    }

    this.error.set(null);
    this.isDeleting.set(true);
    this.usersApi
      .delete(row.id)
      .pipe(finalize(() => this.isDeleting.set(false)))
      .subscribe({
        next: () => {
          this.rows.update((rows) => rows.filter((entry) => entry.id !== row.id));
          this.totalUsers.update((total) => Math.max(0, total - 1));
          this.editRevision.update((revision) => revision + 1);
        },
        error: (error: unknown) => this.error.set(this.deleteErrorMessage(error)),
      });
  }

  private resetCreateForm(): void {
    this.createUserForm.reset({
      username: '',
      displayName: '',
      password: '',
      confirmPassword: '',
      role: 'User',
      tenantIds: this.defaultTenantIds(),
    });
  }

  private loadTenants(): void {
    this.tenantsApi.list(1, 100).subscribe({
      next: (response) => {
        this.tenants.set(response.items.filter((tenant) => tenant.isActive));
        if (this.createUserForm.controls.tenantIds.value.length === 0) {
          this.createUserForm.controls.tenantIds.setValue(this.defaultTenantIds());
        }
      },
      error: () => this.error.set('tenants.errors.loadFailed'),
    });
  }

  private defaultTenantIds(): string[] {
    return this.tenants()[0]?.id ? [this.tenants()[0].id] : [];
  }

  private activeAdminCount(): number {
    return this.rows().filter((row) => this.isActiveAdmin(row)).length;
  }

  private isActiveAdmin(row: EditableUserRow): boolean {
    return row.form.controls.role.value === 'Admin' && !row.form.controls.isDisabled.value;
  }

  private saveErrorMessage(error: unknown): string {
    if (apiErrorMessage(error) === ACTIVE_ADMIN_REQUIRED_ERROR) {
      return 'users.errors.activeAdminRequired';
    }

    return 'users.errors.saveFailed';
  }

  private deleteErrorMessage(error: unknown): string {
    if (apiErrorMessage(error) === ACTIVE_ADMIN_REQUIRED_ERROR) {
      return 'users.errors.activeAdminRequired';
    }

    return 'users.errors.deleteFailed';
  }
}

function appendUniqueRows(
  current: readonly EditableUserRow[],
  next: readonly EditableUserRow[],
): EditableUserRow[] {
  const rowIds = new Set(current.map((row) => row.id));
  return [...current, ...next.filter((row) => !rowIds.has(row.id))];
}

function userEditValue(user: UserDto): UserEditValue {
  return {
    displayName: user.displayName,
    role: user.role,
    isDisabled: !user.isActive,
    tenantIds: user.tenants.map((tenant) => tenant.id),
  };
}

function sameStringSet(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }

  const rightValues = new Set(right);
  return left.every((value) => rightValues.has(value));
}

function apiErrorMessage(error: unknown): string | undefined {
  if (!(error instanceof HttpErrorResponse)) {
    return undefined;
  }

  const responseBody = error.error;
  if (typeof responseBody !== 'object' || responseBody === null || !('message' in responseBody)) {
    return undefined;
  }

  const message = (responseBody as { readonly message?: unknown }).message;
  return typeof message === 'string' ? message : undefined;
}
