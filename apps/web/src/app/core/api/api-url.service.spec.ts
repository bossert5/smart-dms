import { TestBed } from '@angular/core/testing';
import { API_BASE_URL } from './api-base-url.token';
import { ApiUrlService } from './api-url.service';

describe('ApiUrlService', () => {
  it('uses the same-origin API prefix when configured', () => {
    TestBed.configureTestingModule({
      providers: [{ provide: API_BASE_URL, useValue: '/api' }],
    });

    expect(TestBed.inject(ApiUrlService).endpoint('/auth/login')).toBe(
      '/api/auth/login',
    );
    expect(TestBed.inject(ApiUrlService).assetUrl('/api/documents/doc/pdf')).toBe(
      '/api/documents/doc/pdf',
    );
  });

  it('joins configured base URL and endpoint paths without duplicate slashes', () => {
    TestBed.configureTestingModule({
      providers: [{ provide: API_BASE_URL, useValue: 'http://localhost:3010/api/' }],
    });

    expect(TestBed.inject(ApiUrlService).endpoint('/auth/login')).toBe(
      'http://localhost:3010/api/auth/login',
    );
    expect(
      TestBed.inject(ApiUrlService).assetUrl('/api/documents/doc/pdf'),
    ).toBe('http://localhost:3010/api/documents/doc/pdf');
  });
});
