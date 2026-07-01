import {
  HttpErrorResponse,
  HttpInterceptorFn,
  HttpRequest,
} from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { TenantContextService } from '../services/tenant-context.service';

export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const auth = inject(AuthService);
  const tenantContext = inject(TenantContextService);
  const authenticatedRequest = withSessionHeaders(request, auth, tenantContext);

  return next(authenticatedRequest).pipe(
    catchError((error: unknown) => {
      if (!shouldRefreshSession(error, request)) {
        return throwError(() => error);
      }

      return auth.refresh().pipe(
        switchMap((isAuthenticated) =>
          isAuthenticated
            ? next(withSessionHeaders(request, auth, tenantContext))
            : throwError(() => error),
        ),
      );
    }),
  );
};

function withSessionHeaders(
  request: HttpRequest<unknown>,
  auth: AuthService,
  tenantContext: TenantContextService,
): HttpRequest<unknown> {
  const accessToken = auth.accessToken();
  const headers = accessToken
    ? request.headers
        .set('Authorization', `Bearer ${accessToken}`)
        .set('X-Tenant-Scope', tenantContext.activeScope())
    : request.headers;

  return request.clone({
    headers,
    withCredentials: true,
  });
}

function shouldRefreshSession(
  error: unknown,
  request: HttpRequest<unknown>,
): boolean {
  return (
    error instanceof HttpErrorResponse &&
    error.status === 401 &&
    !isRefreshUnsafeAuthEndpoint(request.url)
  );
}

function isRefreshUnsafeAuthEndpoint(url: string): boolean {
  const path = url.split('?')[0];
  return /\/auth\/(login|refresh|logout)$/.test(path);
}
