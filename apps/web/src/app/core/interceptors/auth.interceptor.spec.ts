import { provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { API_BASE_URL } from '../api/api-base-url.token';
import { AuthApiService } from '../api/auth-api.service';
import { AuthService } from '../services/auth.service';
import { TenantContextService } from '../services/tenant-context.service';
import { authInterceptor } from './auth.interceptor';

const tenant = {
  id: '00000000-0000-4000-8000-000000000010',
  key: 'default',
  name: 'Default',
  isActive: true,
};

const user = {
  id: '00000000-0000-4000-8000-000000000001',
  username: 'admin',
  displayName: 'Admin',
  role: 'Admin' as const,
  isActive: true,
  passwordChangeRequired: false,
  tenants: [tenant],
  defaultTenantId: tenant.id,
  createdAt: '2026-05-07T00:00:00.000Z',
  updatedAt: '2026-05-07T00:00:00.000Z',
};

describe('authInterceptor', () => {
  let http: HttpTestingController;
  let api: AuthApiService;
  let auth: AuthService;
  let tenantContext: TenantContextService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        { provide: API_BASE_URL, useValue: 'http://localhost:3010/api' },
      ],
    });

    http = TestBed.inject(HttpTestingController);
    api = TestBed.inject(AuthApiService);
    auth = TestBed.inject(AuthService);
    tenantContext = TestBed.inject(TenantContextService);
    auth.user.set(user);
    auth.accessToken.set('expired-token');
    tenantContext.setScope(tenant.id);
  });

  afterEach(() => {
    http.verify();
  });

  it('refreshes an expired access token and retries the failed request', () => {
    let response: unknown;

    api.me().subscribe((value) => {
      response = value;
    });

    const initialRequest = http.expectOne('http://localhost:3010/api/auth/me');
    expect(initialRequest.request.headers.get('Authorization')).toBe(
      'Bearer expired-token',
    );
    expect(initialRequest.request.headers.get('X-Tenant-Scope')).toBe(tenant.id);
    initialRequest.flush(
      { message: 'Unauthorized' },
      { status: 401, statusText: 'Unauthorized' },
    );

    const refreshRequest = http.expectOne('http://localhost:3010/api/auth/refresh');
    expect(refreshRequest.request.method).toBe('POST');
    expect(refreshRequest.request.withCredentials).toBe(true);
    refreshRequest.flush({
      accessToken: 'fresh-token',
      accessTokenExpiresAt: '2026-05-07T00:15:00.000Z',
      user,
    });

    const retryRequest = http.expectOne('http://localhost:3010/api/auth/me');
    expect(retryRequest.request.headers.get('Authorization')).toBe(
      'Bearer fresh-token',
    );
    expect(retryRequest.request.headers.get('X-Tenant-Scope')).toBe(tenant.id);
    retryRequest.flush({ user });

    expect(response).toEqual({ user });
  });

  it('shares one refresh request across concurrent unauthorized requests', () => {
    const responses: unknown[] = [];

    api.me().subscribe((value) => responses.push(value));
    api.me().subscribe((value) => responses.push(value));

    const initialRequests = http.match('http://localhost:3010/api/auth/me');
    expect(initialRequests).toHaveLength(2);
    for (const request of initialRequests) {
      request.flush(
        { message: 'Unauthorized' },
        { status: 401, statusText: 'Unauthorized' },
      );
    }

    const refreshRequests = http.match('http://localhost:3010/api/auth/refresh');
    expect(refreshRequests).toHaveLength(1);
    refreshRequests[0].flush({
      accessToken: 'fresh-token',
      accessTokenExpiresAt: '2026-05-07T00:15:00.000Z',
      user,
    });

    const retryRequests = http.match('http://localhost:3010/api/auth/me');
    expect(retryRequests).toHaveLength(2);
    for (const request of retryRequests) {
      expect(request.request.headers.get('Authorization')).toBe(
        'Bearer fresh-token',
      );
      request.flush({ user });
    }

    expect(responses).toEqual([{ user }, { user }]);
  });

  it('does not refresh failed login requests', () => {
    let status: number | undefined;

    api.login({ username: 'admin', password: 'wrong-password' }).subscribe({
      error: (error: { status: number }) => {
        status = error.status;
      },
    });

    const loginRequest = http.expectOne('http://localhost:3010/api/auth/login');
    loginRequest.flush(
      { message: 'Invalid credentials.' },
      { status: 401, statusText: 'Unauthorized' },
    );

    expect(http.match('http://localhost:3010/api/auth/refresh')).toHaveLength(0);
    expect(status).toBe(401);
  });
});
