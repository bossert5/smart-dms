import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { readdir, stat } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { AuditService } from '../audit/audit.service';
import { AppConfigService } from '../common/app-config.service';
import { DocumentHistoryService } from '../document-history/document-history.service';
import { PrismaService } from '../prisma/prisma.service';
import { ProcessingJobsService } from '../processing/processing-jobs.service';
import { RealtimeEventsService } from '../realtime/realtime-events.service';
import { RealtimeNotificationsService } from '../realtime/realtime-notifications.service';
import { StorageService } from '../storage/storage.service';

interface ObservedFile {
  size: number;
  mtimeMs: number;
  firstSeenStableAt?: number;
}

const STABLE_DURATION_MS = 10_000;
const SCAN_INTERVAL_MS = 5_000;

@Injectable()
export class IngestionService {
  private readonly logger = new Logger(IngestionService.name);
  private readonly observedFiles = new Map<string, ObservedFile>();
  private isScanning = false;

  constructor(
    private readonly config: AppConfigService,
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly processingJobs: ProcessingJobsService,
    private readonly audit: AuditService,
    private readonly realtimeEvents: RealtimeEventsService,
    private readonly notifications: RealtimeNotificationsService,
    private readonly documentHistory: DocumentHistoryService,
  ) {}

  @Interval(SCAN_INTERVAL_MS)
  async scanScannerImportDirectory(): Promise<void> {
    if (this.isScanning) {
      return;
    }

    this.isScanning = true;
    try {
      const tenants = await this.prisma.tenant.findMany({
        where: {
          isActive: true,
          scannerImportPath: { not: null },
        },
        select: {
          id: true,
          scannerImportPath: true,
        },
      });

      for (const tenant of tenants) {
        if (!tenant.scannerImportPath) {
          continue;
        }
        const scannerImportPath = this.config.resolveScannerImportPath(
          tenant.scannerImportPath,
        );
        const entries = await readdir(scannerImportPath, {
          withFileTypes: true,
        }).catch(() => []);

        for (const entry of entries) {
          if (!entry.isFile()) {
            continue;
          }

          const absolutePath = join(scannerImportPath, entry.name);
          await this.maybeIngestFile(tenant.id, absolutePath, entry.name);
        }
      }
    } finally {
      this.isScanning = false;
    }
  }

  private async maybeIngestFile(
    tenantId: string,
    absolutePath: string,
    fileName: string,
  ): Promise<void> {
    const mimeType = mimeTypeFromFileName(fileName);
    if (!mimeType) {
      return;
    }

    const fileStat = await stat(absolutePath).catch(() => null);
    if (!fileStat?.isFile()) {
      this.observedFiles.delete(absolutePath);
      return;
    }

    const previous = this.observedFiles.get(absolutePath);
    if (
      !previous ||
      previous.size !== fileStat.size ||
      previous.mtimeMs !== fileStat.mtimeMs
    ) {
      this.observedFiles.set(absolutePath, {
        size: fileStat.size,
        mtimeMs: fileStat.mtimeMs,
        firstSeenStableAt: Date.now(),
      });
      return;
    }

    if (
      !previous.firstSeenStableAt ||
      Date.now() - previous.firstSeenStableAt < STABLE_DURATION_MS
    ) {
      return;
    }

    await this.ingestStableFile(tenantId, absolutePath, fileName, mimeType);
    this.observedFiles.delete(absolutePath);
  }

  private async ingestStableFile(
    tenantId: string,
    absolutePath: string,
    fileName: string,
    mimeType: string,
  ): Promise<void> {
    this.logger.log(`Ingesting scanner file ${fileName}.`);
    const document = await this.prisma.document.create({
      data: {
        tenantId,
        title: fileName.replace(/\.[^.]+$/, '') || fileName,
        originalFileName: fileName,
        source: 'SCANNER',
        mimeType,
        status: 'INGESTING',
      },
    });

    const storedOriginal = await this.storage.moveUploadedOriginal(
      absolutePath,
      document.id,
      fileName,
    );

    const updatedDocument = await this.prisma.$transaction(async (tx) => {
      await tx.fileArtifact.create({
        data: {
          documentId: document.id,
          artifactType: 'ORIGINAL',
          path: storedOriginal.relativePath,
          mimeType,
          size: storedOriginal.size,
          checksum: storedOriginal.checksum,
        },
      });

      return tx.document.update({
        where: { id: document.id },
        data: {
          status: 'OCR_PENDING',
          fileSize: storedOriginal.size,
          checksum: storedOriginal.checksum,
        },
        select: {
          id: true,
          title: true,
          originalFileName: true,
          status: true,
        },
      });
    });

    const pendingJob = await this.processingJobs.createDocumentProcessingJob(
      document.id,
      'OCR_DOCUMENT',
    );
    await this.documentHistory.record({
      documentId: updatedDocument.id,
      type: 'SCANNER_DOCUMENT_DETECTED',
      summary: 'New document detected in the scanner import directory.',
      metadata: {
        originalFileName: fileName,
        mimeType,
        size: storedOriginal.size,
      },
    });
    await this.notifications.publish({
      type: 'document.scanner_ingested',
      severity: 'info',
      documentId: updatedDocument.id,
      documentTitle: documentNotificationTitle(updatedDocument),
      tenantId,
      jobId: pendingJob.id,
      status: updatedDocument.status,
    });
    await this.realtimeEvents.documentChanged({
      documentId: updatedDocument.id,
      tenantId,
      jobId: pendingJob.id,
      status: updatedDocument.status,
      reason: 'SCANNER_INGESTED',
    });

    const job =
      await this.processingJobs.enqueueCreatedDocumentProcessingJob(pendingJob);
    await this.documentHistory.record({
      documentId: updatedDocument.id,
      type: 'DOCUMENT_PROCESSING_QUEUED',
      summary: 'Document queued for OCR processing.',
      metadata: {
        jobId: job.id,
        jobType: 'OCR_DOCUMENT',
        status: updatedDocument.status,
      },
    });
    await this.audit.record({
      action: 'SCANNER_DOCUMENT_INGESTED',
      entityType: 'Document',
      entityId: document.id,
      metadata: {
        originalFileName: fileName,
        mimeType,
        size: storedOriginal.size,
        jobId: job.id,
      },
    });
  }
}

function documentNotificationTitle(document: {
  readonly title: string | null;
  readonly originalFileName: string;
}): string {
  return document.title?.trim() || document.originalFileName;
}

function mimeTypeFromFileName(fileName: string): string | undefined {
  switch (extname(fileName).toLowerCase()) {
    case '.pdf':
      return 'application/pdf';
    case '.tif':
    case '.tiff':
      return 'image/tiff';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.png':
      return 'image/png';
    default:
      return undefined;
  }
}
