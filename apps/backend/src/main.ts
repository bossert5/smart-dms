import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import { AppConfigService } from './common/app-config.service';
import { API_GLOBAL_PREFIX } from './common/api-prefix';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, new ExpressAdapter());
  const config = app.get(AppConfigService);

  app.use(cookieParser());
  app.setGlobalPrefix(API_GLOBAL_PREFIX);
  app.enableCors({
    origin: true,
    credentials: true,
  });

  await app.listen(config.port);
}
void bootstrap();
