import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import type { UserRole } from '@smart-dms/shared-dto';
import { map } from 'rxjs';
import { AuthService } from '../services/auth.service';

export const authGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const targetUrl = state.url;

  if (auth.isAuthenticated()) {
    return resolveAuthenticatedRoute(auth, router, targetUrl);
  }

  return auth.refresh().pipe(
    map((isAuthenticated) =>
      isAuthenticated
        ? resolveAuthenticatedRoute(auth, router, targetUrl)
        : router.createUrlTree(['/login']),
    ),
  );
};

function resolveAuthenticatedRoute(
  auth: AuthService,
  router: Router,
  targetUrl: string,
) {
  const isPasswordChangeRoute = targetUrl.startsWith('/password-change');

  if (auth.passwordChangeRequired()) {
    return isPasswordChangeRoute
      ? true
      : router.createUrlTree(['/password-change']);
  }

  return isPasswordChangeRoute ? router.createUrlTree(['/documents']) : true;
}

export function roleGuard(roles: UserRole[]): CanActivateFn {
  return () => {
    const auth = inject(AuthService);
    const router = inject(Router);

    if (auth.hasRole(roles)) {
      return true;
    }

    return router.createUrlTree(['/documents']);
  };
}
