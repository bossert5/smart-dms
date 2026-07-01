import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../common/authenticated-user';
import { PrismaService } from '../prisma/prisma.service';

export const TENANT_SCOPE_HEADER = 'x-tenant-scope';
export const ALL_TENANTS_SCOPE = 'all';

export interface ResolvedTenantScope {
  readonly requestedScope: string;
  readonly tenantIds: string[];
  readonly isAll: boolean;
}

@Injectable()
export class TenantScopeService {
  constructor(private readonly prisma: PrismaService) {}

  resolveFromHeader(
    user: AuthenticatedUser,
    rawHeader: string | string[] | undefined,
  ): ResolvedTenantScope {
    const requestedScope = this.normalizeScope(rawHeader, user);
    const activeTenantIds = user.tenants
      .filter((tenant) => tenant.isActive)
      .map((tenant) => tenant.id);

    if (requestedScope === ALL_TENANTS_SCOPE) {
      if (activeTenantIds.length === 0) {
        throw new ForbiddenException('No tenant access.');
      }
      return {
        requestedScope,
        tenantIds: activeTenantIds,
        isAll: true,
      };
    }

    if (!activeTenantIds.includes(requestedScope)) {
      throw new ForbiddenException('Tenant access denied.');
    }

    return {
      requestedScope,
      tenantIds: [requestedScope],
      isAll: false,
    };
  }

  assertTenantAccess(user: AuthenticatedUser, tenantId: string): Promise<void> {
    if (
      !user.tenants.some((tenant) => tenant.id === tenantId && tenant.isActive)
    ) {
      return Promise.reject(new ForbiddenException('Tenant access denied.'));
    }

    return Promise.resolve();
  }

  async assertActiveTenantExists(tenantId: string): Promise<void> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { isActive: true },
    });

    if (!tenant?.isActive) {
      throw new NotFoundException('Tenant not found.');
    }
  }

  private normalizeScope(
    rawHeader: string | string[] | undefined,
    user: AuthenticatedUser,
  ): string {
    const headerValue = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;
    const requestedScope = headerValue?.trim();
    if (requestedScope) {
      return requestedScope;
    }

    return (
      user.defaultTenantId ??
      user.tenants.find((tenant) => tenant.isActive)?.id ??
      ALL_TENANTS_SCOPE
    );
  }
}
