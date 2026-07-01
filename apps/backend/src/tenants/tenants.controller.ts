import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  CreateTenantRequestSchema,
  DeleteTenantRequestSchema,
  PaginationRequestSchema,
  UpdateTenantRequestSchema,
} from '@smart-dms/shared-dto';
import type {
  CreateTenantRequest,
  DeleteTenantRequest,
  DeleteTenantResponse,
  ListTenantsResponse,
  PaginationRequest,
  TenantDto,
  UpdateTenantRequest,
} from '@smart-dms/shared-dto';
import { Roles } from '../common/auth.decorators';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { TenantsService } from './tenants.service';

@Controller('tenants')
export class TenantsController {
  constructor(private readonly tenants: TenantsService) {}

  @Get()
  @Roles('Admin')
  list(
    @Query(new ZodValidationPipe(PaginationRequestSchema))
    query: PaginationRequest,
  ): Promise<ListTenantsResponse> {
    return this.tenants.list(query);
  }

  @Get('active')
  @Roles('Admin')
  listActive(): Promise<TenantDto[]> {
    return this.tenants.listActive();
  }

  @Post()
  @Roles('Admin')
  create(
    @Body(new ZodValidationPipe(CreateTenantRequestSchema))
    body: CreateTenantRequest,
  ): Promise<TenantDto> {
    return this.tenants.create(body);
  }

  @Patch(':id')
  @Roles('Admin')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateTenantRequestSchema))
    body: UpdateTenantRequest,
  ): Promise<TenantDto> {
    return this.tenants.update(id, body);
  }

  @Delete(':id')
  @Roles('Admin')
  async delete(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(DeleteTenantRequestSchema))
    body: DeleteTenantRequest,
  ): Promise<DeleteTenantResponse> {
    await this.tenants.delete(id, body);
    return { success: true };
  }
}
