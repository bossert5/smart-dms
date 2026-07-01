import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import {
  AI_PROVIDER_CHANGED_EVENT,
  DOCUMENT_CHANGED_EVENT,
  NOTIFICATIONS_CREATED_EVENT,
  NOTIFICATIONS_SNAPSHOT_EVENT,
} from '@smart-dms/shared-dto';
import { API_BASE_URL } from '../api/api-base-url.token';
import { AuthService } from './auth.service';
import {
  REALTIME_SOCKET_FACTORY,
  RealtimeClientService,
} from './realtime-client.service';

const socketHandlers = new Map<string, (payload?: unknown) => void>();
const socket = {
  on: vi.fn((event: string, handler: (payload?: unknown) => void) => {
    socketHandlers.set(event, handler);
    return socket;
  }),
  removeAllListeners: vi.fn(),
  disconnect: vi.fn(),
};

const createSocket = vi.fn(() => socket);

const tenant = {
  id: '00000000-0000-4000-8000-000000000010',
  key: 'default',
  name: 'Default',
  isActive: true,
};

const user = {
  id: '00000000-0000-4000-8000-000000000001',
  username: 'admin',
  displayName: 'Admin',
  role: 'Admin' as const,
  isActive: true,
  passwordChangeRequired: false,
  tenants: [tenant],
  defaultTenantId: tenant.id,
  createdAt: '2026-05-07T00:00:00.000Z',
  updatedAt: '2026-05-07T00:00:00.000Z',
};

describe('RealtimeClientService', () => {
  beforeEach(() => {
    socketHandlers.clear();
    createSocket.mockClear();
    socket.on.mockClear();
    socket.removeAllListeners.mockClear();
    socket.disconnect.mockClear();

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        { provide: API_BASE_URL, useValue: 'http://localhost:3010/api' },
        { provide: REALTIME_SOCKET_FACTORY, useValue: createSocket },
      ],
    });
  });

  it('connects to the realtime namespace and parses socket events', () => {
    const auth = TestBed.inject(AuthService);
    auth.user.set(user);
    auth.accessToken.set('access-token');

    const service = TestBed.inject(RealtimeClientService);
    TestBed.flushEffects();

    expect(createSocket).toHaveBeenCalledWith(
      'http://localhost:3010/api/realtime',
      expect.objectContaining({
        transports: ['websocket'],
        auth: { accessToken: 'access-token' },
        withCredentials: true,
      }),
    );

    socketHandlers.get('connect')?.();
    expect(service.isConnected()).toBe(true);
    expect(service.connectionRevision()).toBe(1);

    socketHandlers.get(NOTIFICATIONS_SNAPSHOT_EVENT)?.({ items: [] });
    expect(service.notificationsSnapshot()).toEqual({ items: [] });

    socketHandlers.get(NOTIFICATIONS_CREATED_EVENT)?.({
      id: '018f1a44-9093-7f55-a515-278f4d9bd99f',
      type: 'ocr.completed',
      severity: 'success',
      title: 'OCR abgeschlossen',
      message: 'Document ist bereit.',
      createdAt: '2026-05-07T18:05:01.000Z',
      documentId: '018f1a44-9093-7f55-a515-278f4d9bd99f',
      status: 'READY',
    });
    expect(service.latestNotification()?.type).toBe('ocr.completed');

    socketHandlers.get(DOCUMENT_CHANGED_EVENT)?.({
      type: DOCUMENT_CHANGED_EVENT,
      documentId: '018f1a44-9093-7f55-a515-278f4d9bd99f',
      tenantId: tenant.id,
      status: 'AI_RUNNING',
      reason: 'AI_STARTED',
      changedAt: '2026-05-07T18:05:02.000Z',
    });
    expect(service.latestDocumentChange()?.reason).toBe('AI_STARTED');

    socketHandlers.get(AI_PROVIDER_CHANGED_EVENT)?.({
      type: AI_PROVIDER_CHANGED_EVENT,
      providerId: '018f1a44-9093-7f55-a515-278f4d9bd990',
      action: 'DELETE',
      reason: 'PROVIDER_DELETED',
      changedAt: '2026-05-07T18:05:02.000Z',
    });
    expect(service.latestAiProviderChange()?.action).toBe('DELETE');

  });
});
