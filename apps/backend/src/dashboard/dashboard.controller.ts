import { Controller, Get, Req } from '@nestjs/common';
import type { Request } from 'express';
import type { DashboardSummaryDto } from '@smart-dms/shared-dto';
import { CurrentUser } from '../common/auth.decorators';
import type { AuthenticatedUser } from '../common/authenticated-user';
import {
  TENANT_SCOPE_HEADER,
  TenantScopeService,
} from '../tenants/tenant-scope.service';
import { DashboardService } from './dashboard.service';

@Controller('dashboard')
export class DashboardController {
  constructor(
    private readonly dashboardService: DashboardService,
    private readonly tenantScope: TenantScopeService,
  ) {}

  @Get()
  summary(
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<DashboardSummaryDto> {
    const scope = this.tenantScope.resolveFromHeader(
      user,
      request.headers[TENANT_SCOPE_HEADER],
    );

    return this.dashboardService.summary(scope.tenantIds, {
      includeAdminData: user.role === 'Admin',
      includeTenantBreakdown: scope.isAll,
    });
  }
}
