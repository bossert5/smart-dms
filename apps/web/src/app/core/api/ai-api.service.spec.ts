import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { API_BASE_URL } from './api-base-url.token';
import { AiApiService } from './ai-api.service';

describe('AiApiService', () => {
  let service: AiApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_BASE_URL, useValue: 'http://localhost:3010/api' },
      ],
    });

    service = TestBed.inject(AiApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
  });

  it('loads AI availability', () => {
    service.availability().subscribe();

    const request = http.expectOne('http://localhost:3010/api/ai/availability');
    expect(request.request.method).toBe('GET');
    request.flush({
      enabled: true,
      providers: [],
    });
  });

});
