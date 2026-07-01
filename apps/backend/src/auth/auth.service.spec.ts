import { expectAny } from '../testing/expect-matchers';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { AuthService } from './auth.service';

const createdAt = new Date('2026-05-07T00:00:00.000Z');

const authenticatedUser = {
  id: '00000000-0000-4000-8000-000000000001',
  username: 'admin',
  displayName: 'Admin',
  role: 'Admin' as const,
  isActive: true,
  passwordChangeRequired: true,
  createdAt: createdAt.toISOString(),
  updatedAt: createdAt.toISOString(),
  tenants: [
    {
      id: '018f1a44-9093-7f55-a515-278f4d9bd900',
      key: 'default',
      name: 'Default',
      isActive: true,
    },
  ],
  defaultTenantId: '018f1a44-9093-7f55-a515-278f4d9bd900',
};

function userRecord(passwordHash: string, passwordChangeRequired = true) {
  return {
    id: authenticatedUser.id,
    username: authenticatedUser.username,
    displayName: authenticatedUser.displayName,
    passwordHash,
    role: authenticatedUser.role,
    isActive: true,
    passwordChangeRequired,
    createdAt,
    updatedAt: createdAt,
    tenantMemberships: [
      {
        userId: authenticatedUser.id,
        tenantId: authenticatedUser.defaultTenantId,
        isDefault: true,
        createdAt,
        updatedAt: createdAt,
        tenant: authenticatedUser.tenants[0],
      },
    ],
  };
}

function config() {
  return {
    jwtAccessSecret: 'access-secret',
    jwtAccessTtlSeconds: 60,
    refreshTokenTtlDays: 7,
  };
}

describe('AuthService', () => {
  it('changes required passwords without the current password and rotates refresh tokens', async () => {
    const passwordHash = await argon2.hash('initial-password', {
      type: argon2.argon2id,
    });
    const updatedUser = userRecord('new-password-hash', false);
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue(userRecord(passwordHash)),
        update: jest.fn().mockResolvedValue(updatedUser),
      },
      refreshToken: {
        create: jest.fn().mockResolvedValue({ id: 'new-refresh-token-id' }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const jwtService = {
      signAsync: jest.fn().mockResolvedValue('new-access-token'),
    };
    const audit = { record: jest.fn().mockResolvedValue(undefined) };
    const service = new AuthService(
      prisma as never,
      jwtService as never,
      config() as never,
      audit as never,
    );

    const result = await service.changePassword(
      authenticatedUser,
      {
        newPassword: 'changed-password',
      },
      { ipAddress: '127.0.0.1', userAgent: 'test' },
    );

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: authenticatedUser.id },
      data: {
        passwordHash: expectAny(String),
        passwordChangeRequired: false,
      },
      include: expectAny(Object),
    });
    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
      where: {
        userId: authenticatedUser.id,
        revokedAt: null,
        id: { not: 'new-refresh-token-id' },
      },
      data: {
        revokedAt: expectAny(Date),
        replacedByTokenId: 'new-refresh-token-id',
      },
    });
    expect(result.response.user.passwordChangeRequired).toBe(false);
    expect(result.response.accessToken).toBe('new-access-token');
  });

  it('rejects reusing the existing password during required password changes', async () => {
    const passwordHash = await argon2.hash('initial-password', {
      type: argon2.argon2id,
    });
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue(userRecord(passwordHash)),
        update: jest.fn(),
      },
      refreshToken: {
        create: jest.fn(),
        updateMany: jest.fn(),
      },
    };
    const service = new AuthService(
      prisma as never,
      { signAsync: jest.fn() } as never,
      config() as never,
      { record: jest.fn().mockResolvedValue(undefined) } as never,
    );

    await expect(
      service.changePassword(
        authenticatedUser,
        {
          newPassword: 'initial-password',
        },
        {},
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('rejects missing current passwords for regular password changes', async () => {
    const passwordHash = await argon2.hash('initial-password', {
      type: argon2.argon2id,
    });
    const prisma = {
      user: {
        findUnique: jest
          .fn()
          .mockResolvedValue(userRecord(passwordHash, false)),
        update: jest.fn(),
      },
      refreshToken: {
        create: jest.fn(),
        updateMany: jest.fn(),
      },
    };
    const service = new AuthService(
      prisma as never,
      { signAsync: jest.fn() } as never,
      config() as never,
      { record: jest.fn().mockResolvedValue(undefined) } as never,
    );

    await expect(
      service.changePassword(
        { ...authenticatedUser, passwordChangeRequired: false },
        {
          newPassword: 'changed-password',
        },
        {},
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('rejects invalid current passwords for regular password changes', async () => {
    const passwordHash = await argon2.hash('initial-password', {
      type: argon2.argon2id,
    });
    const prisma = {
      user: {
        findUnique: jest
          .fn()
          .mockResolvedValue(userRecord(passwordHash, false)),
        update: jest.fn(),
      },
      refreshToken: {
        create: jest.fn(),
        updateMany: jest.fn(),
      },
    };
    const service = new AuthService(
      prisma as never,
      { signAsync: jest.fn() } as never,
      config() as never,
      { record: jest.fn().mockResolvedValue(undefined) } as never,
    );

    await expect(
      service.changePassword(
        { ...authenticatedUser, passwordChangeRequired: false },
        {
          currentPassword: 'wrong-password',
          newPassword: 'changed-password',
        },
        {},
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});
