import { By } from '@angular/platform-browser';
import { TestBed } from '@angular/core/testing';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import {
  CheckCircleOutline,
  CloseCircleOutline,
  EyeInvisibleOutline,
  EyeOutline,
} from '@ant-design/icons-angular/icons';
import { Router } from '@angular/router';
import { provideNzIcons } from 'ng-zorro-antd/icon';
import { of } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { provideI18nTesting } from '../../testing/i18n-testing';
import { PasswordChangeComponent } from './password-change.component';

describe('PasswordChangeComponent', () => {
  it('keeps the password change dialog non-dismissible', async () => {
    await TestBed.configureTestingModule({
      imports: [PasswordChangeComponent],
      providers: [
        provideAnimationsAsync(),
        provideI18nTesting(),
        provideNzIcons([CheckCircleOutline, CloseCircleOutline, EyeInvisibleOutline, EyeOutline]),
        {
          provide: AuthService,
          useValue: { changePassword: vi.fn().mockReturnValue(of(undefined)) },
        },
        { provide: Router, useValue: { navigateByUrl: vi.fn() } },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(PasswordChangeComponent);
    fixture.detectChanges();

    const modal = fixture.debugElement.query(By.css('nz-modal')).componentInstance as {
      nzClosable: boolean;
      nzMaskClosable: boolean;
      nzKeyboard: boolean;
    };

    expect(modal.nzClosable).toBe(false);
    expect(modal.nzMaskClosable).toBe(false);
    expect(modal.nzKeyboard).toBe(false);
  });

  it('submits valid password changes', async () => {
    const auth = { changePassword: vi.fn().mockReturnValue(of(undefined)) };
    const router = { navigateByUrl: vi.fn() };

    await TestBed.configureTestingModule({
      imports: [PasswordChangeComponent],
      providers: [
        provideAnimationsAsync(),
        provideI18nTesting(),
        provideNzIcons([CheckCircleOutline, CloseCircleOutline, EyeInvisibleOutline, EyeOutline]),
        { provide: AuthService, useValue: auth },
        { provide: Router, useValue: router },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(PasswordChangeComponent);
    const component = fixture.componentInstance;
    component.form.setValue({
      newPassword: 'Password1!',
      confirmPassword: 'Password1!',
    });

    component.submit();

    expect(auth.changePassword).toHaveBeenCalledWith({
      newPassword: 'Password1!',
    });
    expect(router.navigateByUrl).toHaveBeenCalledWith('/documents');
  });

  it('renders password inputs and requirement state', async () => {
    await TestBed.configureTestingModule({
      imports: [PasswordChangeComponent],
      providers: [
        provideAnimationsAsync(),
        provideI18nTesting(),
        provideNzIcons([CheckCircleOutline, CloseCircleOutline, EyeInvisibleOutline, EyeOutline]),
        {
          provide: AuthService,
          useValue: { changePassword: vi.fn().mockReturnValue(of(undefined)) },
        },
        { provide: Router, useValue: { navigateByUrl: vi.fn() } },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(PasswordChangeComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();

    expect(
      fixture.debugElement.queryAll(By.css('input[autocomplete="new-password"]')),
    ).toHaveLength(2);
    expect(fixture.debugElement.queryAll(By.css('.password-requirement'))).toHaveLength(4);

    component.form.setValue({
      newPassword: 'Password1!',
      confirmPassword: 'Password1!',
    });

    expect(component.passwordRequirements().every((item) => item.isMet)).toBe(true);
  });
});
