import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  ApiOutline,
  DeleteOutline,
  EditOutline,
  FolderOpenOutline,
  PlusOutline,
  SaveOutline,
  SyncOutline,
} from '@ant-design/icons-angular/icons';
import { signal } from '@angular/core';
import type { EmailMailboxDto, EmailRemoteFolderDto } from '@smart-dms/shared-dto';
import { provideNzIcons } from 'ng-zorro-antd/icon';
import { of } from 'rxjs';
import { EmailMailboxesApiService } from '../../core/api/email-mailboxes-api.service';
import { TenantContextService } from '../../core/services/tenant-context.service';
import { provideI18nTesting } from '../../testing/i18n-testing';
import { SettingsEmailComponent } from './settings-email.component';

const createdAt = '2026-05-25T18:00:00.000Z';
const tenant = {
  id: '00000000-0000-4000-8000-000000000010',
  key: 'default',
  name: 'Default',
  isActive: true,
};

const mailbox: EmailMailboxDto = {
  id: '018f1a44-9093-7f55-a515-278f4d9bd990',
  tenant,
  name: 'Invoices',
  host: 'imap.example.com',
  port: 993,
  username: 'invoices@example.com',
  tls: true,
  importMode: 'OCR_ONLY',
  isActive: true,
  lastSyncAt: null,
  lastSyncError: null,
  createdAt,
  updatedAt: createdAt,
  folders: [
    {
      id: '018f1a44-9093-7f55-a515-278f4d9bd991',
      folderPath: 'INBOX',
      selected: true,
      uidValidity: '1',
      highestSeenUid: '10',
      lastSyncAt: null,
      createdAt,
      updatedAt: createdAt,
    },
  ],
  senderRules: [
    {
      id: '018f1a44-9093-7f55-a515-278f4d9bd992',
      pattern: '*@supplier.example',
      createdAt,
    },
  ],
};

const remoteFolders: EmailRemoteFolderDto[] = [
  { path: 'INBOX', name: 'INBOX', delimiter: '/', selected: true },
  { path: 'Archive', name: 'Archive', delimiter: '/', selected: false },
];

const syncedMailbox: EmailMailboxDto = {
  ...mailbox,
  id: '018f1a44-9093-7f55-a515-278f4d9bd994',
  name: 'Synced',
  lastSyncAt: '2026-06-04T13:30:00.000Z',
};

describe('SettingsEmailComponent', () => {
  let fixture: ComponentFixture<SettingsEmailComponent>;
  let component: SettingsEmailComponent;
  let api: {
    mailboxes: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
    testConnectionInput: ReturnType<typeof vi.fn>;
    sync: ReturnType<typeof vi.fn>;
    folders: ReturnType<typeof vi.fn>;
    foldersFromConnectionInput: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    api = {
      mailboxes: vi.fn().mockReturnValue(of([mailbox])),
      create: vi.fn().mockImplementation((input) =>
        of({
          ...mailbox,
          ...input,
          id: '018f1a44-9093-7f55-a515-278f4d9bd993',
          tenant,
          folders: [],
          senderRules: [],
        }),
      ),
      update: vi.fn().mockImplementation((_id, input) => of({ ...mailbox, ...input })),
      delete: vi.fn().mockReturnValue(of({ success: true })),
      testConnectionInput: vi.fn().mockReturnValue(of({ success: true })),
      sync: vi.fn().mockReturnValue(of({ importedMessages: 1, processedDocuments: 1 })),
      folders: vi.fn().mockReturnValue(of(remoteFolders)),
      foldersFromConnectionInput: vi.fn().mockReturnValue(of(remoteFolders)),
    };

    await TestBed.configureTestingModule({
      imports: [SettingsEmailComponent],
      providers: [
        provideI18nTesting(),
        provideNzIcons([
          ApiOutline,
          DeleteOutline,
          EditOutline,
          FolderOpenOutline,
          PlusOutline,
          SaveOutline,
          SyncOutline,
        ]),
        { provide: EmailMailboxesApiService, useValue: api },
        {
          provide: TenantContextService,
          useValue: {
            activeTenant: signal(tenant),
            hasMultipleActiveTenants: () => false,
            uploadTenantOptions: () => [tenant],
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(SettingsEmailComponent);
    component = fixture.componentInstance;
  });

  it('loads mailbox configuration into the table', () => {
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;

    expect(api.mailboxes).toHaveBeenCalledOnce();
    expect(compiled.textContent).toContain('Invoices');
    expect(compiled.textContent).toContain('invoices@example.com');
    expect(compiled.textContent).toContain('imap.example.com:993');
  });

  it('renders only the configured empty state when no mailboxes exist', () => {
    api.mailboxes.mockReturnValueOnce(of([]));

    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const text = compiled.textContent ?? '';

    expect(text.match(/No IMAP mailboxes connected yet\./g)).toHaveLength(1);
    expect(text).not.toContain('No Data');
    expect(compiled.querySelector('.settings-email-table .empty-state')).toBeNull();
  });

  it('renders last sync date with local time and keeps null values empty', () => {
    api.mailboxes.mockReturnValueOnce(of([mailbox, syncedMailbox]));

    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const expectedLastSync = new Date(syncedMailbox.lastSyncAt!).toLocaleString(undefined, {
      dateStyle: 'short',
      timeStyle: 'short',
    });

    expect(compiled.textContent).toContain(expectedLastSync);
    expect(component.formatLastSync(mailbox)).toBe('—');
  });

  it('renders direct edit, synchronize, and delete buttons in the actions column', () => {
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const headerCells = compiled.querySelectorAll('thead th');
    const actionsHeader = headerCells.item(headerCells.length - 1);
    const disabledHeader = headerCells.item(headerCells.length - 2);
    const rowActionButtons = compiled.querySelectorAll<HTMLButtonElement>(
      'tbody .actions-cell button',
    );

    expect(disabledHeader.textContent?.trim()).toBe('Disabled');
    expect(actionsHeader.textContent?.trim()).toBe('');
    expect(actionsHeader.getAttribute('aria-label')).toBe('Actions');
    expect(compiled.querySelectorAll('tbody nz-tag')).toHaveLength(2);
    expect(compiled.querySelectorAll('tbody nz-switch')).toHaveLength(0);
    expect(rowActionButtons).toHaveLength(3);
    expect(rowActionButtons[0].getAttribute('aria-label')).toBe('Edit');
    expect(rowActionButtons[0].querySelector('.anticon-edit')).not.toBeNull();
    expect(rowActionButtons[1].getAttribute('aria-label')).toBe('Synchronize');
    expect(rowActionButtons[1].querySelector('.anticon-sync')).not.toBeNull();
    expect(rowActionButtons[2].getAttribute('aria-label')).toBe('Delete');
    expect(rowActionButtons[2].querySelector('.anticon-delete')).not.toBeNull();
  });

  it('opens an empty create dialog with the default tenant', () => {
    fixture.detectChanges();

    component.openCreateDialog();

    expect(component.isConfigDialogOpen()).toBe(true);
    expect(component.isEditMode()).toBe(false);
    expect(component.mailboxForm.getRawValue()).toEqual({
      name: '',
      tenantId: tenant.id,
      host: '',
      port: 993,
      username: '',
      password: '',
      tls: true,
      importMode: 'OCR_ONLY',
      isDisabled: false,
      senderRulesText: '',
    });
  });

  it('keeps the TLS checkbox aligned like the disabled checkbox in the dialog', () => {
    fixture.detectChanges();

    component.openCreateDialog();
    fixture.detectChanges();

    const disabledCheckbox = document.body.querySelector<HTMLElement>(
      '.name-active-row .ant-checkbox-wrapper',
    );
    const tlsCheckbox = document.body.querySelector<HTMLElement>('.dialog-checkbox-row');

    expect(disabledCheckbox).not.toBeNull();
    expect(tlsCheckbox).not.toBeNull();
    expect(getComputedStyle(tlsCheckbox!).alignItems).toBe('baseline');
    expect(getComputedStyle(tlsCheckbox!).lineHeight).toBe('32px');
    expect(getComputedStyle(tlsCheckbox!).minHeight).toBe('32px');
    expect(getComputedStyle(tlsCheckbox!).marginBottom).toBe('24px');
  });

  it('requires a password for new configurations and creates after verification', () => {
    fixture.detectChanges();
    component.openCreateDialog();
    component.mailboxForm.patchValue({
      name: 'Receipts',
      host: 'imap.receipts.example',
      port: 993,
      username: 'receipts@example.com',
      senderRulesText: 'billing@example.com',
    });

    component.save();

    expect(api.create).not.toHaveBeenCalled();
    expect(component.error()).toBe('email.errors.passwordRequired');

    component.mailboxForm.controls.password.setValue('secret');
    component.testDialogConnection();

    expect(api.testConnectionInput).toHaveBeenCalledWith({
      host: 'imap.receipts.example',
      port: 993,
      username: 'receipts@example.com',
      tls: true,
      password: 'secret',
    });
    expect(component.canSave()).toBe(true);

    component.save();

    expect(api.create).toHaveBeenCalledWith({
      name: 'Receipts',
      host: 'imap.receipts.example',
      port: 993,
      username: 'receipts@example.com',
      tls: true,
      importMode: 'OCR_ONLY',
      isActive: true,
      selectedFolders: [],
      senderRules: ['billing@example.com'],
      tenantId: tenant.id,
      password: 'secret',
    });
    expect(component.isConfigDialogOpen()).toBe(false);
  });

  it('opens edit dialog with existing values and updates without password', () => {
    fixture.detectChanges();

    component.openEditDialog(mailbox);
    expect(component.isEditMode()).toBe(true);
    expect(component.mailboxForm.controls.name.value).toBe('Invoices');
    expect(component.mailboxForm.controls.password.value).toBe('');

    component.mailboxForm.controls.host.setValue('imap.changed.example');
    component.testDialogConnection();
    component.save();

    expect(api.testConnectionInput).toHaveBeenCalledWith({
      mailboxId: mailbox.id,
      host: 'imap.changed.example',
      port: 993,
      username: 'invoices@example.com',
      tls: true,
    });
    expect(api.update).toHaveBeenCalledWith(mailbox.id, {
      name: 'Invoices',
      host: 'imap.changed.example',
      port: 993,
      username: 'invoices@example.com',
      tls: true,
      importMode: 'OCR_ONLY',
      isActive: true,
      selectedFolders: ['INBOX'],
      senderRules: ['*@supplier.example'],
    });
  });

  it('loads remote folders with the current edited configuration', () => {
    fixture.detectChanges();

    component.openEditDialog(mailbox);
    component.loadRemoteFolders();

    expect(api.foldersFromConnectionInput).toHaveBeenCalledWith({
      mailboxId: mailbox.id,
      host: 'imap.example.com',
      port: 993,
      username: 'invoices@example.com',
      tls: true,
    });
    expect(component.folders()).toEqual(remoteFolders);
    expect(component.selectedFolderPaths()).toEqual(['INBOX']);
    expect(component.canSave()).toBe(true);
  });

  it('loads remote folders for a new configuration before it is saved', () => {
    fixture.detectChanges();

    component.openCreateDialog();
    component.mailboxForm.patchValue({
      host: 'imap.receipts.example',
      port: 993,
      username: 'receipts@example.com',
      password: 'secret',
    });
    component.loadRemoteFolders();

    expect(api.foldersFromConnectionInput).toHaveBeenCalledWith({
      host: 'imap.receipts.example',
      port: 993,
      username: 'receipts@example.com',
      tls: true,
      password: 'secret',
    });
    expect(component.folders()).toEqual(remoteFolders);
    expect(component.selectedFolderPaths()).toEqual(['INBOX']);
  });

  it('runs row actions for edit, sync, and delete', () => {
    fixture.detectChanges();

    component.openEditDialog(mailbox);
    component.sync(mailbox);
    component.deleteMailbox(mailbox);

    expect(component.isConfigDialogOpen()).toBe(false);
    expect(component.mailboxForm.controls.name.value).toBe('Invoices');
    expect(api.sync).toHaveBeenCalledWith(mailbox.id);
    expect(api.delete).toHaveBeenCalledWith(mailbox.id);
    expect(component.mailboxes()).toEqual([]);
  });
});
