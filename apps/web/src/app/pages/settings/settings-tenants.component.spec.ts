import { TestBed } from '@angular/core/testing';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import {
  DeleteOutline,
  EditOutline,
  PlusOutline,
  SaveOutline,
  UndoOutline,
} from '@ant-design/icons-angular/icons';
import { provideNzIcons } from 'ng-zorro-antd/icon';
import { of, throwError } from 'rxjs';
import {
  type ListTenantsWithCountsResponse,
  type TenantWithCounts,
  TenantApiService,
} from '../../core/api/tenant-api.service';
import { provideI18nTesting } from '../../testing/i18n-testing';
import { SettingsTenantsComponent } from './settings-tenants.component';

const now = '2026-06-04T00:00:00.000Z';

const tenant: TenantWithCounts = {
  id: '00000000-0000-4000-8000-000000000301',
  key: 'main',
  name: 'Main Tenant',
  scannerImportPath: '/scan/main',
  isActive: true,
  userCount: 2,
  documentCount: 7,
  createdAt: now,
  updatedAt: now,
};

const targetTenant: TenantWithCounts = {
  id: '00000000-0000-4000-8000-000000000302',
  key: 'archive',
  name: 'Archive Tenant',
  scannerImportPath: null,
  isActive: true,
  userCount: 1,
  documentCount: 0,
  createdAt: now,
  updatedAt: now,
};

const listResponse: ListTenantsWithCountsResponse = {
  items: [tenant, targetTenant],
  meta: {
    page: 1,
    pageSize: 100,
    totalItems: 2,
    totalPages: 1,
  },
};

function buttonByText(root: HTMLElement, text: string): HTMLButtonElement | undefined {
  return Array.from(root.querySelectorAll<HTMLButtonElement>('button')).find((button) =>
    button.textContent?.includes(text),
  );
}

function headerTexts(root: HTMLElement): string[] {
  return Array.from(root.querySelectorAll('thead tr:first-child th')).map(
    (header) => header.textContent?.trim() ?? '',
  );
}

describe('SettingsTenantsComponent', () => {
  async function createFixture(overrides: Partial<TenantApiMock> = {}) {
    const tenantsApi: TenantApiMock = {
      create: vi.fn().mockReturnValue(of(tenant)),
      delete: vi.fn().mockReturnValue(of({ success: true })),
      list: vi.fn().mockReturnValue(of(listResponse)),
      update: vi.fn().mockReturnValue(of(tenant)),
      ...overrides,
    };

    await TestBed.configureTestingModule({
      imports: [SettingsTenantsComponent],
      providers: [
        provideAnimationsAsync(),
        provideI18nTesting(),
        provideNzIcons([DeleteOutline, EditOutline, PlusOutline, SaveOutline, UndoOutline]),
        { provide: TenantApiService, useValue: tenantsApi },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(SettingsTenantsComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    return { fixture, tenantsApi };
  }

  it('renders tenants as a read-only table with count columns and row actions', async () => {
    const { fixture } = await createFixture();
    const compiled = fixture.nativeElement as HTMLElement;

    expect(compiled.querySelectorAll('app-table-panel').length).toBe(1);
    expect(compiled.querySelectorAll('nz-table').length).toBe(1);
    expect(compiled.querySelector('.ant-pagination')).toBeNull();
    expect(headerTexts(compiled)).toEqual([
      'Name',
      'Key',
      'Scanner import path',
      'Users',
      'Documents',
      'Disabled',
      '',
    ]);
    expect(headerTexts(compiled).at(-1)).toBe('');
    expect(compiled.textContent).toContain('Users');
    expect(compiled.textContent).toContain('Documents');
    expect(compiled.textContent).toContain('2');
    expect(compiled.textContent).toContain('7');
    expect(compiled.querySelectorAll('.tenants-table tbody input[nz-input]')).toHaveLength(0);
    expect(compiled.querySelector('.tenants-table tbody .anticon-edit')).not.toBeNull();
  });

  it('renders only the configured empty state when no tenants exist', async () => {
    const { fixture } = await createFixture({
      list: vi.fn().mockReturnValue(
        of({
          items: [],
          meta: {
            page: 1,
            pageSize: 100,
            totalItems: 0,
            totalPages: 0,
          },
        }),
      ),
    });
    const compiled = fixture.nativeElement as HTMLElement;
    const text = compiled.textContent ?? '';

    expect(text.match(/No tenants configured\./g)).toHaveLength(1);
    expect(text).not.toContain('No Data');
    expect(compiled.querySelector('.tenants-table .empty-state')).toBeNull();
  });

  it('opens an edit dialog and saves tenant changes', async () => {
    const { fixture } = await createFixture();
    const component = fixture.componentInstance;
    const compiled = fixture.nativeElement as HTMLElement;
    const row = component.rows()[0];

    expect(component.hasPendingChanges()).toBe(false);
    expect(compiled.querySelector('.app-table-panel__actions')?.textContent).toContain(
      'New tenant',
    );
    expect(compiled.querySelector('.app-table-panel__actions')?.textContent).not.toContain(
      'Save changes',
    );
    expect(compiled.querySelector('.app-table-panel__actions')?.textContent).not.toContain(
      'Revert changes',
    );

    component.openEditDialog(row);
    component.editForm.controls.name.setValue('Updated Tenant');
    fixture.detectChanges();

    expect(component.isEditDialogOpen()).toBe(true);
    expect(component.hasPendingChanges()).toBe(false);

    component.saveEditDialog();
    fixture.detectChanges();

    expect(component.isEditDialogOpen()).toBe(false);
    expect(component.rows()[0].original.name).toBe('Main Tenant');
  });

  it('creates tenants from the dialog and saves existing rows through the edit dialog', async () => {
    const createdTenant: TenantWithCounts = {
      ...tenant,
      id: '00000000-0000-4000-8000-000000000303',
      key: 'new_tenant',
      name: 'New Tenant',
      userCount: 0,
      documentCount: 0,
    };
    const { fixture, tenantsApi } = await createFixture({
      create: vi.fn().mockReturnValue(of(createdTenant)),
    });
    const component = fixture.componentInstance;
    component.openCreateDialog();
    component.createForm.controls.name.setValue('New Tenant');

    component.createTenant();
    fixture.detectChanges();

    expect(tenantsApi.create).toHaveBeenCalledWith({
      key: 'new_tenant',
      name: 'New Tenant',
      scannerImportPath: 'new_tenant',
      isActive: true,
    });
    expect(component.rows()).toHaveLength(3);
    expect(component.isCreateDialogOpen()).toBe(false);

    component.openEditDialog(component.rows()[0]);
    component.editForm.controls.name.setValue('Updated Tenant');
    component.saveEditDialog();
    fixture.detectChanges();

    expect(tenantsApi.create).toHaveBeenCalledTimes(1);
    expect(tenantsApi.update).toHaveBeenCalledWith(tenant.id, {
      name: 'Updated Tenant',
    });
    expect(component.hasPendingChanges()).toBe(false);
  });

  it('generates create key and scanner import path from the tenant name until fields are set', async () => {
    const { fixture } = await createFixture();
    const component = fixture.componentInstance;
    component.openCreateDialog();

    component.createForm.controls.name.setValue('New Tenant');
    expect(component.createForm.controls.key.value).toBe('new_tenant');
    expect(component.createForm.controls.scannerImportPath.value).toBe('new_tenant');

    component.createForm.controls.key.setValue('custom_key');
    component.createForm.controls.scannerImportPath.setValue('custom-import');
    component.createForm.controls.name.setValue('Renamed Tenant');

    expect(component.createForm.controls.key.value).toBe('custom_key');
    expect(component.createForm.controls.scannerImportPath.value).toBe('custom-import');
    fixture.detectChanges();
  });

  it('does not call create for invalid dialog values', async () => {
    const { fixture, tenantsApi } = await createFixture();
    const component = fixture.componentInstance;

    component.openCreateDialog();
    component.createForm.controls.key.setValue('');
    component.createForm.controls.name.setValue('');
    component.createTenant();

    expect(component.rows()).toHaveLength(2);
    expect(component.isCreateDialogOpen()).toBe(true);
    expect(tenantsApi.create).not.toHaveBeenCalled();
  });

  it('keeps the create dialog open when tenant creation fails', async () => {
    const { fixture, tenantsApi } = await createFixture({
      create: vi.fn().mockReturnValue(throwError(() => new Error('failed'))),
    });
    const component = fixture.componentInstance;

    component.openCreateDialog();
    component.createForm.controls.key.setValue('new_tenant');
    component.createForm.controls.name.setValue('New Tenant');
    component.createTenant();
    fixture.detectChanges();

    expect(tenantsApi.create).toHaveBeenCalled();
    expect(component.isCreateDialogOpen()).toBe(true);
    expect(component.rows()).toHaveLength(2);
    expect(component.error()).toBe('tenants.errors.createFailed');
  });

  it('requires tenant name confirmation before deleting documents with the tenant', async () => {
    const { fixture, tenantsApi } = await createFixture();
    const component = fixture.componentInstance;
    const row = component.rows()[0];
    component.openDeleteDialog(row);
    component.deleteForm.controls.confirmationName.setValue('Wrong Tenant');
    component.deleteForm.controls.documentAction.setValue('DELETE');

    expect(component.canDeleteTenant()).toBe(false);
    component.confirmDeleteTenant();
    expect(tenantsApi.delete).not.toHaveBeenCalled();

    component.deleteForm.controls.confirmationName.setValue('Main Tenant');
    expect(component.canDeleteTenant()).toBe(true);
    component.confirmDeleteTenant();
    fixture.detectChanges();

    expect(tenantsApi.delete).toHaveBeenCalledWith(tenant.id, {
      confirmationName: 'Main Tenant',
      documentAction: 'DELETE',
      userAction: 'REMOVE_ASSIGNMENTS',
    });
    expect(component.deleteTenant()).toBeNull();
  });

  it('requires a different target tenant when moving documents during deletion', async () => {
    const { fixture, tenantsApi } = await createFixture();
    const component = fixture.componentInstance;
    const row = component.rows()[0];
    component.openDeleteDialog(row);
    component.deleteForm.controls.confirmationName.setValue('Main Tenant');
    component.deleteForm.controls.documentAction.setValue('MOVE');

    expect(component.canDeleteTenant()).toBe(false);

    component.deleteForm.controls.targetTenantId.setValue(tenant.id);
    expect(component.canDeleteTenant()).toBe(false);

    component.deleteForm.controls.targetTenantId.setValue(targetTenant.id);
    expect(component.canDeleteTenant()).toBe(true);
    component.confirmDeleteTenant();
    fixture.detectChanges();

    expect(tenantsApi.delete).toHaveBeenCalledWith(tenant.id, {
      confirmationName: 'Main Tenant',
      documentAction: 'MOVE',
      targetTenantId: targetTenant.id,
      userAction: 'REMOVE_ASSIGNMENTS',
    });
  });

  it('keeps the delete dialog open when deletion fails', async () => {
    const { fixture } = await createFixture({
      delete: vi.fn().mockReturnValue(throwError(() => new Error('failed'))),
    });
    const component = fixture.componentInstance;
    component.openDeleteDialog(component.rows()[0]);
    component.deleteForm.controls.confirmationName.setValue('Main Tenant');
    component.deleteForm.controls.documentAction.setValue('DELETE');

    component.confirmDeleteTenant();
    fixture.detectChanges();

    expect(component.deleteTenant()).not.toBeNull();
    expect(component.error()).toBe('tenants.errors.deleteFailed');
  });
});

interface TenantApiMock {
  readonly create: ReturnType<typeof vi.fn>;
  readonly delete: ReturnType<typeof vi.fn>;
  readonly list: ReturnType<typeof vi.fn>;
  readonly update: ReturnType<typeof vi.fn>;
}
