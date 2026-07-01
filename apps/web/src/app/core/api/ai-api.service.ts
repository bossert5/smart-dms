import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type { AiAvailabilityResponse } from '@smart-dms/shared-dto';
import type { Observable } from 'rxjs';
import { ApiUrlService } from './api-url.service';

@Injectable({ providedIn: 'root' })
export class AiApiService {
  private readonly http = inject(HttpClient);
  private readonly urls = inject(ApiUrlService);

  availability(): Observable<AiAvailabilityResponse> {
    return this.http.get<AiAvailabilityResponse>(
      this.urls.endpoint('/ai/availability'),
    );
  }
}
