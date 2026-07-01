import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ProcessorAppModule } from './processor/processor-app.module';

async function bootstrap() {
  const logger = new Logger('ProcessorBootstrap');
  await NestFactory.createApplicationContext(ProcessorAppModule);
  logger.log('Document processor started.');
}

void bootstrap();
