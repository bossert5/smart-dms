import { Controller, Get, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import {
  EmailMessagesRequestSchema,
  type EmailMessagesRequest,
} from '@smart-dms/shared-dto';
import { CurrentUser, Roles } from '../common/auth.decorators';
import type { AuthenticatedUser } from '../common/authenticated-user';
import {
  TENANT_SCOPE_HEADER,
  TenantScopeService,
} from '../tenants/tenant-scope.service';
import { EmailMailboxesService } from './email-mailboxes.service';

@Controller('email-messages')
@Roles('Admin', 'User')
export class EmailMessagesController {
  constructor(
    private readonly emailMailboxes: EmailMailboxesService,
    private readonly tenantScope: TenantScopeService,
  ) {}

  @Get()
  listMessages(
    @Query() query: Record<string, unknown>,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.emailMailboxes.listAllMessages(
      normalizeMessagesQuery(query),
      this.tenantScope.resolveFromHeader(
        user,
        request.headers[TENANT_SCOPE_HEADER],
      ).tenantIds,
    );
  }
}

function normalizeMessagesQuery(
  query: Record<string, unknown>,
): EmailMessagesRequest {
  return EmailMessagesRequestSchema.parse({
    page: query.page,
    pageSize: query.pageSize,
    mailboxId: query.mailboxId,
    folderPath: query.folderPath,
  });
}
