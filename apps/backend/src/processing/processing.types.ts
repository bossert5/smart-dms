import type { ProcessingJobType } from '@smart-dms/shared-dto';

export interface DocumentProcessingJobData {
  documentId: string;
  processingJobId: string;
  jobType?: ProcessingJobType;
  processingOptions?: DocumentProcessingOptions;
}

export interface DocumentProcessingOptions {
  rotationDegrees?: 180;
  forceOcr?: boolean;
}
