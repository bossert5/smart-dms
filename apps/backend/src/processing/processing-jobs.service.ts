import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { ProcessingJobType } from '@smart-dms/shared-dto';
import type { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { DOCUMENT_PROCESSING_QUEUE } from '../queue/queue.constants';
import type {
  DocumentProcessingJobData,
  DocumentProcessingOptions,
} from './processing.types';

export interface DocumentProcessingJobRef {
  id: string;
  documentId: string;
  jobType: ProcessingJobType;
  processingOptions?: DocumentProcessingOptions;
}

@Injectable()
export class ProcessingJobsService {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(DOCUMENT_PROCESSING_QUEUE)
    private readonly queue: Queue<DocumentProcessingJobData>,
  ) {}

  async enqueueDocumentProcessing(
    documentId: string,
    jobType: ProcessingJobType = 'OCR_DOCUMENT',
    processingOptions?: DocumentProcessingOptions,
  ) {
    const processingJob = await this.createDocumentProcessingJob(
      documentId,
      jobType,
      processingOptions,
    );

    return this.enqueueCreatedDocumentProcessingJob(processingJob);
  }

  async createDocumentProcessingJob(
    documentId: string,
    jobType: ProcessingJobType = 'OCR_DOCUMENT',
    processingOptions?: DocumentProcessingOptions,
  ): Promise<DocumentProcessingJobRef> {
    const processingJob = await this.prisma.processingJob.create({
      data: {
        documentId,
        jobType,
        status: 'WAITING',
        ...(processingOptions
          ? { payload: processingOptions as Prisma.InputJsonValue }
          : {}),
      },
    });

    return {
      id: processingJob.id,
      documentId,
      jobType,
      processingOptions,
    };
  }

  async enqueueCreatedDocumentProcessingJob(
    processingJob: DocumentProcessingJobRef,
  ) {
    const data: DocumentProcessingJobData = {
      documentId: processingJob.documentId,
      processingJobId: processingJob.id,
      jobType: processingJob.jobType,
    };
    if (processingJob.processingOptions) {
      data.processingOptions = processingJob.processingOptions;
    }
    const bullJob = await this.queue.add('process-document', data, {
      jobId: processingJob.id,
    });

    return this.prisma.processingJob.update({
      where: { id: processingJob.id },
      data: { bullJobId: String(bullJob.id) },
    });
  }

  async enqueueExistingDocumentProcessingJob(
    processingJob: DocumentProcessingJobRef,
  ) {
    const data: DocumentProcessingJobData = {
      documentId: processingJob.documentId,
      processingJobId: processingJob.id,
      jobType: processingJob.jobType,
    };
    if (processingJob.processingOptions) {
      data.processingOptions = processingJob.processingOptions;
    }

    const bullJob = await this.queue.add('process-document', data, {
      jobId: `${processingJob.id}-retry-${Date.now()}`,
    });

    return this.prisma.processingJob.update({
      where: { id: processingJob.id },
      data: { bullJobId: String(bullJob.id) },
    });
  }
}
