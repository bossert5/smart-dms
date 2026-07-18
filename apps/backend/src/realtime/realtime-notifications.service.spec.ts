import {
  NOTIFICATIONS_HISTORY_KEY,
  NOTIFICATIONS_REDIS_CHANNEL,
} from './realtime.constants';
import { RealtimeNotificationsService } from './realtime-notifications.service';
import { createRedisClient } from './redis-client.factory';

jest.mock('./redis-client.factory', () => ({
  createRedisClient: jest.fn(),
}));

function redisClient(overrides: Record<string, unknown> = {}) {
  return {
    on: jest.fn(),
    zadd: jest.fn().mockResolvedValue(1),
    zremrangebyscore: jest.fn().mockResolvedValue(0),
    expire: jest.fn().mockResolvedValue(1),
    publish: jest.fn().mockResolvedValue(1),
    zrangebyscore: jest.fn().mockResolvedValue([]),
    quit: jest.fn().mockResolvedValue('OK'),
    ...overrides,
  };
}

const config = {
  redisHost: 'localhost',
  redisPort: 6379,
  redisPassword: undefined,
};

describe('RealtimeNotificationsService', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-07T18:05:00.000Z'));
    jest.mocked(createRedisClient).mockReset();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('stores notifications in Redis history and publishes them', async () => {
    const history = redisClient();
    const publisher = redisClient();
    jest
      .mocked(createRedisClient)
      .mockReturnValueOnce(history as never)
      .mockReturnValueOnce(publisher as never);
    const service = new RealtimeNotificationsService(config as never);

    const notification = await service.publish({
      type: 'ocr.completed',
      severity: 'success',
      documentId: '018f1a44-9093-7f55-a515-278f4d9bd99f',
      documentTitle: 'Document',
      jobId: '018f1a44-9093-7f55-a515-278f4d9bd990',
      status: 'READY',
    });

    expect(history.zadd).toHaveBeenCalledWith(
      NOTIFICATIONS_HISTORY_KEY,
      Date.parse(notification.createdAt),
      JSON.stringify(notification),
    );
    expect(publisher.publish).toHaveBeenCalledWith(
      NOTIFICATIONS_REDIS_CHANNEL,
      JSON.stringify(notification),
    );
    expect(notification).not.toHaveProperty('title');
    expect(notification).not.toHaveProperty('message');
  });

  it('returns only valid notifications from the last five minutes', async () => {
    const recent = {
      id: '018f1a44-9093-7f55-a515-278f4d9bd99f',
      type: 'ocr.started',
      severity: 'info',
      createdAt: '2026-05-07T18:04:00.000Z',
      documentId: '018f1a44-9093-7f55-a515-278f4d9bd99f',
      documentTitle: 'Document',
      jobId: '018f1a44-9093-7f55-a515-278f4d9bd990',
      status: 'OCR_RUNNING',
    };
    const legacyRecent = {
      ...recent,
      title: 'OCR started',
      message: 'Document is being processed.',
    };
    const old = {
      ...legacyRecent,
      id: '018f1a44-9093-7f55-a515-278f4d9bd991',
      createdAt: '2026-05-07T17:59:00.000Z',
    };
    const history = redisClient({
      zrangebyscore: jest
        .fn()
        .mockResolvedValue([
          JSON.stringify(old),
          JSON.stringify(legacyRecent),
          '{',
        ]),
    });
    const publisher = redisClient();
    jest
      .mocked(createRedisClient)
      .mockReturnValueOnce(history as never)
      .mockReturnValueOnce(publisher as never);
    const service = new RealtimeNotificationsService(config as never);

    await expect(service.recentNotifications()).resolves.toEqual([recent]);
    expect(history.zremrangebyscore).toHaveBeenCalledWith(
      NOTIFICATIONS_HISTORY_KEY,
      0,
      Date.parse('2026-05-07T18:00:00.000Z') - 1,
    );
  });
});
