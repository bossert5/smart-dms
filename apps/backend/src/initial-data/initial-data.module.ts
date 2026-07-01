import { Module } from '@nestjs/common';
import { InitialDataService } from './initial-data.service';

@Module({
  providers: [InitialDataService],
})
export class InitialDataModule {}
