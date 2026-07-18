import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import type {
  DocumentStatus,
  RealtimeNotificationDto,
  RealtimeNotificationSeverity,
  RealtimeNotificationType,
} from '@smart-dms/shared-dto';
import { RealtimeNotificationDtoSchema } from '@smart-dms/shared-dto';
import type Redis from 'ioredis';
import { randomUUID } from 'node:crypto';
import { AppConfigService } from '../common/app-config.service';
import {
  NOTIFICATIONS_HISTORY_KEY,
  NOTIFICATIONS_HISTORY_KEY_TTL_SECONDS,
  NOTIFICATIONS_HISTORY_WINDOW_MS,
  NOTIFICATIONS_REDIS_CHANNEL,
} from './realtime.constants';
import { createRedisClient } from './redis-client.factory';

export interface RealtimeNotificationPublishInput {
  type: RealtimeNotificationType;
  severity: RealtimeNotificationSeverity;
  tenantId?: string;
  documentId?: string;
  documentTitle?: string;
  jobId?: string;
  status?: DocumentStatus;
  queuePosition?: number;
  documentCount?: number;
  targetTenantName?: string;
}

@Injectable()
export class RealtimeNotificationsService implements OnModuleDestroy {
  private readonly logger = new Logger(RealtimeNotificationsService.name);
  private readonly historyClient: Redis;
  private readonly publisherClient: Redis;

  constructor(config: AppConfigService) {
    this.historyClient = createRedisClient(config);
    this.publisherClient = createRedisClient(config);
    this.historyClient.on('error', (error) => this.logRedisError(error));
    this.publisherClient.on('error', (error) => this.logRedisError(error));
  }

  async publish(
    input: RealtimeNotificationPublishInput,
  ): Promise<RealtimeNotificationDto> {
    const normalizedInput = this.normalizeInput(input);
    const notification = RealtimeNotificationDtoSchema.parse({
      ...normalizedInput,
      id: randomUUID(),
      createdAt: new Date().toISOString(),
    });
    const payload = JSON.stringify(notification);
    const createdAtMs = Date.parse(notification.createdAt);
    const pruneBefore = Date.now() - NOTIFICATIONS_HISTORY_WINDOW_MS;

    try {
      await Promise.all([
        this.historyClient.zadd(
          NOTIFICATIONS_HISTORY_KEY,
          createdAtMs,
          payload,
        ),
        this.historyClient.zremrangebyscore(
          NOTIFICATIONS_HISTORY_KEY,
          0,
          pruneBefore - 1,
        ),
        this.historyClient.expire(
          NOTIFICATIONS_HISTORY_KEY,
          NOTIFICATIONS_HISTORY_KEY_TTL_SECONDS,
        ),
        this.publisherClient.publish(NOTIFICATIONS_REDIS_CHANNEL, payload),
      ]);
    } catch (error) {
      this.logger.warn(
        `Failed to publish realtime notification: ${this.errorMessage(error)}`,
      );
    }

    return notification;
  }

  async recentNotifications(): Promise<RealtimeNotificationDto[]> {
    const minCreatedAt = Date.now() - NOTIFICATIONS_HISTORY_WINDOW_MS;

    try {
      await this.historyClient.zremrangebyscore(
        NOTIFICATIONS_HISTORY_KEY,
        0,
        minCreatedAt - 1,
      );
      const payloads = await this.historyClient.zrangebyscore(
        NOTIFICATIONS_HISTORY_KEY,
        minCreatedAt,
        '+inf',
      );

      return payloads
        .map((payload) => this.parseNotification(payload))
        .filter((notification): notification is RealtimeNotificationDto =>
          Boolean(
            notification && Date.parse(notification.createdAt) >= minCreatedAt,
          ),
        );
    } catch (error) {
      this.logger.warn(
        `Failed to read realtime notification history: ${this.errorMessage(
          error,
        )}`,
      );
      return [];
    }
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all([
      this.historyClient.quit().catch(() => undefined),
      this.publisherClient.quit().catch(() => undefined),
    ]);
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

  private normalizeInput(
    input: RealtimeNotificationPublishInput,
  ): RealtimeNotificationPublishInput {
    const documentTitle =
      input.documentTitle?.trim().slice(0, 500) || undefined;
    const targetTenantName =
      input.targetTenantName?.trim().slice(0, 200) || undefined;

    return {
      ...input,
      documentTitle,
      targetTenantName,
    };
  }

  private logRedisError(error: unknown): void {
    this.logger.warn(`Redis realtime error: ${this.errorMessage(error)}`);
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
