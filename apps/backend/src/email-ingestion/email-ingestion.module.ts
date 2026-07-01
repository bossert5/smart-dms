import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AppConfigModule } from '../common/app-config.module';
import { DocumentHistoryModule } from '../document-history/document-history.module';
import { ProcessingModule } from '../processing/processing.module';
import { StorageModule } from '../storage/storage.module';
import { TenantsModule } from '../tenants/tenants.module';
import { EmailCredentialService } from './email-credential.service';
import { EmailMessagesController } from './email-messages.controller';
import { EmailMailboxesController } from './email-mailboxes.controller';
import { EmailMailboxesService } from './email-mailboxes.service';

@Module({
  imports: [
    AppConfigModule,
    AuditModule,
    DocumentHistoryModule,
    ProcessingModule,
    StorageModule,
    TenantsModule,
  ],
  controllers: [EmailMailboxesController, EmailMessagesController],
  providers: [EmailCredentialService, EmailMailboxesService],
  exports: [EmailMailboxesService],
})
export class EmailIngestionModule {}
