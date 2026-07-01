import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import {
  AppstoreOutline,
  CheckCircleOutline,
  CloseCircleOutline,
  DeleteOutline,
  ExclamationCircleOutline,
  HolderOutline,
  PlusOutline,
  QuestionCircleOutline,
  ReloadOutline,
  RollbackOutline,
  SaveOutline,
  UndoOutline,
} from '@ant-design/icons-angular/icons';
import type { AiProviderDto, RealtimeAiProviderChangedEvent } from '@smart-dms/shared-dto';
import { provideNzIcons } from 'ng-zorro-antd/icon';
import { of, Subject, throwError } from 'rxjs';
import { SettingsApiService } from '../../core/api/settings-api.service';
import { RealtimeClientService } from '../../core/services/realtime-client.service';
import { provideI18nTesting } from '../../testing/i18n-testing';
import { SettingsAiComponent } from './settings-ai.component';

const now = '2026-05-08T00:00:00.000Z';

const aiProvider: AiProviderDto = {
  id: '018f1a44-9093-7f55-a515-278f4d9bd777',
  name: 'Local Ollama',
  type: 'OPENAI_COMPATIBLE',
  baseUrl: 'http://localhost:11434/v1',
  selectedModel: 'qwen3:8b',
  selectedMetadataModel: 'qwen3:8b',
  priority: 1,
  isActive: true,
  status: 'AVAILABLE',
  lastCheckedAt: now,
  lastError: null,
  availableModels: [
    {
      name: 'qwen3:8b',
      model: 'qwen3:8b',
      createdAt: now,
      ownedBy: 'library',
    },
  ],
  hasApiKey: false,
  createdAt: now,
  updatedAt: now,
  isAvailable: true,
};

function createSettingsApiMock(providers: AiProviderDto[] = [aiProvider]) {
  return {
    aiProviders: vi.fn().mockReturnValue(of(providers)),
    aiMetadataPrompts: vi.fn().mockReturnValue(of([])),
    loadAiProviderModels: vi.fn().mockReturnValue(of({ models: aiProvider.availableModels })),
    createAiProvider: vi.fn().mockReturnValue(of(aiProvider)),
    updateAiProvider: vi.fn().mockReturnValue(of(aiProvider)),
    deleteAiProvider: vi.fn().mockReturnValue(of({ success: true })),
    reorderAiProviders: vi.fn().mockReturnValue(of(providers)),
    refreshAiProviderModels: vi.fn().mockReturnValue(of(aiProvider)),
    updateAiMetadataPrompt: vi.fn(),
    resetAiMetadataPrompt: vi.fn(),
  };
}

function tableHeaders(root: HTMLElement): string[] {
  return Array.from(root.querySelectorAll('.ai-provider-settings-table thead th')).map(
    (header) => header.textContent?.trim() ?? '',
  );
}

async function createComponent(
  settingsApi = createSettingsApiMock(),
  latestAiProviderChange = signal<RealtimeAiProviderChangedEvent | null>(null),
): Promise<ComponentFixture<SettingsAiComponent>> {
  TestBed.configureTestingModule({
    imports: [SettingsAiComponent],
    providers: [
      provideAnimationsAsync(),
      provideI18nTesting(),
      provideNzIcons([
        AppstoreOutline,
        CheckCircleOutline,
        CloseCircleOutline,
        DeleteOutline,
        ExclamationCircleOutline,
        HolderOutline,
        PlusOutline,
        QuestionCircleOutline,
        ReloadOutline,
        RollbackOutline,
        SaveOutline,
        UndoOutline,
      ]),
      { provide: SettingsApiService, useValue: settingsApi },
      {
        provide: RealtimeClientService,
        useValue: {
          isConnected: signal(true),
          latestAiProviderChange,
          connectionRevision: signal(1),
        },
      },
    ],
  });

  const fixture = TestBed.createComponent(SettingsAiComponent);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

describe('SettingsAiComponent', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('loads AI providers and prompts', async () => {
    const settingsApi = createSettingsApiMock();
    const fixture = await createComponent(settingsApi);

    expect(settingsApi.aiProviders).toHaveBeenCalledTimes(1);
    expect(fixture.componentInstance.aiProviders()).toEqual([aiProvider]);
  });

  it('renders a compact unlabeled provider actions column', async () => {
    const fixture = await createComponent();
    const headers = tableHeaders(fixture.nativeElement);

    expect(headers[0]).toBe('');
    expect(headers).toEqual([
      '',
      'Name',
      'OpenAI API base URL',
      'Metadata model',
      'API key',
      'Status',
      'Disabled',
      '',
    ]);
    expect(headers.at(-2)).toBe('Disabled');
    expect(headers.at(-1)).toBe('');
    expect(headers).not.toContain('Actions');
  });

  it('applies realtime provider updates', async () => {
    const latestAiProviderChange = signal<RealtimeAiProviderChangedEvent | null>(null);
    const fixture = await createComponent(createSettingsApiMock(), latestAiProviderChange);

    latestAiProviderChange.set({
      type: 'ai.provider.changed',
      providerId: aiProvider.id,
      action: 'UPSERT',
      reason: 'PROVIDER_HEALTH_CHANGED',
      changedAt: now,
      provider: { ...aiProvider, status: 'UNAVAILABLE', isAvailable: false },
    });
    fixture.detectChanges();

    expect(fixture.componentInstance.aiProviders()[0].status).toBe('UNAVAILABLE');
  });

  it('loads models before creating providers from the dialog fields', async () => {
    const settingsApi = createSettingsApiMock([]);
    const fixture = await createComponent(settingsApi);
    const component = fixture.componentInstance;

    component.addProvider();
    fixture.detectChanges();

    expect(document.body.querySelector('#create-ai-provider-metadata-model')).not.toBeNull();
    component.createProviderForm.patchValue({
      name: 'Office Ollama',
    });

    component.createProvider();
    expect(settingsApi.createAiProvider).not.toHaveBeenCalled();

    component.loadCreateProviderModels();
    component.createProviderForm.controls.selectedMetadataModel.setValue('qwen3:8b');
    component.createProvider();

    expect(settingsApi.loadAiProviderModels).toHaveBeenCalledWith({
      baseUrl: 'http://localhost:11434/v1',
    });
    expect(settingsApi.createAiProvider).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Office Ollama',
        selectedMetadataModel: 'qwen3:8b',
      }),
    );
    expect(component.visibleProviderRows()).toHaveLength(1);
    expect(component.isProviderCreateDialogOpen()).toBe(false);
  });

  it('resets loaded create models when provider connection fields change', async () => {
    const settingsApi = createSettingsApiMock([]);
    const fixture = await createComponent(settingsApi);
    const component = fixture.componentInstance;

    component.addProvider();
    component.loadCreateProviderModels();
    component.createProviderForm.controls.selectedMetadataModel.setValue('qwen3:8b');

    expect(component.hasLoadedCreateProviderModels()).toBe(true);
    expect(component.canCreateProvider()).toBe(true);

    component.createProviderForm.controls.baseUrl.setValue('http://localhost:11435/v1');

    expect(component.hasLoadedCreateProviderModels()).toBe(false);
    expect(component.createProviderForm.controls.selectedMetadataModel.value).toBe('');
    expect(component.canCreateProvider()).toBe(false);
  });

  it('does not duplicate providers when realtime creation arrives before the create response', async () => {
    const createResponse = new Subject<AiProviderDto>();
    const latestAiProviderChange = signal<RealtimeAiProviderChangedEvent | null>(null);
    const settingsApi = {
      ...createSettingsApiMock([]),
      createAiProvider: vi.fn().mockReturnValue(createResponse.asObservable()),
    };
    const fixture = await createComponent(settingsApi, latestAiProviderChange);
    const component = fixture.componentInstance;

    component.addProvider();
    component.loadCreateProviderModels();
    component.createProviderForm.controls.selectedMetadataModel.setValue('qwen3:8b');
    component.createProvider();

    latestAiProviderChange.set({
      type: 'ai.provider.changed',
      providerId: aiProvider.id,
      action: 'UPSERT',
      reason: 'PROVIDER_CREATED',
      changedAt: now,
      provider: aiProvider,
    });
    fixture.detectChanges();

    expect(component.visibleProviderRows()).toHaveLength(1);

    createResponse.next(aiProvider);
    createResponse.complete();

    expect(component.visibleProviderRows()).toHaveLength(1);
    expect(component.visibleProviderRows()[0].id).toBe(aiProvider.id);
    expect(component.isProviderCreateDialogOpen()).toBe(false);
    expect(component.hasProviderChanges()).toBe(false);
  });

  it('does not create providers from invalid dialog fields', async () => {
    const settingsApi = createSettingsApiMock([]);
    const fixture = await createComponent(settingsApi);
    const component = fixture.componentInstance;

    component.addProvider();
    component.createProviderForm.controls.name.setValue('');
    component.createProviderForm.controls.baseUrl.setValue('');
    component.createProvider();

    expect(settingsApi.createAiProvider).not.toHaveBeenCalled();
    expect(component.isProviderCreateDialogOpen()).toBe(true);
  });

  it('saves inline provider edits', async () => {
    const settingsApi = createSettingsApiMock();
    const fixture = await createComponent(settingsApi);
    const component = fixture.componentInstance;
    const row = component.visibleProviderRows()[0];

    row.form.controls.name.setValue('Office Ollama');
    component.saveProviderChanges();

    expect(settingsApi.updateAiProvider).toHaveBeenCalledWith(
      aiProvider.id,
      expect.objectContaining({ name: 'Office Ollama' }),
    );
    expect(settingsApi.deleteAiProvider).not.toHaveBeenCalled();
  });

  it('deletes providers immediately after confirmation', async () => {
    const settingsApi = createSettingsApiMock();
    const fixture = await createComponent(settingsApi);
    const component = fixture.componentInstance;
    const row = component.visibleProviderRows()[0];

    component.deleteProvider(row);

    expect(settingsApi.deleteAiProvider).toHaveBeenCalledWith(aiProvider.id);
    expect(component.visibleProviderRows()).toHaveLength(0);
    expect(component.hasProviderChanges()).toBe(false);
  });

  it('keeps pending provider edits after an immediate delete', async () => {
    const secondProvider: AiProviderDto = {
      ...aiProvider,
      id: '018f1a44-9093-7f55-a515-278f4d9bd778',
      name: 'Office Ollama',
      priority: 2,
    };
    const settingsApi = createSettingsApiMock([aiProvider, secondProvider]);
    const fixture = await createComponent(settingsApi);
    const component = fixture.componentInstance;
    const editRow = component.visibleProviderRows()[0];
    const deleteRow = component.visibleProviderRows()[1];
    editRow.form.controls.name.setValue('Renamed Ollama');

    component.deleteProvider(deleteRow);

    expect(settingsApi.deleteAiProvider).toHaveBeenCalledWith(secondProvider.id);
    expect(settingsApi.updateAiProvider).not.toHaveBeenCalled();
    expect(component.visibleProviderRows()).toHaveLength(1);
    expect(component.hasProviderChanges()).toBe(true);
  });

  it('keeps provider rows when immediate deletion fails', async () => {
    const settingsApi = {
      ...createSettingsApiMock(),
      deleteAiProvider: vi.fn().mockReturnValue(throwError(() => new Error('failed'))),
    };
    const fixture = await createComponent(settingsApi);
    const component = fixture.componentInstance;
    const row = component.visibleProviderRows()[0];

    component.deleteProvider(row);

    expect(component.visibleProviderRows()).toHaveLength(1);
    expect(component.error()).toBe('settings.ai.errors.providerRemoveFailed');
  });

  it('reverts inline provider edits', async () => {
    const fixture = await createComponent();
    const component = fixture.componentInstance;
    const row = component.visibleProviderRows()[0];

    row.form.controls.name.setValue('Office Ollama');
    expect(component.hasProviderChanges()).toBe(true);

    component.revertProviderChanges();

    expect(component.visibleProviderRows()[0].form.controls.name.value).toBe(aiProvider.name);
    expect(component.hasProviderChanges()).toBe(false);
  });

  it('refreshes provider models from the table action', async () => {
    const settingsApi = createSettingsApiMock();
    const fixture = await createComponent(settingsApi);
    const component = fixture.componentInstance;

    component.refreshModels(aiProvider);

    expect(settingsApi.refreshAiProviderModels).toHaveBeenCalledWith(aiProvider.id);
  });
});
