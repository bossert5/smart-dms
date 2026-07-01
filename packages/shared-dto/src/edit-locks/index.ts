import { z } from 'zod';
import { IsoDateTimeSchema, UuidSchema } from '../common';

export const EditLockScopeSchema = z.enum(['INBOX', 'DOCUMENT']);
export type EditLockScope = z.infer<typeof EditLockScopeSchema>;

export const EditLockDtoSchema = z.object({
  id: UuidSchema,
  scope: EditLockScopeSchema,
  resourceId: z.string().trim().min(1).max(200),
  ownerUserId: UuidSchema,
  ownerDisplayName: z.string().trim().min(1).max(200),
  clientId: z.string().trim().min(1).max(200),
  socketId: z.string().trim().min(1).max(200),
  expiresAt: IsoDateTimeSchema,
  createdAt: IsoDateTimeSchema,
});
export type EditLockDto = z.infer<typeof EditLockDtoSchema>;

export const CreateEditLockRequestSchema = z.object({
  scope: EditLockScopeSchema,
  resourceId: z.string().trim().min(1).max(200),
  clientId: z.string().trim().min(1).max(200),
  socketId: z.string().trim().min(1).max(200),
});
export type CreateEditLockRequest = z.infer<
  typeof CreateEditLockRequestSchema
>;

export const CreateEditLockResponseSchema = z.object({
  lock: EditLockDtoSchema,
});
export type CreateEditLockResponse = z.infer<
  typeof CreateEditLockResponseSchema
>;

export const EditLockConflictResponseSchema = z.object({
  lock: EditLockDtoSchema,
});
export type EditLockConflictResponse = z.infer<
  typeof EditLockConflictResponseSchema
>;
