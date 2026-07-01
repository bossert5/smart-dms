import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { DOCUMENT_PROCESSING_QUEUE } from '../queue/queue.constants';
import type { DocumentProcessingJobData } from '../processing/processing.types';
import { DocumentHistoryService } from '../document-history/document-history.service';
import { RealtimeEventsService } from '../realtime/realtime-events.service';
import { RealtimeNotificationsService } from '../realtime/realtime-notifications.service';
import { StorageService } from '../storage/storage.service';
import { OcrProcessingService } from './ocr-processing.service';

@Injectable()
@Processor(DOCUMENT_PROCESSING_QUEUE)
export class DocumentProcessingConsumer extends WorkerHost {
  private readonly logger = new Logger(DocumentProcessingConsumer.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly ocrProcessing: OcrProcessingService,
    private readonly realtimeEvents: RealtimeEventsService,
    private readonly notifications: RealtimeNotificationsService,
    private readonly documentHistory: DocumentHistoryService,
  ) {
    super();
  }

  async process(job: Job<DocumentProcessingJobData>): Promise<void> {
    const { documentId, processingJobId, processingOptions } = job.data;

    await this.prisma.processingJob.update({
      where: { id: processingJobId },
      data: {
        status: 'ACTIVE',
        startedAt: new Date(),
        attempts: job.attemptsMade + 1,
        progress: 5,
      },
    });
    const runningDocument = await this.prisma.document.update({
      where: { id: documentId },
      data: { status: 'OCR_RUNNING', failedReason: null },
      select: {
        tenantId: true,
        title: true,
        originalFileName: true,
        status: true,
      },
    });
    await this.notifications.publish({
      type: 'ocr.started',
      severity: 'info',
      title: 'OCR gestartet',
      message: `${documentNotificationTitle(runningDocument)} wird verarbeitet.`,
      documentId,
      tenantId: runningDocument.tenantId,
      documentTitle: documentNotificationTitle(runningDocument),
      jobId: processingJobId,
      status: runningDocument.status,
    });
    await this.realtimeEvents.documentChanged({
      documentId,
      tenantId: runningDocument.tenantId,
      jobId: processingJobId,
      status: runningDocument.status,
      reason: 'OCR_STARTED',
    });
    await this.documentHistory.record({
      documentId,
      type: 'OCR_PROCESSING_STARTED',
      summary: 'OCR-Verarbeitung wurde gestartet.',
      metadata: {
        jobId: processingJobId,
        status: runningDocument.status,
      },
    });

    try {
      await this.ocrProcessing.processDocument(
        documentId,
        processingJobId,
        processingOptions,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Document processing failed for ${documentId}: ${message}`,
      );
      await this.recordErrorArtifact(documentId, message);
      await this.prisma.processingJob.update({
        where: { id: processingJobId },
        data: {
          status: 'FAILED',
          finishedAt: new Date(),
          progress: 100,
          errorCode: 'PROCESSING_FAILED',
          errorMessage: message,
        },
      });
      const failedDocument = await this.prisma.document.update({
        where: { id: documentId },
        data: {
          status: 'FAILED',
          failedReason: message,
        },
        select: {
          tenantId: true,
          title: true,
          originalFileName: true,
          status: true,
        },
      });
      await this.notifications.publish({
        type: 'processing.failed',
        severity: 'error',
        title: 'Verarbeitung fehlgeschlagen',
        message: `${documentNotificationTitle(failedDocument)}: ${message}`,
        documentId,
        tenantId: failedDocument.tenantId,
        documentTitle: documentNotificationTitle(failedDocument),
        jobId: processingJobId,
        status: failedDocument.status,
      });
      await this.realtimeEvents.documentChanged({
        documentId,
        tenantId: failedDocument.tenantId,
        jobId: processingJobId,
        status: failedDocument.status,
        reason: 'PROCESSING_FAILED',
      });
      await this.documentHistory.record({
        documentId,
        type: 'DOCUMENT_PROCESSING_FAILED',
        summary: 'Verarbeitung ist fehlgeschlagen.',
        metadata: {
          jobId: processingJobId,
          status: failedDocument.status,
          errorCode: 'PROCESSING_FAILED',
        },
      });
      throw error;
    }
  }

  private async recordErrorArtifact(
    documentId: string,
    message: string,
  ): Promise<void> {
    try {
      const artifact = await this.storage.writeErrorArtifact(
        documentId,
        `${new Date().toISOString()}\n${message}\n`,
      );
      await this.prisma.fileArtifact.create({
        data: {
          documentId,
          artifactType: 'ERROR_ARTIFACT',
          path: artifact.relativePath,
          mimeType: 'text/plain',
          size: artifact.size,
          checksum: artifact.checksum,
        },
      });
    } catch (error) {
      this.logger.warn(
        `Failed to write error artifact for ${documentId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}

function documentNotificationTitle(document: {
  readonly title: string | null;
  readonly originalFileName: string;
}): string {
  return document.title?.trim() || document.originalFileName;
}
