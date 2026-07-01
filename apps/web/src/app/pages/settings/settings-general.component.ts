import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import type { AiMetadataLanguage } from '@smart-dms/shared-dto';
import { TranslatePipe } from '@ngx-translate/core';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzSwitchModule } from 'ng-zorro-antd/switch';
import {
  catchError,
  debounceTime,
  distinctUntilChanged,
  EMPTY,
  finalize,
  switchMap,
  tap,
} from 'rxjs';
import { SettingsApiService } from '../../core/api/settings-api.service';
import { LanguageSelectorComponent } from '../../core/i18n/language-selector.component';

type SettingsForm = FormGroup<{
  ocrReprocessExistingTextLayer: FormControl<boolean>;
  pdfRemoveBlankPages: FormControl<boolean>;
  documentsRequireAiMetadataBeforeAcceptance: FormControl<boolean>;
  aiMetadataLanguage: FormControl<AiMetadataLanguage>;
}>;

type SettingsValue = ReturnType<SettingsForm['getRawValue']>;

const AUTO_SAVE_DEBOUNCE_MS = 300;
const AI_METADATA_LANGUAGE_OPTIONS: ReadonlyArray<{
  value: AiMetadataLanguage;
  labelKey: string;
}> = [
  {
    value: 'DOCUMENT_LANGUAGE',
    labelKey: 'settings.general.aiMetadataLanguage.options.documentLanguage',
  },
  { value: 'deu', labelKey: 'settings.general.aiMetadataLanguage.options.deu' },
  { value: 'eng', labelKey: 'settings.general.aiMetadataLanguage.options.eng' },
  { value: 'fra', labelKey: 'settings.general.aiMetadataLanguage.options.fra' },
  { value: 'spa', labelKey: 'settings.general.aiMetadataLanguage.options.spa' },
  { value: 'por', labelKey: 'settings.general.aiMetadataLanguage.options.por' },
  {
    value: 'chi_sim',
    labelKey: 'settings.general.aiMetadataLanguage.options.chiSim',
  },
];

@Component({
  selector: 'app-settings-general',
  imports: [
    ReactiveFormsModule,
    TranslatePipe,
    NzAlertModule,
    NzCardModule,
    NzFormModule,
    NzSelectModule,
    NzSwitchModule,
    LanguageSelectorComponent,
  ],
  templateUrl: './settings-general.component.html',
  styleUrl: './settings-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsGeneralComponent implements OnInit {
  private readonly settingsApi = inject(SettingsApiService);
  private readonly destroyRef = inject(DestroyRef);

  readonly isLoading = signal(false);
  readonly isSaving = signal(false);
  readonly error = signal<string | null>(null);
  readonly aiMetadataLanguageOptions = AI_METADATA_LANGUAGE_OPTIONS;
  readonly settingsForm: SettingsForm = new FormGroup({
    ocrReprocessExistingTextLayer: new FormControl(false, {
      nonNullable: true,
    }),
    pdfRemoveBlankPages: new FormControl(false, {
      nonNullable: true,
    }),
    documentsRequireAiMetadataBeforeAcceptance: new FormControl(false, {
      nonNullable: true,
    }),
    aiMetadataLanguage: new FormControl<AiMetadataLanguage>(
      'DOCUMENT_LANGUAGE',
      {
        nonNullable: true,
      },
    ),
  });

  ngOnInit(): void {
    this.subscribeToAutoSave();
    this.load();
  }

  load(): void {
    this.isLoading.set(true);
    this.error.set(null);
    this.settingsApi
      .get()
      .pipe(finalize(() => this.isLoading.set(false)))
      .subscribe({
        next: (settings) => {
          this.settingsForm.reset(
            {
              ocrReprocessExistingTextLayer: settings.ocrReprocessExistingTextLayer,
              pdfRemoveBlankPages: settings.pdfRemoveBlankPages,
              documentsRequireAiMetadataBeforeAcceptance:
                settings.documentsRequireAiMetadataBeforeAcceptance,
              aiMetadataLanguage: settings.aiMetadataLanguage,
            },
            { emitEvent: false },
          );
        },
        error: () => this.error.set('settings.general.errors.loadFailed'),
      });
  }

  save(): void {
    if (this.isSaving()) {
      return;
    }

    this.saveValue(this.settingsForm.getRawValue());
  }

  private subscribeToAutoSave(): void {
    this.settingsForm.valueChanges
      .pipe(
        debounceTime(AUTO_SAVE_DEBOUNCE_MS),
        distinctUntilChanged((previous, current) =>
          sameSettingsValue(previous as SettingsValue, current as SettingsValue),
        ),
        tap(() => {
          this.isSaving.set(true);
          this.error.set(null);
        }),
        switchMap(() =>
          this.settingsApi.update(this.settingsForm.getRawValue()).pipe(
            catchError(() => {
              this.error.set('settings.general.errors.saveFailed');
              return EMPTY;
            }),
            finalize(() => this.isSaving.set(false)),
          ),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((settings) => {
        this.applySavedSettings({
          ocrReprocessExistingTextLayer: settings.ocrReprocessExistingTextLayer,
          pdfRemoveBlankPages: settings.pdfRemoveBlankPages,
          documentsRequireAiMetadataBeforeAcceptance:
            settings.documentsRequireAiMetadataBeforeAcceptance,
          aiMetadataLanguage: settings.aiMetadataLanguage,
        });
      });
  }

  private saveValue(value: SettingsValue): void {
    if (this.isSaving()) {
      return;
    }

    this.isSaving.set(true);
    this.error.set(null);
    this.settingsApi
      .update(value)
      .pipe(finalize(() => this.isSaving.set(false)))
      .subscribe({
        next: (settings) => {
          this.applySavedSettings({
            ocrReprocessExistingTextLayer: settings.ocrReprocessExistingTextLayer,
            pdfRemoveBlankPages: settings.pdfRemoveBlankPages,
            documentsRequireAiMetadataBeforeAcceptance:
              settings.documentsRequireAiMetadataBeforeAcceptance,
            aiMetadataLanguage: settings.aiMetadataLanguage,
          });
        },
        error: () => this.error.set('settings.general.errors.saveFailed'),
      });
  }

  private applySavedSettings(value: SettingsValue): void {
    this.settingsForm.reset(value, { emitEvent: false });
  }
}

function sameSettingsValue(left: SettingsValue, right: SettingsValue): boolean {
  return (
    left.ocrReprocessExistingTextLayer === right.ocrReprocessExistingTextLayer &&
    left.pdfRemoveBlankPages === right.pdfRemoveBlankPages &&
    left.documentsRequireAiMetadataBeforeAcceptance ===
      right.documentsRequireAiMetadataBeforeAcceptance &&
    left.aiMetadataLanguage === right.aiMetadataLanguage
  );
}
