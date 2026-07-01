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
  AcceptInboxDocumentsRequestSchema,
  AiMetadataPromptScopeSchema,
  DocumentMetadataUpdateRequestSchema,
  MoveDocumentToTenantRequestSchema,
  ReprocessDocumentRequestSchema,
  DocumentTaskUpdateRequestSchema,
  DocumentSearchRequestSchema,
  PaginationRequestSchema,
  UpdateDocumentTagsRequestSchema,
} from '@smart-dms/shared-dto';
import type {
  AcceptInboxDocumentsRequest,
  AcceptInboxDocumentsResponse,
  DeleteDocumentResponse,
  DocumentMetadataUpdateRequest,
  DocumentSearchFacetsResponse,
  DocumentSearchRequest,
  MoveDocumentToTenantRequest,
  MoveDocumentToTenantResponse,
  MoveDocumentToInboxResponse,
  PaginationRequest,
  ReprocessDocumentRequest,
  DocumentTaskUpdateRequest,
  ReprocessDocumentResponse,
  TriggerBulkAiProcessingResponse,
  TriggerDocumentAiProcessingResponse,
  UpdateDocumentTagsRequest,
} from '@smart-dms/shared-dto';
import { CurrentUser, Roles } from '../common/auth.decorators';
import type { AuthenticatedUser } from '../common/authenticated-user';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import {
  TENANT_SCOPE_HEADER,
  TenantScopeService,
} from '../tenants/tenant-scope.service';
import { DocumentsService } from './documents.service';

@Controller('documents')
export class DocumentsController {
  constructor(
    private readonly documentsService: DocumentsService,
    private readonly tenantScope: TenantScopeService,
  ) {}

  @Get()
  search(
    @Query() query: Record<string, unknown>,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.documentsService.search(
      normalizeSearchQuery(query),
      this.resolveTenantIds(user, request),
    );
  }

  @Get('search-facets')
  searchFacets(
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<DocumentSearchFacetsResponse> {
    return this.documentsService.searchFacets(
      this.resolveTenantIds(user, request),
    );
  }

  @Get('inbox')
  inbox(
    @Query() query: Record<string, unknown>,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.documentsService.searchInbox(
      normalizeSearchQuery(query),
      this.resolveTenantIds(user, request),
    );
  }

  @Post('inbox/accept')
  @Roles('Admin', 'User')
  acceptInboxDocuments(
    @Body(new ZodValidationPipe(AcceptInboxDocumentsRequestSchema))
    body: AcceptInboxDocumentsRequest,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<AcceptInboxDocumentsResponse> {
    return this.documentsService.acceptInboxDocuments(
      body.documentIds,
      user,
      this.resolveTenantIds(user, request),
    );
  }

  @Get(':id/history')
  history(
    @Param('id') id: string,
    @Query() query: Record<string, unknown>,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.documentsService.history(
      id,
      normalizeHistoryQuery(query),
      this.resolveTenantIds(user, request),
    );
  }

  @Get(':id')
  getDetail(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.documentsService.getDetail(
      id,
      this.resolveTenantIds(user, request),
    );
  }

  @Post('ai-extraction')
  @Roles('Admin', 'User')
  triggerBulkAiExtraction(
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<TriggerBulkAiProcessingResponse> {
    return this.documentsService.triggerBulkAiExtraction(
      user,
      this.resolveTenantIds(user, request),
    );
  }

  @Patch(':id/metadata')
  @Roles('Admin', 'User')
  updateMetadata(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(DocumentMetadataUpdateRequestSchema))
    body: DocumentMetadataUpdateRequest,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.documentsService.updateMetadata(
      id,
      body,
      user,
      this.resolveTenantIds(user, request),
    );
  }

  @Patch(':id/tags')
  @Roles('Admin', 'User')
  updateTags(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateDocumentTagsRequestSchema))
    body: UpdateDocumentTagsRequest,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.documentsService.updateTags(
      id,
      body,
      user,
      this.resolveTenantIds(user, request),
    );
  }

  @Patch(':id/payments/:paymentId/task')
  @Roles('Admin', 'User')
  updatePaymentTask(
    @Param('id') id: string,
    @Param('paymentId') paymentId: string,
    @Body(new ZodValidationPipe(DocumentTaskUpdateRequestSchema))
    body: DocumentTaskUpdateRequest,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.documentsService.updatePaymentTask(
      id,
      paymentId,
      body,
      user,
      this.resolveTenantIds(user, request),
    );
  }

  @Patch(':id/calendar-events/:eventId/task')
  @Roles('Admin', 'User')
  updateCalendarEventTask(
    @Param('id') id: string,
    @Param('eventId') eventId: string,
    @Body(new ZodValidationPipe(DocumentTaskUpdateRequestSchema))
    body: DocumentTaskUpdateRequest,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.documentsService.updateCalendarEventTask(
      id,
      eventId,
      body,
      user,
      this.resolveTenantIds(user, request),
    );
  }

  @Post(':id/archive')
  @Roles('Admin', 'User')
  archive(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.documentsService.archive(
      id,
      user,
      this.resolveTenantIds(user, request),
    );
  }

  @Post(':id/move-to-inbox')
  @Roles('Admin', 'User')
  moveToInbox(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<MoveDocumentToInboxResponse> {
    return this.documentsService.moveToInbox(
      id,
      user,
      this.resolveTenantIds(user, request),
    );
  }

  @Post(':id/move-to-tenant')
  @Roles('Admin')
  moveToTenant(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(MoveDocumentToTenantRequestSchema))
    body: MoveDocumentToTenantRequest,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<MoveDocumentToTenantResponse> {
    return this.documentsService.moveToTenant(
      id,
      body,
      user,
      this.resolveTenantIds(user, request),
    );
  }

  @Delete(':id')
  @Roles('Admin', 'User')
  delete(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<DeleteDocumentResponse> {
    return this.documentsService.delete(
      id,
      user,
      this.resolveTenantIds(user, request),
    );
  }

  @Post(':id/accept')
  @Roles('Admin', 'User')
  acceptInboxDocument(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<AcceptInboxDocumentsResponse> {
    return this.documentsService.acceptInboxDocument(
      id,
      user,
      this.resolveTenantIds(user, request),
    );
  }

  @Post(':id/ai-extraction')
  @Roles('Admin', 'User')
  triggerAiExtraction(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<TriggerDocumentAiProcessingResponse> {
    return this.documentsService.triggerAiExtraction(
      id,
      user,
      this.resolveTenantIds(user, request),
    );
  }

  @Post(':id/ai-extraction/scopes/:scopeKey')
  @Roles('Admin', 'User')
  triggerScopedAiExtraction(
    @Param('id') id: string,
    @Param('scopeKey') scopeKey: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<TriggerDocumentAiProcessingResponse> {
    return this.documentsService.triggerScopedAiExtraction(
      id,
      AiMetadataPromptScopeSchema.parse(scopeKey),
      user,
      this.resolveTenantIds(user, request),
    );
  }

  @Post(':id/reprocess')
  @Roles('Admin')
  reprocess(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(ReprocessDocumentRequestSchema))
    body: ReprocessDocumentRequest,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<ReprocessDocumentResponse> {
    return this.documentsService.reprocess(
      id,
      user,
      this.resolveTenantIds(user, request),
      body,
    );
  }

  @Get(':id/pdf')
  async pdf(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    const artifact = await this.documentsService.getArtifactForDownload(
      id,
      'pdf',
      this.resolveTenantIds(user, request),
    );
    response.type(artifact.mimeType);
    response.sendFile(artifact.path);
  }

  @Get(':id/thumbnail')
  async thumbnail(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    const artifact = await this.documentsService.getArtifactForDownload(
      id,
      'thumbnail',
      this.resolveTenantIds(user, request),
    );
    response.type(artifact.mimeType);
    response.sendFile(artifact.path);
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

function normalizeSearchQuery(
  query: Record<string, unknown>,
): DocumentSearchRequest {
  return DocumentSearchRequestSchema.parse({
    page: query.page,
    pageSize: query.pageSize,
    query: query.query,
    searchFields: toArray(query.searchFields ?? query.searchField),
    sortBy:
      query.sortBy ?? (hasSearchQuery(query.query) ? 'relevance' : undefined),
    sortDirection: query.sortDirection,
    filters: {
      statuses: toArray(query.statuses ?? query.status),
      sources: toArray(query.sources ?? query.source),
      tags: toArray(query.tags ?? query.tag),
      tagNames: toArray(query.tagNames ?? query.tagName),
      senders: toArray(query.senders),
      documentTypeIds: toArray(query.documentTypeIds ?? query.documentTypeId),
      includeArchived: toBoolean(query.includeArchived),
      createdFrom: query.createdFrom,
      createdTo: query.createdTo,
      documentDateFrom: query.documentDateFrom,
      documentDateTo: query.documentDateTo,
      visibleDateFrom: query.visibleDateFrom,
      visibleDateTo: query.visibleDateTo,
      sender: query.sender,
      recipient: query.recipient,
    },
  });
}

function normalizeHistoryQuery(
  query: Record<string, unknown>,
): PaginationRequest {
  return PaginationRequestSchema.parse({
    page: query.page,
    pageSize: query.pageSize ?? 100,
  });
}

function hasSearchQuery(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

function toArray(value: unknown): string[] | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  if (Array.isArray(value)) {
    return value
      .flatMap((entry) => queryValueToString(entry).split(','))
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  return queryValueToString(value)
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function queryValueToString(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return '';
}

function toBoolean(value: unknown): boolean | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  return value === true || value === 'true';
}
