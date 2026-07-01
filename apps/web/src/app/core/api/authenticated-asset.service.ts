import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, type Observable } from 'rxjs';
import { ApiUrlService } from './api-url.service';

@Injectable({ providedIn: 'root' })
export class AuthenticatedAssetService {
  private readonly http = inject(HttpClient);
  private readonly urls = inject(ApiUrlService);

  loadObjectUrl(url: string): Observable<string> {
    const assetUrl = this.urls.assetUrl(url);

    if (!assetUrl) {
      throw new Error('Asset URL is required.');
    }

    return this.http
      .get(assetUrl, { responseType: 'blob' })
      .pipe(map((blob) => URL.createObjectURL(blob)));
  }

  revokeObjectUrl(url: string | null | undefined): void {
    if (url?.startsWith('blob:')) {
      URL.revokeObjectURL(url);
    }
  }
}
