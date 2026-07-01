import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type User } from '@prisma/client';
import type {
  BulkUpdateUsersRequest,
  BulkUpdateUsersResponse,
  CreateUserRequest,
  ListUserAssigneesResponse,
  ListUsersResponse,
  PaginationRequest,
  UpdateUserTenantsRequest,
  UpdateUserRequest,
  UserDto,
} from '@smart-dms/shared-dto';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import { DEFAULT_TENANT_ID } from '../tenants/tenants.service';
import { toUserDto, userTenantMembershipInclude } from './user.mapper';

const ACTIVE_ADMIN_REQUIRED_MESSAGE = 'At least one active admin is required.';

type UserRepository = Pick<PrismaService, 'user'>;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(pagination: PaginationRequest): Promise<ListUsersResponse> {
    const page = pagination.page;
    const pageSize = pagination.pageSize;
    const [items, totalItems] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        include: userTenantMembershipInclude,
        orderBy: { createdAt: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.user.count(),
    ]);

    return {
      items: items.map(toUserDto),
      meta: {
        page,
        pageSize,
        totalItems,
        totalPages: Math.ceil(totalItems / pageSize),
      },
    };
  }

  async listAssignees(
    tenantIds: readonly string[],
  ): Promise<ListUserAssigneesResponse> {
    const users = await this.prisma.user.findMany({
      where: {
        isActive: true,
        tenantMemberships: {
          some: { tenantId: { in: [...tenantIds] } },
        },
      },
      select: {
        id: true,
        username: true,
        displayName: true,
      },
      orderBy: [{ displayName: 'asc' }, { username: 'asc' }],
    });

    return { items: users };
  }

  async getById(id: string): Promise<UserDto> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: userTenantMembershipInclude,
    });

    if (!user) {
      throw new NotFoundException('User not found.');
    }

    return toUserDto(user);
  }

  async create(input: CreateUserRequest): Promise<UserDto> {
    const existing = await this.prisma.user.findUnique({
      where: { username: input.username.toLowerCase() },
    });

    if (existing) {
      throw new ConflictException('A user with this username already exists.');
    }

    const passwordHash = await this.hashPassword(input.password);
    const tenantIds = await this.validatedTenantIds(input.tenantIds);
    const defaultTenantId = this.defaultTenantId(
      tenantIds,
      input.defaultTenantId,
    );
    const user = await this.prisma.user.create({
      data: {
        username: input.username.toLowerCase(),
        displayName: input.displayName,
        passwordHash,
        role: input.role,
        passwordChangeRequired: true,
        tenantMemberships: {
          create: tenantIds.map((tenantId) => ({
            tenantId,
            isDefault: tenantId === defaultTenantId,
          })),
        },
      },
      include: userTenantMembershipInclude,
    });

    return toUserDto(user);
  }

  async update(id: string, input: UpdateUserRequest): Promise<UserDto> {
    return this.prisma.$transaction(
      (tx) => this.updateInTransaction(tx, id, input),
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async bulkUpdate(
    input: BulkUpdateUsersRequest,
  ): Promise<BulkUpdateUsersResponse> {
    return this.prisma.$transaction(
      async (tx) => {
        const users: UserDto[] = [];
        for (const update of input.updates) {
          users.push(
            await this.updateInTransaction(tx, update.id, update.changes),
          );
        }

        return { users };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async updateTenants(
    id: string,
    input: UpdateUserTenantsRequest,
  ): Promise<UserDto> {
    const existing = await this.prisma.user.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('User not found.');
    }

    const tenantIds = await this.validatedTenantIds(input.tenantIds);
    await this.prisma.$transaction((tx) =>
      this.replaceTenantMemberships(tx, id, {
        tenantIds,
        defaultTenantId: input.defaultTenantId,
      }),
    );
    return this.getById(id);
  }

  async delete(id: string): Promise<void> {
    await this.prisma.$transaction(
      async (tx) => {
        const existing = await tx.user.findUnique({ where: { id } });

        if (!existing) {
          throw new NotFoundException('User not found.');
        }

        await this.ensureActiveAdminRemains(tx, existing, { isActive: false });
        await tx.user.delete({ where: { id } });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  private async ensureActiveAdminRemains(
    repository: UserRepository,
    existing: User,
    input: UpdateUserRequest,
  ): Promise<void> {
    const nextRole = input.role ?? existing.role;
    const nextIsActive = input.isActive ?? existing.isActive;
    const keepsActiveAdmin = nextRole === 'Admin' && nextIsActive;

    if (existing.role !== 'Admin' || !existing.isActive || keepsActiveAdmin) {
      return;
    }

    const remainingActiveAdmins = await repository.user.count({
      where: {
        id: { not: existing.id },
        role: 'Admin',
        isActive: true,
      },
    });

    if (remainingActiveAdmins === 0) {
      throw new ConflictException(ACTIVE_ADMIN_REQUIRED_MESSAGE);
    }
  }

  private async updateInTransaction(
    tx: Prisma.TransactionClient,
    id: string,
    input: UpdateUserRequest,
  ): Promise<UserDto> {
    const existing = await tx.user.findUnique({ where: { id } });

    if (!existing) {
      throw new NotFoundException('User not found.');
    }

    if (input.username && input.username.toLowerCase() !== existing.username) {
      const usernameOwner = await tx.user.findUnique({
        where: { username: input.username.toLowerCase() },
      });
      if (usernameOwner) {
        throw new ConflictException(
          'A user with this username already exists.',
        );
      }
    }

    await this.ensureActiveAdminRemains(tx, existing, input);

    const passwordHash = input.password
      ? await this.hashPassword(input.password)
      : undefined;
    const user = await tx.user.update({
      where: { id },
      data: {
        username: input.username?.toLowerCase(),
        displayName: input.displayName,
        passwordHash,
        passwordChangeRequired: passwordHash ? true : undefined,
        role: input.role,
        isActive: input.isActive,
      },
      include: userTenantMembershipInclude,
    });

    if (input.tenantIds || input.defaultTenantId) {
      const tenantIds = await this.validatedTenantIds(
        input.tenantIds ??
          (
            await tx.userTenantMembership.findMany({
              where: { userId: id },
              select: { tenantId: true },
            })
          ).map((membership) => membership.tenantId),
        tx,
      );
      await this.replaceTenantMemberships(tx, id, {
        tenantIds,
        defaultTenantId: input.defaultTenantId,
      });
      return tx.user
        .findUniqueOrThrow({
          where: { id },
          include: userTenantMembershipInclude,
        })
        .then(toUserDto);
    }

    return toUserDto(user);
  }

  private hashPassword(password: string): Promise<string> {
    return argon2.hash(password, { type: argon2.argon2id });
  }

  private async validatedTenantIds(
    requestedTenantIds: readonly string[] | undefined,
    repository: Pick<PrismaService | Prisma.TransactionClient, 'tenant'> = this
      .prisma,
  ): Promise<string[]> {
    const tenantIds = [
      ...new Set(
        requestedTenantIds?.length ? requestedTenantIds : [DEFAULT_TENANT_ID],
      ),
    ];
    const tenants = await repository.tenant.findMany({
      where: { id: { in: tenantIds }, isActive: true },
      select: { id: true },
    });
    const existingIds = new Set(tenants.map((tenant) => tenant.id));
    if (tenantIds.some((tenantId) => !existingIds.has(tenantId))) {
      throw new ConflictException(
        'At least one selected tenant does not exist.',
      );
    }

    return tenantIds;
  }

  private defaultTenantId(
    tenantIds: readonly string[],
    requestedDefaultTenantId: string | undefined,
  ): string {
    const defaultTenantId = requestedDefaultTenantId ?? tenantIds[0];
    if (!tenantIds.includes(defaultTenantId)) {
      throw new ConflictException(
        'Default tenant must be assigned to the user.',
      );
    }
    return defaultTenantId;
  }

  private async replaceTenantMemberships(
    tx: Prisma.TransactionClient,
    userId: string,
    input: {
      readonly tenantIds: readonly string[];
      readonly defaultTenantId?: string;
    },
  ): Promise<void> {
    const defaultTenantId = this.defaultTenantId(
      input.tenantIds,
      input.defaultTenantId,
    );
    await tx.userTenantMembership.deleteMany({ where: { userId } });
    await tx.userTenantMembership.createMany({
      data: input.tenantIds.map((tenantId) => ({
        userId,
        tenantId,
        isDefault: tenantId === defaultTenantId,
      })),
      skipDuplicates: true,
    });
  }
}
