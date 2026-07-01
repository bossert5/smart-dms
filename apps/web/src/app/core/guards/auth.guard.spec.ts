import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { firstValueFrom, of } from 'rxjs';
import { authGuard, roleGuard } from './auth.guard';
import { AuthService } from '../services/auth.service';

describe('auth guards', () => {
  it('allows authenticated users and redirects password-change users', async () => {
    const router = routerStub();
    const auth = {
      isAuthenticated: vi.fn().mockReturnValue(true),
      passwordChangeRequired: vi.fn().mockReturnValue(true),
    };
    configure(auth, router);

    const result = TestBed.runInInjectionContext(() =>
      authGuard({} as never, { url: '/documents' } as never),
    );

    expect(result).toEqual({ url: '/password-change' });
    expect(router.createUrlTree).toHaveBeenCalledWith(['/password-change']);
  });

  it('keeps password-change users on the password-change route', () => {
    const auth = {
      isAuthenticated: vi.fn().mockReturnValue(true),
      passwordChangeRequired: vi.fn().mockReturnValue(true),
    };
    configure(auth, routerStub());

    const result = TestBed.runInInjectionContext(() =>
      authGuard({} as never, { url: '/password-change' } as never),
    );

    expect(result).toBe(true);
  });

  it('redirects authenticated users away from password change when not required', () => {
    const router = routerStub();
    const auth = {
      isAuthenticated: vi.fn().mockReturnValue(true),
      passwordChangeRequired: vi.fn().mockReturnValue(false),
    };
    configure(auth, router);

    const result = TestBed.runInInjectionContext(() =>
      authGuard({} as never, { url: '/password-change' } as never),
    );

    expect(result).toEqual({ url: '/documents' });
  });

  it('refreshes anonymous users before deciding', async () => {
    const router = routerStub();
    const auth = {
      isAuthenticated: vi.fn().mockReturnValue(false),
      passwordChangeRequired: vi.fn().mockReturnValue(false),
      refresh: vi.fn().mockReturnValue(of(false)),
    };
    configure(auth, router);

    const result = TestBed.runInInjectionContext(() =>
      authGuard({} as never, { url: '/documents' } as never),
    );

    await expect(firstValueFrom(result as never)).resolves.toEqual({ url: '/login' });
    expect(auth.refresh).toHaveBeenCalled();
  });

  it('enforces role checks', () => {
    const router = routerStub();
    const auth = {
      hasRole: vi.fn().mockReturnValueOnce(true).mockReturnValueOnce(false),
    };
    configure(auth, router);

    expect(TestBed.runInInjectionContext(() => roleGuard(['Admin'])({} as never, {} as never))).toBe(
      true,
    );
    expect(TestBed.runInInjectionContext(() => roleGuard(['Admin'])({} as never, {} as never))).toEqual(
      { url: '/documents' },
    );
  });
});

function configure(auth: unknown, router: Partial<Router>): void {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: AuthService, useValue: auth },
      { provide: Router, useValue: router },
    ],
  });
}

function routerStub(): Pick<Router, 'createUrlTree'> {
  return {
    createUrlTree: vi.fn((commands: unknown[]) => ({
      url: commands.map(String).join('/'),
    })),
  } as never;
}
