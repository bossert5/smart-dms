import type { UserRole } from '@smart-dms/shared-dto';

export const USER_ROLES = ['Admin', 'User'] as const satisfies readonly UserRole[];

export function userRoleLabelKey(role: UserRole): string {
  return `enums.userRole.${role}`;
}
