import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AppConfigService } from '../common/app-config.service';
import type { AuthenticatedUser } from '../common/authenticated-user';
import { PrismaService } from '../prisma/prisma.service';
import { toUserDto, userTenantMembershipInclude } from '../users/user.mapper';

interface AccessTokenPayload {
  sub: string;
  username: string;
  role: string;
  displayName: string;
}

@Injectable()
export class AccessTokenService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly config: AppConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async authenticate(
    accessToken: string | undefined,
  ): Promise<AuthenticatedUser> {
    if (!accessToken) {
      throw new UnauthorizedException('Missing access token.');
    }

    try {
      const payload = await this.jwtService.verifyAsync<AccessTokenPayload>(
        accessToken,
        {
          secret: this.config.jwtAccessSecret,
        },
      );
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        include: userTenantMembershipInclude,
      });

      if (!user?.isActive) {
        throw new UnauthorizedException('User is inactive.');
      }

      return toUserDto(user);
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }

      throw new UnauthorizedException('Invalid access token.');
    }
  }
}
