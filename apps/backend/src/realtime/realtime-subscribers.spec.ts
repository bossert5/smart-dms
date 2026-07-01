import {
  NOTIFICATIONS_REDIS_CHANNEL,
  REALTIME_EVENTS_REDIS_CHANNEL,
} from './realtime.constants';
import { DOCUMENT_CHANGED_EVENT } from '@smart-dms/shared-dto';
import { RealtimeEventsSubscriber } from './realtime-events.subscriber';
import { RealtimeNotificationsSubscriber } from './realtime-notifications.subscriber';
import { createRedisClient } from './redis-client.factory';

jest.mock('./redis-client.factory', () => ({
  createRedisClient: jest.fn(),
}));

const config = {
  redisHost: 'localhost',
  redisPort: 6379,
  redisPassword: undefined,
};

interface RedisClientMock {
  emitMessage(payload: unknown): void;
  on: jest.Mock<RedisClientMock, [string, (...args: string[]) => void]>;
  quit: jest.Mock<Promise<string>, []>;
  subscribe: jest.Mock<Promise<number>, [string]>;
}

function redisClient(): RedisClientMock {
  const handlers = new Map<string, Array<(...args: string[]) => void>>();
  const client: RedisClientMock = {
    on: jest.fn((event: string, handler: (...args: string[]) => void) => {
      handlers.set(event, [...(handlers.get(event) ?? []), handler]);
      return client;
    }),
    subscribe: jest.fn<Promise<number>, [string]>().mockResolvedValue(1),
    quit: jest.fn<Promise<string>, []>().mockResolvedValue('OK'),
    emitMessage(payload: unknown) {
      for (const handler of handlers.get('message') ?? []) {
        handler('channel', JSON.stringify(payload));
      }
    },
  };

  return client;
}

describe('realtime Redis subscribers', () => {
  beforeEach(() => {
    jest.mocked(createRedisClient).mockReset();
  });

  it('subscribes to notification events when a handler is registered', () => {
    const client = redisClient();
    jest.mocked(createRedisClient).mockReturnValue(client as never);
    const subscriber = new RealtimeNotificationsSubscriber(config as never);
    const handler = jest.fn();
    const notification = {
      id: '018f1a44-9093-7f55-a515-278f4d9bd99f',
      type: 'ocr.completed' as const,
      severity: 'success' as const,
      title: 'OCR abgeschlossen',
      message: 'Document ist bereit.',
      createdAt: '2026-05-07T18:04:00.000Z',
      status: 'READY' as const,
    };

    subscriber.onNotification(handler);
    client.emitMessage(notification);

    expect(client.subscribe).toHaveBeenCalledWith(NOTIFICATIONS_REDIS_CHANNEL);
    expect(handler).toHaveBeenCalledWith(notification);
  });

  it('subscribes to domain events when a handler is registered', () => {
    const client = redisClient();
    jest.mocked(createRedisClient).mockReturnValue(client as never);
    const subscriber = new RealtimeEventsSubscriber(config as never);
    const handler = jest.fn();
    const event = {
      type: DOCUMENT_CHANGED_EVENT,
      documentId: '018f1a44-9093-7f55-a515-278f4d9bd99f',
      tenantId: '018f1a44-9093-7f55-a515-278f4d9bd900',
      status: 'READY' as const,
      reason: 'OCR_COMPLETED' as const,
      changedAt: '2026-05-07T18:04:00.000Z',
    };

    subscriber.onEvent(handler);
    client.emitMessage(event);

    expect(client.subscribe).toHaveBeenCalledWith(
      REALTIME_EVENTS_REDIS_CHANNEL,
    );
    expect(handler).toHaveBeenCalledWith(event);
  });

  it('does not subscribe twice when lifecycle init already ran', async () => {
    const client = redisClient();
    jest.mocked(createRedisClient).mockReturnValue(client as never);
    const subscriber = new RealtimeNotificationsSubscriber(config as never);

    await subscriber.onModuleInit();
    subscriber.onNotification(jest.fn());

    expect(client.subscribe).toHaveBeenCalledTimes(1);
  });
});
