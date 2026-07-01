import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import type {
  AiProviderDto,
  DocumentStatus,
  RealtimeAiProviderChangeReason,
  RealtimeAiProviderChangedEvent,
  RealtimeDocumentChangedEvent,
  RealtimeDocumentChangeReason,
  RealtimeDomainEvent,
  RealtimeEditLockChangedEvent,
} from '@smart-dms/shared-dto';
import {
  AI_PROVIDER_CHANGED_EVENT,
  DOCUMENT_CHANGED_EVENT,
  EDIT_LOCK_CHANGED_EVENT,
  RealtimeDomainEventSchema,
} from '@smart-dms/shared-dto';
import type {
  EditLockDto,
  RealtimeEditLockChangeAction,
} from '@smart-dms/shared-dto';
import type Redis from 'ioredis';
import { AppConfigService } from '../common/app-config.service';
import { REALTIME_EVENTS_REDIS_CHANNEL } from './realtime.constants';
import { createRedisClient } from './redis-client.factory';

export interface DocumentChangedPublishInput {
  documentId: string;
  tenantId: string;
  status: DocumentStatus;
  jobId?: string;
  queuePosition?: number;
  reason: RealtimeDocumentChangeReason;
}

export interface AiProviderChangedPublishInput {
  providerId: string;
  action: RealtimeAiProviderChangedEvent['action'];
  provider?: AiProviderDto;
  reason: RealtimeAiProviderChangeReason;
}

export interface EditLockChangedPublishInput {
  action: RealtimeEditLockChangeAction;
  lock: EditLockDto;
}

@Injectable()
export class RealtimeEventsService implements OnModuleDestroy {
  private readonly logger = new Logger(RealtimeEventsService.name);
  private readonly publisherClient: Redis;

  constructor(config: AppConfigService) {
    this.publisherClient = createRedisClient(config);
    this.publisherClient.on('error', (error) => this.logRedisError(error));
  }

  documentChanged(
    input: DocumentChangedPublishInput,
  ): Promise<RealtimeDocumentChangedEvent> {
    return this.publish({
      type: DOCUMENT_CHANGED_EVENT,
      ...input,
      changedAt: new Date().toISOString(),
    });
  }

  aiProviderChanged(
    input: AiProviderChangedPublishInput,
  ): Promise<RealtimeAiProviderChangedEvent> {
    return this.publish({
      type: AI_PROVIDER_CHANGED_EVENT,
      ...input,
      changedAt: new Date().toISOString(),
    });
  }

  editLockChanged(
    input: EditLockChangedPublishInput,
  ): Promise<RealtimeEditLockChangedEvent> {
    return this.publish({
      type: EDIT_LOCK_CHANGED_EVENT,
      ...input,
      changedAt: new Date().toISOString(),
    });
  }

  async publish<TEvent extends RealtimeDomainEvent>(
    event: TEvent,
  ): Promise<TEvent> {
    const parsed = RealtimeDomainEventSchema.parse(event) as TEvent;

    try {
      await this.publisherClient.publish(
        REALTIME_EVENTS_REDIS_CHANNEL,
        JSON.stringify(parsed),
      );
    } catch (error) {
      this.logger.warn(
        `Failed to publish realtime event: ${this.errorMessage(error)}`,
      );
    }

    return parsed;
  }

  async onModuleDestroy(): Promise<void> {
    await this.publisherClient.quit().catch(() => undefined);
  }

  private logRedisError(error: unknown): void {
    this.logger.warn(`Redis realtime event error: ${this.errorMessage(error)}`);
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
