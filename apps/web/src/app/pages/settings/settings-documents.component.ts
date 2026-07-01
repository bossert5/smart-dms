import { CdkDragDrop, DragDropModule, moveItemInArray } from '@angular/cdk/drag-drop';
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
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import type {
  CreateDocumentFieldDefinitionRequest,
  CreateDocumentTypeRequest,
  DocumentAttributeValueType,
  DocumentFieldDefinitionDto,
  DocumentTypeDto,
  UpdateDocumentFieldDefinitionRequest,
  UpdateDocumentTypeRequest,
} from '@smart-dms/shared-dto';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzCheckboxModule } from 'ng-zorro-antd/checkbox';
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzPopconfirmModule } from 'ng-zorro-antd/popconfirm';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzTableModule } from 'ng-zorro-antd/table';
import { NzTabsModule } from 'ng-zorro-antd/tabs';
import { NzTooltipModule } from 'ng-zorro-antd/tooltip';
import { finalize, forkJoin, of, switchMap, type Observable } from 'rxjs';
import { SettingsApiService } from '../../core/api/settings-api.service';
import { type PendingChangesAware } from '../../shared/navigation/pending-changes.guard';
import { UnsavedChangesWarningDirective } from '../../shared/navigation/unsaved-changes-warning.directive';
import {
  documentAttributeValueTypeLabelKey,
  documentTypeDisplayName as translatedDocumentTypeDisplayName,
} from '../../shared/presentation/document-presentation';
import { InfiniteTableScrollDirective } from '../../shared/table/infinite-table-scroll.directive';
import { TableCreateDialogComponent } from '../../shared/table/table-create-dialog.component';
import { TableActionsComponent } from '../../shared/table/table-actions.component';
import { TablePanelComponent } from '../../shared/table/table-panel.component';

type DocumentTypeEditForm = FormGroup<{
  key: FormControl<string>;
  name: FormControl<string>;
  isDisabled: FormControl<boolean>;
}>;

type FieldDefinitionEditForm = FormGroup<{
  key: FormControl<string>;
  label: FormControl<string>;
  valueType: FormControl<DocumentAttributeValueType>;
  displayOrder: FormControl<number>;
  isDisabled: FormControl<boolean>;
  required: FormControl<boolean>;
  appliesToAllDocumentTypes: FormControl<boolean>;
  documentTypeIds: FormControl<string[]>;
  includeInFullTextSearch: FormControl<boolean>;
  includeInAiExtraction: FormControl<boolean>;
}>;

interface EditableDocumentTypeRow {
  readonly id: string;
  readonly form: DocumentTypeEditForm;
  readonly original: DocumentTypeEditValue;
  readonly isSystem: boolean;
  readonly displayOrder: number;
}

interface DocumentTypeEditValue {
  readonly key: string;
  readonly name: string;
  readonly isDisabled: boolean;
  readonly displayOrder: number;
}

interface EditableFieldDefinitionRow {
  readonly id: string;
  readonly form: FieldDefinitionEditForm;
  readonly original: FieldDefinitionEditValue;
}

interface FieldDefinitionEditValue {
  readonly key: string;
  readonly label: string;
  readonly valueType: DocumentAttributeValueType;
  readonly displayOrder: number;
  readonly isDisabled: boolean;
  readonly required: boolean;
  readonly appliesToAllDocumentTypes: boolean;
  readonly documentTypeIds: readonly string[];
  readonly includeInFullTextSearch: boolean;
  readonly includeInAiExtraction: boolean;
}

const FIELD_VALUE_TYPES: readonly DocumentAttributeValueType[] = [
  'TEXT',
  'NUMBER',
  'DATE',
  'BOOLEAN',
];
const KEY_MAX_LENGTH = 100;
const LABEL_MAX_LENGTH = 200;

@Component({
  selector: 'app-settings-documents',
  imports: [
    DragDropModule,
    ReactiveFormsModule,
    TranslatePipe,
    NzAlertModule,
    NzButtonModule,
    NzCheckboxModule,
    NzFormModule,
    NzIconModule,
    NzInputModule,
    NzPopconfirmModule,
    NzSelectModule,
    NzTableModule,
    NzTabsModule,
    NzTooltipModule,
    InfiniteTableScrollDirective,
    TableCreateDialogComponent,
    TableActionsComponent,
    TablePanelComponent,
    UnsavedChangesWarningDirective,
  ],
  templateUrl: './settings-documents.component.html',
  styleUrls: ['./settings-page.scss', './settings-documents.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsDocumentsComponent implements OnInit, PendingChangesAware {
  private readonly settingsApi = inject(SettingsApiService);
  private readonly translate = inject(TranslateService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly editRevision = signal(0);

  readonly isLoading = signal(false);
  readonly isSavingDocumentTypes = signal(false);
  readonly isSavingFieldDefinitions = signal(false);
  readonly isCreatingDocumentType = signal(false);
  readonly isCreatingFieldDefinition = signal(false);
  readonly isDocumentTypeCreateDialogOpen = signal(false);
  readonly isFieldDefinitionCreateDialogOpen = signal(false);
  readonly error = signal<string | null>(null);
  readonly documentTypeRows = signal<EditableDocumentTypeRow[]>([]);
  readonly fieldDefinitionRows = signal<EditableFieldDefinitionRow[]>([]);
  readonly originalDocumentTypeOrder = signal<string[]>([]);
  readonly originalFieldDefinitionOrder = signal<string[]>([]);
  readonly valueTypes = FIELD_VALUE_TYPES;
  readonly documentAttributeValueTypeLabelKey = documentAttributeValueTypeLabelKey;
  readonly visibleDocumentTypeRows = computed(() => this.documentTypeRows());
  readonly visibleFieldDefinitionRows = computed(() => this.fieldDefinitionRows());
  readonly fieldScopeDocumentTypeRows = computed(() => this.visibleDocumentTypeRows());
  readonly hasDocumentTypeChanges = computed(() => {
    this.editRevision();
    return this.documentTypeRows().some((row) => this.hasDocumentTypeRowChanges(row)) ||
      this.hasDocumentTypeOrderChanges();
  });
  readonly hasInvalidDocumentTypeChanges = computed(() => {
    this.editRevision();
    return this.visibleDocumentTypeRows().some(
      (row) => this.hasDocumentTypeRowChanges(row) && this.hasInvalidDocumentTypeRow(row),
    );
  });
  readonly hasFieldDefinitionChanges = computed(() => {
    this.editRevision();
    return this.fieldDefinitionRows().some((row) => this.hasFieldDefinitionRowChanges(row)) ||
      this.hasFieldDefinitionOrderChanges();
  });
  readonly hasInvalidFieldDefinitionChanges = computed(() => {
    this.editRevision();
    return this.visibleFieldDefinitionRows().some(
      (row) => this.hasFieldDefinitionRowChanges(row) && this.hasInvalidFieldDefinitionRow(row),
    );
  });

  readonly createDocumentTypeForm: DocumentTypeEditForm = this.documentTypeForm({
    key: '',
    name: '',
    isDisabled: false,
    displayOrder: 10,
  });
  readonly createFieldDefinitionForm: FieldDefinitionEditForm = this.fieldDefinitionForm({
    key: '',
    label: '',
    valueType: 'TEXT',
    displayOrder: 10,
    isDisabled: false,
    required: false,
    appliesToAllDocumentTypes: true,
    documentTypeIds: [],
    includeInFullTextSearch: false,
    includeInAiExtraction: false,
  });

  ngOnInit(): void {
    this.load();
  }

  hasPendingChanges(): boolean {
    return this.hasDocumentTypeChanges() || this.hasFieldDefinitionChanges();
  }

  load(): void {
    this.isLoading.set(true);
    this.error.set(null);
    forkJoin({
      documentTypes: this.settingsApi.documentTypes(),
      fieldDefinitions: this.settingsApi.fieldDefinitions(),
    })
      .pipe(finalize(() => this.isLoading.set(false)))
      .subscribe({
        next: ({ documentTypes, fieldDefinitions }) => {
          this.documentTypeRows.set(
            documentTypes.map((documentType) => this.documentTypeRow(documentType)),
          );
          this.fieldDefinitionRows.set(
            fieldDefinitions.map((definition) => this.fieldDefinitionRow(definition)),
          );
          this.originalDocumentTypeOrder.set(documentTypes.map((documentType) => documentType.id));
          this.originalFieldDefinitionOrder.set(
            fieldDefinitions.map((definition) => definition.id),
          );
          this.editRevision.update((revision) => revision + 1);
        },
        error: () => this.error.set('settings.documents.errors.loadFailed'),
      });
  }

  addDocumentType(): void {
    if (this.isSavingDocumentTypes() || this.isCreatingDocumentType()) {
      return;
    }

    this.resetCreateDocumentTypeForm();
    this.error.set(null);
    this.isDocumentTypeCreateDialogOpen.set(true);
  }

  closeDocumentTypeCreateDialog(): void {
    if (this.isCreatingDocumentType()) {
      return;
    }

    this.isDocumentTypeCreateDialogOpen.set(false);
    this.resetCreateDocumentTypeForm();
  }

  createDocumentType(): void {
    if (this.isCreatingDocumentType()) {
      return;
    }

    if (this.hasInvalidDocumentTypeForm(this.createDocumentTypeForm)) {
      this.createDocumentTypeForm.markAllAsTouched();
      this.editRevision.update((revision) => revision + 1);
      return;
    }

    this.isCreatingDocumentType.set(true);
    this.error.set(null);
    this.settingsApi
      .createDocumentType(this.documentTypeCreateInput(this.createDocumentTypeForm))
      .pipe(finalize(() => this.isCreatingDocumentType.set(false)))
      .subscribe({
        next: (documentType) => {
          this.documentTypeRows.update((rows) => [...rows, this.documentTypeRow(documentType)]);
          this.originalDocumentTypeOrder.update((ids) => [...ids, documentType.id]);
          this.isDocumentTypeCreateDialogOpen.set(false);
          this.resetCreateDocumentTypeForm();
          this.editRevision.update((revision) => revision + 1);
        },
        error: () => this.error.set('settings.documents.errors.documentTypeCreateFailed'),
      });
  }

  deleteDocumentType(row: EditableDocumentTypeRow): void {
    if (row.isSystem || this.isSavingDocumentTypes()) {
      return;
    }

    this.error.set(null);
    this.isSavingDocumentTypes.set(true);
    this.settingsApi
      .deleteDocumentType(row.id)
      .pipe(finalize(() => this.isSavingDocumentTypes.set(false)))
      .subscribe({
        next: () => {
          this.documentTypeRows.update((rows) => rows.filter((entry) => entry.id !== row.id));
          this.originalDocumentTypeOrder.update((ids) => ids.filter((id) => id !== row.id));
          this.editRevision.update((revision) => revision + 1);
        },
        error: () => this.error.set('settings.documents.errors.documentTypeRemoveFailed'),
      });
  }

  dropDocumentType(event: CdkDragDrop<EditableDocumentTypeRow[]>): void {
    if (event.previousIndex === event.currentIndex || this.isSavingDocumentTypes()) {
      return;
    }

    const visibleRows = [...this.visibleDocumentTypeRows()];
    moveItemInArray(visibleRows, event.previousIndex, event.currentIndex);
    this.documentTypeRows.set(visibleRows);
    this.editRevision.update((revision) => revision + 1);
  }

  dropFieldDefinition(event: CdkDragDrop<EditableFieldDefinitionRow[]>): void {
    if (event.previousIndex === event.currentIndex || this.isSavingFieldDefinitions()) {
      return;
    }

    const visibleRows = [...this.visibleFieldDefinitionRows()];
    moveItemInArray(visibleRows, event.previousIndex, event.currentIndex);
    this.fieldDefinitionRows.set(visibleRows);
    this.editRevision.update((revision) => revision + 1);
  }

  deleteFieldDefinition(row: EditableFieldDefinitionRow): void {
    if (this.isSavingFieldDefinitions()) {
      return;
    }

    this.error.set(null);
    this.isSavingFieldDefinitions.set(true);
    this.settingsApi
      .deleteFieldDefinition(row.id)
      .pipe(finalize(() => this.isSavingFieldDefinitions.set(false)))
      .subscribe({
        next: () => {
          this.fieldDefinitionRows.update((rows) => rows.filter((entry) => entry.id !== row.id));
          this.originalFieldDefinitionOrder.update((ids) => ids.filter((id) => id !== row.id));
          this.editRevision.update((revision) => revision + 1);
        },
        error: () => this.error.set('settings.documents.errors.fieldRemoveFailed'),
      });
  }

  saveDocumentTypeChanges(): void {
    if (this.isSavingDocumentTypes() || !this.hasDocumentTypeChanges()) {
      return;
    }

    if (this.hasInvalidDocumentTypeChanges()) {
      for (const row of this.visibleDocumentTypeRows()) {
        if (this.hasDocumentTypeRowChanges(row)) {
          row.form.markAllAsTouched();
        }
      }
      this.editRevision.update((revision) => revision + 1);
      return;
    }

    const rows = this.documentTypeRows();
    const updateRows = rows.filter((row) => this.hasDocumentTypeRowChanges(row));

    this.error.set(null);
    this.isSavingDocumentTypes.set(true);
    const saveRequests: Observable<unknown>[] = [
      ...updateRows.map((row) =>
        this.settingsApi.updateDocumentType(row.id, this.changedDocumentTypeFields(row)),
      ),
    ];
    runRequests(saveRequests)
      .pipe(
        switchMap(() => {
          if (!this.hasDocumentTypeOrderChanges()) {
            return of(null);
          }

          return this.settingsApi.reorderDocumentTypes({
            documentTypeIds: rows.map((row) => row.id),
          });
        }),
        finalize(() => this.isSavingDocumentTypes.set(false)),
      )
      .subscribe({
        next: () => {
          this.load();
        },
        error: () => this.error.set('settings.documents.errors.documentTypeSaveFailed'),
      });
  }

  revertDocumentTypeChanges(): void {
    this.documentTypeRows.update((rows) =>
      rows
        .map((row) => {
          row.form.reset({
            key: row.original.key,
            name: row.original.name,
            isDisabled: row.original.isDisabled,
          });
          return row;
        })
        .sort(
          (left, right) =>
            this.originalDocumentTypeOrder().indexOf(left.id) -
            this.originalDocumentTypeOrder().indexOf(right.id),
        ),
    );
    this.editRevision.update((revision) => revision + 1);
  }

  addFieldDefinition(): void {
    if (this.isSavingFieldDefinitions() || this.isCreatingFieldDefinition()) {
      return;
    }

    this.resetCreateFieldDefinitionForm();
    this.error.set(null);
    this.isFieldDefinitionCreateDialogOpen.set(true);
  }

  closeFieldDefinitionCreateDialog(): void {
    if (this.isCreatingFieldDefinition()) {
      return;
    }

    this.isFieldDefinitionCreateDialogOpen.set(false);
    this.resetCreateFieldDefinitionForm();
  }

  createFieldDefinition(): void {
    if (this.isCreatingFieldDefinition()) {
      return;
    }

    if (this.hasInvalidFieldDefinitionForm(this.createFieldDefinitionForm)) {
      this.createFieldDefinitionForm.markAllAsTouched();
      this.editRevision.update((revision) => revision + 1);
      return;
    }

    this.isCreatingFieldDefinition.set(true);
    this.error.set(null);
    this.settingsApi
      .createFieldDefinition(this.fieldDefinitionCreateInput(this.createFieldDefinitionForm))
      .pipe(finalize(() => this.isCreatingFieldDefinition.set(false)))
      .subscribe({
        next: (definition) => {
          this.fieldDefinitionRows.update((rows) => [...rows, this.fieldDefinitionRow(definition)]);
          this.originalFieldDefinitionOrder.update((ids) => [...ids, definition.id]);
          this.isFieldDefinitionCreateDialogOpen.set(false);
          this.resetCreateFieldDefinitionForm();
          this.editRevision.update((revision) => revision + 1);
        },
        error: () => this.error.set('settings.documents.errors.fieldCreateFailed'),
      });
  }

  saveFieldDefinitionChanges(): void {
    if (this.isSavingFieldDefinitions() || !this.hasFieldDefinitionChanges()) {
      return;
    }

    if (this.hasInvalidFieldDefinitionChanges()) {
      for (const row of this.visibleFieldDefinitionRows()) {
        if (this.hasFieldDefinitionRowChanges(row)) {
          row.form.markAllAsTouched();
        }
      }
      this.editRevision.update((revision) => revision + 1);
      return;
    }

    const rows = this.fieldDefinitionRows();
    const updateRows = rows.filter((row) => this.hasFieldDefinitionRowChanges(row));

    this.error.set(null);
    this.isSavingFieldDefinitions.set(true);
    const saveRequests: Observable<unknown>[] = [
      ...updateRows.map((row) =>
        this.settingsApi.updateFieldDefinition(row.id, this.changedFieldDefinitionFields(row)),
      ),
    ];
    runRequests(saveRequests)
      .pipe(finalize(() => this.isSavingFieldDefinitions.set(false)))
      .subscribe({
        next: () => {
          this.load();
        },
        error: () => this.error.set('settings.documents.errors.fieldSaveFailed'),
      });
  }

  revertFieldDefinitionChanges(): void {
    this.fieldDefinitionRows.update((rows) =>
      rows
        .map((row) => {
          row.form.reset({
            key: row.original.key,
            label: row.original.label,
            valueType: row.original.valueType,
            displayOrder: row.original.displayOrder,
            isDisabled: row.original.isDisabled,
            required: row.original.required,
            appliesToAllDocumentTypes: row.original.appliesToAllDocumentTypes,
            documentTypeIds: [...row.original.documentTypeIds],
            includeInFullTextSearch: row.original.includeInFullTextSearch,
            includeInAiExtraction: row.original.includeInAiExtraction,
          });
          return row;
        })
        .sort(
          (left, right) =>
            this.originalFieldDefinitionOrder().indexOf(left.id) -
            this.originalFieldDefinitionOrder().indexOf(right.id),
        ),
    );
    this.editRevision.update((revision) => revision + 1);
  }

  documentTypeDisplayName(
    documentType: Pick<DocumentTypeDto, 'isSystem' | 'key' | 'name'>,
  ): string {
    return translatedDocumentTypeDisplayName(documentType, (key) => this.translate.instant(key));
  }

  documentTypeRowName(row: EditableDocumentTypeRow): string {
    this.editRevision();
    if (row.isSystem && row.original) {
      return this.documentTypeDisplayName({ ...row.original, isSystem: true });
    }

    return row.form.controls.name.value;
  }

  fieldAppliesToAllDocumentTypes(row: EditableFieldDefinitionRow): boolean {
    this.editRevision();
    return row.form.controls.appliesToAllDocumentTypes.value;
  }

  createFieldAppliesToAllDocumentTypes(): boolean {
    this.editRevision();
    return this.createFieldDefinitionForm.controls.appliesToAllDocumentTypes.value;
  }

  isDocumentTypeFieldChanged(
    row: EditableDocumentTypeRow,
    field: keyof Pick<DocumentTypeEditValue, 'key' | 'name' | 'isDisabled'>,
  ): boolean {
    this.editRevision();
    const original = row.original;
    if (!original) {
      return false;
    }

    const value = row.form.getRawValue();
    if (field === 'isDisabled') {
      return value.isDisabled !== original.isDisabled;
    }

    return !row.isSystem && value[field].trim() !== original[field];
  }

  isFieldDefinitionFieldChanged(
    row: EditableFieldDefinitionRow,
    field: keyof FieldDefinitionEditValue,
  ): boolean {
    this.editRevision();
    const original = row.original;
    if (!original) {
      return false;
    }

    const value = row.form.getRawValue();
    if (field === 'key' || field === 'label') {
      return value[field].trim() !== original[field];
    }

    if (field === 'displayOrder') {
      return (
        this.hasFieldDefinitionOrderChanges() &&
        this.fieldDefinitionDisplayOrder(row) !== original.displayOrder
      );
    }

    if (field === 'documentTypeIds') {
      return !sameStringSet(value.documentTypeIds, original.documentTypeIds);
    }

    return value[field] !== original[field];
  }

  private documentTypeRow(documentType: DocumentTypeDto): EditableDocumentTypeRow {
    const original = documentTypeEditValue(documentType);
    const form = this.documentTypeForm(original);
    if (documentType.isSystem) {
      form.controls.key.disable({ emitEvent: false });
      form.controls.name.disable({ emitEvent: false });
    }

    return {
      id: documentType.id,
      form,
      original,
      isSystem: documentType.isSystem,
      displayOrder: documentType.displayOrder,
    };
  }

  private documentTypeForm(value: DocumentTypeEditValue): DocumentTypeEditForm {
    const form = new FormGroup({
      key: new FormControl(value.key, {
        nonNullable: true,
        validators: [Validators.required, Validators.maxLength(KEY_MAX_LENGTH)],
      }),
      name: new FormControl(value.name, {
        nonNullable: true,
        validators: [Validators.required, Validators.maxLength(LABEL_MAX_LENGTH)],
      }),
      isDisabled: new FormControl(value.isDisabled, { nonNullable: true }),
    });

    form.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.editRevision.update((revision) => revision + 1);
    });

    return form;
  }

  private fieldDefinitionRow(definition: DocumentFieldDefinitionDto): EditableFieldDefinitionRow {
    const original = fieldDefinitionEditValue(definition);
    return {
      id: definition.id,
      form: this.fieldDefinitionForm(original),
      original,
    };
  }

  private fieldDefinitionForm(value: FieldDefinitionEditValue): FieldDefinitionEditForm {
    const form = new FormGroup({
      key: new FormControl(value.key, {
        nonNullable: true,
        validators: [Validators.required, Validators.maxLength(KEY_MAX_LENGTH)],
      }),
      label: new FormControl(value.label, {
        nonNullable: true,
        validators: [Validators.required, Validators.maxLength(LABEL_MAX_LENGTH)],
      }),
      valueType: new FormControl<DocumentAttributeValueType>(value.valueType, {
        nonNullable: true,
      }),
      displayOrder: new FormControl(value.displayOrder, { nonNullable: true }),
      isDisabled: new FormControl(value.isDisabled, { nonNullable: true }),
      required: new FormControl(value.required, { nonNullable: true }),
      appliesToAllDocumentTypes: new FormControl(value.appliesToAllDocumentTypes, {
        nonNullable: true,
      }),
      documentTypeIds: new FormControl<string[]>([...value.documentTypeIds], {
        nonNullable: true,
      }),
      includeInFullTextSearch: new FormControl(value.includeInFullTextSearch, {
        nonNullable: true,
      }),
      includeInAiExtraction: new FormControl(value.includeInAiExtraction, {
        nonNullable: true,
      }),
    });

    form.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.editRevision.update((revision) => revision + 1);
    });

    return form;
  }

  private documentTypeCreateInput(form: DocumentTypeEditForm): CreateDocumentTypeRequest {
    const value = form.getRawValue();
    return {
      key: value.key.trim(),
      name: value.name.trim(),
      active: !value.isDisabled,
      displayOrder: this.nextDocumentTypeDisplayOrder(),
    };
  }

  private fieldDefinitionCreateInput(
    form: FieldDefinitionEditForm,
  ): CreateDocumentFieldDefinitionRequest {
    const value = form.getRawValue();
    return {
      key: value.key.trim(),
      label: value.label.trim(),
      valueType: value.valueType,
      displayOrder: this.nextFieldDefinitionDisplayOrder(),
      active: !value.isDisabled,
      required: value.required,
      appliesToAllDocumentTypes: value.appliesToAllDocumentTypes,
      documentTypeIds: value.appliesToAllDocumentTypes ? [] : value.documentTypeIds,
      includeInFullTextSearch: value.includeInFullTextSearch,
      includeInAiExtraction: value.includeInAiExtraction,
    };
  }

  private changedDocumentTypeFields(row: EditableDocumentTypeRow): UpdateDocumentTypeRequest {
    const value = row.form.getRawValue();
    const changes: UpdateDocumentTypeRequest = {};
    const original = row.original;

    if (!row.isSystem && value.key.trim() !== original.key) {
      changes.key = value.key.trim();
    }

    if (!row.isSystem && value.name.trim() !== original.name) {
      changes.name = value.name.trim();
    }

    if (value.isDisabled !== original.isDisabled) {
      changes.active = !value.isDisabled;
    }

    return changes;
  }

  private changedFieldDefinitionFields(
    row: EditableFieldDefinitionRow,
  ): UpdateDocumentFieldDefinitionRequest {
    const value = row.form.getRawValue();
    const changes: UpdateDocumentFieldDefinitionRequest = {};
    const original = row.original;

    if (value.key.trim() !== original.key) {
      changes.key = value.key.trim();
    }

    if (value.label.trim() !== original.label) {
      changes.label = value.label.trim();
    }

    if (value.valueType !== original.valueType) {
      changes.valueType = value.valueType;
    }

    const displayOrder = this.fieldDefinitionDisplayOrder(row);
    if (this.hasFieldDefinitionOrderChanges() && displayOrder !== original.displayOrder) {
      changes.displayOrder = displayOrder;
    }

    if (value.isDisabled !== original.isDisabled) {
      changes.active = !value.isDisabled;
    }

    if (value.required !== original.required) {
      changes.required = value.required;
    }

    if (value.appliesToAllDocumentTypes !== original.appliesToAllDocumentTypes) {
      changes.appliesToAllDocumentTypes = value.appliesToAllDocumentTypes;
    }

    if (
      value.appliesToAllDocumentTypes ||
      !sameStringSet(value.documentTypeIds, original.documentTypeIds)
    ) {
      changes.documentTypeIds = value.appliesToAllDocumentTypes ? [] : value.documentTypeIds;
    }

    if (value.includeInFullTextSearch !== original.includeInFullTextSearch) {
      changes.includeInFullTextSearch = value.includeInFullTextSearch;
    }

    if (value.includeInAiExtraction !== original.includeInAiExtraction) {
      changes.includeInAiExtraction = value.includeInAiExtraction;
    }

    return changes;
  }

  private hasDocumentTypeRowChanges(row: EditableDocumentTypeRow): boolean {
    const original = row.original;
    const value = row.form.getRawValue();
    return (
      (!row.isSystem && value.key.trim() !== original.key) ||
      (!row.isSystem && value.name.trim() !== original.name) ||
      value.isDisabled !== original.isDisabled
    );
  }

  private hasFieldDefinitionRowChanges(row: EditableFieldDefinitionRow): boolean {
    const original = row.original;
    const value = row.form.getRawValue();
    return (
      value.key.trim() !== original.key ||
      value.label.trim() !== original.label ||
      value.valueType !== original.valueType ||
      (this.hasFieldDefinitionOrderChanges() &&
        this.fieldDefinitionDisplayOrder(row) !== original.displayOrder) ||
      value.isDisabled !== original.isDisabled ||
      value.required !== original.required ||
      value.appliesToAllDocumentTypes !== original.appliesToAllDocumentTypes ||
      !sameStringSet(value.documentTypeIds, original.documentTypeIds) ||
      value.includeInFullTextSearch !== original.includeInFullTextSearch ||
      value.includeInAiExtraction !== original.includeInAiExtraction
    );
  }

  private hasDocumentTypeOrderChanges(): boolean {
    const currentOrder = this.visibleDocumentTypeRows().map((row) => row.id);
    const originalOrder = this.originalDocumentTypeOrder();
    return (
      currentOrder.length !== originalOrder.length || !sameStringList(currentOrder, originalOrder)
    );
  }

  private hasFieldDefinitionOrderChanges(): boolean {
    const currentOrder = this.visibleFieldDefinitionRows().map((row) => row.id);
    const originalOrder = this.originalFieldDefinitionOrder();
    return (
      currentOrder.length !== originalOrder.length || !sameStringList(currentOrder, originalOrder)
    );
  }

  private hasInvalidDocumentTypeRow(row: EditableDocumentTypeRow): boolean {
    return this.hasInvalidDocumentTypeForm(row.form);
  }

  private hasInvalidFieldDefinitionRow(row: EditableFieldDefinitionRow): boolean {
    return this.hasInvalidFieldDefinitionForm(row.form);
  }

  private hasInvalidDocumentTypeForm(form: DocumentTypeEditForm): boolean {
    const value = form.getRawValue();
    return form.invalid || value.key.trim().length === 0 || value.name.trim().length === 0;
  }

  private hasInvalidFieldDefinitionForm(form: FieldDefinitionEditForm): boolean {
    const value = form.getRawValue();
    return (
      form.invalid ||
      value.key.trim().length === 0 ||
      value.label.trim().length === 0 ||
      !Number.isInteger(normalizedOrder(value.displayOrder)) ||
      (!value.appliesToAllDocumentTypes && value.documentTypeIds.length === 0)
    );
  }

  private nextDocumentTypeDisplayOrder(): number {
    const maxDisplayOrder = this.documentTypeRows().reduce(
      (maxOrder, row) => Math.max(maxOrder, row.displayOrder),
      0,
    );
    return maxDisplayOrder + 10;
  }

  private nextFieldDefinitionDisplayOrder(): number {
    const maxDisplayOrder = this.visibleFieldDefinitionRows().reduce((maxOrder, row) => {
      const value = row.form.getRawValue();
      return Math.max(maxOrder, normalizedOrder(value.displayOrder));
    }, 0);
    return maxDisplayOrder + 10;
  }

  private fieldDefinitionDisplayOrder(row: EditableFieldDefinitionRow): number {
    return (this.visibleFieldDefinitionRows().indexOf(row) + 1) * 10;
  }

  private resetCreateDocumentTypeForm(): void {
    this.createDocumentTypeForm.reset({
      key: '',
      name: '',
      isDisabled: false,
    });
    this.editRevision.update((revision) => revision + 1);
  }

  private resetCreateFieldDefinitionForm(): void {
    this.createFieldDefinitionForm.reset({
      key: '',
      label: '',
      valueType: 'TEXT',
      displayOrder: this.nextFieldDefinitionDisplayOrder(),
      isDisabled: false,
      required: false,
      appliesToAllDocumentTypes: true,
      documentTypeIds: [],
      includeInFullTextSearch: false,
      includeInAiExtraction: false,
    });
    this.editRevision.update((revision) => revision + 1);
  }
}

function documentTypeEditValue(documentType: DocumentTypeDto): DocumentTypeEditValue {
  return {
    key: documentType.key,
    name: documentType.name,
    isDisabled: !documentType.active,
    displayOrder: documentType.displayOrder,
  };
}

function fieldDefinitionEditValue(
  definition: DocumentFieldDefinitionDto,
): FieldDefinitionEditValue {
  return {
    key: definition.key,
    label: definition.label,
    valueType: definition.valueType,
    displayOrder: definition.displayOrder,
    isDisabled: !definition.active,
    required: definition.required,
    appliesToAllDocumentTypes: definition.appliesToAllDocumentTypes,
    documentTypeIds: definition.documentTypeIds,
    includeInFullTextSearch: definition.includeInFullTextSearch,
    includeInAiExtraction: definition.includeInAiExtraction,
  };
}

function runRequests<T>(requests: readonly Observable<T>[]): Observable<T[]> {
  return requests.length === 0 ? of([] as T[]) : forkJoin([...requests]);
}

function sameStringList(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function sameStringSet(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }

  const rightValues = new Set(right);
  return left.every((value) => rightValues.has(value));
}

function normalizedOrder(value: number): number {
  return Number.isFinite(value) ? Math.trunc(value) : 0;
}
