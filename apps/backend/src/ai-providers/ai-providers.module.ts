import { Module } from '@nestjs/common';
import { AppConfigModule } from '../common/app-config.module';
import { PrismaModule } from '../prisma/prisma.module';
import { RealtimeNotificationsModule } from '../realtime/realtime-notifications.module';
import { AiProviderRouter } from './ai-provider-router.service';
import { AiProviderSecretService } from './ai-provider-secret.service';
import { AiProviderService } from './ai-provider.service';
import { OpenAiModelsClient } from './openai-models.client';
import { OpenAiResponsesClient } from './openai-responses.client';

@Module({
  imports: [AppConfigModule, PrismaModule, RealtimeNotificationsModule],
  providers: [
    AiProviderRouter,
    AiProviderSecretService,
    AiProviderService,
    OpenAiModelsClient,
    OpenAiResponsesClient,
  ],
  exports: [AiProviderRouter, AiProviderService],
})
export class AiProvidersModule {}
