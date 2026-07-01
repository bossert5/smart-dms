import {
  Prisma,
  type Tenant,
  type User,
  type UserTenantMembership,
} from '@prisma/client';
import type { UserDto } from '@smart-dms/shared-dto';
import { toIsoDateTime } from '../common/date-mapper';
import { toTenantSummaryDto } from '../tenants/tenant.mapper';

export type UserWithTenantMemberships = User & {
  tenantMemberships?: Array<
    UserTenantMembership & {
      tenant: Pick<Tenant, 'id' | 'key' | 'name' | 'isActive'>;
    }
  >;
};

export function toUserDto(user: UserWithTenantMemberships): UserDto {
  const memberships = user.tenantMemberships ?? [];
  const defaultMembership =
    memberships.find((membership) => membership.isDefault) ?? memberships[0];

  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    isActive: user.isActive,
    passwordChangeRequired: user.passwordChangeRequired,
    tenants: memberships.map((membership) =>
      toTenantSummaryDto(membership.tenant),
    ),
    defaultTenantId: defaultMembership?.tenantId ?? null,
    createdAt: toIsoDateTime(user.createdAt),
    updatedAt: toIsoDateTime(user.updatedAt),
  };
}

export const userTenantMembershipInclude =
  Prisma.validator<Prisma.UserInclude>()({
    tenantMemberships: {
      include: {
        tenant: {
          select: {
            id: true,
            key: true,
            name: true,
            isActive: true,
          },
        },
      },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    },
  });
