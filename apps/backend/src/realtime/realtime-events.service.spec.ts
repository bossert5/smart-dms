import { REALTIME_EVENTS_REDIS_CHANNEL } from './realtime.constants';
import { RealtimeEventsService } from './realtime-events.service';
import { createRedisClient } from './redis-client.factory';

jest.mock('./redis-client.factory', () => ({
  createRedisClient: jest.fn(),
}));

function redisClient(overrides: Record<string, unknown> = {}) {
  return {
    on: jest.fn(),
    publish: jest.fn().mockResolvedValue(1),
    quit: jest.fn().mockResolvedValue('OK'),
    ...overrides,
  };
}

const config = {
  redisHost: 'localhost',
  redisPort: 6379,
  redisPassword: undefined,
};

describe('RealtimeEventsService', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-07T18:05:00.000Z'));
    jest.mocked(createRedisClient).mockReset();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('publishes document domain events to Redis', async () => {
    const publisher = redisClient();
    jest.mocked(createRedisClient).mockReturnValue(publisher as never);
    const service = new RealtimeEventsService(config as never);

    const event = await service.documentChanged({
      documentId: '018f1a44-9093-7f55-a515-278f4d9bd99f',
      tenantId: '018f1a44-9093-7f55-a515-278f4d9bd900',
      jobId: '018f1a44-9093-7f55-a515-278f4d9bd990',
      status: 'AI_RUNNING',
      reason: 'AI_STARTED',
    });

    expect(publisher.publish).toHaveBeenCalledWith(
      REALTIME_EVENTS_REDIS_CHANNEL,
      JSON.stringify(event),
    );
  });

  it('publishes AI provider domain events to Redis', async () => {
    const publisher = redisClient();
    jest.mocked(createRedisClient).mockReturnValue(publisher as never);
    const service = new RealtimeEventsService(config as never);

    const event = await service.aiProviderChanged({
      providerId: '018f1a44-9093-7f55-a515-278f4d9bd802',
      action: 'DELETE',
      reason: 'PROVIDER_DELETED',
    });

    expect(publisher.publish).toHaveBeenCalledWith(
      REALTIME_EVENTS_REDIS_CHANNEL,
      JSON.stringify(event),
    );
  });
});
