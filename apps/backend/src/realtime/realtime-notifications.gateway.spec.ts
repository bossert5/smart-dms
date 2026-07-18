import { expectObjectContaining } from '../testing/expect-matchers';
import {
  AI_PROVIDER_CHANGED_EVENT,
  DOCUMENT_CHANGED_EVENT,
  NOTIFICATIONS_CREATED_EVENT,
  NOTIFICATIONS_SNAPSHOT_EVENT,
} from '@smart-dms/shared-dto';
import type { RealtimeDomainEvent } from '@smart-dms/shared-dto';
import { RealtimeNotificationsGateway } from './realtime-notifications.gateway';

const user = {
  id: '00000000-0000-4000-8000-000000000001',
  username: 'admin',
  displayName: 'Admin',
  role: 'Admin' as const,
  isActive: true,
  passwordChangeRequired: false,
  createdAt: '2026-05-07T00:00:00.000Z',
  updatedAt: '2026-05-07T00:00:00.000Z',
  tenants: [
    {
      id: '018f1a44-9093-7f55-a515-278f4d9bd900',
      key: 'default',
      name: 'Default',
      isActive: true,
    },
  ],
  defaultTenantId: '018f1a44-9093-7f55-a515-278f4d9bd900',
};

const notification = {
  id: '018f1a44-9093-7f55-a515-278f4d9bd99f',
  type: 'ocr.completed' as const,
  severity: 'success' as const,
  createdAt: '2026-05-07T18:04:00.000Z',
  documentId: '018f1a44-9093-7f55-a515-278f4d9bd99f',
  documentTitle: 'Document',
  tenantId: user.defaultTenantId,
  jobId: '018f1a44-9093-7f55-a515-278f4d9bd990',
  status: 'READY' as const,
};

describe('RealtimeNotificationsGateway', () => {
  it('authenticates socket handshakes and sends the recent snapshot', async () => {
    let middleware:
      | ((client: never, next: (error?: Error) => void) => void)
      | undefined;
    let notificationHandler: ((value: typeof notification) => void) | undefined;
    let eventHandler: ((value: RealtimeDomainEvent) => void) | undefined;
    const accessTokens = {
      authenticate: jest.fn().mockResolvedValue(user),
    };
    const notifications = {
      recentNotifications: jest.fn().mockResolvedValue([notification]),
    };
    const subscriber = {
      onNotification: jest.fn(
        (handler: (value: typeof notification) => void) => {
          notificationHandler = handler;
          return jest.fn();
        },
      ),
    };
    const eventsSubscriber = {
      onEvent: jest.fn((handler: (value: RealtimeDomainEvent) => void) => {
        eventHandler = handler;
        return jest.fn();
      }),
    };
    const adminClient = {
      data: { user },
      emit: jest.fn(),
    };
    const userClient = {
      data: { user: { ...user, role: 'User' } },
      emit: jest.fn(),
    };
    const server = {
      use: jest.fn((handler: typeof middleware) => {
        middleware = handler;
      }),
      emit: jest.fn(),
      sockets: new Map([
        ['admin', adminClient],
        ['user', userClient],
      ]),
    };
    const gateway = new RealtimeNotificationsGateway(
      accessTokens as never,
      notifications as never,
      subscriber as never,
      eventsSubscriber as never,
      { releaseBySocketId: jest.fn() } as never,
    );

    gateway.afterInit(server as never);
    const client = {
      id: 'socket-id',
      data: {},
      handshake: {
        auth: { accessToken: 'access-token' },
      },
      emit: jest.fn(),
    };
    const next = jest.fn<void, [Error?]>();

    middleware?.(client as never, next);
    await new Promise((resolve) => setImmediate(resolve));
    await gateway.handleConnection(client as never);
    notificationHandler?.(notification);
    eventHandler?.({
      type: DOCUMENT_CHANGED_EVENT,
      documentId: notification.documentId,
      tenantId: user.defaultTenantId,
      status: 'READY',
      reason: 'OCR_COMPLETED',
      changedAt: '2026-05-07T18:04:00.000Z',
    });
    eventHandler?.({
      type: AI_PROVIDER_CHANGED_EVENT,
      providerId: '018f1a44-9093-7f55-a515-278f4d9bd992',
      action: 'DELETE',
      reason: 'PROVIDER_DELETED',
      changedAt: '2026-05-07T18:04:00.000Z',
    });

    expect(accessTokens.authenticate).toHaveBeenCalledWith('access-token');
    expect(next).toHaveBeenCalledWith();
    expect(client.data).toEqual({ user });
    expect(client.emit).toHaveBeenCalledWith(NOTIFICATIONS_SNAPSHOT_EVENT, {
      items: [notification],
    });
    expect(adminClient.emit).toHaveBeenCalledWith(
      NOTIFICATIONS_CREATED_EVENT,
      notification,
    );
    expect(userClient.emit).toHaveBeenCalledWith(
      NOTIFICATIONS_CREATED_EVENT,
      notification,
    );
    expect(adminClient.emit).toHaveBeenCalledWith(
      DOCUMENT_CHANGED_EVENT,
      expectObjectContaining({ reason: 'OCR_COMPLETED' }),
    );
    expect(userClient.emit).toHaveBeenCalledWith(
      DOCUMENT_CHANGED_EVENT,
      expectObjectContaining({ reason: 'OCR_COMPLETED' }),
    );
    expect(adminClient.emit).toHaveBeenCalledWith(
      AI_PROVIDER_CHANGED_EVENT,
      expectObjectContaining({ reason: 'PROVIDER_DELETED' }),
    );
    expect(userClient.emit).not.toHaveBeenCalledWith(
      AI_PROVIDER_CHANGED_EVENT,
      expect.anything(),
    );
  });

  it('rejects unauthenticated socket handshakes', async () => {
    let middleware:
      | ((client: never, next: (error?: Error) => void) => void)
      | undefined;
    const gateway = new RealtimeNotificationsGateway(
      {
        authenticate: jest.fn().mockRejectedValue(new Error('Invalid token')),
      } as never,
      { recentNotifications: jest.fn() } as never,
      { onNotification: jest.fn(() => jest.fn()) } as never,
      { onEvent: jest.fn(() => jest.fn()) } as never,
      { releaseBySocketId: jest.fn() } as never,
    );
    gateway.afterInit({
      use: jest.fn((handler: typeof middleware) => {
        middleware = handler;
      }),
      emit: jest.fn(),
    } as never);
    const next = jest.fn<void, [Error?]>();

    middleware?.(
      {
        data: {},
        handshake: { auth: {} },
      } as never,
      next,
    );
    await new Promise((resolve) => setImmediate(resolve));

    const error = next.mock.calls[0]?.[0];
    expect(error).toBeInstanceOf(Error);
    expect(error?.message).toBe('Unauthorized');
  });
});
