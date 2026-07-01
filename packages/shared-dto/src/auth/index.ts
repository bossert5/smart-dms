import { z } from 'zod';
import { IsoDateTimeSchema } from '../common';
import { PasswordSchema, UserDtoSchema } from '../users';

export const LoginRequestSchema = z.object({
  username: z.string().trim().min(1).max(100),
  password: z.string().min(1),
});
export type LoginRequest = z.infer<typeof LoginRequestSchema>;

export const LoginResponseSchema = z.object({
  accessToken: z.string().min(1),
  accessTokenExpiresAt: IsoDateTimeSchema,
  user: UserDtoSchema,
});
export type LoginResponse = z.infer<typeof LoginResponseSchema>;

export const RefreshResponseSchema = LoginResponseSchema;
export type RefreshResponse = z.infer<typeof RefreshResponseSchema>;

export const LogoutResponseSchema = z.object({
  success: z.literal(true),
});
export type LogoutResponse = z.infer<typeof LogoutResponseSchema>;

export const CurrentUserResponseSchema = z.object({
  user: UserDtoSchema,
});
export type CurrentUserResponse = z.infer<typeof CurrentUserResponseSchema>;

export const ChangePasswordRequestSchema = z
  .object({
    currentPassword: z.string().min(1).optional(),
    newPassword: PasswordSchema,
  })
  .refine((value) => value.currentPassword !== value.newPassword, {
    message: 'New password must differ from the current password.',
    path: ['newPassword'],
  });
export type ChangePasswordRequest = z.infer<
  typeof ChangePasswordRequestSchema
>;
