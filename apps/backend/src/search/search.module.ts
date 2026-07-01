import { Module } from '@nestjs/common';
import { DocumentsModule } from '../documents/documents.module';

@Module({
  imports: [DocumentsModule],
})
export class SearchModule {}
