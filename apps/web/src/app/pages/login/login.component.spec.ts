import { TestBed } from '@angular/core/testing';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { provideI18nTesting } from '../../testing/i18n-testing';
import { LoginComponent } from './login.component';

describe('LoginComponent', () => {
  it('submits credentials and navigates to documents', async () => {
    const auth = {
      login: vi.fn().mockReturnValue(of(undefined)),
      passwordChangeRequired: vi.fn().mockReturnValue(false),
    };
    const router = { navigateByUrl: vi.fn() };
    const fixture = await createComponent(auth, router);
    const component = fixture.componentInstance;

    component.form.setValue({ username: 'admin', password: 'admin' });
    component.submit();

    expect(auth.login).toHaveBeenCalledWith({ username: 'admin', password: 'admin' });
    expect(router.navigateByUrl).toHaveBeenCalledWith('/documents');
    expect(component.errorKey()).toBeNull();
  });

  it('navigates to password change when required', async () => {
    const auth = {
      login: vi.fn().mockReturnValue(of(undefined)),
      passwordChangeRequired: vi.fn().mockReturnValue(true),
    };
    const router = { navigateByUrl: vi.fn() };
    const fixture = await createComponent(auth, router);

    fixture.componentInstance.form.setValue({ username: 'admin', password: 'admin' });
    fixture.componentInstance.submit();

    expect(router.navigateByUrl).toHaveBeenCalledWith('/password-change');
  });

  it('marks invalid forms and exposes login errors', async () => {
    const auth = {
      login: vi.fn().mockReturnValue(throwError(() => new Error('bad credentials'))),
      passwordChangeRequired: vi.fn(),
    };
    const fixture = await createComponent(auth, { navigateByUrl: vi.fn() });
    const component = fixture.componentInstance;

    component.form.setValue({ username: '', password: '' });
    component.submit();
    expect(auth.login).not.toHaveBeenCalled();
    expect(component.form.touched).toBe(true);

    component.form.setValue({ username: 'admin', password: 'wrong' });
    component.submit();
    expect(component.errorKey()).toBe('auth.login.error');
    expect(component.isSubmitting()).toBe(false);
  });
});

async function createComponent(auth: unknown, router: Partial<Router>) {
  TestBed.resetTestingModule();
  await TestBed.configureTestingModule({
    imports: [LoginComponent],
    providers: [
      provideAnimationsAsync(),
      provideI18nTesting(),
      { provide: AuthService, useValue: auth },
      { provide: Router, useValue: router },
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(LoginComponent);
  fixture.detectChanges();
  return fixture;
}
