import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type {
  AiMetadataPromptDto,
  AiProviderDto,
  AiProviderModelsResponse,
  CreateAiProviderRequest,
  CreateDocumentFieldDefinitionRequest,
  CreateDocumentTypeRequest,
  ReorderAiProvidersRequest,
  ReorderDocumentTypesRequest,
  UpdateAiProviderRequest,
  UpdateAiMetadataPromptRequest,
  DocumentFieldDefinitionDto,
  DocumentTypeDto,
  LoadAiProviderModelsRequest,
  SystemSettingsDto,
  UpdateDocumentFieldDefinitionRequest,
  UpdateDocumentTypeRequest,
  UpdateSystemSettingsRequest,
} from '@smart-dms/shared-dto';
import type { Observable } from 'rxjs';
import { ApiUrlService } from './api-url.service';

@Injectable({ providedIn: 'root' })
export class SettingsApiService {
  private readonly http = inject(HttpClient);
  private readonly urls = inject(ApiUrlService);

  get(): Observable<SystemSettingsDto> {
    return this.http.get<SystemSettingsDto>(this.urls.endpoint('/settings'));
  }

  update(input: UpdateSystemSettingsRequest): Observable<SystemSettingsDto> {
    return this.http.patch<SystemSettingsDto>(this.urls.endpoint('/settings'), input);
  }

  aiMetadataPrompts(): Observable<AiMetadataPromptDto[]> {
    return this.http.get<AiMetadataPromptDto[]>(
      this.urls.endpoint('/settings/ai-metadata-prompts'),
    );
  }

  updateAiMetadataPrompt(
    key: string,
    input: UpdateAiMetadataPromptRequest,
  ): Observable<AiMetadataPromptDto> {
    return this.http.patch<AiMetadataPromptDto>(
      this.urls.endpoint(`/settings/ai-metadata-prompts/${encodeURIComponent(key)}`),
      input,
    );
  }

  resetAiMetadataPrompt(key: string): Observable<AiMetadataPromptDto> {
    return this.http.post<AiMetadataPromptDto>(
      this.urls.endpoint(`/settings/ai-metadata-prompts/${encodeURIComponent(key)}/reset`),
      {},
    );
  }

  aiProviders(): Observable<AiProviderDto[]> {
    return this.http.get<AiProviderDto[]>(this.urls.endpoint('/settings/ai-providers'));
  }

  loadAiProviderModels(
    input: LoadAiProviderModelsRequest,
  ): Observable<AiProviderModelsResponse> {
    return this.http.post<AiProviderModelsResponse>(
      this.urls.endpoint('/settings/ai-providers/models/preview'),
      input,
    );
  }

  createAiProvider(input: CreateAiProviderRequest): Observable<AiProviderDto> {
    return this.http.post<AiProviderDto>(this.urls.endpoint('/settings/ai-providers'), input);
  }

  updateAiProvider(id: string, input: UpdateAiProviderRequest): Observable<AiProviderDto> {
    return this.http.patch<AiProviderDto>(
      this.urls.endpoint(`/settings/ai-providers/${encodeURIComponent(id)}`),
      input,
    );
  }

  deleteAiProvider(id: string): Observable<{ success: true }> {
    return this.http.delete<{ success: true }>(
      this.urls.endpoint(`/settings/ai-providers/${encodeURIComponent(id)}`),
    );
  }

  reorderAiProviders(input: ReorderAiProvidersRequest): Observable<AiProviderDto[]> {
    return this.http.patch<AiProviderDto[]>(
      this.urls.endpoint('/settings/ai-providers/reorder'),
      input,
    );
  }

  refreshAiProviderModels(id: string): Observable<AiProviderDto> {
    return this.http.post<AiProviderDto>(
      this.urls.endpoint(`/settings/ai-providers/${encodeURIComponent(id)}/models/refresh`),
      {},
    );
  }

  documentTypes(): Observable<DocumentTypeDto[]> {
    return this.http.get<DocumentTypeDto[]>(this.urls.endpoint('/settings/document-types'));
  }

  createDocumentType(input: CreateDocumentTypeRequest): Observable<DocumentTypeDto> {
    return this.http.post<DocumentTypeDto>(this.urls.endpoint('/settings/document-types'), input);
  }

  updateDocumentType(id: string, input: UpdateDocumentTypeRequest): Observable<DocumentTypeDto> {
    return this.http.patch<DocumentTypeDto>(
      this.urls.endpoint(`/settings/document-types/${id}`),
      input,
    );
  }

  reorderDocumentTypes(input: ReorderDocumentTypesRequest): Observable<DocumentTypeDto[]> {
    return this.http.patch<DocumentTypeDto[]>(
      this.urls.endpoint('/settings/document-types/reorder'),
      input,
    );
  }

  deleteDocumentType(id: string): Observable<{ success: true }> {
    return this.http.delete<{ success: true }>(
      this.urls.endpoint(`/settings/document-types/${id}`),
    );
  }

  fieldDefinitions(): Observable<DocumentFieldDefinitionDto[]> {
    return this.http.get<DocumentFieldDefinitionDto[]>(
      this.urls.endpoint('/settings/document-field-definitions'),
    );
  }

  createFieldDefinition(
    input: CreateDocumentFieldDefinitionRequest,
  ): Observable<DocumentFieldDefinitionDto> {
    return this.http.post<DocumentFieldDefinitionDto>(
      this.urls.endpoint('/settings/document-field-definitions'),
      input,
    );
  }

  updateFieldDefinition(
    id: string,
    input: UpdateDocumentFieldDefinitionRequest,
  ): Observable<DocumentFieldDefinitionDto> {
    return this.http.patch<DocumentFieldDefinitionDto>(
      this.urls.endpoint(`/settings/document-field-definitions/${id}`),
      input,
    );
  }

  deleteFieldDefinition(id: string): Observable<{ success: true }> {
    return this.http.delete<{ success: true }>(
      this.urls.endpoint(`/settings/document-field-definitions/${id}`),
    );
  }
}
