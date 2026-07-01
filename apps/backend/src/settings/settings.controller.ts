import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import {
  AiMetadataPromptScopeSchema,
  LoadAiProviderModelsRequestSchema,
  CreateDocumentFieldDefinitionRequestSchema,
  CreateAiProviderRequestSchema,
  CreateDocumentTypeRequestSchema,
  ReorderAiProvidersRequestSchema,
  ReorderDocumentTypesRequestSchema,
  UpdateDocumentFieldDefinitionRequestSchema,
  UpdateDocumentTypeRequestSchema,
  UpdateAiProviderRequestSchema,
  UpdateAiMetadataPromptRequestSchema,
  UpdateSystemSettingsRequestSchema,
  type AiProviderDto,
  type AiProviderModelsResponse,
  type AiMetadataPromptDto,
  type AiMetadataPromptScope,
  type CreateAiProviderRequest,
  type CreateDocumentFieldDefinitionRequest,
  type CreateDocumentTypeRequest,
  type ReorderAiProvidersRequest,
  type DocumentFieldDefinitionDto,
  type DocumentTypeDto,
  type LoadAiProviderModelsRequest,
  type ReorderDocumentTypesRequest,
  type SystemSettingsDto,
  type UpdateAiProviderRequest,
  type UpdateAiMetadataPromptRequest,
  type UpdateDocumentFieldDefinitionRequest,
  type UpdateDocumentTypeRequest,
  type UpdateSystemSettingsRequest,
} from '@smart-dms/shared-dto';
import { AiProviderService } from '../ai-providers/ai-provider.service';
import { Roles } from '../common/auth.decorators';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { SettingsService } from './settings.service';

@Controller('settings')
@Roles('Admin')
export class SettingsController {
  constructor(
    private readonly settingsService: SettingsService,
    private readonly aiProviders: AiProviderService,
  ) {}

  @Get()
  getSettings(): Promise<SystemSettingsDto> {
    return this.settingsService.getSettings();
  }

  @Patch()
  updateSettings(
    @Body(new ZodValidationPipe(UpdateSystemSettingsRequestSchema))
    body: UpdateSystemSettingsRequest,
  ): Promise<SystemSettingsDto> {
    return this.settingsService.updateSettings(body);
  }

  @Get('ai-metadata-prompts')
  listAiMetadataPrompts(): Promise<AiMetadataPromptDto[]> {
    return this.settingsService.listAiMetadataPrompts();
  }

  @Patch('ai-metadata-prompts/:key')
  updateAiMetadataPrompt(
    @Param('key') key: string,
    @Body(new ZodValidationPipe(UpdateAiMetadataPromptRequestSchema))
    body: UpdateAiMetadataPromptRequest,
  ): Promise<AiMetadataPromptDto> {
    return this.settingsService.updateAiMetadataPrompt(
      this.parseAiMetadataPromptScope(key),
      body,
    );
  }

  @Post('ai-metadata-prompts/:key/reset')
  resetAiMetadataPrompt(
    @Param('key') key: string,
  ): Promise<AiMetadataPromptDto> {
    return this.settingsService.resetAiMetadataPrompt(
      this.parseAiMetadataPromptScope(key),
    );
  }

  @Get('document-types')
  listDocumentTypes(): Promise<DocumentTypeDto[]> {
    return this.settingsService.listDocumentTypes();
  }

  @Post('document-types')
  createDocumentType(
    @Body(new ZodValidationPipe(CreateDocumentTypeRequestSchema))
    body: CreateDocumentTypeRequest,
  ): Promise<DocumentTypeDto> {
    return this.settingsService.createDocumentType(body);
  }

  @Patch('document-types/reorder')
  reorderDocumentTypes(
    @Body(new ZodValidationPipe(ReorderDocumentTypesRequestSchema))
    body: ReorderDocumentTypesRequest,
  ): Promise<DocumentTypeDto[]> {
    return this.settingsService.reorderDocumentTypes(body);
  }

  @Patch('document-types/:id')
  updateDocumentType(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateDocumentTypeRequestSchema))
    body: UpdateDocumentTypeRequest,
  ): Promise<DocumentTypeDto> {
    return this.settingsService.updateDocumentType(id, body);
  }

  @Delete('document-types/:id')
  async deleteDocumentType(
    @Param('id') id: string,
  ): Promise<{ success: true }> {
    await this.settingsService.deleteDocumentType(id);
    return { success: true };
  }

  @Get('document-field-definitions')
  listDocumentFieldDefinitions(): Promise<DocumentFieldDefinitionDto[]> {
    return this.settingsService.listDocumentFieldDefinitions();
  }

  @Post('document-field-definitions')
  createDocumentFieldDefinition(
    @Body(new ZodValidationPipe(CreateDocumentFieldDefinitionRequestSchema))
    body: CreateDocumentFieldDefinitionRequest,
  ): Promise<DocumentFieldDefinitionDto> {
    return this.settingsService.createDocumentFieldDefinition(body);
  }

  @Patch('document-field-definitions/:id')
  updateDocumentFieldDefinition(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateDocumentFieldDefinitionRequestSchema))
    body: UpdateDocumentFieldDefinitionRequest,
  ): Promise<DocumentFieldDefinitionDto> {
    return this.settingsService.updateDocumentFieldDefinition(id, body);
  }

  @Delete('document-field-definitions/:id')
  async deleteDocumentFieldDefinition(
    @Param('id') id: string,
  ): Promise<{ success: true }> {
    await this.settingsService.deleteDocumentFieldDefinition(id);
    return { success: true };
  }

  @Get('ai-providers')
  listAiProviders(): Promise<AiProviderDto[]> {
    return this.aiProviders.listProviders();
  }

  @Post('ai-providers')
  createAiProvider(
    @Body(new ZodValidationPipe(CreateAiProviderRequestSchema))
    body: CreateAiProviderRequest,
  ): Promise<AiProviderDto> {
    return this.aiProviders.createProvider(body);
  }

  @Post('ai-providers/models/preview')
  loadAiProviderModels(
    @Body(new ZodValidationPipe(LoadAiProviderModelsRequestSchema))
    body: LoadAiProviderModelsRequest,
  ): Promise<AiProviderModelsResponse> {
    return this.aiProviders.loadProviderModels(body);
  }

  @Patch('ai-providers/reorder')
  reorderAiProviders(
    @Body(new ZodValidationPipe(ReorderAiProvidersRequestSchema))
    body: ReorderAiProvidersRequest,
  ): Promise<AiProviderDto[]> {
    return this.aiProviders.reorderProviders(body);
  }

  @Patch('ai-providers/:id')
  updateAiProvider(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateAiProviderRequestSchema))
    body: UpdateAiProviderRequest,
  ): Promise<AiProviderDto> {
    return this.aiProviders.updateProvider(id, body);
  }

  @Delete('ai-providers/:id')
  async deleteAiProvider(@Param('id') id: string): Promise<{ success: true }> {
    await this.aiProviders.deleteProvider(id);
    return { success: true };
  }

  @Post('ai-providers/:id/models/refresh')
  refreshAiProviderModels(@Param('id') id: string): Promise<AiProviderDto> {
    return this.aiProviders.refreshProviderModels(id);
  }

  private parseAiMetadataPromptScope(key: string): AiMetadataPromptScope {
    return AiMetadataPromptScopeSchema.parse(key);
  }
}
