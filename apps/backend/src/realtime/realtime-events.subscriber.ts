import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import type { RealtimeDomainEvent } from '@smart-dms/shared-dto';
import { RealtimeDomainEventSchema } from '@smart-dms/shared-dto';
import type Redis from 'ioredis';
import { AppConfigService } from '../common/app-config.service';
import { REALTIME_EVENTS_REDIS_CHANNEL } from './realtime.constants';
import { createRedisClient } from './redis-client.factory';

type RealtimeEventHandler = (event: RealtimeDomainEvent) => void;

@Injectable()
export class RealtimeEventsSubscriber implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RealtimeEventsSubscriber.name);
  private readonly subscriberClient: Redis;
  private readonly handlers = new Set<RealtimeEventHandler>();
  private subscriptionPromise: Promise<void> | undefined;
  private isMessageHandlerRegistered = false;

  constructor(config: AppConfigService) {
    this.subscriberClient = createRedisClient(config);
    this.subscriberClient.on('error', (error) => {
      this.logger.warn(
        `Redis realtime event error: ${this.errorMessage(error)}`,
      );
    });
  }

  async onModuleInit(): Promise<void> {
    await this.ensureSubscribed();
  }

  onEvent(handler: RealtimeEventHandler): () => void {
    this.handlers.add(handler);
    void this.ensureSubscribed().catch((error) => {
      this.logger.warn(
        `Failed to subscribe to realtime events: ${this.errorMessage(error)}`,
      );
    });

    return () => {
      this.handlers.delete(handler);
    };
  }

  async onModuleDestroy(): Promise<void> {
    await this.subscriberClient.quit().catch(() => undefined);
  }

  private handleMessage(payload: string): void {
    const event = this.parseEvent(payload);

    if (!event) {
      this.logger.warn('Ignored invalid realtime event payload.');
      return;
    }

    for (const handler of this.handlers) {
      handler(event);
    }
  }

  private ensureSubscribed(): Promise<void> {
    if (!this.subscriptionPromise) {
      if (!this.isMessageHandlerRegistered) {
        this.subscriberClient.on('message', (_channel, payload) =>
          this.handleMessage(payload),
        );
        this.isMessageHandlerRegistered = true;
      }

      this.subscriptionPromise = this.subscriberClient
        .subscribe(REALTIME_EVENTS_REDIS_CHANNEL)
        .then(() => undefined)
        .catch((error) => {
          this.subscriptionPromise = undefined;
          throw error;
        });
    }

    return this.subscriptionPromise;
  }

  private parseEvent(payload: string): RealtimeDomainEvent | null {
    try {
      const parsed = RealtimeDomainEventSchema.safeParse(JSON.parse(payload));
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
