import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AiModule } from '../ai/ai.module';
import { AiProvidersModule } from '../ai-providers/ai-providers.module';
import { AppConfigModule } from '../common/app-config.module';
import { DocumentHistoryModule } from '../document-history/document-history.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ProcessingModule } from '../processing/processing.module';
import { QueueModule } from '../queue/queue.module';
import { RealtimeNotificationsModule } from '../realtime/realtime-notifications.module';
import { SettingsModule } from '../settings/settings.module';
import { StorageModule } from '../storage/storage.module';
import { CommandRunnerService } from './command-runner.service';
import { DocumentProcessingConsumer } from './document-processing.consumer';
import { OcrCommandService } from './ocr-command.service';
import { OcrProcessingService } from './ocr-processing.service';

@Module({
  imports: [
    AppConfigModule,
    ScheduleModule.forRoot(),
    AiModule,
    AiProvidersModule,
    DocumentHistoryModule,
    PrismaModule,
    ProcessingModule,
    QueueModule,
    RealtimeNotificationsModule,
    SettingsModule,
    StorageModule,
  ],
  providers: [
    CommandRunnerService,
    OcrCommandService,
    OcrProcessingService,
    DocumentProcessingConsumer,
  ],
})
export class ProcessorAppModule {}
