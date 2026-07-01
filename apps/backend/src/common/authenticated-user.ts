import type { TenantSummaryDto, UserRole } from '@smart-dms/shared-dto';
import type { Request } from 'express';

export interface AuthenticatedUser {
  id: string;
  username: string;
  displayName: string;
  role: UserRole;
  isActive: boolean;
  passwordChangeRequired: boolean;
  tenants: TenantSummaryDto[];
  defaultTenantId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RequestWithUser extends Request {
  user?: AuthenticatedUser;
}
