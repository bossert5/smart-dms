import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type {
  AcceptInboxDocumentsResponse,
  DeleteDocumentResponse,
  DocumentDetailDto,
  DocumentHistoryResponse,
  DocumentMetadataUpdateRequest,
  DocumentSearchFacetsResponse,
  DocumentSearchField,
  DocumentSearchResponse,
  DocumentSearchSortBy,
  DocumentStatus,
  DocumentTaskUpdateRequest,
  AiMetadataPromptScope,
  MoveDocumentToInboxResponse,
  MoveDocumentToTenantRequest,
  MoveDocumentToTenantResponse,
  ReprocessDocumentResponse,
  ReprocessDocumentRequest,
  SortDirection,
  TriggerBulkAiProcessingResponse,
  TriggerDocumentAiProcessingResponse,
  UpdateDocumentTagsRequest,
} from '@smart-dms/shared-dto';
import type { Observable } from 'rxjs';
import { ApiUrlService } from './api-url.service';
import { toHttpParams } from './http-params';

export interface DocumentSearchQuery {
  readonly page: number;
  readonly pageSize: number;
  readonly query?: string;
  readonly searchFields: readonly DocumentSearchField[];
  readonly sortBy?: DocumentSearchSortBy;
  readonly sortDirection?: SortDirection;
  readonly statuses?: readonly DocumentStatus[];
  readonly tagNames?: readonly string[];
  readonly senders?: readonly string[];
  readonly documentTypeIds?: readonly string[];
  readonly visibleDateFrom?: string;
  readonly visibleDateTo?: string;
}

@Injectable({ providedIn: 'root' })
export class DocumentApiService {
  private readonly http = inject(HttpClient);
  private readonly urls = inject(ApiUrlService);

  search(query: DocumentSearchQuery): Observable<DocumentSearchResponse> {
    return this.http.get<DocumentSearchResponse>(this.urls.endpoint('/documents'), {
      params: toHttpParams({
        page: query.page,
        pageSize: query.pageSize,
        query: query.query,
        searchFields: query.searchFields,
        sortBy: query.sortBy,
        sortDirection: query.sortDirection,
        statuses: query.statuses,
        tagNames: query.tagNames,
        senders: query.senders,
        documentTypeIds: query.documentTypeIds,
        visibleDateFrom: query.visibleDateFrom,
        visibleDateTo: query.visibleDateTo,
      }),
    });
  }

  searchInbox(query: DocumentSearchQuery): Observable<DocumentSearchResponse> {
    return this.http.get<DocumentSearchResponse>(this.urls.endpoint('/documents/inbox'), {
      params: toHttpParams({
        page: query.page,
        pageSize: query.pageSize,
        query: query.query,
        searchFields: query.searchFields,
        sortBy: query.sortBy,
        sortDirection: query.sortDirection,
        statuses: query.statuses,
        tagNames: query.tagNames,
        senders: query.senders,
        documentTypeIds: query.documentTypeIds,
        visibleDateFrom: query.visibleDateFrom,
        visibleDateTo: query.visibleDateTo,
      }),
    });
  }

  searchFacets(): Observable<DocumentSearchFacetsResponse> {
    return this.http.get<DocumentSearchFacetsResponse>(
      this.urls.endpoint('/documents/search-facets'),
    );
  }

  detail(id: string): Observable<DocumentDetailDto> {
    return this.http.get<DocumentDetailDto>(this.urls.endpoint(`/documents/${id}`));
  }

  history(id: string, page = 1, pageSize = 100): Observable<DocumentHistoryResponse> {
    return this.http.get<DocumentHistoryResponse>(this.urls.endpoint(`/documents/${id}/history`), {
      params: toHttpParams({ page, pageSize }),
    });
  }

  updateMetadata(id: string, input: DocumentMetadataUpdateRequest): Observable<DocumentDetailDto> {
    return this.http.patch<DocumentDetailDto>(
      this.urls.endpoint(`/documents/${id}/metadata`),
      input,
    );
  }

  updateTags(id: string, input: UpdateDocumentTagsRequest): Observable<DocumentDetailDto> {
    return this.http.patch<DocumentDetailDto>(this.urls.endpoint(`/documents/${id}/tags`), input);
  }

  updatePaymentTask(
    id: string,
    paymentId: string,
    input: DocumentTaskUpdateRequest,
  ): Observable<DocumentDetailDto> {
    return this.http.patch<DocumentDetailDto>(
      this.urls.endpoint(`/documents/${id}/payments/${paymentId}/task`),
      input,
    );
  }

  updateCalendarEventTask(
    id: string,
    eventId: string,
    input: DocumentTaskUpdateRequest,
  ): Observable<DocumentDetailDto> {
    return this.http.patch<DocumentDetailDto>(
      this.urls.endpoint(`/documents/${id}/calendar-events/${eventId}/task`),
      input,
    );
  }

  archive(id: string): Observable<unknown> {
    return this.http.post(this.urls.endpoint(`/documents/${id}/archive`), {});
  }

  moveToInbox(id: string): Observable<MoveDocumentToInboxResponse> {
    return this.http.post<MoveDocumentToInboxResponse>(
      this.urls.endpoint(`/documents/${id}/move-to-inbox`),
      {},
    );
  }

  moveToTenant(
    id: string,
    input: MoveDocumentToTenantRequest,
  ): Observable<MoveDocumentToTenantResponse> {
    return this.http.post<MoveDocumentToTenantResponse>(
      this.urls.endpoint(`/documents/${id}/move-to-tenant`),
      input,
    );
  }

  delete(id: string): Observable<DeleteDocumentResponse> {
    return this.http.delete<DeleteDocumentResponse>(this.urls.endpoint(`/documents/${id}`));
  }

  acceptInboxDocument(id: string): Observable<AcceptInboxDocumentsResponse> {
    return this.http.post<AcceptInboxDocumentsResponse>(
      this.urls.endpoint(`/documents/${id}/accept`),
      {},
    );
  }

  acceptInboxDocuments(documentIds: readonly string[]): Observable<AcceptInboxDocumentsResponse> {
    return this.http.post<AcceptInboxDocumentsResponse>(
      this.urls.endpoint('/documents/inbox/accept'),
      { documentIds },
    );
  }

  reprocess(
    id: string,
    input: ReprocessDocumentRequest = { action: 'OCR' },
  ): Observable<ReprocessDocumentResponse> {
    return this.http.post<ReprocessDocumentResponse>(
      this.urls.endpoint(`/documents/${id}/reprocess`),
      input,
    );
  }

  triggerAiExtraction(id: string): Observable<TriggerDocumentAiProcessingResponse> {
    return this.http.post<TriggerDocumentAiProcessingResponse>(
      this.urls.endpoint(`/documents/${id}/ai-extraction`),
      {},
    );
  }

  triggerScopedAiExtraction(
    id: string,
    scope: AiMetadataPromptScope,
  ): Observable<TriggerDocumentAiProcessingResponse> {
    return this.http.post<TriggerDocumentAiProcessingResponse>(
      this.urls.endpoint(
        `/documents/${id}/ai-extraction/scopes/${encodeURIComponent(scope)}`,
      ),
      {},
    );
  }

  triggerBulkAiExtraction(): Observable<TriggerBulkAiProcessingResponse> {
    return this.http.post<TriggerBulkAiProcessingResponse>(
      this.urls.endpoint('/documents/ai-extraction'),
      {},
    );
  }
}
