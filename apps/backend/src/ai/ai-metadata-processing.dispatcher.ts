import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { AiProviderService } from '../ai-providers/ai-provider.service';
import { AiProcessingService } from './ai-processing.service';

@Injectable()
export class AiMetadataProcessingDispatcher implements OnApplicationBootstrap {
  private readonly logger = new Logger(AiMetadataProcessingDispatcher.name);
  private isRecoveringProviders = false;

  constructor(
    private readonly aiProcessing: AiProcessingService,
    private readonly aiProviders: AiProviderService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const requeuedJobs =
      await this.aiProcessing.requeueInterruptedMetadataJobs();
    if (requeuedJobs.length > 0) {
      this.logger.warn(
        `Requeued ${requeuedJobs.length} interrupted AI metadata job(s).`,
      );
    }

    await this.dispatchWaitingJobs();
  }

  @Interval(3000)
  async dispatchWaitingJobs(): Promise<void> {
    await this.aiProcessing.dispatchWaitingJobs();
  }

  @Interval(60_000)
  async recoverUnavailableProviders(): Promise<void> {
    if (this.isRecoveringProviders) {
      return;
    }

    this.isRecoveringProviders = true;
    try {
      const recovered = await this.aiProviders.recoverUnavailableProviders();
      if (recovered.length === 0) {
        return;
      }

      this.logger.log(`Recovered ${recovered.length} AI provider(s).`);
      await this.dispatchWaitingJobs();
    } finally {
      this.isRecoveringProviders = false;
    }
  }
}
