import { z } from 'zod';
import {
  IsoDateTimeSchema,
  PaginationMetaSchema,
  UuidSchema,
} from '../common';

const TenantKeySchema = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9][a-z0-9_-]*$/, {
    message:
      'Tenant key must use lowercase letters, numbers, underscores or hyphens.',
  });

const ScannerImportPathSchema = z
  .string()
  .trim()
  .max(1000)
  .nullable()
  .optional();

export const TenantDtoSchema = z.object({
  id: UuidSchema,
  key: TenantKeySchema,
  name: z.string().min(1),
  scannerImportPath: z.string().nullable(),
  isActive: z.boolean(),
  userCount: z.number().int().min(0),
  documentCount: z.number().int().min(0),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});
export type TenantDto = z.infer<typeof TenantDtoSchema>;

export const TenantSummaryDtoSchema = TenantDtoSchema.pick({
  id: true,
  key: true,
  name: true,
  isActive: true,
});
export type TenantSummaryDto = z.infer<typeof TenantSummaryDtoSchema>;

export const TenantScopeSchema = z.union([UuidSchema, z.literal('all')]);
export type TenantScope = z.infer<typeof TenantScopeSchema>;

export const CreateTenantRequestSchema = z.object({
  key: TenantKeySchema,
  name: z.string().trim().min(1).max(200),
  scannerImportPath: ScannerImportPathSchema,
  isActive: z.boolean().default(true),
});
export type CreateTenantRequest = z.infer<typeof CreateTenantRequestSchema>;

export const UpdateTenantRequestSchema = CreateTenantRequestSchema.partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be provided.',
  });
export type UpdateTenantRequest = z.infer<typeof UpdateTenantRequestSchema>;

export const DeleteTenantDocumentActionSchema = z.enum(['DELETE', 'MOVE']);
export type DeleteTenantDocumentAction = z.infer<
  typeof DeleteTenantDocumentActionSchema
>;

export const DeleteTenantUserActionSchema = z.literal('REMOVE_ASSIGNMENTS');
export type DeleteTenantUserAction = z.infer<
  typeof DeleteTenantUserActionSchema
>;

const DeleteTenantBaseRequestSchema = z.object({
  confirmationName: z.string().trim().min(1).max(200),
  userAction: DeleteTenantUserActionSchema,
});

export const DeleteTenantRequestSchema = z.discriminatedUnion(
  'documentAction',
  [
    DeleteTenantBaseRequestSchema.extend({
      documentAction: z.literal('DELETE'),
    }),
    DeleteTenantBaseRequestSchema.extend({
      documentAction: z.literal('MOVE'),
      targetTenantId: UuidSchema,
    }),
  ],
);
export type DeleteTenantRequest = z.infer<typeof DeleteTenantRequestSchema>;

export const DeleteTenantResponseSchema = z.object({
  success: z.literal(true),
});
export type DeleteTenantResponse = z.infer<typeof DeleteTenantResponseSchema>;

export const ListTenantsResponseSchema = z.object({
  items: z.array(TenantDtoSchema),
  meta: PaginationMetaSchema,
});
export type ListTenantsResponse = z.infer<typeof ListTenantsResponseSchema>;

export const UpdateUserTenantsRequestSchema = z.object({
  tenantIds: z.array(UuidSchema).min(1).max(500),
  defaultTenantId: UuidSchema.optional(),
});
export type UpdateUserTenantsRequest = z.infer<
  typeof UpdateUserTenantsRequestSchema
>;
