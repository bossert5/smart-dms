import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { API_BASE_URL } from './api-base-url.token';
import { DocumentApiService } from './document-api.service';

describe('DocumentApiService', () => {
  it('searches documents with field and metadata filter parameters', () => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_BASE_URL, useValue: 'http://localhost:3010/api' },
      ],
    });
    const service = TestBed.inject(DocumentApiService);
    const http = TestBed.inject(HttpTestingController);

    service
      .search({
        page: 1,
        pageSize: 25,
        query: 'invoice',
        searchFields: ['title', 'content', 'sender', 'tags'],
        sortBy: 'sender',
        sortDirection: 'asc',
        statuses: ['READY'],
        tagNames: ['tax'],
        senders: ['Sender GmbH'],
        documentTypeIds: ['type-id'],
        visibleDateFrom: '2026-05-01T00:00:00.000Z',
        visibleDateTo: '2026-05-31T23:59:59.999Z',
      })
      .subscribe();

    const request = http.expectOne((candidate) => {
      const params = candidate.params;
      return (
        candidate.url === 'http://localhost:3010/api/documents' &&
        params.get('query') === 'invoice' &&
        params.getAll('searchFields')?.join(',') === 'title,content,sender,tags' &&
        params.get('sortBy') === 'sender' &&
        params.get('sortDirection') === 'asc' &&
        params.getAll('statuses')?.join(',') === 'READY' &&
        params.getAll('tagNames')?.join(',') === 'tax' &&
        params.getAll('senders')?.join(',') === 'Sender GmbH' &&
        params.getAll('documentTypeIds')?.join(',') === 'type-id' &&
        params.get('visibleDateFrom') === '2026-05-01T00:00:00.000Z' &&
        params.get('visibleDateTo') === '2026-05-31T23:59:59.999Z'
      );
    });
    expect(request.request.method).toBe('GET');
    request.flush({
      items: [],
      meta: {
        page: 1,
        pageSize: 25,
        totalItems: 0,
        totalPages: 0,
      },
    });
    http.verify();
  });

  it('loads document search facets', () => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_BASE_URL, useValue: 'http://localhost:3010/api' },
      ],
    });
    const service = TestBed.inject(DocumentApiService);
    const http = TestBed.inject(HttpTestingController);

    service.searchFacets().subscribe();

    const request = http.expectOne('http://localhost:3010/api/documents/search-facets');
    expect(request.request.method).toBe('GET');
    request.flush({
      tags: [],
      senders: [],
      documentTypes: [],
    });
    http.verify();
  });

  it('loads document history with pagination parameters', () => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_BASE_URL, useValue: 'http://localhost:3010/api' },
      ],
    });
    const service = TestBed.inject(DocumentApiService);
    const http = TestBed.inject(HttpTestingController);

    service.history('document-id', 2, 25).subscribe();

    const request = http.expectOne(
      'http://localhost:3010/api/documents/document-id/history?page=2&pageSize=25',
    );
    expect(request.request.method).toBe('GET');
    request.flush({
      items: [],
      meta: {
        page: 2,
        pageSize: 25,
        totalItems: 0,
        totalPages: 0,
      },
    });
    http.verify();
  });

  it('sends reprocess actions in the request body', () => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_BASE_URL, useValue: 'http://localhost:3010/api' },
      ],
    });
    const service = TestBed.inject(DocumentApiService);
    const http = TestBed.inject(HttpTestingController);

    service.reprocess('document-id', { action: 'ROTATE_180' }).subscribe();

    const request = http.expectOne('http://localhost:3010/api/documents/document-id/reprocess');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ action: 'ROTATE_180' });
    request.flush({
      documentId: 'document-id',
      jobId: 'job-id',
      status: 'OCR_PENDING',
    });
    http.verify();
  });

  it('moves a document to inbox', () => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_BASE_URL, useValue: 'http://localhost:3010/api' },
      ],
    });
    const service = TestBed.inject(DocumentApiService);
    const http = TestBed.inject(HttpTestingController);

    service.moveToInbox('document-id').subscribe();

    const request = http.expectOne('http://localhost:3010/api/documents/document-id/move-to-inbox');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({});
    request.flush({ document: null });
    http.verify();
  });

  it('moves an inbox document to another tenant', () => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_BASE_URL, useValue: 'http://localhost:3010/api' },
      ],
    });
    const service = TestBed.inject(DocumentApiService);
    const http = TestBed.inject(HttpTestingController);

    service
      .moveToTenant('document-id', {
        targetTenantId: '018f1a44-9093-7f55-a515-278f4d9bd990',
      })
      .subscribe();

    const request = http.expectOne('http://localhost:3010/api/documents/document-id/move-to-tenant');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({
      targetTenantId: '018f1a44-9093-7f55-a515-278f4d9bd990',
    });
    request.flush({ document: null });
    http.verify();
  });

  it('permanently deletes a document', () => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_BASE_URL, useValue: 'http://localhost:3010/api' },
      ],
    });
    const service = TestBed.inject(DocumentApiService);
    const http = TestBed.inject(HttpTestingController);

    service.delete('document-id').subscribe();

    const request = http.expectOne('http://localhost:3010/api/documents/document-id');
    expect(request.request.method).toBe('DELETE');
    request.flush({ deleted: true, documentId: 'document-id' });
    http.verify();
  });
});
