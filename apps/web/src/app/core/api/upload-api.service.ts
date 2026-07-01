import { HttpClient, type HttpEvent } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type { UploadConfigResponse, UploadDocumentResponse } from '@smart-dms/shared-dto';
import type { Observable } from 'rxjs';
import { ApiUrlService } from './api-url.service';

@Injectable({ providedIn: 'root' })
export class UploadApiService {
  private readonly http = inject(HttpClient);
  private readonly urls = inject(ApiUrlService);

  config(): Observable<UploadConfigResponse> {
    return this.http.get<UploadConfigResponse>(this.urls.endpoint('/uploads/config'));
  }

  uploadDocument(
    file: File,
    tenantId: string,
  ): Observable<HttpEvent<UploadDocumentResponse>> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('tenantId', tenantId);

    return this.http.post<UploadDocumentResponse>(
      this.urls.endpoint('/uploads/documents'),
      formData,
      {
        observe: 'events',
        reportProgress: true,
      },
    );
  }
}
