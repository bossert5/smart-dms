import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { StorageModule } from '../storage/storage.module';
import { TenantsController } from './tenants.controller';
import { TenantScopeService } from './tenant-scope.service';
import { TenantsService } from './tenants.service';

@Module({
  imports: [PrismaModule, StorageModule],
  controllers: [TenantsController],
  providers: [TenantsService, TenantScopeService],
  exports: [TenantsService, TenantScopeService],
})
export class TenantsModule {}
