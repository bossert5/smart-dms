import { expectAny } from '../testing/expect-matchers';
import { ConflictException } from '@nestjs/common';
import { UsersService } from './users.service';

const createdAt = new Date('2026-05-07T00:00:00.000Z');
const tenantId = '00000000-0000-4000-8000-000000000001';

function userRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    username: 'test',
    displayName: 'Test User',
    passwordHash: 'hashed-password',
    role: 'User',
    isActive: true,
    passwordChangeRequired: true,
    createdAt,
    updatedAt: createdAt,
    ...overrides,
  };
}

function withTransaction<T extends object>(prisma: T) {
  return {
    ...prisma,
    $transaction: jest.fn((operation: (tx: T) => unknown) => operation(prisma)),
  };
}

describe('UsersService', () => {
  it('marks newly created users for password change', async () => {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(userRecord()),
      },
      tenant: {
        findMany: jest.fn().mockResolvedValue([{ id: tenantId }]),
      },
    };
    const service = new UsersService(prisma as never);

    const result = await service.create({
      username: 'Test',
      displayName: 'Test User',
      password: 'initial-password',
      role: 'User',
    });

    expect(prisma.user.create).toHaveBeenCalledWith({
      data: {
        username: 'test',
        displayName: 'Test User',
        passwordHash: expectAny(String),
        role: 'User',
        passwordChangeRequired: true,
        tenantMemberships: {
          create: [
            {
              tenantId,
              isDefault: true,
            },
          ],
        },
      },
      include: expectAny(Object),
    });
    expect(result.passwordChangeRequired).toBe(true);
  });

  it('marks password resets for password change', async () => {
    const prisma = withTransaction({
      user: {
        findUnique: jest.fn().mockResolvedValue(
          userRecord({
            id: '00000000-0000-4000-8000-000000000002',
            username: 'reset-user',
            passwordChangeRequired: false,
          }),
        ),
        update: jest.fn().mockResolvedValue(
          userRecord({
            id: '00000000-0000-4000-8000-000000000002',
            username: 'reset-user',
            passwordChangeRequired: true,
          }),
        ),
      },
      tenant: {
        findMany: jest.fn().mockResolvedValue([{ id: tenantId }]),
      },
      userTenantMembership: {
        findMany: jest.fn().mockResolvedValue([{ tenantId }]),
        deleteMany: jest.fn(),
        createMany: jest.fn(),
      },
    });
    const service = new UsersService(prisma as never);

    await service.update('00000000-0000-4000-8000-000000000002', {
      password: 'reset-password',
    });

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: '00000000-0000-4000-8000-000000000002' },
      data: {
        username: undefined,
        displayName: undefined,
        passwordHash: expectAny(String),
        passwordChangeRequired: true,
        role: undefined,
        isActive: undefined,
      },
      include: expectAny(Object),
    });
  });

  it('prevents deactivating the last active admin', async () => {
    const prisma = withTransaction({
      user: {
        findUnique: jest.fn().mockResolvedValue(
          userRecord({
            role: 'Admin',
            isActive: true,
          }),
        ),
        count: jest.fn().mockResolvedValue(0),
        update: jest.fn(),
      },
    });
    const service = new UsersService(prisma as never);

    await expect(
      service.update('00000000-0000-4000-8000-000000000001', {
        isActive: false,
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(prisma.user.count).toHaveBeenCalledWith({
      where: {
        id: { not: '00000000-0000-4000-8000-000000000001' },
        role: 'Admin',
        isActive: true,
      },
    });
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('prevents removing the admin role from the last active admin', async () => {
    const prisma = withTransaction({
      user: {
        findUnique: jest.fn().mockResolvedValue(
          userRecord({
            role: 'Admin',
            isActive: true,
          }),
        ),
        count: jest.fn().mockResolvedValue(0),
        update: jest.fn(),
      },
    });
    const service = new UsersService(prisma as never);

    await expect(
      service.update('00000000-0000-4000-8000-000000000001', {
        role: 'User',
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('allows changing an active admin when another active admin remains', async () => {
    const prisma = withTransaction({
      user: {
        findUnique: jest.fn().mockResolvedValue(
          userRecord({
            role: 'Admin',
            isActive: true,
          }),
        ),
        count: jest.fn().mockResolvedValue(1),
        update: jest.fn().mockResolvedValue(
          userRecord({
            role: 'User',
            isActive: true,
          }),
        ),
      },
    });
    const service = new UsersService(prisma as never);

    const result = await service.update(
      '00000000-0000-4000-8000-000000000001',
      {
        role: 'User',
      },
    );

    expect(result.role).toBe('User');
    expect(prisma.user.update).toHaveBeenCalled();
  });

  it('updates multiple users in one serializable transaction', async () => {
    const prisma = {
      $transaction: jest.fn(),
      user: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce(userRecord({ id: 'user-1', username: 'one' }))
          .mockResolvedValueOnce(userRecord({ id: 'user-2', username: 'two' })),
        update: jest
          .fn()
          .mockResolvedValueOnce(
            userRecord({
              id: 'user-1',
              username: 'one',
              displayName: 'One Updated',
            }),
          )
          .mockResolvedValueOnce(
            userRecord({
              id: 'user-2',
              username: 'two',
              displayName: 'Two Updated',
            }),
          ),
      },
    };
    const transaction = jest.fn(
      <TResult>(operation: (tx: typeof prisma) => TResult) => operation(prisma),
    );
    prisma.$transaction = transaction;
    const service = new UsersService(prisma as never);

    const result = await service.bulkUpdate({
      updates: [
        { id: 'user-1', changes: { displayName: 'One Updated' } },
        { id: 'user-2', changes: { displayName: 'Two Updated' } },
      ],
    });

    expect(result.users.map((user) => user.displayName)).toEqual([
      'One Updated',
      'Two Updated',
    ]);
    expect(prisma.user.update).toHaveBeenCalledTimes(2);
    expect(transaction).toHaveBeenCalledWith(expectAny(Function), {
      isolationLevel: 'Serializable',
    });
  });

  it('prevents removing all active admins in one bulk update', async () => {
    const prisma = withTransaction({
      user: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce(
            userRecord({
              id: 'admin-1',
              role: 'Admin',
              isActive: true,
            }),
          )
          .mockResolvedValueOnce(
            userRecord({
              id: 'admin-2',
              role: 'Admin',
              isActive: true,
            }),
          ),
        count: jest.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(0),
        update: jest.fn().mockResolvedValue(
          userRecord({
            role: 'User',
            isActive: true,
          }),
        ),
      },
    });
    const service = new UsersService(prisma as never);

    await expect(
      service.bulkUpdate({
        updates: [
          { id: 'admin-1', changes: { role: 'User' } },
          { id: 'admin-2', changes: { role: 'User' } },
        ],
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(prisma.user.update).toHaveBeenCalledTimes(1);
  });

  it('deletes users when an active admin remains', async () => {
    const prisma = withTransaction({
      user: {
        findUnique: jest.fn().mockResolvedValue(userRecord()),
        count: jest.fn(),
        delete: jest.fn().mockResolvedValue(userRecord()),
      },
    });
    const service = new UsersService(prisma as never);

    await service.delete('00000000-0000-4000-8000-000000000001');

    expect(prisma.user.count).not.toHaveBeenCalled();
    expect(prisma.user.delete).toHaveBeenCalledWith({
      where: { id: '00000000-0000-4000-8000-000000000001' },
    });
  });

  it('prevents deleting the last active admin', async () => {
    const prisma = withTransaction({
      user: {
        findUnique: jest.fn().mockResolvedValue(
          userRecord({
            role: 'Admin',
            isActive: true,
          }),
        ),
        count: jest.fn().mockResolvedValue(0),
        delete: jest.fn(),
      },
    });
    const service = new UsersService(prisma as never);

    await expect(
      service.delete('00000000-0000-4000-8000-000000000001'),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(prisma.user.delete).not.toHaveBeenCalled();
  });
});
