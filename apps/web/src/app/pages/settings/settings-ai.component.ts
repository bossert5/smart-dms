import { CdkDragDrop, DragDropModule, moveItemInArray } from '@angular/cdk/drag-drop';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  OnInit,
  signal,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  FormControl,
  FormGroup,
  FormsModule,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import type {
  AiMetadataPromptDto,
  AiProviderDto,
  AiProviderModelDto,
  AiProviderStatus,
  CreateAiProviderRequest,
  LoadAiProviderModelsRequest,
  UpdateAiProviderRequest,
} from '@smart-dms/shared-dto';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzCheckboxModule } from 'ng-zorro-antd/checkbox';
import { NzCollapseModule } from 'ng-zorro-antd/collapse';
import { NzEmptyModule } from 'ng-zorro-antd/empty';
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzModalModule } from 'ng-zorro-antd/modal';
import { NzPopconfirmModule } from 'ng-zorro-antd/popconfirm';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzSkeletonModule } from 'ng-zorro-antd/skeleton';
import { NzTableModule } from 'ng-zorro-antd/table';
import { NzTabsModule } from 'ng-zorro-antd/tabs';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzTooltipModule } from 'ng-zorro-antd/tooltip';
import { finalize, forkJoin, of, switchMap, type Observable } from 'rxjs';
import { SettingsApiService } from '../../core/api/settings-api.service';
import { RealtimeClientService } from '../../core/services/realtime-client.service';
import { type PendingChangesAware } from '../../shared/navigation/pending-changes.guard';
import { UnsavedChangesWarningDirective } from '../../shared/navigation/unsaved-changes-warning.directive';
import { InfiniteTableScrollDirective } from '../../shared/table/infinite-table-scroll.directive';
import { TableActionsComponent } from '../../shared/table/table-actions.component';
import { TablePanelComponent } from '../../shared/table/table-panel.component';

type ProviderEditForm = FormGroup<{
  isDisabled: FormControl<boolean>;
  name: FormControl<string>;
  baseUrl: FormControl<string>;
  selectedMetadataModel: FormControl<string>;
  apiKey: FormControl<string>;
}>;

type ProviderCreateForm = FormGroup<{
  name: FormControl<string>;
  baseUrl: FormControl<string>;
  selectedMetadataModel: FormControl<string>;
  apiKey: FormControl<string>;
}>;

interface EditableAiProviderRow {
  readonly id: string;
  readonly form: ProviderEditForm;
  readonly original: ProviderEditValue;
  readonly provider: AiProviderDto;
  readonly priority: number;
}

interface ProviderEditValue {
  readonly isDisabled: boolean;
  readonly name: string;
  readonly baseUrl: string;
  readonly selectedMetadataModel: string;
  readonly priority: number;
}

interface ProviderModelSource {
  readonly baseUrl: string;
  readonly apiKey: string;
}

const DEFAULT_NEW_PROVIDER: ProviderEditValue = {
  isDisabled: false,
  name: 'Local Ollama',
  baseUrl: 'http://localhost:11434/v1',
  selectedMetadataModel: '',
  priority: 10,
};
const NAME_MAX_LENGTH = 160;
const URL_MAX_LENGTH = 1000;
const MODEL_MAX_LENGTH = 200;
const API_KEY_MAX_LENGTH = 4000;

@Component({
  selector: 'app-settings-ai',
  imports: [
    DragDropModule,
    FormsModule,
    ReactiveFormsModule,
    TranslatePipe,
    NzAlertModule,
    NzButtonModule,
    NzCheckboxModule,
    NzCollapseModule,
    NzEmptyModule,
    NzFormModule,
    NzIconModule,
    NzInputModule,
    NzModalModule,
    NzPopconfirmModule,
    NzSelectModule,
    NzSkeletonModule,
    NzTableModule,
    NzTabsModule,
    NzTagModule,
    NzTooltipModule,
    InfiniteTableScrollDirective,
    TableActionsComponent,
    TablePanelComponent,
    UnsavedChangesWarningDirective,
  ],
  templateUrl: './settings-ai.component.html',
  styleUrls: ['./settings-page.scss', './settings-ai.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsAiComponent implements OnInit, PendingChangesAware {
  private readonly settingsApi = inject(SettingsApiService);
  private readonly realtime = inject(RealtimeClientService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly editRevision = signal(0);
  private lastProviderChangeKey = this.providerChangeKey(this.realtime.latestAiProviderChange());
  private lastConnectionRevision = this.realtime.connectionRevision();

  readonly isLoading = signal(false);
  readonly isSavingProviders = signal(false);
  readonly isCreatingProvider = signal(false);
  readonly isProviderCreateDialogOpen = signal(false);
  readonly isProviderEditDialogOpen = signal(false);
  readonly error = signal<string | null>(null);
  readonly editingProviderId = signal<string | null>(null);
  readonly providerRows = signal<EditableAiProviderRow[]>([]);
  readonly aiProviders = computed(() => this.visibleProviderRows().map((row) => row.provider));
  readonly aiMetadataPrompts = signal<AiMetadataPromptDto[]>([]);
  readonly promptDrafts = signal<Record<string, string>>({});
  readonly savingPromptKey = signal<string | null>(null);
  readonly providerActionId = signal<string | null>(null);
  readonly originalProviderOrder = signal<string[]>([]);
  readonly isLoadingCreateProviderModels = signal(false);
  readonly createProviderModels = signal<AiProviderModelDto[]>([]);
  readonly createProviderModelSource = signal<ProviderModelSource | null>(null);
  readonly visibleProviderRows = computed(() => this.providerRows());
  readonly hasProviderChanges = computed(() => {
    this.editRevision();
    return this.providerRows().some((row) => this.hasProviderRowChanges(row)) ||
      this.hasProviderOrderChanges();
  });
  readonly hasInvalidProviderChanges = computed(() => {
    this.editRevision();
    return this.visibleProviderRows().some(
      (row) => this.hasProviderRowChanges(row) && this.hasInvalidProviderRow(row),
    );
  });
  readonly createProviderForm: ProviderCreateForm = this.providerCreateForm(DEFAULT_NEW_PROVIDER);
  readonly editProviderForm: ProviderEditForm = this.providerForm(DEFAULT_NEW_PROVIDER);

  constructor() {
    effect(() => {
      const event = this.realtime.latestAiProviderChange();
      const eventKey = this.providerChangeKey(event);
      if (!event || eventKey === this.lastProviderChangeKey) {
        return;
      }

      this.lastProviderChangeKey = eventKey;
      this.applyProviderChange(event);
    });
    effect(() => {
      const revision = this.realtime.connectionRevision();
      if (revision === this.lastConnectionRevision) {
        return;
      }

      this.lastConnectionRevision = revision;
      if (revision > 1) {
        untracked(() => this.loadProviders());
      }
    });
  }

  ngOnInit(): void {
    this.load();
  }

  hasPendingChanges(): boolean {
    return this.hasProviderChanges();
  }

  load(): void {
    this.isLoading.set(true);
    this.error.set(null);
    forkJoin({
      providers: this.settingsApi.aiProviders(),
      prompts: this.settingsApi.aiMetadataPrompts(),
    })
      .pipe(finalize(() => this.isLoading.set(false)))
      .subscribe({
        next: ({ providers, prompts }) => {
          this.setProviderRows(providers);
          this.aiMetadataPrompts.set(prompts);
          this.promptDrafts.set(
            Object.fromEntries(prompts.map((prompt) => [prompt.key, prompt.promptText])),
          );
        },
        error: () => this.error.set('settings.ai.errors.loadFailed'),
      });
  }

  loadProviders(): void {
    this.settingsApi.aiProviders().subscribe({
      next: (providers) => this.setProviderRows(providers),
      error: () => this.error.set('settings.ai.errors.providersLoadFailed'),
    });
  }

  addProvider(): void {
    if (this.isSavingProviders() || this.isCreatingProvider()) {
      return;
    }

    this.resetCreateProviderForm();
    this.error.set(null);
    this.isProviderCreateDialogOpen.set(true);
  }

  closeProviderCreateDialog(): void {
    if (this.isCreatingProvider() || this.isLoadingCreateProviderModels()) {
      return;
    }

    this.isProviderCreateDialogOpen.set(false);
    this.resetCreateProviderForm();
  }

  openProviderEditDialog(row: EditableAiProviderRow): void {
    if (this.isSavingProviders()) {
      return;
    }

    this.editingProviderId.set(row.id);
    this.editProviderForm.reset({
      isDisabled: row.original.isDisabled,
      name: row.original.name,
      baseUrl: row.original.baseUrl,
      selectedMetadataModel: row.original.selectedMetadataModel,
      apiKey: '',
    });
    this.error.set(null);
    this.isProviderEditDialogOpen.set(true);
    this.editRevision.update((revision) => revision + 1);
  }

  closeProviderEditDialog(): void {
    if (this.isSavingProviders()) {
      return;
    }

    this.isProviderEditDialogOpen.set(false);
    this.editingProviderId.set(null);
    this.editProviderForm.reset({
      isDisabled: false,
      name: '',
      baseUrl: '',
      selectedMetadataModel: '',
      apiKey: '',
    });
    this.editRevision.update((revision) => revision + 1);
  }

  saveProviderEditDialog(): void {
    if (this.isSavingProviders()) {
      return;
    }

    const row = this.editingProvider();
    if (!row) {
      return;
    }

    if (this.hasInvalidProviderForm(this.editProviderForm)) {
      this.editProviderForm.markAllAsTouched();
      this.editRevision.update((revision) => revision + 1);
      return;
    }

    const changes = this.changedProviderValues(row.original, this.editProviderForm.getRawValue());
    if (Object.keys(changes).length === 0) {
      this.closeProviderEditDialog();
      return;
    }

    this.isSavingProviders.set(true);
    this.error.set(null);
    this.settingsApi
      .updateAiProvider(row.id, changes)
      .pipe(finalize(() => this.isSavingProviders.set(false)))
      .subscribe({
        next: (provider) => {
          this.replaceProvider(provider);
          this.isProviderEditDialogOpen.set(false);
          this.editingProviderId.set(null);
          this.editProviderForm.reset({
            isDisabled: false,
            name: '',
            baseUrl: '',
            selectedMetadataModel: '',
            apiKey: '',
          });
          this.editRevision.update((revision) => revision + 1);
        },
        error: () => this.error.set('settings.ai.errors.providerUpdateFailed'),
      });
  }

  createProvider(): void {
    if (this.isCreatingProvider()) {
      return;
    }

    if (!this.canCreateProvider()) {
      this.createProviderForm.markAllAsTouched();
      this.editRevision.update((revision) => revision + 1);
      return;
    }

    this.isCreatingProvider.set(true);
    this.error.set(null);
    this.settingsApi
      .createAiProvider(this.providerCreateInput(this.createProviderForm))
      .pipe(finalize(() => this.isCreatingProvider.set(false)))
      .subscribe({
        next: (provider) => {
          this.replaceProvider(provider);
          this.isProviderCreateDialogOpen.set(false);
          this.resetCreateProviderForm();
          this.editRevision.update((revision) => revision + 1);
        },
        error: () => this.error.set('settings.ai.errors.providerCreateFailed'),
      });
  }

  loadCreateProviderModels(): void {
    if (!this.canLoadCreateProviderModels()) {
      this.createProviderForm.controls.baseUrl.markAsTouched();
      this.createProviderForm.controls.apiKey.markAsTouched();
      this.editRevision.update((revision) => revision + 1);
      return;
    }

    this.isLoadingCreateProviderModels.set(true);
    this.error.set(null);
    this.settingsApi
      .loadAiProviderModels(this.providerModelsPreviewInput(this.createProviderForm))
      .pipe(finalize(() => this.isLoadingCreateProviderModels.set(false)))
      .subscribe({
        next: ({ models }) => {
          this.createProviderModels.set(models);
          this.createProviderForm.controls.selectedMetadataModel.setValue('');
          if (models.length === 0) {
            this.createProviderModelSource.set(null);
            this.error.set('settings.ai.errors.modelPreviewEmpty');
            return;
          }

          this.createProviderModelSource.set(
            createProviderModelSource(this.createProviderForm),
          );
          this.editRevision.update((revision) => revision + 1);
        },
        error: () => {
          this.resetCreateProviderModels();
          this.error.set('settings.ai.errors.modelPreviewFailed');
        },
      });
  }

  deleteProvider(row: EditableAiProviderRow): void {
    if (this.isSavingProviders()) {
      return;
    }

    this.error.set(null);
    this.isSavingProviders.set(true);
    this.settingsApi
      .deleteAiProvider(row.id)
      .pipe(finalize(() => this.isSavingProviders.set(false)))
      .subscribe({
        next: () => {
          this.providerRows.update((rows) => rows.filter((entry) => entry.id !== row.id));
          this.originalProviderOrder.update((ids) => ids.filter((id) => id !== row.id));
          this.editRevision.update((revision) => revision + 1);
        },
        error: () => this.error.set('settings.ai.errors.providerRemoveFailed'),
      });
  }

  dropProvider(event: CdkDragDrop<EditableAiProviderRow[]>): void {
    if (event.previousIndex === event.currentIndex || this.isSavingProviders()) {
      return;
    }

    const visibleRows = [...this.visibleProviderRows()];
    moveItemInArray(visibleRows, event.previousIndex, event.currentIndex);
    this.providerRows.set(visibleRows);
    this.editRevision.update((revision) => revision + 1);
  }

  saveProviderChanges(): void {
    if (this.isSavingProviders() || !this.hasProviderChanges()) {
      return;
    }

    if (this.hasInvalidProviderChanges()) {
      for (const row of this.visibleProviderRows()) {
        if (this.hasProviderRowChanges(row)) {
          row.form.markAllAsTouched();
        }
      }
      this.editRevision.update((revision) => revision + 1);
      return;
    }

    const rows = this.providerRows();
    const updateRows = rows.filter((row) => this.hasProviderRowChanges(row));

    this.error.set(null);
    this.isSavingProviders.set(true);
    const saveRequests: Observable<unknown>[] = [
      ...updateRows.map((row) =>
        this.settingsApi.updateAiProvider(row.id, this.changedProviderFields(row)),
      ),
    ];
    runRequests(saveRequests)
      .pipe(
        switchMap(() => {
          if (!this.hasProviderOrderChanges() || rows.length === 0) {
            return of(null);
          }

          return this.settingsApi.reorderAiProviders({
            providerIds: rows.map((row) => row.id),
          });
        }),
        finalize(() => this.isSavingProviders.set(false)),
      )
      .subscribe({
        next: () => this.loadProviders(),
        error: () => this.error.set('settings.ai.errors.providerUpdateFailed'),
      });
  }

  revertProviderChanges(): void {
    this.providerRows.update((rows) =>
      rows
        .map((row) => {
          row.form.reset({
            isDisabled: row.original.isDisabled,
            name: row.original.name,
            baseUrl: row.original.baseUrl,
            selectedMetadataModel: row.original.selectedMetadataModel,
            apiKey: '',
          });
          return row;
        })
        .sort(
          (left, right) =>
            this.originalProviderOrder().indexOf(left.id) -
            this.originalProviderOrder().indexOf(right.id),
        ),
    );
    this.editRevision.update((revision) => revision + 1);
  }

  refreshModels(provider: AiProviderDto): void {
    this.providerActionId.set(provider.id);
    this.settingsApi
      .refreshAiProviderModels(provider.id)
      .pipe(finalize(() => this.providerActionId.set(null)))
      .subscribe({
        next: (updated) => this.replaceProvider(updated),
        error: () => this.error.set('settings.ai.errors.modelRefreshFailed'),
      });
  }

  clearProviderApiKey(provider: AiProviderDto): void {
    this.updateProvider(provider, { apiKey: null });
  }

  promptDraft(prompt: AiMetadataPromptDto): string {
    return this.promptDrafts()[prompt.key] ?? prompt.promptText;
  }

  updatePromptDraft(prompt: AiMetadataPromptDto, value: string): void {
    this.promptDrafts.update((drafts) => ({ ...drafts, [prompt.key]: value }));
  }

  promptChanged(prompt: AiMetadataPromptDto): boolean {
    return this.promptDraft(prompt).trim() !== prompt.promptText.trim();
  }

  savePrompt(prompt: AiMetadataPromptDto): void {
    const promptText = this.promptDraft(prompt).trim();
    if (!promptText || !this.promptChanged(prompt)) {
      return;
    }
    this.savingPromptKey.set(prompt.key);
    this.settingsApi
      .updateAiMetadataPrompt(prompt.key, { promptText })
      .pipe(finalize(() => this.savingPromptKey.set(null)))
      .subscribe({
        next: (updated) => this.replacePrompt(updated),
        error: () => this.error.set('settings.ai.errors.promptUpdateFailed'),
      });
  }

  resetPrompt(prompt: AiMetadataPromptDto): void {
    this.savingPromptKey.set(prompt.key);
    this.settingsApi
      .resetAiMetadataPrompt(prompt.key)
      .pipe(finalize(() => this.savingPromptKey.set(null)))
      .subscribe({
        next: (updated) => this.replacePrompt(updated),
        error: () => this.error.set('settings.ai.errors.promptUpdateFailed'),
      });
  }

  isPromptSaving(prompt: AiMetadataPromptDto): boolean {
    return this.savingPromptKey() === prompt.key;
  }

  isProviderFieldChanged(
    row: EditableAiProviderRow,
    field: keyof ProviderEditValue | 'apiKey',
  ): boolean {
    this.editRevision();
    const original = row.original;
    if (!original) {
      return false;
    }

    const value = row.form.getRawValue();
    if (field === 'apiKey') {
      return value.apiKey.trim().length > 0;
    }

    if (field === 'selectedMetadataModel') {
      return value.selectedMetadataModel.trim() !== original.selectedMetadataModel;
    }

    if (field === 'name' || field === 'baseUrl') {
      return value[field].trim() !== original[field];
    }

    if (field === 'priority') {
      return (
        this.hasProviderOrderChanges() && this.providerDisplayPriority(row) !== original.priority
      );
    }

    return value[field] !== original[field];
  }

  providerStatusColor(status: AiProviderStatus): string {
    switch (status) {
      case 'AVAILABLE':
        return 'success';
      case 'UNAVAILABLE':
        return 'error';
      case 'UNKNOWN':
        return 'default';
    }
  }

  providerStatusIcon(status: AiProviderStatus): string {
    switch (status) {
      case 'AVAILABLE':
        return 'check-circle';
      case 'UNAVAILABLE':
        return 'exclamation-circle';
      case 'UNKNOWN':
        return 'question-circle';
    }
  }

  isProviderActionRunning(provider: AiProviderDto): boolean {
    return this.providerActionId() === provider.id;
  }

  canLoadCreateProviderModels(): boolean {
    return (
      !this.isCreatingProvider() &&
      !this.isLoadingCreateProviderModels() &&
      this.createProviderForm.controls.baseUrl.valid &&
      this.createProviderForm.controls.apiKey.valid
    );
  }

  hasLoadedCreateProviderModels(): boolean {
    return this.createProviderModelSource() !== null && this.createProviderModels().length > 0;
  }

  canCreateProvider(): boolean {
    return (
      !this.isCreatingProvider() &&
      !this.isLoadingCreateProviderModels() &&
      this.hasLoadedCreateProviderModels() &&
      !this.hasInvalidProviderForm(this.createProviderForm)
    );
  }

  hasProviderModel(row: EditableAiProviderRow, model: string): boolean {
    return row.provider?.availableModels.some((entry) => entry.name === model) ?? false;
  }

  modelOptionLabel(model: AiProviderModelDto): string {
    return model.ownedBy ? `${model.name} (${model.ownedBy})` : model.name;
  }

  editingProvider(): EditableAiProviderRow | null {
    const providerId = this.editingProviderId();
    return this.visibleProviderRows().find((row) => row.id === providerId) ?? null;
  }

  private setProviderRows(providers: AiProviderDto[]): void {
    const sortedProviders = [...providers].sort(providerSort);
    this.providerRows.set(sortedProviders.map((provider) => this.providerRow(provider)));
    this.originalProviderOrder.set(sortedProviders.map((provider) => provider.id));
    this.editRevision.update((revision) => revision + 1);
  }

  private providerRow(provider: AiProviderDto): EditableAiProviderRow {
    const original = providerEditValue(provider);
    return {
      id: provider.id,
      form: this.providerForm(original),
      original,
      provider,
      priority: provider.priority,
    };
  }

  private providerForm(value: ProviderEditValue): ProviderEditForm {
    const form = new FormGroup({
      isDisabled: new FormControl(value.isDisabled, { nonNullable: true }),
      name: new FormControl(value.name, {
        nonNullable: true,
        validators: [Validators.required, Validators.maxLength(NAME_MAX_LENGTH)],
      }),
      baseUrl: new FormControl(value.baseUrl, {
        nonNullable: true,
        validators: [Validators.required, Validators.maxLength(URL_MAX_LENGTH)],
      }),
      selectedMetadataModel: new FormControl(value.selectedMetadataModel, {
        nonNullable: true,
        validators: [Validators.maxLength(MODEL_MAX_LENGTH)],
      }),
      apiKey: new FormControl('', {
        nonNullable: true,
        validators: [Validators.maxLength(API_KEY_MAX_LENGTH)],
      }),
    });

    form.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.editRevision.update((revision) => revision + 1);
    });

    return form;
  }

  private providerCreateForm(value: ProviderEditValue): ProviderCreateForm {
    const form = new FormGroup({
      name: new FormControl(value.name, {
        nonNullable: true,
        validators: [Validators.required, Validators.maxLength(NAME_MAX_LENGTH)],
      }),
      baseUrl: new FormControl(value.baseUrl, {
        nonNullable: true,
        validators: [Validators.required, Validators.maxLength(URL_MAX_LENGTH)],
      }),
      selectedMetadataModel: new FormControl(value.selectedMetadataModel, {
        nonNullable: true,
        validators: [
          Validators.required,
          Validators.maxLength(MODEL_MAX_LENGTH),
        ],
      }),
      apiKey: new FormControl('', {
        nonNullable: true,
        validators: [Validators.maxLength(API_KEY_MAX_LENGTH)],
      }),
    });

    form.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      const loadedSource = this.createProviderModelSource();
      if (loadedSource && !sameProviderModelSource(loadedSource, createProviderModelSource(form))) {
        this.resetCreateProviderModels();
      }
      this.editRevision.update((revision) => revision + 1);
    });

    return form;
  }

  private providerCreateInput(form: ProviderCreateForm): CreateAiProviderRequest {
    const value = form.getRawValue();
    const apiKey = value.apiKey.trim();
    return {
      name: value.name.trim(),
      baseUrl: value.baseUrl.trim(),
      selectedMetadataModel: value.selectedMetadataModel.trim(),
      apiKey: apiKey || undefined,
      isActive: true,
      priority: this.nextProviderPriority(),
    };
  }

  private providerModelsPreviewInput(form: ProviderCreateForm): LoadAiProviderModelsRequest {
    const source = createProviderModelSource(form);
    return {
      baseUrl: source.baseUrl,
      ...(source.apiKey ? { apiKey: source.apiKey } : {}),
    };
  }

  private changedProviderFields(row: EditableAiProviderRow): UpdateAiProviderRequest {
    return this.changedProviderValues(row.original, row.form.getRawValue());
  }

  private changedProviderValues(
    original: ProviderEditValue,
    value: ReturnType<ProviderEditForm['getRawValue']>,
  ): UpdateAiProviderRequest {
    const changes: UpdateAiProviderRequest = {};

    if (value.name.trim() !== original.name) {
      changes.name = value.name.trim();
    }

    if (value.baseUrl.trim() !== original.baseUrl) {
      changes.baseUrl = value.baseUrl.trim();
    }

    if (value.selectedMetadataModel.trim() !== original.selectedMetadataModel) {
      changes.selectedMetadataModel = value.selectedMetadataModel.trim() || null;
    }

    if (value.isDisabled !== original.isDisabled) {
      changes.isActive = !value.isDisabled;
    }

    if (value.apiKey.trim()) {
      changes.apiKey = value.apiKey.trim();
    }

    return changes;
  }

  private hasProviderRowChanges(row: EditableAiProviderRow): boolean {
    const original = row.original;
    const value = row.form.getRawValue();
    return (
      value.name.trim() !== original.name ||
      value.baseUrl.trim() !== original.baseUrl ||
      value.selectedMetadataModel.trim() !== original.selectedMetadataModel ||
      value.isDisabled !== original.isDisabled ||
      value.apiKey.trim().length > 0
    );
  }

  private hasProviderOrderChanges(): boolean {
    const currentOrder = this.visibleProviderRows().map((row) => row.id);
    const originalOrder = this.originalProviderOrder();
    return (
      currentOrder.length !== originalOrder.length || !sameStringList(currentOrder, originalOrder)
    );
  }

  private hasInvalidProviderRow(row: EditableAiProviderRow): boolean {
    return this.hasInvalidProviderForm(row.form);
  }

  private hasInvalidProviderForm(form: ProviderEditForm | ProviderCreateForm): boolean {
    const value = form.getRawValue();
    return form.invalid || value.name.trim().length === 0 || value.baseUrl.trim().length === 0;
  }

  private nextProviderPriority(): number {
    const maxPriority = this.providerRows().reduce(
      (priority, row) => Math.max(priority, row.priority),
      0,
    );
    return maxPriority + 10;
  }

  private providerDisplayPriority(row: EditableAiProviderRow): number {
    return (this.visibleProviderRows().indexOf(row) + 1) * 10;
  }

  private updateProvider(provider: AiProviderDto, input: UpdateAiProviderRequest): void {
    this.settingsApi.updateAiProvider(provider.id, input).subscribe({
      next: (updated) => this.replaceProvider(updated),
      error: () => this.error.set('settings.ai.errors.providerUpdateFailed'),
    });
  }

  private replaceProvider(provider: AiProviderDto): void {
    let isNewProvider = false;
    this.providerRows.update((rows) => {
      const index = rows.findIndex((entry) => entry.id === provider.id);
      if (index < 0) {
        isNewProvider = true;
        return [...rows, this.providerRow(provider)].sort(providerRowSort);
      }

      return rows
        .map((row) => {
          if (row.id !== provider.id) {
            return row;
          }

          const original = providerEditValue(provider);
          if (this.hasProviderRowChanges(row)) {
            return { ...row, provider, original, priority: provider.priority };
          }

          return this.providerRow(provider);
        })
        .sort(providerRowSort);
    });
    if (isNewProvider) {
      this.originalProviderOrder.update((ids) =>
        ids.includes(provider.id) ? ids : [...ids, provider.id],
      );
    }
    this.editRevision.update((revision) => revision + 1);
  }

  private replacePrompt(prompt: AiMetadataPromptDto): void {
    this.aiMetadataPrompts.update((prompts) =>
      prompts.map((entry) => (entry.key === prompt.key ? prompt : entry)),
    );
    this.promptDrafts.update((drafts) => ({ ...drafts, [prompt.key]: prompt.promptText }));
  }

  private applyProviderChange(
    event: ReturnType<RealtimeClientService['latestAiProviderChange']>,
  ): void {
    if (event?.action === 'DELETE') {
      this.providerRows.update((rows) =>
        rows.filter((provider) => provider.id !== event.providerId),
      );
      this.originalProviderOrder.update((ids) => ids.filter((id) => id !== event.providerId));
      this.editRevision.update((revision) => revision + 1);
      return;
    }
    if (event?.provider) {
      this.replaceProvider(event.provider);
    }
  }

  private providerChangeKey(
    event: ReturnType<RealtimeClientService['latestAiProviderChange']>,
  ): string | null {
    return event ? `${event.providerId}:${event.changedAt}:${event.reason}` : null;
  }

  private resetCreateProviderForm(): void {
    this.createProviderForm.reset({
      name: DEFAULT_NEW_PROVIDER.name,
      baseUrl: DEFAULT_NEW_PROVIDER.baseUrl,
      selectedMetadataModel: '',
      apiKey: '',
    });
    this.resetCreateProviderModels();
    this.editRevision.update((revision) => revision + 1);
  }

  private resetCreateProviderModels(): void {
    this.createProviderModels.set([]);
    this.createProviderModelSource.set(null);
    if (this.createProviderForm.controls.selectedMetadataModel.value) {
      this.createProviderForm.controls.selectedMetadataModel.setValue('', {
        emitEvent: false,
      });
    }
  }
}

function providerEditValue(provider: AiProviderDto): ProviderEditValue {
  return {
    isDisabled: !provider.isActive,
    name: provider.name,
    baseUrl: provider.baseUrl,
    selectedMetadataModel: provider.selectedMetadataModel ?? provider.selectedModel ?? '',
    priority: provider.priority,
  };
}

function providerSort(left: AiProviderDto, right: AiProviderDto): number {
  return left.priority - right.priority || left.name.localeCompare(right.name);
}

function providerRowSort(left: EditableAiProviderRow, right: EditableAiProviderRow): number {
  return (
    left.priority - right.priority ||
    left.form.controls.name.value.localeCompare(right.form.controls.name.value)
  );
}

function runRequests<T>(requests: readonly Observable<T>[]): Observable<T[]> {
  return requests.length === 0 ? of([] as T[]) : forkJoin([...requests]);
}

function createProviderModelSource(form: ProviderCreateForm): ProviderModelSource {
  const value = form.getRawValue();
  return {
    baseUrl: value.baseUrl.trim(),
    apiKey: value.apiKey.trim(),
  };
}

function sameProviderModelSource(
  left: ProviderModelSource,
  right: ProviderModelSource,
): boolean {
  return left.baseUrl === right.baseUrl && left.apiKey === right.apiKey;
}

function sameStringList(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}
