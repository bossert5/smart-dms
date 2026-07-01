import { inject, Injectable } from '@angular/core';
import { API_BASE_URL } from './api-base-url.token';

@Injectable({ providedIn: 'root' })
export class ApiUrlService {
  private readonly baseUrl = inject(API_BASE_URL);

  endpoint(path: string): string {
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;

    if (!this.baseUrl) {
      return normalizedPath;
    }

    return `${this.baseUrl.replace(/\/$/, '')}${normalizedPath}`;
  }

  assetUrl(url: string | null): string | null {
    if (!url) {
      return null;
    }

    if (url.startsWith('http')) {
      return url;
    }

    const normalizedBaseUrl = this.baseUrl.replace(/\/$/, '');
    if (!normalizedBaseUrl) {
      return url;
    }

    const normalizedUrl = url.startsWith('/') ? url : `/${url}`;
    if (normalizedBaseUrl.startsWith('http')) {
      const base = new URL(normalizedBaseUrl);
      if (
        normalizedUrl === base.pathname ||
        normalizedUrl.startsWith(`${base.pathname}/`)
      ) {
        return `${base.origin}${normalizedUrl}`;
      }
    }

    if (
      normalizedBaseUrl.startsWith('/') &&
      (normalizedUrl === normalizedBaseUrl ||
        normalizedUrl.startsWith(`${normalizedBaseUrl}/`))
    ) {
      return normalizedUrl;
    }

    return this.endpoint(normalizedUrl);
  }
}
