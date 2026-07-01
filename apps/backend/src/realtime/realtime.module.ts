import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { EditLocksModule } from '../edit-locks/edit-locks.module';
import { RealtimeEventsSubscriber } from './realtime-events.subscriber';
import { RealtimeNotificationsGateway } from './realtime-notifications.gateway';
import { RealtimeNotificationsModule } from './realtime-notifications.module';
import { RealtimeNotificationsSubscriber } from './realtime-notifications.subscriber';

@Module({
  imports: [AuthModule, EditLocksModule, RealtimeNotificationsModule],
  providers: [
    RealtimeEventsSubscriber,
    RealtimeNotificationsGateway,
    RealtimeNotificationsSubscriber,
  ],
})
export class RealtimeModule {}
