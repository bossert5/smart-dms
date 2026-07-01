import { ForbiddenException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import {
  ALLOW_PASSWORD_CHANGE_REQUIRED_KEY,
  IS_PUBLIC_KEY,
} from './auth.decorators';
import { PasswordChangeRequiredGuard } from './password-change-required.guard';

const user = {
  id: '00000000-0000-4000-8000-000000000001',
  username: 'admin',
  displayName: 'Admin',
  role: 'Admin' as const,
  isActive: true,
  passwordChangeRequired: true,
  createdAt: '2026-05-07T00:00:00.000Z',
  updatedAt: '2026-05-07T00:00:00.000Z',
};

function contextWithUser(passwordChangeRequired = true): ExecutionContext {
  return {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({
      getRequest: () => ({
        user: { ...user, passwordChangeRequired },
      }),
    }),
  } as never;
}

function reflector(publicRoute = false, allowedRoute = false) {
  return {
    getAllAndOverride: jest.fn((key: string) => {
      if (key === IS_PUBLIC_KEY) {
        return publicRoute;
      }
      if (key === ALLOW_PASSWORD_CHANGE_REQUIRED_KEY) {
        return allowedRoute;
      }
      return undefined;
    }),
  };
}

describe('PasswordChangeRequiredGuard', () => {
  it('blocks protected routes when a password change is required', () => {
    const guard = new PasswordChangeRequiredGuard(reflector() as never);

    expect(() => guard.canActivate(contextWithUser(true))).toThrow(
      ForbiddenException,
    );
  });

  it('allows explicit auth routes during a required password change', () => {
    const guard = new PasswordChangeRequiredGuard(
      reflector(false, true) as never,
    );

    expect(guard.canActivate(contextWithUser(true))).toBe(true);
  });

  it('allows normal protected routes after the password has been changed', () => {
    const guard = new PasswordChangeRequiredGuard(reflector() as never);

    expect(guard.canActivate(contextWithUser(false))).toBe(true);
  });
});
