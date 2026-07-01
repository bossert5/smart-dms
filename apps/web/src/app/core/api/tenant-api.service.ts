import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type {
  CreateTenantRequest,
  DeleteTenantDocumentAction,
  DeleteTenantRequest,
  DeleteTenantResponse,
  DeleteTenantUserAction,
  ListTenantsResponse,
  TenantDto,
  UpdateTenantRequest,
} from '@smart-dms/shared-dto';
import type { Observable } from 'rxjs';
import { ApiUrlService } from './api-url.service';
import { toHttpParams } from './http-params';

export interface TenantWithCounts extends TenantDto {
  readonly userCount: number;
  readonly documentCount: number;
}

export interface ListTenantsWithCountsResponse extends Omit<ListTenantsResponse, 'items'> {
  readonly items: TenantWithCounts[];
}

@Injectable({ providedIn: 'root' })
export class TenantApiService {
  private readonly http = inject(HttpClient);
  private readonly urls = inject(ApiUrlService);

  list(page = 1, pageSize = 100): Observable<ListTenantsWithCountsResponse> {
    return this.http.get<ListTenantsResponse>(this.urls.endpoint('/tenants'), {
      params: toHttpParams({ page, pageSize }),
    }) as Observable<ListTenantsWithCountsResponse>;
  }

  listActive(): Observable<TenantDto[]> {
    return this.http.get<TenantDto[]>(this.urls.endpoint('/tenants/active'));
  }

  create(input: CreateTenantRequest): Observable<TenantDto> {
    return this.http.post<TenantDto>(this.urls.endpoint('/tenants'), input);
  }

  update(id: string, input: UpdateTenantRequest): Observable<TenantDto> {
    return this.http.patch<TenantDto>(
      this.urls.endpoint(`/tenants/${encodeURIComponent(id)}`),
      input,
    );
  }

  delete(id: string, input: DeleteTenantRequest): Observable<DeleteTenantResponse> {
    return this.http.delete<DeleteTenantResponse>(
      this.urls.endpoint(`/tenants/${encodeURIComponent(id)}`),
      { body: input },
    );
  }
}

export type {
  DeleteTenantDocumentAction,
  DeleteTenantRequest,
  DeleteTenantResponse,
  DeleteTenantUserAction,
};
