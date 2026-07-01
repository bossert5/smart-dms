import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzModalModule } from 'ng-zorro-antd/modal';
import { finalize } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import {
  buildPasswordRequirements,
  PASSWORD_DIGIT_PATTERN,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  type PasswordRequirement,
  passwordRequirementsMet,
  PASSWORD_SPECIAL_PATTERN,
} from '../../shared/presentation/password-requirements';

type PasswordChangeForm = FormGroup<{
  newPassword: FormControl<string>;
  confirmPassword: FormControl<string>;
}>;

@Component({
  selector: 'app-password-change',
  imports: [
    ReactiveFormsModule,
    TranslatePipe,
    NzAlertModule,
    NzButtonModule,
    NzFormModule,
    NzIconModule,
    NzInputModule,
    NzModalModule,
  ],
  templateUrl: './password-change.component.html',
  styleUrl: './password-change.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PasswordChangeComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly form: PasswordChangeForm = new FormGroup({
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
  readonly isSubmitting = signal(false);
  readonly error = signal<string | null>(null);

  passwordRequirements(): readonly PasswordRequirement[] {
    return buildPasswordRequirements(
      this.form.controls.newPassword.value,
      this.form.controls.confirmPassword.value,
    );
  }

  canSubmit(): boolean {
    return (
      this.form.valid &&
      passwordRequirementsMet(this.passwordRequirements()) &&
      !this.isSubmitting()
    );
  }

  submit(): void {
    if (this.isSubmitting()) {
      return;
    }

    if (!this.canSubmit()) {
      this.form.markAllAsTouched();
      return;
    }

    const value = this.form.getRawValue();
    this.isSubmitting.set(true);
    this.error.set(null);
    this.auth
      .changePassword({
        newPassword: value.newPassword,
      })
      .pipe(finalize(() => this.isSubmitting.set(false)))
      .subscribe({
        next: () => void this.router.navigateByUrl('/documents'),
        error: () => this.error.set('auth.passwordChange.error'),
      });
  }
}
