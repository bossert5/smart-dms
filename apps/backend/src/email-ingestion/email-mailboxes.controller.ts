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
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import {
  CreateEmailMailboxRequestSchema,
  EmailMailboxConnectionRequestSchema,
  EmailMessagesRequestSchema,
  UpdateEmailMailboxRequestSchema,
} from '@smart-dms/shared-dto';
import type {
  CreateEmailMailboxRequest,
  EmailMailboxConnectionRequest,
  EmailMessagesRequest,
  UpdateEmailMailboxRequest,
} from '@smart-dms/shared-dto';
import { CurrentUser, Roles } from '../common/auth.decorators';
import type { AuthenticatedUser } from '../common/authenticated-user';
import {
  TENANT_SCOPE_HEADER,
  TenantScopeService,
} from '../tenants/tenant-scope.service';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { EmailMailboxesService } from './email-mailboxes.service';

@Controller('email-mailboxes')
@Roles('Admin')
export class EmailMailboxesController {
  constructor(
    private readonly emailMailboxes: EmailMailboxesService,
    private readonly tenantScope: TenantScopeService,
  ) {}

  @Get()
  listMailboxes(
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.emailMailboxes.listMailboxes(
      this.resolveTenantIds(user, request),
    );
  }

  @Post()
  createMailbox(
    @Body(new ZodValidationPipe(CreateEmailMailboxRequestSchema))
    body: CreateEmailMailboxRequest,
  ) {
    return this.emailMailboxes.createMailbox(body);
  }

  @Patch(':id')
  updateMailbox(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateEmailMailboxRequestSchema))
    body: UpdateEmailMailboxRequest,
  ) {
    return this.emailMailboxes.updateMailbox(id, body);
  }

  @Delete(':id')
  async deleteMailbox(@Param('id') id: string): Promise<{ success: true }> {
    await this.emailMailboxes.deleteMailbox(id);
    return { success: true };
  }

  @Post(':id/test')
  testConnection(@Param('id') id: string) {
    return this.emailMailboxes.testConnection(id);
  }

  @Post('test')
  testConnectionInput(
    @Body(new ZodValidationPipe(EmailMailboxConnectionRequestSchema))
    body: EmailMailboxConnectionRequest,
  ) {
    return this.emailMailboxes.testConnectionInput(body);
  }

  @Post(':id/sync')
  syncMailbox(@Param('id') id: string) {
    return this.emailMailboxes.syncMailbox(id);
  }

  @Get(':id/folders')
  listFolders(@Param('id') id: string) {
    return this.emailMailboxes.listFolders(id);
  }

  @Post('folders')
  listFoldersFromConnectionInput(
    @Body(new ZodValidationPipe(EmailMailboxConnectionRequestSchema))
    body: EmailMailboxConnectionRequest,
  ) {
    return this.emailMailboxes.listFoldersFromConnectionInput(body);
  }

  @Get(':id/messages')
  listMessages(
    @Param('id') id: string,
    @Query() query: Record<string, unknown>,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.emailMailboxes.listMessages(
      id,
      normalizeMessagesQuery(query),
      this.resolveTenantIds(user, request),
    );
  }

  @Get('messages/:messageId/attachments/:attachmentId/pdf')
  @Roles('Admin', 'User')
  async attachmentPdf(
    @Param('messageId') messageId: string,
    @Param('attachmentId') attachmentId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    await this.emailMailboxes.sendAttachmentPdf(
      messageId,
      attachmentId,
      this.resolveTenantIds(user, request),
      response,
    );
  }

  private resolveTenantIds(
    user: AuthenticatedUser,
    request: Request,
  ): string[] {
    return this.tenantScope.resolveFromHeader(
      user,
      request.headers[TENANT_SCOPE_HEADER],
    ).tenantIds;
  }
}

function normalizeMessagesQuery(
  query: Record<string, unknown>,
): EmailMessagesRequest {
  return EmailMessagesRequestSchema.parse({
    page: query.page,
    pageSize: query.pageSize,
    folderPath: query.folderPath,
  });
}
