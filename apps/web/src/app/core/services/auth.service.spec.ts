import { TestBed } from '@angular/core/testing';
import type { UserDto } from '@smart-dms/shared-dto';
import { of, Subject, throwError } from 'rxjs';
import { AuthApiService } from '../api/auth-api.service';
import { AuthService } from './auth.service';

const user: UserDto = {
  id: '00000000-0000-4000-8000-000000000001',
  username: 'admin',
  displayName: 'Admin',
  role: 'Admin',
  isActive: true,
  passwordChangeRequired: false,
  tenants: [
    {
      id: '018f1a44-9093-7f55-a515-278f4d9bd900',
      key: 'default',
      name: 'Default',
      isActive: true,
    },
  ],
  defaultTenantId: '018f1a44-9093-7f55-a515-278f4d9bd900',
  createdAt: '2026-05-07T00:00:00.000Z',
  updatedAt: '2026-05-07T00:00:00.000Z',
};

describe('AuthService', () => {
  it('applies login and change-password sessions and derives permissions', () => {
    const api = {
      login: vi.fn().mockReturnValue(of({ accessToken: 'token', user })),
      changePassword: vi.fn().mockReturnValue(
        of({
          accessToken: 'changed-token',
          user: { ...user, role: 'User' },
        }),
      ),
    };
    const service = createService(api);

    service.login({ username: 'admin', password: 'admin' }).subscribe();
    expect(service.accessToken()).toBe('token');
    expect(service.isAuthenticated()).toBe(true);
    expect(service.isAdmin()).toBe(true);
    expect(service.canEditDocuments()).toBe(true);
    expect(service.hasRole(['Admin'])).toBe(true);

    service.changePassword({ currentPassword: 'old', newPassword: 'new' }).subscribe();
    expect(service.accessToken()).toBe('changed-token');
    expect(service.isAdmin()).toBe(false);
    expect(service.canEditDocuments()).toBe(true);
  });

  it('deduplicates concurrent refresh calls and clears failed sessions', () => {
    const refreshResponse = new Subject<{ accessToken: string; user: UserDto }>();
    const api = {
      refresh: vi.fn().mockReturnValue(refreshResponse.asObservable()),
    };
    const service = createService(api);
    const results: boolean[] = [];

    service.refresh().subscribe((value) => results.push(value));
    service.refresh().subscribe((value) => results.push(value));
    refreshResponse.next({ accessToken: 'refreshed-token', user });
    refreshResponse.complete();

    expect(api.refresh).toHaveBeenCalledTimes(1);
    expect(results).toEqual([true, true]);
    expect(service.accessToken()).toBe('refreshed-token');

    api.refresh.mockReturnValueOnce(throwError(() => new Error('expired')));
    service.refresh().subscribe((value) => results.push(value));

    expect(results.at(-1)).toBe(false);
    expect(service.accessToken()).toBeNull();
    expect(service.user()).toBeNull();
  });

  it('clears the session on logout even when the API fails', () => {
    const api = {
      login: vi.fn().mockReturnValue(of({ accessToken: 'token', user })),
      logout: vi.fn().mockReturnValue(throwError(() => new Error('network'))),
    };
    const service = createService(api);

    service.login({ username: 'admin', password: 'admin' }).subscribe();
    service.logout().subscribe();

    expect(service.accessToken()).toBeNull();
    expect(service.user()).toBeNull();
  });

  it('disables roles and editing while password change is required', () => {
    const api = {
      login: vi.fn().mockReturnValue(
        of({
          accessToken: 'token',
          user: { ...user, passwordChangeRequired: true },
        }),
      ),
    };
    const service = createService(api);

    service.login({ username: 'admin', password: 'admin' }).subscribe();

    expect(service.passwordChangeRequired()).toBe(true);
    expect(service.isAdmin()).toBe(false);
    expect(service.canEditDocuments()).toBe(false);
    expect(service.hasRole(['Admin'])).toBe(false);
  });
});

function createService(api: Partial<AuthApiService>): AuthService {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [{ provide: AuthApiService, useValue: api }],
  });
  return TestBed.inject(AuthService);
}
