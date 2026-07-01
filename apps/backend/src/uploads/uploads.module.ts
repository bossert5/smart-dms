import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { mkdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { basename } from 'node:path';
import { AppConfigModule } from '../common/app-config.module';
import { AppConfigService } from '../common/app-config.service';
import { AuditModule } from '../audit/audit.module';
import { DocumentHistoryModule } from '../document-history/document-history.module';
import { ProcessingModule } from '../processing/processing.module';
import { StorageModule } from '../storage/storage.module';
import { TenantsModule } from '../tenants/tenants.module';
import { UploadsController } from './uploads.controller';
import { UploadsService } from './uploads.service';

@Module({
  imports: [
    AppConfigModule,
    AuditModule,
    DocumentHistoryModule,
    ProcessingModule,
    StorageModule,
    TenantsModule,
    MulterModule.registerAsync({
      imports: [AppConfigModule],
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => ({
        storage: diskStorage({
          destination: (_request, _file, callback) => {
            mkdir(config.tempUploadDir, { recursive: true })
              .then(() => callback(null, config.tempUploadDir))
              .catch((error: unknown) => {
                const storageError =
                  error instanceof Error
                    ? error
                    : new Error('Failed to create upload directory.');
                callback(storageError, config.tempUploadDir);
              });
          },
          filename: (_request, file, callback) => {
            callback(null, `${randomUUID()}-${basename(file.originalname)}`);
          },
        }),
        limits: {
          fileSize: config.maxUploadSizeBytes,
        },
      }),
    }),
  ],
  controllers: [UploadsController],
  providers: [UploadsService],
})
export class UploadsModule {}
