import { signal } from '@angular/core';
import { By } from '@angular/platform-browser';
import { TestBed } from '@angular/core/testing';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import {
  CheckCircleOutline,
  CloseCircleOutline,
  DeleteOutline,
  DownOutline,
  EditOutline,
  EyeInvisibleOutline,
  EyeOutline,
  SaveOutline,
  SyncOutline,
  UndoOutline,
  UserAddOutline,
} from '@ant-design/icons-angular/icons';
import type { ListUsersResponse, UserDto } from '@smart-dms/shared-dto';
import { provideNzIcons } from 'ng-zorro-antd/icon';
import { of, throwError } from 'rxjs';
import { TenantApiService } from '../../core/api/tenant-api.service';
import { UserApiService } from '../../core/api/user-api.service';
import { AuthService } from '../../core/services/auth.service';
import { provideI18nTesting } from '../../testing/i18n-testing';
import { UsersComponent } from './users.component';

const tenant = {
  id: '00000000-0000-4000-8000-000000000010',
  key: 'default',
  name: 'Default',
  scannerImportPath: null,
  isActive: true,
  createdAt: '2026-05-07T00:00:00.000Z',
  updatedAt: '2026-05-07T00:00:00.000Z',
};

const user: UserDto = {
  id: '00000000-0000-4000-8000-000000000001',
  username: 'admin',
  displayName: 'Admin',
  role: 'Admin',
  isActive: true,
  passwordChangeRequired: false,
  tenants: [tenant],
  defaultTenantId: tenant.id,
  createdAt: '2026-05-07T00:00:00.000Z',
  updatedAt: '2026-05-07T00:00:00.000Z',
};

const listResponse: ListUsersResponse = {
  items: [user],
  meta: {
    page: 1,
    pageSize: 50,
    totalItems: 1,
    totalPages: 1,
  },
};

function buttonByText(root: HTMLElement, text: string): HTMLButtonElement | undefined {
  return Array.from(root.querySelectorAll<HTMLButtonElement>('button')).find((button) =>
    button.textContent?.includes(text),
  );
}

function tableHeaders(root: HTMLElement): string[] {
  return Array.from(root.querySelectorAll('.users-table thead th')).map(
    (header) => header.textContent?.trim() ?? '',
  );
}

async function createComponent(
  options: {
    readonly usersApi?: {
      readonly list: ReturnType<typeof vi.fn>;
      readonly create: ReturnType<typeof vi.fn>;
      readonly update: ReturnType<typeof vi.fn>;
      readonly bulkUpdate: ReturnType<typeof vi.fn>;
      readonly delete: ReturnType<typeof vi.fn>;
    };
  } = {},
) {
  const usersApi = options.usersApi ?? {
    list: vi.fn().mockReturnValue(of(listResponse)),
    create: vi.fn(),
    update: vi.fn(),
    bulkUpdate: vi.fn().mockReturnValue(of({ users: [user] })),
    delete: vi.fn().mockReturnValue(of({ success: true })),
  };
  const authService = {
    user: signal<UserDto | null>(user),
  };
  const tenantsApi = {
    list: vi.fn().mockReturnValue(of({ items: [tenant], meta: listResponse.meta })),
  };

  await TestBed.configureTestingModule({
    imports: [UsersComponent],
    providers: [
      provideAnimationsAsync(),
      provideI18nTesting(),
      provideNzIcons([
        CheckCircleOutline,
        CloseCircleOutline,
        DeleteOutline,
        DownOutline,
        EyeInvisibleOutline,
        EyeOutline,
        SaveOutline,
        SyncOutline,
        UndoOutline,
        UserAddOutline,
      ]),
      { provide: UserApiService, useValue: usersApi },
      { provide: TenantApiService, useValue: tenantsApi },
      { provide: AuthService, useValue: authService },
    ],
  }).compileComponents();

  const fixture = TestBed.createComponent(UsersComponent);
  fixture.detectChanges();
  await fixture.whenStable();

  return { fixture, usersApi };
}

describe('UsersComponent', () => {
  it('renders a create button instead of an inline create row', async () => {
    const usersApi = {
      list: vi.fn().mockReturnValue(of(listResponse)),
      create: vi.fn(),
      update: vi.fn(),
      bulkUpdate: vi.fn(),
      delete: vi.fn(),
    };
    const authService = {
      user: signal<UserDto | null>(user),
    };
    const tenantsApi = {
      list: vi.fn().mockReturnValue(of({ items: [tenant], meta: listResponse.meta })),
    };

    await TestBed.configureTestingModule({
      imports: [UsersComponent],
      providers: [
        provideAnimationsAsync(),
        provideI18nTesting(),
        provideNzIcons([
          CheckCircleOutline,
          CloseCircleOutline,
          DeleteOutline,
          DownOutline,
          EditOutline,
          EyeInvisibleOutline,
          EyeOutline,
          SaveOutline,
          SyncOutline,
          UndoOutline,
          UserAddOutline,
        ]),
        { provide: UserApiService, useValue: usersApi },
        { provide: TenantApiService, useValue: tenantsApi },
        { provide: AuthService, useValue: authService },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(UsersComponent);
    fixture.detectChanges();
    await fixture.whenStable();

    const compiled = fixture.nativeElement as HTMLElement;
    const panelActions = compiled.querySelector('.app-table-panel__actions');
    const createButton = Array.from(compiled.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Create user'),
    );

    expect(compiled.querySelector('.create-user')).toBeNull();
    expect(compiled.querySelector('.users-actions')).toBeNull();
    expect(panelActions?.textContent).toContain('Create user');
    expect(panelActions?.textContent).not.toContain('Save changes');
    expect(panelActions?.textContent).not.toContain('Revert changes');
    expect(panelActions?.nextElementSibling?.querySelector('nz-table')).not.toBeNull();
    expect(createButton).not.toBeUndefined();
    const rowButtonTexts = Array.from(compiled.querySelectorAll('tbody button')).map((button) =>
      button.textContent?.trim(),
    );
    expect(rowButtonTexts).not.toContain('Save');

    createButton?.click();
    fixture.detectChanges();

    expect(fixture.componentInstance.isCreateDialogOpen()).toBe(true);
    expect(
      fixture.debugElement.queryAll(By.css('input[autocomplete="new-password"]')),
    ).toHaveLength(2);
    expect(fixture.debugElement.queryAll(By.css('.password-requirement'))).toHaveLength(4);
  });

  it('keeps tenant assignment and the table tenant column available for a single tenant', async () => {
    const { fixture } = await createComponent();
    const compiled = fixture.nativeElement as HTMLElement;

    expect(tableHeaders(compiled)).toEqual(['Username', 'Name', 'Role', 'Tenants', 'Disabled', '']);
    fixture.componentInstance.openCreateDialog();
    fixture.detectChanges();

    expect(fixture.debugElement.query(By.css('#create-tenants'))).not.toBeNull();
    fixture.componentInstance.closeCreateDialog();
    fixture.componentInstance.openEditDialog(fixture.componentInstance.rows()[0]);
    fixture.detectChanges();

    expect(fixture.debugElement.query(By.css('#edit-tenants'))).not.toBeNull();
    expect(compiled.querySelector('td.checkbox-cell')?.textContent).toContain('No');
    expect(compiled.querySelector('td.actions-cell button .anticon-edit')).not.toBeNull();
    expect(compiled.querySelector('td.actions-cell button[nzDanger]')).not.toBeNull();
  });

  it('tracks password requirements and omits confirmation from create requests', async () => {
    const usersApi = {
      list: vi.fn().mockReturnValue(of(listResponse)),
      create: vi.fn().mockReturnValue(of(user)),
      update: vi.fn(),
      bulkUpdate: vi.fn(),
      delete: vi.fn(),
    };
    const authService = {
      user: signal<UserDto | null>(user),
    };
    const tenantsApi = {
      list: vi.fn().mockReturnValue(of({ items: [tenant], meta: listResponse.meta })),
    };

    await TestBed.configureTestingModule({
      imports: [UsersComponent],
      providers: [
        provideAnimationsAsync(),
        provideI18nTesting(),
        provideNzIcons([
          CheckCircleOutline,
          CloseCircleOutline,
          DeleteOutline,
          DownOutline,
          EditOutline,
          EyeInvisibleOutline,
          EyeOutline,
          SaveOutline,
          SyncOutline,
          UndoOutline,
          UserAddOutline,
        ]),
        { provide: UserApiService, useValue: usersApi },
        { provide: TenantApiService, useValue: tenantsApi },
        { provide: AuthService, useValue: authService },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(UsersComponent);
    fixture.detectChanges();
    await fixture.whenStable();

    const component = fixture.componentInstance;
    component.createUserForm.setValue({
      username: 'new-user',
      displayName: 'New User',
      password: 'Passwort1!',
      confirmPassword: 'Passwort1!',
      role: 'User',
      tenantIds: [tenant.id],
    });

    expect(component.createPasswordRequirements().every((item) => item.isMet)).toBe(true);

    component.create();

    expect(usersApi.create).toHaveBeenCalledWith({
      username: 'new-user',
      displayName: 'New User',
      password: 'Passwort1!',
      role: 'User',
      tenantIds: [tenant.id],
      defaultTenantId: tenant.id,
    });
  });

  it('detects when the current user is the last active admin', async () => {
    const usersApi = {
      list: vi.fn().mockReturnValue(of(listResponse)),
      create: vi.fn(),
      update: vi.fn(),
      bulkUpdate: vi.fn(),
      delete: vi.fn(),
    };
    const authService = {
      user: signal<UserDto | null>(user),
    };
    const tenantsApi = {
      list: vi.fn().mockReturnValue(of({ items: [tenant], meta: listResponse.meta })),
    };

    await TestBed.configureTestingModule({
      imports: [UsersComponent],
      providers: [
        provideAnimationsAsync(),
        provideI18nTesting(),
        provideNzIcons([
          CheckCircleOutline,
          CloseCircleOutline,
          DeleteOutline,
          DownOutline,
          EditOutline,
          EyeInvisibleOutline,
          EyeOutline,
          SaveOutline,
          SyncOutline,
          UndoOutline,
          UserAddOutline,
        ]),
        { provide: UserApiService, useValue: usersApi },
        { provide: TenantApiService, useValue: tenantsApi },
        { provide: AuthService, useValue: authService },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(UsersComponent);
    fixture.detectChanges();
    await fixture.whenStable();

    const row = fixture.componentInstance.rows()[0];

    expect(fixture.componentInstance.isLastActiveAdminSelf(row)).toBe(true);
  });

  it('keeps table actions focused on creation after a row form changes', async () => {
    const { fixture } = await createComponent();
    const compiled = fixture.nativeElement as HTMLElement;
    const row = fixture.componentInstance.rows()[0];

    expect(compiled.querySelector('.app-table-panel__actions')?.textContent).toContain(
      'Create user',
    );
    expect(compiled.querySelector('.app-table-panel__actions')?.textContent).not.toContain(
      'Save changes',
    );
    expect(compiled.querySelector('.app-table-panel__actions')?.textContent).not.toContain(
      'Revert changes',
    );
    expect(fixture.componentInstance.hasPendingChanges()).toBe(false);

    row.form.controls.displayName.setValue('Admin Updated');
    fixture.detectChanges();

    expect(compiled.querySelector('.app-table-panel__actions')?.textContent).toContain(
      'Create user',
    );
    expect(compiled.querySelector('.app-table-panel__actions')?.textContent).not.toContain(
      'Save changes',
    );
    expect(compiled.querySelector('.app-table-panel__actions')?.textContent).not.toContain(
      'Revert changes',
    );
    expect(fixture.componentInstance.hasPendingChanges()).toBe(false);
  });

  it('reverts changed user rows to their loaded values', async () => {
    const { fixture } = await createComponent();
    const compiled = fixture.nativeElement as HTMLElement;
    const row = fixture.componentInstance.rows()[0];
    row.form.controls.displayName.setValue('Admin Updated');

    fixture.componentInstance.revertChanges();
    fixture.detectChanges();

    expect(row.form.controls.displayName.value).toBe('Admin');
    expect(fixture.componentInstance.hasPendingChanges()).toBe(false);
    expect(compiled.querySelector('.app-table-panel__actions')?.textContent).toContain(
      'Create user',
    );
    expect(compiled.querySelector('.app-table-panel__actions')?.textContent).not.toContain(
      'Save changes',
    );
  });

  it('bulk saves changed rows and resets pending changes', async () => {
    const updatedUser = { ...user, displayName: 'Admin Updated' };
    const usersApi = {
      list: vi.fn().mockReturnValue(of(listResponse)),
      create: vi.fn(),
      update: vi.fn(),
      bulkUpdate: vi.fn().mockReturnValue(of({ users: [updatedUser] })),
      delete: vi.fn(),
    };
    const { fixture } = await createComponent({ usersApi });
    const row = fixture.componentInstance.rows()[0];
    row.form.controls.displayName.setValue('Admin Updated');

    fixture.componentInstance.saveChanges();
    fixture.detectChanges();

    expect(usersApi.bulkUpdate).toHaveBeenCalledWith({
      updates: [
        {
          id: user.id,
          changes: { displayName: 'Admin Updated' },
        },
      ],
    });
    expect(usersApi.update).not.toHaveBeenCalled();
    expect(fixture.componentInstance.rows()[0].form.controls.displayName.value).toBe(
      'Admin Updated',
    );
    expect(fixture.componentInstance.hasPendingChanges()).toBe(false);
  });

  it('sends disabled user changes as inactive updates', async () => {
    const usersApi = {
      list: vi.fn().mockReturnValue(of(listResponse)),
      create: vi.fn(),
      update: vi.fn(),
      bulkUpdate: vi.fn().mockReturnValue(of({ users: [{ ...user, isActive: false }] })),
      delete: vi.fn(),
    };
    const { fixture } = await createComponent({ usersApi });
    const row = fixture.componentInstance.rows()[0];
    row.form.controls.isDisabled.setValue(true);

    fixture.componentInstance.saveChanges();
    fixture.detectChanges();

    expect(usersApi.bulkUpdate).toHaveBeenCalledWith({
      updates: [
        {
          id: user.id,
          changes: { isActive: false },
        },
      ],
    });
  });

  it('deletes users from the table', async () => {
    const removableUser: UserDto = {
      ...user,
      id: '00000000-0000-4000-8000-000000000099',
      username: 'user',
      displayName: 'Regular User',
      role: 'User',
    };
    const usersApi = {
      list: vi.fn().mockReturnValue(
        of({
          items: [removableUser],
          meta: listResponse.meta,
        }),
      ),
      create: vi.fn(),
      update: vi.fn(),
      bulkUpdate: vi.fn(),
      delete: vi.fn().mockReturnValue(of({ success: true })),
    };
    const { fixture } = await createComponent({ usersApi });
    const row = fixture.componentInstance.rows()[0];

    fixture.componentInstance.deleteUser(row);
    fixture.detectChanges();

    expect(usersApi.delete).toHaveBeenCalledWith(removableUser.id);
    expect(fixture.componentInstance.rows()).toHaveLength(0);
  });

  it('keeps the edit dialog open when saving user changes fails', async () => {
    const usersApi = {
      list: vi.fn().mockReturnValue(of(listResponse)),
      create: vi.fn(),
      update: vi.fn(),
      bulkUpdate: vi.fn().mockReturnValue(throwError(() => new Error('failed'))),
      delete: vi.fn(),
    };
    const { fixture } = await createComponent({ usersApi });
    const row = fixture.componentInstance.rows()[0];
    fixture.componentInstance.openEditDialog(row);
    fixture.componentInstance.editUserForm.controls.displayName.setValue('Admin Updated');

    fixture.componentInstance.saveEditDialog();
    fixture.detectChanges();

    expect(fixture.componentInstance.error()).toBe('users.errors.saveFailed');
    expect(fixture.componentInstance.isEditDialogOpen()).toBe(true);
    expect(fixture.componentInstance.editUserForm.controls.displayName.value).toBe('Admin Updated');
  });

  it('renders users without table pagination and appends the next page', async () => {
    const nextUser: UserDto = {
      ...user,
      id: '00000000-0000-4000-8000-000000000002',
      username: 'second',
      displayName: 'Second User',
      role: 'User',
    };
    const usersApi = {
      list: vi.fn().mockReturnValueOnce(
        of({
          ...listResponse,
          meta: {
            page: 1,
            pageSize: 50,
            totalItems: 2,
            totalPages: 2,
          },
        }),
      ),
      create: vi.fn(),
      update: vi.fn(),
      bulkUpdate: vi.fn(),
      delete: vi.fn(),
    };
    const authService = {
      user: signal<UserDto | null>(user),
    };
    const tenantsApi = {
      list: vi.fn().mockReturnValue(of({ items: [tenant], meta: listResponse.meta })),
    };

    await TestBed.configureTestingModule({
      imports: [UsersComponent],
      providers: [
        provideAnimationsAsync(),
        provideI18nTesting(),
        provideNzIcons([
          CheckCircleOutline,
          CloseCircleOutline,
          DeleteOutline,
          DownOutline,
          EditOutline,
          EyeInvisibleOutline,
          EyeOutline,
          SaveOutline,
          SyncOutline,
          UndoOutline,
          UserAddOutline,
        ]),
        { provide: UserApiService, useValue: usersApi },
        { provide: TenantApiService, useValue: tenantsApi },
        { provide: AuthService, useValue: authService },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(UsersComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    usersApi.list.mockReturnValueOnce(
      of({
        items: [nextUser],
        meta: {
          page: 2,
          pageSize: 50,
          totalItems: 2,
          totalPages: 2,
        },
      }),
    );

    fixture.componentInstance.loadNextPage();

    expect((fixture.nativeElement as HTMLElement).querySelector('nz-pagination')).toBeNull();
    expect(usersApi.list).toHaveBeenLastCalledWith(2, 50);
    expect(fixture.componentInstance.rows().map((row) => row.username)).toEqual([
      'admin',
      'second',
    ]);
  });
});
