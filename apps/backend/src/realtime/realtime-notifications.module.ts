import { Global, Module } from '@nestjs/common';
import { AppConfigModule } from '../common/app-config.module';
import { RealtimeEventsService } from './realtime-events.service';
import { RealtimeNotificationsService } from './realtime-notifications.service';

@Global()
@Module({
  imports: [AppConfigModule],
  providers: [RealtimeEventsService, RealtimeNotificationsService],
  exports: [RealtimeEventsService, RealtimeNotificationsService],
})
export class RealtimeNotificationsModule {}
