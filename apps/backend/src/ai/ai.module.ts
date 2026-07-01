import { Module } from '@nestjs/common';
import { AiProvidersModule } from '../ai-providers/ai-providers.module';
import { CalendarModule } from '../calendar/calendar.module';
import { DocumentHistoryModule } from '../document-history/document-history.module';
import { RealtimeNotificationsModule } from '../realtime/realtime-notifications.module';
import { AiMetadataPromptBuilder } from './ai-metadata-prompt.builder';
import { AiMetadataEvidenceExtractor } from './ai-metadata-evidence.extractor';
import { AiOcrTextPreprocessor } from './ai-ocr-text-preprocessor';
import { AiPromptPlanner } from './ai-prompt-planner';
import { AiProcessingService } from './ai-processing.service';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';

@Module({
  imports: [
    AiProvidersModule,
    CalendarModule,
    DocumentHistoryModule,
    RealtimeNotificationsModule,
  ],
  controllers: [AiController],
  providers: [
    AiMetadataPromptBuilder,
    AiMetadataEvidenceExtractor,
    AiOcrTextPreprocessor,
    AiPromptPlanner,
    AiProcessingService,
    AiService,
  ],
  exports: [AiProcessingService, AiService],
})
export class AiModule {}
