import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type {
  ChangePasswordRequest,
  CurrentUserResponse,
  LoginRequest,
  LoginResponse,
  UserDto,
} from '@smart-dms/shared-dto';
import * as argon2 from 'argon2';
import { createHash, randomBytes } from 'node:crypto';
import { AppConfigService } from '../common/app-config.service';
import type { AuthenticatedUser } from '../common/authenticated-user';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { toUserDto, userTenantMembershipInclude } from '../users/user.mapper';

interface RequestContext {
  userAgent?: string;
  ipAddress?: string;
}

interface SessionIssueResult {
  response: LoginResponse;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
  refreshTokenRecordId: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: AppConfigService,
    private readonly audit: AuditService,
  ) {}

  async login(
    input: LoginRequest,
    context: RequestContext,
  ): Promise<SessionIssueResult> {
    const user = await this.prisma.user.findUnique({
      where: { username: input.username.toLowerCase() },
      include: userTenantMembershipInclude,
    });

    if (!user?.isActive) {
      await this.audit.record({
        action: 'LOGIN_FAILED',
        entityType: 'User',
        metadata: {
          username: input.username.toLowerCase(),
          reason: 'not_found_or_inactive',
        },
      });
      throw new UnauthorizedException('Invalid credentials.');
    }

    const isPasswordValid = await argon2.verify(
      user.passwordHash,
      input.password,
    );
    if (!isPasswordValid) {
      await this.audit.record({
        actorUserId: user.id,
        action: 'LOGIN_FAILED',
        entityType: 'User',
        entityId: user.id,
        metadata: { reason: 'invalid_password' },
      });
      throw new UnauthorizedException('Invalid credentials.');
    }

    const result = await this.issueSession(toUserDto(user), context);
    await this.audit.record({
      actorUserId: user.id,
      action: 'LOGIN',
      entityType: 'User',
      entityId: user.id,
    });

    return result;
  }

  async refresh(
    refreshToken: string | undefined,
    context: RequestContext,
  ): Promise<SessionIssueResult> {
    if (!refreshToken) {
      throw new UnauthorizedException('Missing refresh token.');
    }

    const tokenHash = this.hashRefreshToken(refreshToken);
    const tokenRecord = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: { include: userTenantMembershipInclude } },
    });

    if (
      !tokenRecord ||
      tokenRecord.revokedAt ||
      tokenRecord.expiresAt.getTime() <= Date.now() ||
      !tokenRecord.user.isActive
    ) {
      throw new UnauthorizedException('Invalid refresh token.');
    }

    const result = await this.issueSession(
      toUserDto(tokenRecord.user),
      context,
    );
    await this.prisma.refreshToken.update({
      where: { id: tokenRecord.id },
      data: {
        revokedAt: new Date(),
        replacedByTokenId: result.refreshTokenRecordId,
      },
    });

    return result;
  }

  async logout(refreshToken: string | undefined): Promise<void> {
    if (!refreshToken) {
      return;
    }

    await this.prisma.refreshToken.updateMany({
      where: {
        tokenHash: this.hashRefreshToken(refreshToken),
        revokedAt: null,
      },
      data: { revokedAt: new Date() },
    });
  }

  currentUser(user: AuthenticatedUser): CurrentUserResponse {
    return { user };
  }

  async changePassword(
    user: AuthenticatedUser,
    input: ChangePasswordRequest,
    context: RequestContext,
  ): Promise<SessionIssueResult> {
    const existing = await this.prisma.user.findUnique({
      where: { id: user.id },
      include: userTenantMembershipInclude,
    });

    if (!existing?.isActive) {
      throw new UnauthorizedException('Invalid credentials.');
    }

    const reusesCurrentPassword = await argon2.verify(
      existing.passwordHash,
      input.newPassword,
    );
    if (reusesCurrentPassword) {
      throw new BadRequestException(
        'New password must differ from the current password.',
      );
    }

    if (!existing.passwordChangeRequired) {
      if (!input.currentPassword) {
        throw new BadRequestException('Current password is required.');
      }

      const isPasswordValid = await argon2.verify(
        existing.passwordHash,
        input.currentPassword,
      );
      if (!isPasswordValid) {
        await this.audit.record({
          actorUserId: existing.id,
          action: 'PASSWORD_CHANGE_FAILED',
          entityType: 'User',
          entityId: existing.id,
          metadata: { reason: 'invalid_current_password' },
        });
        throw new UnauthorizedException('Invalid credentials.');
      }
    }

    const updatedUser = await this.prisma.user.update({
      where: { id: existing.id },
      data: {
        passwordHash: await this.hashPassword(input.newPassword),
        passwordChangeRequired: false,
      },
      include: userTenantMembershipInclude,
    });
    const result = await this.issueSession(toUserDto(updatedUser), context);
    await this.prisma.refreshToken.updateMany({
      where: {
        userId: existing.id,
        revokedAt: null,
        id: { not: result.refreshTokenRecordId },
      },
      data: {
        revokedAt: new Date(),
        replacedByTokenId: result.refreshTokenRecordId,
      },
    });
    await this.audit.record({
      actorUserId: existing.id,
      action: 'PASSWORD_CHANGED',
      entityType: 'User',
      entityId: existing.id,
    });

    return result;
  }

  private async issueSession(
    user: UserDto,
    context: RequestContext,
  ): Promise<SessionIssueResult> {
    const accessTokenExpiresAt = new Date(
      Date.now() + this.config.jwtAccessTtlSeconds * 1000,
    );
    const accessToken = await this.jwtService.signAsync(
      {
        sub: user.id,
        username: user.username,
        role: user.role,
        displayName: user.displayName,
      },
      {
        secret: this.config.jwtAccessSecret,
        expiresIn: this.config.jwtAccessTtlSeconds,
      },
    );

    const refreshToken = randomBytes(48).toString('base64url');
    const refreshTokenExpiresAt = new Date(
      Date.now() + this.config.refreshTokenTtlDays * 24 * 60 * 60 * 1000,
    );
    const tokenRecord = await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: this.hashRefreshToken(refreshToken),
        expiresAt: refreshTokenExpiresAt,
        userAgent: context.userAgent,
        ipAddress: context.ipAddress,
      },
    });

    return {
      response: {
        accessToken,
        accessTokenExpiresAt: accessTokenExpiresAt.toISOString(),
        user,
      },
      refreshToken,
      refreshTokenExpiresAt,
      refreshTokenRecordId: tokenRecord.id,
    };
  }

  private hashRefreshToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private hashPassword(password: string): Promise<string> {
    return argon2.hash(password, { type: argon2.argon2id });
  }
}
