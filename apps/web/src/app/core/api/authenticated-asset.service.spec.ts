import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { API_BASE_URL } from './api-base-url.token';
import { AuthenticatedAssetService } from './authenticated-asset.service';

describe('AuthenticatedAssetService', () => {
  let http: HttpTestingController;
  let createObjectUrl: ReturnType<typeof vi.fn>;
  let revokeObjectUrl: ReturnType<typeof vi.fn>;
  let originalCreateObjectUrl: typeof URL.createObjectURL | undefined;
  let originalRevokeObjectUrl: typeof URL.revokeObjectURL | undefined;

  beforeEach(() => {
    originalCreateObjectUrl = URL.createObjectURL;
    originalRevokeObjectUrl = URL.revokeObjectURL;
    createObjectUrl = vi.fn().mockReturnValue('blob:authenticated-asset');
    revokeObjectUrl = vi.fn();

    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: createObjectUrl,
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: revokeObjectUrl,
    });

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_BASE_URL, useValue: 'http://localhost:3010/api/' },
      ],
    });

    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    restoreUrlFunction('createObjectURL', originalCreateObjectUrl);
    restoreUrlFunction('revokeObjectURL', originalRevokeObjectUrl);
  });

  it('loads an asset as a blob and returns an object URL', () => {
    const service = TestBed.inject(AuthenticatedAssetService);
    const blob = new Blob(['thumbnail'], { type: 'image/jpeg' });
    let result: string | undefined;

    service.loadObjectUrl('/documents/document-id/thumbnail').subscribe((url) => {
      result = url;
    });

    const request = http.expectOne('http://localhost:3010/api/documents/document-id/thumbnail');
    expect(request.request.method).toBe('GET');
    expect(request.request.responseType).toBe('blob');

    request.flush(blob);

    expect(createObjectUrl).toHaveBeenCalledWith(blob);
    expect(result).toBe('blob:authenticated-asset');
  });

  it('revokes only blob object URLs', () => {
    const service = TestBed.inject(AuthenticatedAssetService);

    service.revokeObjectUrl('blob:authenticated-asset');
    service.revokeObjectUrl('http://localhost:3010/api/documents/document-id/thumbnail');
    service.revokeObjectUrl(null);

    expect(revokeObjectUrl).toHaveBeenCalledOnce();
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:authenticated-asset');
  });
});

function restoreUrlFunction(
  name: 'createObjectURL' | 'revokeObjectURL',
  value: typeof URL.createObjectURL | typeof URL.revokeObjectURL | undefined,
): void {
  if (value) {
    Object.defineProperty(URL, name, {
      configurable: true,
      value,
    });
    return;
  }

  Reflect.deleteProperty(URL, name);
}
