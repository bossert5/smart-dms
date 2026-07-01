import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { DocumentHistoryModule } from '../document-history/document-history.module';
import { ProcessingModule } from '../processing/processing.module';
import { StorageModule } from '../storage/storage.module';
import { IngestionService } from './ingestion.service';

@Module({
  imports: [
    AuditModule,
    DocumentHistoryModule,
    ProcessingModule,
    StorageModule,
  ],
  providers: [IngestionService],
})
export class IngestionModule {}
