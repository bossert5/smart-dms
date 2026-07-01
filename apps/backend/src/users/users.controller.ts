import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  CreateUserRequestSchema,
  BulkUpdateUsersRequestSchema,
  PaginationRequestSchema,
  UpdateUserTenantsRequestSchema,
  UpdateUserRequestSchema,
} from '@smart-dms/shared-dto';
import type {
  BulkUpdateUsersRequest,
  BulkUpdateUsersResponse,
  CreateUserRequest,
  ListUserAssigneesResponse,
  ListUsersResponse,
  PaginationRequest,
  UpdateUserTenantsRequest,
  UpdateUserRequest,
  UserDto,
} from '@smart-dms/shared-dto';
import { Roles } from '../common/auth.decorators';
import { CurrentUser } from '../common/auth.decorators';
import type { AuthenticatedUser } from '../common/authenticated-user';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { TENANT_SCOPE_HEADER } from '../tenants/tenant-scope.service';
import { UsersService } from './users.service';

@Controller('users')
@Roles('Admin')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('assignees')
  @Roles('Admin', 'User')
  assignees(
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<ListUserAssigneesResponse> {
    return this.usersService.listAssignees(
      this.resolveTenantIds(user, request),
    );
  }

  @Get()
  list(
    @Query(new ZodValidationPipe(PaginationRequestSchema))
    query: PaginationRequest,
  ): Promise<ListUsersResponse> {
    return this.usersService.list(query);
  }

  @Post()
  create(
    @Body(new ZodValidationPipe(CreateUserRequestSchema))
    body: CreateUserRequest,
  ): Promise<UserDto> {
    return this.usersService.create(body);
  }

  @Patch()
  bulkUpdate(
    @Body(new ZodValidationPipe(BulkUpdateUsersRequestSchema))
    body: BulkUpdateUsersRequest,
  ): Promise<BulkUpdateUsersResponse> {
    return this.usersService.bulkUpdate(body);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateUserRequestSchema))
    body: UpdateUserRequest,
  ): Promise<UserDto> {
    return this.usersService.update(id, body);
  }

  @Delete(':id')
  async delete(@Param('id') id: string): Promise<{ success: true }> {
    await this.usersService.delete(id);
    return { success: true };
  }

  @Patch(':id/tenants')
  updateTenants(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateUserTenantsRequestSchema))
    body: UpdateUserTenantsRequest,
  ): Promise<UserDto> {
    return this.usersService.updateTenants(id, body);
  }

  private resolveTenantIds(
    user: AuthenticatedUser,
    request: Request,
  ): string[] {
    const requestedScope = Array.isArray(request.headers[TENANT_SCOPE_HEADER])
      ? request.headers[TENANT_SCOPE_HEADER][0]
      : request.headers[TENANT_SCOPE_HEADER];
    const userTenantIds = user.tenants.map((tenant) => tenant.id);

    if (
      typeof requestedScope === 'string' &&
      requestedScope !== 'all' &&
      userTenantIds.includes(requestedScope)
    ) {
      return [requestedScope];
    }

    return userTenantIds;
  }
}
