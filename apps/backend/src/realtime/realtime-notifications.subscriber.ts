import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import type { RealtimeNotificationDto } from '@smart-dms/shared-dto';
import { RealtimeNotificationDtoSchema } from '@smart-dms/shared-dto';
import type Redis from 'ioredis';
import { AppConfigService } from '../common/app-config.service';
import { NOTIFICATIONS_REDIS_CHANNEL } from './realtime.constants';
import { createRedisClient } from './redis-client.factory';

type NotificationHandler = (notification: RealtimeNotificationDto) => void;

@Injectable()
export class RealtimeNotificationsSubscriber
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(RealtimeNotificationsSubscriber.name);
  private readonly subscriberClient: Redis;
  private readonly handlers = new Set<NotificationHandler>();
  private subscriptionPromise: Promise<void> | undefined;
  private isMessageHandlerRegistered = false;

  constructor(config: AppConfigService) {
    this.subscriberClient = createRedisClient(config);
    this.subscriberClient.on('error', (error) => {
      this.logger.warn(`Redis realtime error: ${this.errorMessage(error)}`);
    });
  }

  async onModuleInit(): Promise<void> {
    await this.ensureSubscribed();
  }

  onNotification(handler: NotificationHandler): () => void {
    this.handlers.add(handler);
    void this.ensureSubscribed().catch((error) => {
      this.logger.warn(
        `Failed to subscribe to realtime notifications: ${this.errorMessage(
          error,
        )}`,
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
    const notification = this.parseNotification(payload);

    if (!notification) {
      this.logger.warn('Ignored invalid realtime notification payload.');
      return;
    }

    for (const handler of this.handlers) {
      handler(notification);
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
        .subscribe(NOTIFICATIONS_REDIS_CHANNEL)
        .then(() => undefined)
        .catch((error) => {
          this.subscriptionPromise = undefined;
          throw error;
        });
    }

    return this.subscriptionPromise;
  }

  private parseNotification(payload: string): RealtimeNotificationDto | null {
    try {
      const parsed = RealtimeNotificationDtoSchema.safeParse(
        JSON.parse(payload),
      );
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
