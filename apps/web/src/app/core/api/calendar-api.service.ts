import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type { CalendarEventKind, CalendarEventsResponse } from '@smart-dms/shared-dto';
import type { Observable } from 'rxjs';
import { ApiUrlService } from './api-url.service';
import { toHttpParams } from './http-params';

export interface CalendarEventsQuery {
  readonly from: string;
  readonly to: string;
  readonly kinds?: readonly CalendarEventKind[];
}

@Injectable({ providedIn: 'root' })
export class CalendarApiService {
  private readonly http = inject(HttpClient);
  private readonly urls = inject(ApiUrlService);

  events(query: CalendarEventsQuery): Observable<CalendarEventsResponse> {
    return this.http.get<CalendarEventsResponse>(this.urls.endpoint('/calendar/events'), {
      params: toHttpParams({
        from: query.from,
        to: query.to,
        kinds: query.kinds,
      }),
    });
  }
}
