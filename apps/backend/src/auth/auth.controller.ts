import { Body, Controller, Get, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import {
  ChangePasswordRequestSchema,
  LoginRequestSchema,
} from '@smart-dms/shared-dto';
import type {
  ChangePasswordRequest,
  CurrentUserResponse,
  LoginRequest,
  LoginResponse,
  LogoutResponse,
} from '@smart-dms/shared-dto';
import {
  AllowPasswordChangeRequired,
  CurrentUser,
  Public,
} from '../common/auth.decorators';
import type {
  AuthenticatedUser,
  RequestWithUser,
} from '../common/authenticated-user';
import { API_ROUTE_PREFIX } from '../common/api-prefix';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { AuthService } from './auth.service';

const REFRESH_COOKIE_NAME = 'refreshToken';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  async login(
    @Body(new ZodValidationPipe(LoginRequestSchema)) body: LoginRequest,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<LoginResponse> {
    const result = await this.authService.login(
      body,
      this.getRequestContext(request),
    );
    this.setRefreshCookie(
      response,
      result.refreshToken,
      result.refreshTokenExpiresAt,
    );
    return result.response;
  }

  @Public()
  @Post('refresh')
  async refresh(
    @Req() request: RequestWithUser,
    @Res({ passthrough: true }) response: Response,
  ): Promise<LoginResponse> {
    const result = await this.authService.refresh(
      this.refreshTokenFromCookies(request),
      this.getRequestContext(request),
    );
    this.setRefreshCookie(
      response,
      result.refreshToken,
      result.refreshTokenExpiresAt,
    );
    return result.response;
  }

  @Public()
  @Post('logout')
  async logout(
    @Req() request: RequestWithUser,
    @Res({ passthrough: true }) response: Response,
  ): Promise<LogoutResponse> {
    await this.authService.logout(this.refreshTokenFromCookies(request));
    response.clearCookie(REFRESH_COOKIE_NAME, this.refreshCookieOptions());
    return { success: true };
  }

  @Get('me')
  @AllowPasswordChangeRequired()
  me(@CurrentUser() user: AuthenticatedUser): CurrentUserResponse {
    return this.authService.currentUser(user);
  }

  @Post('change-password')
  @AllowPasswordChangeRequired()
  async changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(ChangePasswordRequestSchema))
    body: ChangePasswordRequest,
    @Req() request: RequestWithUser,
    @Res({ passthrough: true }) response: Response,
  ): Promise<LoginResponse> {
    const result = await this.authService.changePassword(
      user,
      body,
      this.getRequestContext(request),
    );
    this.setRefreshCookie(
      response,
      result.refreshToken,
      result.refreshTokenExpiresAt,
    );
    return result.response;
  }

  private getRequestContext(request: Request): {
    userAgent?: string;
    ipAddress?: string;
  } {
    return {
      userAgent: request.get('user-agent'),
      ipAddress: request.ip,
    };
  }

  private setRefreshCookie(
    response: Response,
    token: string,
    expires: Date,
  ): void {
    response.cookie(REFRESH_COOKIE_NAME, token, {
      ...this.refreshCookieOptions(),
      expires,
    });
  }

  private refreshTokenFromCookies(request: Request): string | undefined {
    const cookies = request.cookies as Record<string, unknown> | undefined;
    const token = cookies?.[REFRESH_COOKIE_NAME];
    return typeof token === 'string' ? token : undefined;
  }

  private refreshCookieOptions() {
    return {
      httpOnly: true,
      sameSite: 'lax' as const,
      secure: process.env.NODE_ENV === 'production',
      path: `${API_ROUTE_PREFIX}/auth`,
    };
  }
}
