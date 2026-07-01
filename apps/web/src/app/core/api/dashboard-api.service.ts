import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type { DashboardSummaryDto } from '@smart-dms/shared-dto';
import type { Observable } from 'rxjs';
import { ApiUrlService } from './api-url.service';

@Injectable({ providedIn: 'root' })
export class DashboardApiService {
  private readonly http = inject(HttpClient);
  private readonly urls = inject(ApiUrlService);

  summary(): Observable<DashboardSummaryDto> {
    return this.http.get<DashboardSummaryDto>(this.urls.endpoint('/dashboard'));
  }
}
