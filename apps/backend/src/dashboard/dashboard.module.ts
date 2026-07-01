import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SettingsModule } from '../settings/settings.module';
import { TenantsModule } from '../tenants/tenants.module';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [PrismaModule, SettingsModule, TenantsModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
