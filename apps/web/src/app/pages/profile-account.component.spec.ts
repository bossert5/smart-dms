import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideRouter } from '@angular/router';
import {
  CheckCircleOutline,
  CloseCircleOutline,
  EyeInvisibleOutline,
  EyeOutline,
  SettingOutline,
} from '@ant-design/icons-angular/icons';
import { provideNzIcons } from 'ng-zorro-antd/icon';
import { of } from 'rxjs';
import { AuthService } from '../core/services/auth.service';
import { NotificationCenterService } from '../core/services/notification-center.service';
import { TenantContextService, ALL_TENANTS_SCOPE } from '../core/services/tenant-context.service';
import { ThemeService } from '../core/services/theme.service';
import {
  UserPreferencesService,
  USER_START_ROUTE_OPTIONS,
  type UserStartRoute,
} from '../core/services/user-preferences.service';
import { LanguageService, type SupportedLanguage } from '../core/i18n/language.service';
import { provideI18nTesting } from '../testing/i18n-testing';
import { AccountSettingsComponent } from './account-settings/account-settings.component';

const tenant = {
  id: '00000000-0000-4000-8000-000000000010',
  key: 'default',
  name: 'Default',
  isActive: true,
};

describe('account settings page', () => {
  it('applies account settings through the existing services', async () => {
    TestBed.resetTestingModule();
    const currentLanguage = signal<SupportedLanguage>('en');
    const isDark = signal(false);
    const activeScope = signal<string>(ALL_TENANTS_SCOPE);
    const isMuted = signal(false);
    const startRoute = signal<UserStartRoute>('/documents');
    const language = {
      currentLanguage,
      options: [
        { code: 'en' as const, labelKey: 'language.options.en' },
        { code: 'de' as const, labelKey: 'language.options.de' },
      ],
      use: vi.fn((nextLanguage: SupportedLanguage) => currentLanguage.set(nextLanguage)),
    };
    const theme = {
      isDark,
      use: vi.fn((nextTheme: 'light' | 'dark') => isDark.set(nextTheme === 'dark')),
    };
    const tenantContext = {
      activeScope,
      activeTenants: signal([tenant]),
      setScope: vi.fn((nextScope: string) => activeScope.set(nextScope)),
    };
    const notifications = {
      isMuted,
      unreadCount: signal(3),
      setMuted: vi.fn((nextMuted: boolean) => isMuted.set(nextMuted)),
      markSeen: vi.fn(),
    };
    const preferences = {
      startRoute,
      startRouteOptions: USER_START_ROUTE_OPTIONS,
      setStartRoute: vi.fn((nextRoute: UserStartRoute) => startRoute.set(nextRoute)),
    };
    const auth = {
      changePassword: vi.fn().mockReturnValue(of(undefined)),
    };

    await TestBed.configureTestingModule({
      imports: [AccountSettingsComponent],
      providers: [
        provideAnimationsAsync(),
        provideI18nTesting(),
        provideRouter([]),
        { provide: AuthService, useValue: auth },
        { provide: LanguageService, useValue: language },
        { provide: ThemeService, useValue: theme },
        { provide: TenantContextService, useValue: tenantContext },
        { provide: NotificationCenterService, useValue: notifications },
        { provide: UserPreferencesService, useValue: preferences },
        provideNzIcons([
          CheckCircleOutline,
          CloseCircleOutline,
          EyeInvisibleOutline,
          EyeOutline,
          SettingOutline,
        ]),
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(AccountSettingsComponent);
    fixture.detectChanges();

    fixture.componentInstance.settingsForm.controls.language.setValue('de');
    fixture.componentInstance.settingsForm.controls.isDarkTheme.setValue(true);
    fixture.componentInstance.settingsForm.controls.tenantScope.setValue(tenant.id);
    fixture.componentInstance.settingsForm.controls.notificationsMuted.setValue(true);
    fixture.componentInstance.settingsForm.controls.startRoute.setValue('/dashboard');

    expect(language.use).toHaveBeenCalledWith('de');
    expect(theme.use).toHaveBeenCalledWith('dark');
    expect(tenantContext.setScope).toHaveBeenCalledWith(tenant.id);
    expect(notifications.setMuted).toHaveBeenCalledWith(true);
    expect(preferences.setStartRoute).toHaveBeenCalledWith('/dashboard');

    const text = fixture.nativeElement.textContent as string;

    expect(text).toContain('Appearance');
    expect(text).toContain('Workspace');
    expect(text).toContain('Security & Notifications');

    fixture.componentInstance.openPasswordDialog();
    fixture.componentInstance.passwordForm.setValue({
      currentPassword: 'Admin123!',
      newPassword: 'Admin456!',
      confirmPassword: 'Admin456!',
    });
    fixture.componentInstance.submitPasswordChange();

    expect(auth.changePassword).toHaveBeenCalledWith({
      currentPassword: 'Admin123!',
      newPassword: 'Admin456!',
    });
    expect(fixture.componentInstance.isPasswordDialogOpen()).toBe(false);
    expect(fixture.componentInstance.passwordSuccess()).toBe('accountSettings.password.success');
  });
});
