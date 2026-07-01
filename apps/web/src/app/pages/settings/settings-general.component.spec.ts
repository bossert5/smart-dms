import { TestBed } from '@angular/core/testing';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { SaveOutline } from '@ant-design/icons-angular/icons';
import type { SystemSettingsDto } from '@smart-dms/shared-dto';
import { provideNzIcons } from 'ng-zorro-antd/icon';
import { of, throwError } from 'rxjs';
import { SettingsApiService } from '../../core/api/settings-api.service';
import { provideI18nTesting } from '../../testing/i18n-testing';
import { SettingsGeneralComponent } from './settings-general.component';

const settings: SystemSettingsDto = {
  ocrReprocessExistingTextLayer: false,
  pdfRemoveBlankPages: false,
  documentsRequireAiMetadataBeforeAcceptance: false,
  extractionMode: 'fast',
  aiMetadataLanguage: 'DOCUMENT_LANGUAGE',
};

describe('SettingsGeneralComponent', () => {
  it('loads settings and saves toggle changes', async () => {
    const settingsApi = {
      get: vi.fn().mockReturnValue(of(settings)),
      update: vi.fn().mockReturnValue(
        of({
          ocrReprocessExistingTextLayer: true,
          pdfRemoveBlankPages: true,
          documentsRequireAiMetadataBeforeAcceptance: true,
          extractionMode: 'fast',
          aiMetadataLanguage: 'eng',
        }),
      ),
    };

    await TestBed.configureTestingModule({
      imports: [SettingsGeneralComponent],
      providers: [
        provideAnimationsAsync(),
        provideI18nTesting(),
        provideNzIcons([SaveOutline]),
        { provide: SettingsApiService, useValue: settingsApi },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(SettingsGeneralComponent);
    fixture.detectChanges();
    await fixture.whenStable();

    const component = fixture.componentInstance;
    expect(component.settingsForm.controls.ocrReprocessExistingTextLayer.value).toBe(false);
    expect(component.settingsForm.controls.pdfRemoveBlankPages.value).toBe(false);
    expect(component.settingsForm.controls.documentsRequireAiMetadataBeforeAcceptance.value).toBe(
      false,
    );
    expect(component.settingsForm.controls.aiMetadataLanguage.value).toBe(
      'DOCUMENT_LANGUAGE',
    );
    expect(fixture.nativeElement.querySelector('[data-testid="language-selector"]')).not.toBeNull();
    expect(
      fixture.nativeElement.querySelector(
        'nz-select[formcontrolname="aiMetadataLanguage"]',
      ),
    ).not.toBeNull();

    component.settingsForm.controls.ocrReprocessExistingTextLayer.setValue(true);
    component.settingsForm.controls.pdfRemoveBlankPages.setValue(true);
    component.settingsForm.controls.documentsRequireAiMetadataBeforeAcceptance.setValue(true);
    component.settingsForm.controls.aiMetadataLanguage.setValue('eng');
    component.save();

    expect(settingsApi.update).toHaveBeenCalledWith({
      ocrReprocessExistingTextLayer: true,
      pdfRemoveBlankPages: true,
      documentsRequireAiMetadataBeforeAcceptance: true,
      aiMetadataLanguage: 'eng',
    });
  });

  it('shows an error when settings cannot be loaded', async () => {
    const settingsApi = {
      get: vi.fn().mockReturnValue(throwError(() => new Error('failed'))),
      update: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [SettingsGeneralComponent],
      providers: [
        provideAnimationsAsync(),
        provideI18nTesting(),
        provideNzIcons([SaveOutline]),
        { provide: SettingsApiService, useValue: settingsApi },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(SettingsGeneralComponent);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(fixture.componentInstance.error()).toBe('settings.general.errors.loadFailed');
  });
});
