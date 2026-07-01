import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppConfigService } from './app-config.service';
import { ScannerImportDirectoryService } from './scanner-import-directory.service';

@Global()
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['apps/backend/.env', '.env'],
    }),
  ],
  providers: [AppConfigService, ScannerImportDirectoryService],
  exports: [AppConfigService, ScannerImportDirectoryService],
})
export class AppConfigModule {}
