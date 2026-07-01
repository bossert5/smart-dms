import { Body, Controller, Delete, Param, Patch, Post } from '@nestjs/common';
import {
  CreateEditLockRequestSchema,
  type CreateEditLockRequest,
  type CreateEditLockResponse,
} from '@smart-dms/shared-dto';
import { CurrentUser, Roles } from '../common/auth.decorators';
import type { AuthenticatedUser } from '../common/authenticated-user';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { EditLocksService } from './edit-locks.service';

@Controller('edit-locks')
export class EditLocksController {
  constructor(private readonly editLocks: EditLocksService) {}

  @Post()
  @Roles('Admin', 'User')
  acquire(
    @Body(new ZodValidationPipe(CreateEditLockRequestSchema))
    body: CreateEditLockRequest,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<CreateEditLockResponse> {
    return this.editLocks.acquire(body, user);
  }

  @Patch(':id/heartbeat')
  @Roles('Admin', 'User')
  heartbeat(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<CreateEditLockResponse> {
    return this.editLocks.heartbeat(id, user);
  }

  @Delete(':id')
  @Roles('Admin', 'User')
  release(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    return this.editLocks.release(id, user);
  }
}
