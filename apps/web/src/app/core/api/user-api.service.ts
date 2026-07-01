import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type {
  BulkUpdateUsersRequest,
  BulkUpdateUsersResponse,
  CreateUserRequest,
  ListUserAssigneesResponse,
  ListUsersResponse,
  UpdateUserRequest,
  UserDto,
} from '@smart-dms/shared-dto';
import type { Observable } from 'rxjs';
import { ApiUrlService } from './api-url.service';
import { toHttpParams } from './http-params';

@Injectable({ providedIn: 'root' })
export class UserApiService {
  private readonly http = inject(HttpClient);
  private readonly urls = inject(ApiUrlService);

  list(page = 1, pageSize = 50): Observable<ListUsersResponse> {
    return this.http.get<ListUsersResponse>(this.urls.endpoint('/users'), {
      params: toHttpParams({ page, pageSize }),
    });
  }

  assignees(): Observable<ListUserAssigneesResponse> {
    return this.http.get<ListUserAssigneesResponse>(this.urls.endpoint('/users/assignees'));
  }

  create(input: CreateUserRequest): Observable<UserDto> {
    return this.http.post<UserDto>(this.urls.endpoint('/users'), input);
  }

  update(id: string, input: UpdateUserRequest): Observable<UserDto> {
    return this.http.patch<UserDto>(this.urls.endpoint(`/users/${id}`), input);
  }

  bulkUpdate(input: BulkUpdateUsersRequest): Observable<BulkUpdateUsersResponse> {
    return this.http.patch<BulkUpdateUsersResponse>(this.urls.endpoint('/users'), input);
  }

  delete(id: string): Observable<{ success: true }> {
    return this.http.delete<{ success: true }>(this.urls.endpoint(`/users/${id}`));
  }
}
