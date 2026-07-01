import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { API_BASE_URL } from './api-base-url.token';
import { CalendarApiService } from './calendar-api.service';

describe('CalendarApiService', () => {
  it('loads events with repeated kind query parameters', () => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_BASE_URL, useValue: 'http://localhost:3010/api' },
      ],
    });
    const service = TestBed.inject(CalendarApiService);
    const http = TestBed.inject(HttpTestingController);

    service
      .events({
        from: '2026-01-01',
        to: '2026-12-31',
        kinds: ['DUE_DATE', 'DEADLINE'],
      })
      .subscribe();

    const request = http.expectOne(
      'http://localhost:3010/api/calendar/events?from=2026-01-01&to=2026-12-31&kinds=DUE_DATE&kinds=DEADLINE',
    );
    expect(request.request.method).toBe('GET');
    request.flush({ items: [] });
    http.verify();
  });
});
