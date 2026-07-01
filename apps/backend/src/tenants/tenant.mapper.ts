import type { Tenant } from '@prisma/client';
import type { TenantDto, TenantSummaryDto } from '@smart-dms/shared-dto';
import { toIsoDateTime } from '../common/date-mapper';

type TenantCountFields = {
  readonly _count?: {
    readonly documents: number;
    readonly memberships: number;
  };
};

export function toTenantDto(tenant: Tenant & TenantCountFields): TenantDto {
  return {
    id: tenant.id,
    key: tenant.key,
    name: tenant.name,
    scannerImportPath: tenant.scannerImportPath,
    isActive: tenant.isActive,
    userCount: tenant._count?.memberships ?? 0,
    documentCount: tenant._count?.documents ?? 0,
    createdAt: toIsoDateTime(tenant.createdAt),
    updatedAt: toIsoDateTime(tenant.updatedAt),
  };
}

export function toTenantSummaryDto(
  tenant: Pick<Tenant, 'id' | 'key' | 'name' | 'isActive'>,
): TenantSummaryDto {
  return {
    id: tenant.id,
    key: tenant.key,
    name: tenant.name,
    isActive: tenant.isActive,
  };
}
