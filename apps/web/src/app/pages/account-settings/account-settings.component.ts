import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import type { TenantScope } from '@smart-dms/shared-dto';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzModalModule } from 'ng-zorro-antd/modal';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzSwitchModule } from 'ng-zorro-antd/switch';
import { NzTabsModule } from 'ng-zorro-antd/tabs';
import { finalize } from 'rxjs';
import { LanguageService, type SupportedLanguage } from '../../core/i18n/language.service';
import { AuthService } from '../../core/services/auth.service';
import { NotificationCenterService } from '../../core/services/notification-center.service';
import {
  TenantContextService,
  ALL_TENANTS_SCOPE,
} from '../../core/services/tenant-context.service';
import {
  buildPasswordRequirements,
  PASSWORD_DIGIT_PATTERN,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  type PasswordRequirement,
  passwordRequirementsMet,
  PASSWORD_SPECIAL_PATTERN,
} from '../../shared/presentation/password-requirements';
import {
  DEFAULT_USER_START_ROUTE,
  UserPreferencesService,
  type UserStartRoute,
} from '../../core/services/user-preferences.service';
import { ThemeService } from '../../core/services/theme.service';

type AccountSettingsForm = FormGroup<{
  language: FormControl<SupportedLanguage>;
  isDarkTheme: FormControl<boolean>;
  tenantScope: FormControl<TenantScope>;
  notificationsMuted: FormControl<boolean>;
  startRoute: FormControl<UserStartRoute>;
}>;

type PasswordDialogForm = FormGroup<{
  currentPassword: FormControl<string>;
  newPassword: FormControl<string>;
  confirmPassword: FormControl<string>;
}>;

interface TenantOption {
  readonly value: TenantScope;
  readonly labelKey: string | null;
  readonly label: string | null;
}

@Component({
  selector: 'app-account-settings',
  imports: [
    ReactiveFormsModule,
    TranslatePipe,
    NzAlertModule,
    NzButtonModule,
    NzCardModule,
    NzFormModule,
    NzIconModule,
    NzInputModule,
    NzModalModule,
    NzSelectModule,
    NzSwitchModule,
    NzTabsModule,
  ],
  templateUrl: './account-settings.component.html',
  styleUrl: './account-settings.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccountSettingsComponent {
  private readonly destroyRef = inject(DestroyRef);

  readonly language = inject(LanguageService);
  private readonly auth = inject(AuthService);
  readonly theme = inject(ThemeService);
  readonly tenantContext = inject(TenantContextService);
  readonly notifications = inject(NotificationCenterService);
  readonly preferences = inject(UserPreferencesService);
  readonly tenantOptions = computed<TenantOption[]>(() => [
    {
      value: ALL_TENANTS_SCOPE,
      labelKey: 'tenants.selector.all',
      label: null,
    },
    ...this.tenantContext.activeTenants().map((tenant) => ({
      value: tenant.id,
      labelKey: null,
      label: tenant.name,
    })),
  ]);
  readonly hasTenantChoices = computed(() => this.tenantOptions().length > 1);
  readonly settingsForm: AccountSettingsForm = new FormGroup({
    language: new FormControl(this.language.currentLanguage(), {
      nonNullable: true,
    }),
    isDarkTheme: new FormControl(this.theme.isDark(), {
      nonNullable: true,
    }),
    tenantScope: new FormControl(this.tenantContext.activeScope(), {
      nonNullable: true,
    }),
    notificationsMuted: new FormControl(this.notifications.isMuted(), {
      nonNullable: true,
    }),
    startRoute: new FormControl(this.preferences.startRoute() || DEFAULT_USER_START_ROUTE, {
      nonNullable: true,
    }),
  });
  readonly passwordForm: PasswordDialogForm = new FormGroup({
    currentPassword: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    newPassword: new FormControl('', {
      nonNullable: true,
      validators: [
        Validators.required,
        Validators.minLength(PASSWORD_MIN_LENGTH),
        Validators.maxLength(PASSWORD_MAX_LENGTH),
        Validators.pattern(PASSWORD_DIGIT_PATTERN),
        Validators.pattern(PASSWORD_SPECIAL_PATTERN),
      ],
    }),
    confirmPassword: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required],
    }),
  });
  readonly isPasswordDialogOpen = signal(false);
  readonly isChangingPassword = signal(false);
  readonly passwordDialogError = signal<string | null>(null);
  readonly passwordSuccess = signal<string | null>(null);

  constructor() {
    this.subscribeToSettingsChanges();
    effect(() => {
      const nextValue = {
        language: this.language.currentLanguage(),
        isDarkTheme: this.theme.isDark(),
        tenantScope: this.tenantContext.activeScope(),
        notificationsMuted: this.notifications.isMuted(),
        startRoute: this.preferences.startRoute(),
      };

      untracked(() => this.settingsForm.reset(nextValue, { emitEvent: false }));
    });
  }

  openPasswordDialog(): void {
    this.passwordForm.reset(
      {
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
      },
      { emitEvent: false },
    );
    this.passwordDialogError.set(null);
    this.passwordSuccess.set(null);
    this.isPasswordDialogOpen.set(true);
  }

  closePasswordDialog(): void {
    if (this.isChangingPassword()) {
      return;
    }

    this.isPasswordDialogOpen.set(false);
    this.passwordDialogError.set(null);
    this.passwordForm.reset(
      {
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
      },
      { emitEvent: false },
    );
  }

  passwordRequirements(): readonly PasswordRequirement[] {
    return buildPasswordRequirements(
      this.passwordForm.controls.newPassword.value,
      this.passwordForm.controls.confirmPassword.value,
    );
  }

  canSubmitPasswordChange(): boolean {
    return (
      this.passwordForm.valid &&
      passwordRequirementsMet(this.passwordRequirements()) &&
      !this.isChangingPassword()
    );
  }

  submitPasswordChange(): void {
    if (this.isChangingPassword()) {
      return;
    }

    if (!this.canSubmitPasswordChange()) {
      this.passwordForm.markAllAsTouched();
      return;
    }

    const value = this.passwordForm.getRawValue();
    this.isChangingPassword.set(true);
    this.passwordDialogError.set(null);
    this.auth
      .changePassword({
        currentPassword: value.currentPassword,
        newPassword: value.newPassword,
      })
      .pipe(finalize(() => this.isChangingPassword.set(false)))
      .subscribe({
        next: () => {
          this.isPasswordDialogOpen.set(false);
          this.passwordSuccess.set('accountSettings.password.success');
          this.passwordForm.reset(
            {
              currentPassword: '',
              newPassword: '',
              confirmPassword: '',
            },
            { emitEvent: false },
          );
        },
        error: () => this.passwordDialogError.set('auth.passwordChange.error'),
      });
  }

  private subscribeToSettingsChanges(): void {
    this.settingsForm.controls.language.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((language) => this.language.use(language));

    this.settingsForm.controls.isDarkTheme.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((isDarkTheme) => this.theme.use(isDarkTheme ? 'dark' : 'light'));

    this.settingsForm.controls.tenantScope.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((tenantScope) => this.tenantContext.setScope(tenantScope));

    this.settingsForm.controls.notificationsMuted.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((notificationsMuted) => this.notifications.setMuted(notificationsMuted));

    this.settingsForm.controls.startRoute.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((startRoute) => this.preferences.setStartRoute(startRoute));
  }
}
