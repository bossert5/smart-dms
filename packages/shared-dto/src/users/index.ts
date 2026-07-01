import { z } from 'zod';
import {
  IsoDateTimeSchema,
  PaginationMetaSchema,
  UuidSchema,
} from '../common';
import { TenantSummaryDtoSchema } from '../tenants';

export const UserRoleSchema = z.enum(['Admin', 'User']);
export type UserRole = z.infer<typeof UserRoleSchema>;

const UsernameSchema = z.string().trim().min(1).max(100);
export const PasswordSchema = z
  .string()
  .min(8)
  .max(256)
  .regex(/\d/, 'Password must contain at least one number.')
  .regex(
    /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]/,
    'Password must contain at least one special character.',
  );
export type Password = z.infer<typeof PasswordSchema>;

export const UserDtoSchema = z.object({
  id: UuidSchema,
  username: UsernameSchema,
  displayName: z.string().min(1),
  role: UserRoleSchema,
  isActive: z.boolean(),
  passwordChangeRequired: z.boolean(),
  tenants: z.array(TenantSummaryDtoSchema),
  defaultTenantId: UuidSchema.nullable(),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});
export type UserDto = z.infer<typeof UserDtoSchema>;

export const UserAssigneeDtoSchema = UserDtoSchema.pick({
  id: true,
  username: true,
  displayName: true,
});
export type UserAssigneeDto = z.infer<typeof UserAssigneeDtoSchema>;

export const CreateUserRequestSchema = z.object({
  username: UsernameSchema,
  displayName: z.string().trim().min(1).max(200),
  password: PasswordSchema,
  role: UserRoleSchema,
  tenantIds: z.array(UuidSchema).min(1).max(500).optional(),
  defaultTenantId: UuidSchema.optional(),
});
export type CreateUserRequest = z.infer<typeof CreateUserRequestSchema>;

export const UpdateUserRequestSchema = z
  .object({
    username: UsernameSchema.optional(),
    displayName: z.string().trim().min(1).max(200).optional(),
    password: PasswordSchema.optional(),
    role: UserRoleSchema.optional(),
    isActive: z.boolean().optional(),
    tenantIds: z.array(UuidSchema).min(1).max(500).optional(),
    defaultTenantId: UuidSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be provided.',
  });
export type UpdateUserRequest = z.infer<typeof UpdateUserRequestSchema>;

export const BulkUpdateUsersRequestSchema = z.object({
  updates: z
    .array(
      z.object({
        id: UuidSchema,
        changes: UpdateUserRequestSchema,
      }),
    )
    .min(1)
    .max(500),
});
export type BulkUpdateUsersRequest = z.infer<
  typeof BulkUpdateUsersRequestSchema
>;

export const BulkUpdateUsersResponseSchema = z.object({
  users: z.array(UserDtoSchema),
});
export type BulkUpdateUsersResponse = z.infer<
  typeof BulkUpdateUsersResponseSchema
>;

export const ListUsersResponseSchema = z.object({
  items: z.array(UserDtoSchema),
  meta: PaginationMetaSchema,
});
export type ListUsersResponse = z.infer<typeof ListUsersResponseSchema>;

export const ListUserAssigneesResponseSchema = z.object({
  items: z.array(UserAssigneeDtoSchema),
});
export type ListUserAssigneesResponse = z.infer<
  typeof ListUserAssigneesResponseSchema
>;
