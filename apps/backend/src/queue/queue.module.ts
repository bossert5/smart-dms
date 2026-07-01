import { BullModule } from '@nestjs/bullmq';
import { Global, Module } from '@nestjs/common';
import { AppConfigModule } from '../common/app-config.module';
import { AppConfigService } from '../common/app-config.service';
import { DOCUMENT_PROCESSING_QUEUE } from './queue.constants';

@Global()
@Module({
  imports: [
    AppConfigModule,
    BullModule.forRootAsync({
      useFactory: (config: AppConfigService) => ({
        connection: {
          host: config.redisHost,
          port: config.redisPort,
          password: config.redisPassword,
        },
      }),
      inject: [AppConfigService],
    }),
    BullModule.registerQueue({
      name: DOCUMENT_PROCESSING_QUEUE,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
        removeOnComplete: 1000,
        removeOnFail: false,
      },
    }),
  ],
  exports: [BullModule],
})
export class QueueModule {}
