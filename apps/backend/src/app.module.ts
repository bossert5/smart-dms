import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { AiMetadataProcessingDispatcher } from './ai/ai-metadata-processing.dispatcher';
import { AiModule } from './ai/ai.module';
import { AiProvidersModule } from './ai-providers/ai-providers.module';
import { AuditModule } from './audit/audit.module';
import { CalendarModule } from './calendar/calendar.module';
import { AuthModule } from './auth/auth.module';
import { AppConfigModule } from './common/app-config.module';
import { JwtAuthGuard } from './common/jwt-auth.guard';
import { PasswordChangeRequiredGuard } from './common/password-change-required.guard';
import { RolesGuard } from './common/roles.guard';
import { DocumentsModule } from './documents/documents.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { DocumentHistoryModule } from './document-history/document-history.module';
import { EmailIngestionModule } from './email-ingestion/email-ingestion.module';
import { EditLocksModule } from './edit-locks/edit-locks.module';
import { HealthModule } from './health/health.module';
import { IngestionModule } from './ingestion/ingestion.module';
import { InitialDataModule } from './initial-data/initial-data.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProcessingModule } from './processing/processing.module';
import { QueueModule } from './queue/queue.module';
import { RealtimeModule } from './realtime/realtime.module';
import { RealtimeNotificationsModule } from './realtime/realtime-notifications.module';
import { SearchModule } from './search/search.module';
import { SettingsModule } from './settings/settings.module';
import { StorageModule } from './storage/storage.module';
import { TenantsModule } from './tenants/tenants.module';
import { UploadsModule } from './uploads/uploads.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    AppConfigModule,
    ScheduleModule.forRoot(),
    PrismaModule,
    InitialDataModule,
    QueueModule,
    RealtimeNotificationsModule,
    StorageModule,
    TenantsModule,
    AuditModule,
    DocumentHistoryModule,
    DashboardModule,
    CalendarModule,
    AuthModule,
    UsersModule,
    ProcessingModule,
    DocumentsModule,
    EditLocksModule,
    EmailIngestionModule,
    UploadsModule,
    IngestionModule,
    SearchModule,
    SettingsModule,
    AiProvidersModule,
    AiModule,
    RealtimeModule,
    HealthModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: PasswordChangeRequiredGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
    AiMetadataProcessingDispatcher,
  ],
})
export class AppModule {}
