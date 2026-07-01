import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type { CreateEditLockResponse } from '@smart-dms/shared-dto';
import { firstValueFrom } from 'rxjs';
import { API_BASE_URL } from '../api/api-base-url.token';
import { AuthService } from './auth.service';
import { EditLockService } from './edit-lock.service';
import { RealtimeClientService } from './realtime-client.service';

const lockResponse: CreateEditLockResponse = {
  lock: {
    id: '018f1a44-9093-7f55-a515-278f4d9bd990',
    scope: 'DOCUMENT',
    resourceId: 'document-id',
    ownerUserId: '018f1a44-9093-7f55-a515-278f4d9bd991',
    ownerDisplayName: 'Admin',
    clientId: 'client-id',
    socketId: 'socket-id',
    expiresAt: '2026-05-07T18:10:00.000Z',
    createdAt: '2026-05-07T18:00:00.000Z',
  },
};

describe('EditLockService', () => {
  const realtime = {
    isConnected: vi.fn(),
    socketId: vi.fn(),
  };
  const auth = {
    accessToken: vi.fn(),
  };

  let http: HttpTestingController;
  let service: EditLockService;

  beforeEach(() => {
    realtime.isConnected.mockReturnValue(true);
    realtime.socketId.mockReturnValue('socket-id');
    auth.accessToken.mockReturnValue(null);

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_BASE_URL, useValue: 'http://localhost:3010/api' },
        { provide: AuthService, useValue: auth },
        { provide: RealtimeClientService, useValue: realtime },
      ],
    });

    http = TestBed.inject(HttpTestingController);
    service = TestBed.inject(EditLockService);
  });

  afterEach(() => {
    http.verify();
    vi.restoreAllMocks();
    vi.useRealTimers();
    TestBed.resetTestingModule();
  });

  it('acquires an edit lock with the active realtime socket id', async () => {
    const result = firstValueFrom(service.acquire('DOCUMENT', 'document-id'));

    const request = http.expectOne('http://localhost:3010/api/edit-locks');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({
      scope: 'DOCUMENT',
      resourceId: 'document-id',
      clientId: expect.any(String),
      socketId: 'socket-id',
    });
    request.flush(lockResponse);

    await expect(result).resolves.toEqual(lockResponse);
  });

  it('rejects lock acquisition without an active realtime connection', async () => {
    realtime.socketId.mockReturnValue(null);

    await expect(firstValueFrom(service.acquire('DOCUMENT', 'document-id'))).rejects.toThrow(
      'Edit locks require an active realtime connection.',
    );
    http.expectNone('http://localhost:3010/api/edit-locks');
  });

  it('releases locks and sends heartbeat updates using encoded lock ids', () => {
    service.release('lock/id').subscribe();

    const releaseRequest = http.expectOne('http://localhost:3010/api/edit-locks/lock%2Fid');
    expect(releaseRequest.request.method).toBe('DELETE');
    releaseRequest.flush(null);

    service.heartbeat('lock/id').subscribe();

    const heartbeatRequest = http.expectOne(
      'http://localhost:3010/api/edit-locks/lock%2Fid/heartbeat',
    );
    expect(heartbeatRequest.request.method).toBe('PATCH');
    expect(heartbeatRequest.request.body).toEqual({});
    heartbeatRequest.flush(lockResponse);
  });

  it('runs heartbeat checks only while realtime is connected and reports lost locks', () => {
    vi.useFakeTimers();
    const onLost = vi.fn();

    const subscription = service.startHeartbeat('lock-id', onLost);
    vi.advanceTimersByTime(15_000);

    const firstHeartbeat = http.expectOne('http://localhost:3010/api/edit-locks/lock-id/heartbeat');
    expect(firstHeartbeat.request.method).toBe('PATCH');
    firstHeartbeat.flush(lockResponse);

    realtime.isConnected.mockReturnValue(false);
    vi.advanceTimersByTime(15_000);
    http.expectNone('http://localhost:3010/api/edit-locks/lock-id/heartbeat');

    realtime.isConnected.mockReturnValue(true);
    vi.advanceTimersByTime(15_000);

    const failedHeartbeat = http.expectOne(
      'http://localhost:3010/api/edit-locks/lock-id/heartbeat',
    );
    failedHeartbeat.flush({ message: 'lost' }, { status: 409, statusText: 'Conflict' });

    expect(onLost).toHaveBeenCalledTimes(1);
    subscription.unsubscribe();
  });

  it('releases locks best effort and ignores release failures', () => {
    service.releaseBestEffort(null);
    http.expectNone('http://localhost:3010/api/edit-locks/null');

    service.releaseBestEffort('lock-id');

    const request = http.expectOne('http://localhost:3010/api/edit-locks/lock-id');
    expect(request.request.method).toBe('DELETE');
    request.flush({ message: 'failed' }, { status: 500, statusText: 'Server Error' });
  });

  it('uses fetch keepalive with the current access token before page unload', () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response());
    auth.accessToken.mockReturnValue('access-token');

    service.releaseBeforeUnload('lock/id');

    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:3010/api/edit-locks/lock%2Fid',
      expect.objectContaining({
        method: 'DELETE',
        keepalive: true,
        credentials: 'include',
      }),
    );
    const [, options] = fetch.mock.calls[0];
    expect((options?.headers as Headers).get('Authorization')).toBe('Bearer access-token');
  });
});
