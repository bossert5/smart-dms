import { TestBed } from '@angular/core/testing';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import {
  DeleteOutline,
  HolderOutline,
  PlusOutline,
  SaveOutline,
  UndoOutline,
} from '@ant-design/icons-angular/icons';
import type { DocumentFieldDefinitionDto, DocumentTypeDto } from '@smart-dms/shared-dto';
import { provideNzIcons } from 'ng-zorro-antd/icon';
import { of, throwError } from 'rxjs';
import { SettingsApiService } from '../../core/api/settings-api.service';
import { provideI18nTesting } from '../../testing/i18n-testing';
import { SettingsDocumentsComponent } from './settings-documents.component';

const now = '2026-05-08T00:00:00.000Z';

const systemDocumentType: DocumentTypeDto = {
  id: '00000000-0000-4000-8000-000000000101',
  key: 'invoice',
  name: 'Invoice',
  active: true,
  isSystem: true,
  displayOrder: 10,
  createdAt: now,
  updatedAt: now,
};

const customDocumentType: DocumentTypeDto = {
  id: '00000000-0000-4000-8000-000000000102',
  key: 'custom',
  name: 'Custom',
  active: true,
  isSystem: false,
  displayOrder: 20,
  createdAt: now,
  updatedAt: now,
};

const fieldDefinition: DocumentFieldDefinitionDto = {
  id: '00000000-0000-4000-8000-000000000201',
  key: 'customer_number',
  label: 'Customer number',
  valueType: 'TEXT',
  required: false,
  active: true,
  displayOrder: 10,
  appliesToAllDocumentTypes: false,
  documentTypeIds: [systemDocumentType.id, customDocumentType.id],
  includeInFullTextSearch: true,
  includeInAiExtraction: true,
  createdAt: now,
  updatedAt: now,
};

const secondFieldDefinition: DocumentFieldDefinitionDto = {
  ...fieldDefinition,
  id: '00000000-0000-4000-8000-000000000202',
  key: 'amount',
  label: 'Amount',
  valueType: 'NUMBER',
  displayOrder: 20,
};

function buttonsByText(root: HTMLElement, text: string): HTMLButtonElement[] {
  return Array.from(root.querySelectorAll<HTMLButtonElement>('button')).filter((button) =>
    button.textContent?.includes(text),
  );
}

function tableHeaders(root: HTMLElement, tableClass: string): string[] {
  return Array.from(root.querySelectorAll(`${tableClass} thead tr:first-child th`)).map(
    (header) => header.textContent?.trim() ?? '',
  );
}

function expectCreateOnly(root: Element, createLabel: string): void {
  const text = root.textContent ?? '';

  expect(text).toContain(createLabel);
  expect(text).not.toContain('Revert changes');
  expect(text).not.toContain('Save changes');
}

describe('SettingsDocumentsComponent', () => {
  async function createFixture(overrides: Partial<SettingsApiMock> = {}) {
    const settingsApi: SettingsApiMock = {
      createDocumentType: vi.fn().mockReturnValue(of(customDocumentType)),
      createFieldDefinition: vi.fn().mockReturnValue(of(fieldDefinition)),
      deleteDocumentType: vi.fn().mockReturnValue(of({ success: true })),
      deleteFieldDefinition: vi.fn().mockReturnValue(of({ success: true })),
      documentTypes: vi.fn().mockReturnValue(of([systemDocumentType, customDocumentType])),
      fieldDefinitions: vi.fn().mockReturnValue(of([fieldDefinition])),
      reorderDocumentTypes: vi.fn().mockReturnValue(of([systemDocumentType, customDocumentType])),
      updateDocumentType: vi.fn().mockReturnValue(of(customDocumentType)),
      updateFieldDefinition: vi.fn().mockReturnValue(of(fieldDefinition)),
      ...overrides,
    };

    await TestBed.configureTestingModule({
      imports: [SettingsDocumentsComponent],
      providers: [
        provideAnimationsAsync(),
        provideI18nTesting(),
        provideNzIcons([DeleteOutline, HolderOutline, PlusOutline, SaveOutline, UndoOutline]),
        { provide: SettingsApiService, useValue: settingsApi },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(SettingsDocumentsComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    return { fixture, settingsApi };
  }

  it('renders both document tabs as table panels without duplicate headings', async () => {
    const { fixture } = await createFixture();
    const compiled = fixture.nativeElement as HTMLElement;

    expect(compiled.querySelector('h2')).toBeNull();
    expect(compiled.textContent).toContain('Document types');
    expect(compiled.textContent).toContain('Additional fields');
    expect(compiled.querySelectorAll('app-table-panel').length).toBe(2);
    expect(compiled.querySelectorAll('nz-table').length).toBe(2);
    expectCreateOnly(compiled.querySelectorAll('app-table-actions')[0], 'Create document type');
    expectCreateOnly(compiled.querySelectorAll('app-table-actions')[1], 'Create additional field');
    expect(compiled.querySelector('.ant-pagination')).toBeNull();
    expect(tableHeaders(compiled, '.document-types-table')).toEqual([
      '',
      'Key',
      'Name',
      'Disabled',
      '',
    ]);
    expect(tableHeaders(compiled, '.field-definitions-table')).toEqual([
      '',
      'Key',
      'Label',
      'Type',
      'All document types',
      'Document types',
      'Required field',
      'FTS',
      'AI',
      'Disabled',
      '',
    ]);
    expect(compiled.textContent).not.toContain('Display order');
    expect(compiled.textContent).toContain('Invoice');
    expect(compiled.textContent).toContain('Custom');
    expect(fixture.componentInstance.fieldDefinitionRows()[0].form.controls.label.value).toBe(
      'Customer number',
    );
  });

  it('keeps system document type key and name locked and prevents removal', async () => {
    const { fixture, settingsApi } = await createFixture();
    const systemRow = fixture.componentInstance.visibleDocumentTypeRows()[0];

    expect(systemRow.form.controls.key.disabled).toBe(true);
    expect(systemRow.form.controls.name.disabled).toBe(true);
    fixture.componentInstance.deleteDocumentType(systemRow);
    expect(fixture.componentInstance.visibleDocumentTypeRows()).toHaveLength(2);
    expect(fixture.componentInstance.hasPendingChanges()).toBe(false);
    expect(settingsApi.deleteDocumentType).not.toHaveBeenCalled();
  });

  it('shows document type save controls after an inline edit and reverts changes', async () => {
    const { fixture } = await createFixture();
    const compiled = fixture.nativeElement as HTMLElement;
    const customRow = fixture.componentInstance.visibleDocumentTypeRows()[1];

    expect(fixture.componentInstance.hasPendingChanges()).toBe(false);
    expect(compiled.textContent).toContain('Create document type');
    expect(compiled.textContent).not.toContain('Save changes');
    expect(compiled.textContent).not.toContain('Revert changes');

    customRow.form.controls.name.setValue('Updated custom');
    fixture.detectChanges();

    expect(fixture.componentInstance.hasPendingChanges()).toBe(true);
    expect(compiled.textContent).not.toContain('Create document type');
    expect(buttonsByText(compiled, 'Save changes').some((button) => !button.disabled)).toBe(true);
    expect(buttonsByText(compiled, 'Revert changes').some((button) => !button.disabled)).toBe(true);

    fixture.componentInstance.revertDocumentTypeChanges();
    fixture.detectChanges();

    expect(customRow.form.controls.name.value).toBe('Custom');
    expect(fixture.componentInstance.hasPendingChanges()).toBe(false);
    expect(compiled.textContent).toContain('Create document type');
    expect(compiled.textContent).not.toContain('Save changes');
    expect(compiled.textContent).not.toContain('Revert changes');
  });

  it('opens create dialogs without marking table changes as pending', async () => {
    const { fixture } = await createFixture();

    fixture.componentInstance.addDocumentType();
    fixture.componentInstance.addFieldDefinition();
    fixture.detectChanges();

    expect(fixture.componentInstance.isDocumentTypeCreateDialogOpen()).toBe(true);
    expect(fixture.componentInstance.isFieldDefinitionCreateDialogOpen()).toBe(true);
    expect(fixture.componentInstance.visibleDocumentTypeRows()).toHaveLength(2);
    expect(fixture.componentInstance.fieldDefinitionRows()).toHaveLength(1);
    expect(fixture.componentInstance.hasPendingChanges()).toBe(false);

    fixture.componentInstance.closeDocumentTypeCreateDialog();
    fixture.componentInstance.closeFieldDefinitionCreateDialog();
    fixture.detectChanges();

    expect(fixture.componentInstance.visibleDocumentTypeRows()).toHaveLength(2);
    expect(fixture.componentInstance.fieldDefinitionRows()).toHaveLength(1);
    expect(fixture.componentInstance.hasPendingChanges()).toBe(false);
  });

  it('creates document types directly from the dialog', async () => {
    const createdDocumentType: DocumentTypeDto = {
      ...customDocumentType,
      id: '00000000-0000-4000-8000-000000000103',
      key: 'draft',
      name: 'Draft',
    };
    const settingsApi: Partial<SettingsApiMock> = {
      createDocumentType: vi.fn().mockReturnValue(of(createdDocumentType)),
    };
    const { fixture, settingsApi: api } = await createFixture(settingsApi);
    const component = fixture.componentInstance;

    component.addDocumentType();
    component.createDocumentTypeForm.controls.key.setValue('draft');
    component.createDocumentTypeForm.controls.name.setValue('Draft');
    component.createDocumentType();
    fixture.detectChanges();

    expect(api.createDocumentType).toHaveBeenCalledWith({
      key: 'draft',
      name: 'Draft',
      active: true,
      displayOrder: 30,
    });
    expect(component.visibleDocumentTypeRows()).toHaveLength(3);
    expect(component.isDocumentTypeCreateDialogOpen()).toBe(false);
    expect(component.hasPendingChanges()).toBe(false);
  });

  it('saves document type inline edits and order changes', async () => {
    const { fixture, settingsApi: api } = await createFixture();
    const component = fixture.componentInstance;
    const systemRow = component.visibleDocumentTypeRows()[0];
    systemRow.form.controls.isDisabled.setValue(true);
    component.dropDocumentType({ previousIndex: 1, currentIndex: 0 } as never);

    component.saveDocumentTypeChanges();
    fixture.detectChanges();

    expect(api.updateDocumentType).toHaveBeenCalledWith(systemDocumentType.id, {
      active: false,
    });
    expect(api.deleteDocumentType).not.toHaveBeenCalled();
    expect(api.reorderDocumentTypes).toHaveBeenCalledWith({
      documentTypeIds: [customDocumentType.id, systemDocumentType.id],
    });
    expect(component.hasPendingChanges()).toBe(false);
  });

  it('deletes document types immediately after confirmation', async () => {
    const { fixture, settingsApi } = await createFixture();
    const component = fixture.componentInstance;
    const customRow = component.visibleDocumentTypeRows()[1];

    component.deleteDocumentType(customRow);
    fixture.detectChanges();

    expect(settingsApi.deleteDocumentType).toHaveBeenCalledWith(customDocumentType.id);
    expect(component.visibleDocumentTypeRows().map((row) => row.id)).toEqual([
      systemDocumentType.id,
    ]);
    expect(component.hasPendingChanges()).toBe(false);
  });

  it('keeps pending document type edits after an immediate delete', async () => {
    const { fixture, settingsApi } = await createFixture();
    const component = fixture.componentInstance;
    const systemRow = component.visibleDocumentTypeRows()[0];
    const customRow = component.visibleDocumentTypeRows()[1];
    systemRow.form.controls.isDisabled.setValue(true);

    component.deleteDocumentType(customRow);
    fixture.detectChanges();

    expect(settingsApi.deleteDocumentType).toHaveBeenCalledWith(customDocumentType.id);
    expect(settingsApi.updateDocumentType).not.toHaveBeenCalled();
    expect(component.hasPendingChanges()).toBe(true);
  });

  it('keeps document type rows when immediate deletion fails', async () => {
    const { fixture } = await createFixture({
      deleteDocumentType: vi.fn().mockReturnValue(throwError(() => new Error('failed'))),
    });
    const component = fixture.componentInstance;
    const customRow = component.visibleDocumentTypeRows()[1];

    component.deleteDocumentType(customRow);
    fixture.detectChanges();

    expect(component.visibleDocumentTypeRows()).toHaveLength(2);
    expect(component.error()).toBe('settings.documents.errors.documentTypeRemoveFailed');
  });

  it('creates field definitions directly and saves inline edits separately', async () => {
    const createdField: DocumentFieldDefinitionDto = {
      ...fieldDefinition,
      id: '00000000-0000-4000-8000-000000000202',
      key: 'amount',
      label: 'Amount',
      displayOrder: 20,
    };
    const { fixture, settingsApi } = await createFixture({
      createFieldDefinition: vi.fn().mockReturnValue(of(createdField)),
    });
    const component = fixture.componentInstance;
    const row = component.fieldDefinitionRows()[0];
    row.form.controls.label.setValue('Customer ID');
    component.addFieldDefinition();
    component.createFieldDefinitionForm.controls.key.setValue('amount');
    component.createFieldDefinitionForm.controls.label.setValue('Amount');
    component.createFieldDefinitionForm.controls.valueType.setValue('NUMBER');

    component.createFieldDefinition();
    fixture.detectChanges();

    expect(settingsApi.createFieldDefinition).toHaveBeenCalledWith({
      key: 'amount',
      label: 'Amount',
      valueType: 'NUMBER',
      displayOrder: 20,
      active: true,
      required: false,
      appliesToAllDocumentTypes: true,
      documentTypeIds: [],
      includeInFullTextSearch: false,
      includeInAiExtraction: false,
    });
    expect(component.fieldDefinitionRows()).toHaveLength(2);
    expect(component.isFieldDefinitionCreateDialogOpen()).toBe(false);

    component.saveFieldDefinitionChanges();
    fixture.detectChanges();

    expect(settingsApi.createFieldDefinition).toHaveBeenCalledTimes(1);
    expect(settingsApi.updateFieldDefinition).toHaveBeenCalledWith(fieldDefinition.id, {
      label: 'Customer ID',
    });
    expect(component.hasPendingChanges()).toBe(false);
  });

  it('deletes additional fields immediately after confirmation', async () => {
    const { fixture, settingsApi } = await createFixture({
      fieldDefinitions: vi.fn().mockReturnValue(of([fieldDefinition, secondFieldDefinition])),
    });
    const component = fixture.componentInstance;
    const row = component.visibleFieldDefinitionRows()[0];

    component.deleteFieldDefinition(row);
    fixture.detectChanges();

    expect(settingsApi.deleteFieldDefinition).toHaveBeenCalledWith(fieldDefinition.id);
    expect(component.visibleFieldDefinitionRows()).toHaveLength(1);
    expect(component.hasPendingChanges()).toBe(false);
  });

  it('keeps additional field rows when immediate deletion fails', async () => {
    const { fixture } = await createFixture({
      deleteFieldDefinition: vi.fn().mockReturnValue(throwError(() => new Error('failed'))),
      fieldDefinitions: vi.fn().mockReturnValue(of([fieldDefinition, secondFieldDefinition])),
    });
    const component = fixture.componentInstance;
    const row = component.visibleFieldDefinitionRows()[0];

    component.deleteFieldDefinition(row);
    fixture.detectChanges();

    expect(component.visibleFieldDefinitionRows()).toHaveLength(2);
    expect(component.error()).toBe('settings.documents.errors.fieldRemoveFailed');
  });

  it('keeps the create dialog open when additional field creation fails', async () => {
    const { fixture } = await createFixture({
      createFieldDefinition: vi.fn().mockReturnValue(throwError(() => new Error('failed'))),
    });
    const component = fixture.componentInstance;

    component.addFieldDefinition();
    component.createFieldDefinitionForm.controls.key.setValue('amount');
    component.createFieldDefinitionForm.controls.label.setValue('Amount');
    component.createFieldDefinition();
    fixture.detectChanges();

    expect(component.isFieldDefinitionCreateDialogOpen()).toBe(true);
    expect(component.fieldDefinitionRows()).toHaveLength(1);
    expect(component.error()).toBe('settings.documents.errors.fieldCreateFailed');
  });

  it('saves additional field order from drag position and reverts to the loaded order', async () => {
    const { fixture, settingsApi } = await createFixture({
      fieldDefinitions: vi.fn().mockReturnValue(of([fieldDefinition, secondFieldDefinition])),
    });
    const component = fixture.componentInstance;

    component.dropFieldDefinition({ previousIndex: 1, currentIndex: 0 } as never);
    fixture.detectChanges();

    expect(component.fieldDefinitionRows().map((row) => row.id)).toEqual([
      secondFieldDefinition.id,
      fieldDefinition.id,
    ]);
    expect(component.hasPendingChanges()).toBe(true);

    component.revertFieldDefinitionChanges();
    fixture.detectChanges();

    expect(component.fieldDefinitionRows().map((row) => row.id)).toEqual([
      fieldDefinition.id,
      secondFieldDefinition.id,
    ]);
    expect(component.hasPendingChanges()).toBe(false);

    component.dropFieldDefinition({ previousIndex: 1, currentIndex: 0 } as never);
    component.saveFieldDefinitionChanges();
    fixture.detectChanges();

    expect(settingsApi.updateFieldDefinition).toHaveBeenCalledWith(secondFieldDefinition.id, {
      displayOrder: 10,
    });
    expect(settingsApi.updateFieldDefinition).toHaveBeenCalledWith(fieldDefinition.id, {
      displayOrder: 20,
    });
  });

  it('keeps pending document type changes when save fails', async () => {
    const { fixture } = await createFixture({
      updateDocumentType: vi.fn().mockReturnValue(throwError(() => new Error('failed'))),
    });
    const row = fixture.componentInstance.visibleDocumentTypeRows()[1];
    row.form.controls.name.setValue('Updated custom');

    fixture.componentInstance.saveDocumentTypeChanges();
    fixture.detectChanges();

    expect(fixture.componentInstance.error()).toBe(
      'settings.documents.errors.documentTypeSaveFailed',
    );
    expect(fixture.componentInstance.hasPendingChanges()).toBe(true);
    expect(row.form.controls.name.value).toBe('Updated custom');
  });
});

interface SettingsApiMock {
  readonly createDocumentType: ReturnType<typeof vi.fn>;
  readonly createFieldDefinition: ReturnType<typeof vi.fn>;
  readonly deleteDocumentType: ReturnType<typeof vi.fn>;
  readonly deleteFieldDefinition: ReturnType<typeof vi.fn>;
  readonly documentTypes: ReturnType<typeof vi.fn>;
  readonly fieldDefinitions: ReturnType<typeof vi.fn>;
  readonly reorderDocumentTypes: ReturnType<typeof vi.fn>;
  readonly updateDocumentType: ReturnType<typeof vi.fn>;
  readonly updateFieldDefinition: ReturnType<typeof vi.fn>;
}
