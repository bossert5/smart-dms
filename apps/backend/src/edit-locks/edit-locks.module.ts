import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { PrismaModule } from '../prisma/prisma.module';
import { RealtimeNotificationsModule } from '../realtime/realtime-notifications.module';
import { EditLocksController } from './edit-locks.controller';
import { EditLocksService } from './edit-locks.service';

@Module({
  imports: [AiModule, PrismaModule, RealtimeNotificationsModule],
  controllers: [EditLocksController],
  providers: [EditLocksService],
  exports: [EditLocksService],
})
export class EditLocksModule {}
