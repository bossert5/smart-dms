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
import { TranslatePipe } from '@ngx-translate/core';
import type {
  EmailImportMode,
  EmailMailboxConnectionRequest,
  EmailMailboxDto,
  EmailRemoteFolderDto,
} from '@smart-dms/shared-dto';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzCheckboxModule } from 'ng-zorro-antd/checkbox';
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzInputNumberModule } from 'ng-zorro-antd/input-number';
import { NzModalModule } from 'ng-zorro-antd/modal';
import { NzPopconfirmModule } from 'ng-zorro-antd/popconfirm';
import { NzRadioModule } from 'ng-zorro-antd/radio';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzTableModule } from 'ng-zorro-antd/table';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzTooltipModule } from 'ng-zorro-antd/tooltip';
import { finalize } from 'rxjs';
import { EmailMailboxesApiService } from '../../core/api/email-mailboxes-api.service';
import { TenantContextService } from '../../core/services/tenant-context.service';
import { shortIsoDateTime } from '../../shared/formatters/date.formatter';
import { InfiniteTableScrollDirective } from '../../shared/table/infinite-table-scroll.directive';
import { TablePanelComponent } from '../../shared/table/table-panel.component';

type MailboxForm = FormGroup<{
  tenantId: FormControl<string>;
  name: FormControl<string>;
  host: FormControl<string>;
  port: FormControl<number>;
  username: FormControl<string>;
  password: FormControl<string>;
  tls: FormControl<boolean>;
  importMode: FormControl<EmailImportMode>;
  isDisabled: FormControl<boolean>;
  senderRulesText: FormControl<string>;
}>;

@Component({
  selector: 'app-settings-email',
  imports: [
    ReactiveFormsModule,
    TranslatePipe,
    NzAlertModule,
    NzButtonModule,
    NzCheckboxModule,
    NzFormModule,
    NzIconModule,
    NzInputModule,
    NzInputNumberModule,
    NzModalModule,
    NzPopconfirmModule,
    NzRadioModule,
    NzSelectModule,
    NzTableModule,
    NzTagModule,
    NzTooltipModule,
    InfiniteTableScrollDirective,
    TablePanelComponent,
  ],
  templateUrl: './settings-email.component.html',
  styleUrl: './settings-email.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsEmailComponent implements OnInit {
  private readonly emailApi = inject(EmailMailboxesApiService);
  private readonly destroyRef = inject(DestroyRef);
  readonly tenantContext = inject(TenantContextService);

  readonly mailboxes = signal<EmailMailboxDto[]>([]);
  readonly folders = signal<EmailRemoteFolderDto[]>([]);
  readonly selectedFolderPaths = signal<string[]>([]);
  readonly editingMailboxId = signal<string | null>(null);
  readonly isLoading = signal(false);
  readonly isSaving = signal(false);
  readonly isTesting = signal(false);
  readonly isLoadingFolders = signal(false);
  readonly isSyncing = signal(false);
  readonly isConnectionVerified = signal(false);
  readonly isConfigDialogOpen = signal(false);
  readonly error = signal<string | null>(null);
  readonly importModes: readonly EmailImportMode[] = ['DISABLED', 'OCR_ONLY', 'OCR_AND_AI'];

  readonly mailboxForm: MailboxForm = new FormGroup({
    tenantId: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    name: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    host: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    port: new FormControl(993, { nonNullable: true, validators: [Validators.required] }),
    username: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    password: new FormControl('', { nonNullable: true }),
    tls: new FormControl(true, { nonNullable: true }),
    importMode: new FormControl<EmailImportMode>('OCR_ONLY', { nonNullable: true }),
    isDisabled: new FormControl(false, { nonNullable: true }),
    senderRulesText: new FormControl('', { nonNullable: true }),
  });

  readonly selectedMailbox = computed(() => {
    const selectedId = this.editingMailboxId();
    return this.mailboxes().find((mailbox) => mailbox.id === selectedId) ?? null;
  });
  readonly isEditMode = computed(() => this.editingMailboxId() !== null);
  readonly dialogTitleKey = computed(() =>
    this.isEditMode() ? 'email.configDialog.editTitle' : 'email.configDialog.createTitle',
  );
  readonly canSave = computed(() => this.isConnectionVerified() && !this.isTesting());

  constructor() {
    this.mailboxForm.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.isConnectionVerified.set(false));
  }

  ngOnInit(): void {
    this.loadMailboxes();
  }

  loadMailboxes(): void {
    this.isLoading.set(true);
    this.error.set(null);
    this.emailApi
      .mailboxes()
      .pipe(finalize(() => this.isLoading.set(false)))
      .subscribe({
        next: (mailboxes) => {
          this.mailboxes.set(mailboxes);
          const selectedId = this.editingMailboxId();
          if (selectedId && !mailboxes.some((item) => item.id === selectedId)) {
            this.closeConfigDialog();
          }
        },
        error: () => this.error.set('email.errors.loadFailed'),
      });
  }

  openCreateDialog(): void {
    this.editingMailboxId.set(null);
    this.folders.set([]);
    this.selectedFolderPaths.set([]);
    this.isConnectionVerified.set(false);
    this.mailboxForm.reset({
      name: '',
      tenantId: this.defaultTenantId(),
      host: '',
      port: 993,
      username: '',
      password: '',
      tls: true,
      importMode: 'OCR_ONLY',
      isDisabled: false,
      senderRulesText: '',
    });
    this.error.set(null);
    this.isConfigDialogOpen.set(true);
  }

  openEditDialog(mailbox: EmailMailboxDto): void {
    this.editingMailboxId.set(mailbox.id);
    this.folders.set(
      mailbox.folders.map((folder) => ({
        path: folder.folderPath,
        name: folder.folderPath,
        delimiter: null,
        selected: folder.selected,
      })),
    );
    this.selectedFolderPaths.set(
      mailbox.folders.filter((folder) => folder.selected).map((folder) => folder.folderPath),
    );
    this.isConnectionVerified.set(false);
    this.mailboxForm.reset({
      name: mailbox.name,
      tenantId: mailbox.tenant.id,
      host: mailbox.host,
      port: mailbox.port,
      username: mailbox.username,
      password: '',
      tls: mailbox.tls,
      importMode: mailbox.importMode,
      isDisabled: !mailbox.isActive,
      senderRulesText: mailbox.senderRules.map((rule) => rule.pattern).join('\n'),
    });
    this.error.set(null);
    this.isConfigDialogOpen.set(true);
  }

  closeConfigDialog(): void {
    if (this.isSaving() || this.isTesting() || this.isLoadingFolders()) {
      return;
    }

    this.resetConfigDialog();
  }

  private resetConfigDialog(): void {
    this.isConfigDialogOpen.set(false);
    this.editingMailboxId.set(null);
    this.folders.set([]);
    this.selectedFolderPaths.set([]);
    this.isConnectionVerified.set(false);
  }

  loadRemoteFolders(): void {
    if (this.isLoadingFolders()) {
      return;
    }

    const input = this.connectionInput();
    if (!input) {
      return;
    }

    this.isLoadingFolders.set(true);
    this.error.set(null);
    this.emailApi
      .foldersFromConnectionInput(input)
      .pipe(finalize(() => this.isLoadingFolders.set(false)))
      .subscribe({
        next: (folders) => {
          this.folders.set(folders);
          this.selectedFolderPaths.set(
            folders.filter((folder) => folder.selected).map((folder) => folder.path),
          );
          this.isConnectionVerified.set(true);
        },
        error: () => this.error.set('email.errors.foldersFailed'),
      });
  }

  save(): void {
    if (this.mailboxForm.invalid || this.isSaving() || this.isLoadingFolders()) {
      this.mailboxForm.markAllAsTouched();
      return;
    }

    const value = this.mailboxForm.getRawValue();
    const selectedFolders = this.selectedFolderPaths();
    const senderRules = parseSenderRules(value.senderRulesText);
    const selectedId = this.editingMailboxId();
    const input = {
      name: value.name,
      host: value.host,
      port: value.port,
      username: value.username,
      tls: value.tls,
      importMode: value.importMode,
      isActive: !value.isDisabled,
      selectedFolders,
      senderRules,
      ...(value.password ? { password: value.password } : {}),
    };

    if (!selectedId && !value.password) {
      this.error.set('email.errors.passwordRequired');
      return;
    }
    if (!this.canSave()) {
      return;
    }

    this.isSaving.set(true);
    this.error.set(null);
    const request = selectedId
      ? this.emailApi.update(selectedId, input)
      : this.emailApi.create({
          ...input,
          tenantId: value.tenantId,
          password: value.password,
        });
    request.pipe(finalize(() => this.isSaving.set(false))).subscribe({
      next: (mailbox) => {
        this.upsertMailbox(mailbox);
        this.resetConfigDialog();
      },
      error: () => this.error.set('email.errors.saveFailed'),
    });
  }

  testDialogConnection(): void {
    if (this.isTesting()) {
      return;
    }

    const input = this.connectionInput();
    if (!input) {
      return;
    }

    this.isTesting.set(true);
    this.error.set(null);
    this.emailApi
      .testConnectionInput(input)
      .pipe(finalize(() => this.isTesting.set(false)))
      .subscribe({
        next: () => this.isConnectionVerified.set(true),
        error: () => this.error.set('email.errors.testFailed'),
      });
  }

  deleteMailbox(mailbox: EmailMailboxDto): void {
    this.emailApi.delete(mailbox.id).subscribe({
      next: () => {
        this.mailboxes.update((mailboxes) => mailboxes.filter((item) => item.id !== mailbox.id));
        if (this.editingMailboxId() === mailbox.id) {
          this.closeConfigDialog();
        }
      },
      error: () => this.error.set('email.errors.deleteFailed'),
    });
  }

  sync(mailbox: EmailMailboxDto): void {
    if (this.isSyncing()) {
      return;
    }

    this.isSyncing.set(true);
    this.error.set(null);
    this.emailApi
      .sync(mailbox.id)
      .pipe(finalize(() => this.isSyncing.set(false)))
      .subscribe({
        next: () => {
          this.loadMailboxes();
        },
        error: () => this.error.set('email.errors.syncFailed'),
      });
  }

  updateFolderSelection(path: string, selected: boolean): void {
    this.selectedFolderPaths.update((paths) => {
      const next = new Set(paths);
      selected ? next.add(path) : next.delete(path);
      return [...next].sort((left, right) => left.localeCompare(right, 'de'));
    });
    this.folders.update((folders) =>
      folders.map((folder) => (folder.path === path ? { ...folder, selected } : folder)),
    );
  }

  isFolderSelected(path: string): boolean {
    return this.selectedFolderPaths().includes(path);
  }

  selectedFolderCount(mailbox: EmailMailboxDto): number {
    return mailbox.folders.filter((folder) => folder.selected).length;
  }

  formatLastSync(mailbox: EmailMailboxDto): string {
    return shortIsoDateTime(mailbox.lastSyncAt);
  }

  private defaultTenantId(): string {
    return (
      this.tenantContext.activeTenant()?.id ?? this.tenantContext.uploadTenantOptions()[0]?.id ?? ''
    );
  }

  private connectionInput(): EmailMailboxConnectionRequest | null {
    const value = this.mailboxForm.getRawValue();
    const selectedId = this.editingMailboxId();

    this.mailboxForm.controls.host.markAsTouched();
    this.mailboxForm.controls.port.markAsTouched();
    this.mailboxForm.controls.username.markAsTouched();
    if (
      this.mailboxForm.controls.host.invalid ||
      this.mailboxForm.controls.port.invalid ||
      this.mailboxForm.controls.username.invalid
    ) {
      return null;
    }

    if (!selectedId && !value.password) {
      this.mailboxForm.controls.password.markAsTouched();
      this.error.set('email.errors.passwordRequired');
      return null;
    }

    return {
      ...(selectedId ? { mailboxId: selectedId } : {}),
      host: value.host,
      port: value.port,
      username: value.username,
      tls: value.tls,
      ...(value.password ? { password: value.password } : {}),
    };
  }

  private upsertMailbox(mailbox: EmailMailboxDto): void {
    this.mailboxes.update((mailboxes) => {
      const index = mailboxes.findIndex((item) => item.id === mailbox.id);
      if (index < 0) {
        return [...mailboxes, mailbox].sort((left, right) =>
          left.name.localeCompare(right.name, 'de'),
        );
      }

      return mailboxes.map((item) => (item.id === mailbox.id ? mailbox : item));
    });
  }
}

function parseSenderRules(value: string): string[] {
  return [
    ...new Set(
      value
        .split(/\r?\n|,/)
        .map((entry) => entry.trim())
        .filter(Boolean),
    ),
  ];
}
