import { BadRequestException, Injectable } from '@nestjs/common';
import type {
  UploadConfigResponse,
  UploadDocumentResponse,
} from '@smart-dms/shared-dto';
import { AuditService } from '../audit/audit.service';
import type { AuthenticatedUser } from '../common/authenticated-user';
import { AppConfigService } from '../common/app-config.service';
import { DocumentHistoryService } from '../document-history/document-history.service';
import { PrismaService } from '../prisma/prisma.service';
import { ProcessingJobsService } from '../processing/processing-jobs.service';
import { RealtimeEventsService } from '../realtime/realtime-events.service';
import { RealtimeNotificationsService } from '../realtime/realtime-notifications.service';
import { StorageService } from '../storage/storage.service';
import { toDocumentSummaryDto } from '../documents/document.mapper';
import { TenantScopeService } from '../tenants/tenant-scope.service';

export const ALLOWED_UPLOAD_MIME_TYPES = [
  'application/pdf',
  'image/tiff',
  'image/jpeg',
  'image/png',
] as const;

const ALLOWED_MIME_TYPES = new Set<string>(ALLOWED_UPLOAD_MIME_TYPES);

@Injectable()
export class UploadsService {
  constructor(
    private readonly config: AppConfigService,
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly processingJobs: ProcessingJobsService,
    private readonly audit: AuditService,
    private readonly realtimeEvents: RealtimeEventsService,
    private readonly notifications: RealtimeNotificationsService,
    private readonly documentHistory: DocumentHistoryService,
    private readonly tenantScope: TenantScopeService,
  ) {}

  async acceptDocumentUpload(
    file: Express.Multer.File | undefined,
    user: AuthenticatedUser,
    tenantId: string | undefined,
  ): Promise<UploadDocumentResponse> {
    if (!file) {
      throw new BadRequestException('Missing upload file.');
    }

    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      throw new BadRequestException('Unsupported file type.');
    }
    if (!tenantId) {
      throw new BadRequestException('Missing tenant id.');
    }
    await this.tenantScope.assertTenantAccess(user, tenantId);

    const document = await this.prisma.document.create({
      data: {
        tenantId,
        title: this.defaultTitle(file.originalname),
        originalFileName: file.originalname,
        source: 'UPLOAD',
        mimeType: file.mimetype,
        status: 'INGESTING',
        fileSize: file.size,
      },
    });

    const storedOriginal = await this.storage.moveUploadedOriginal(
      file.path,
      document.id,
      file.originalname,
    );

    const updatedDocument = await this.prisma.$transaction(async (tx) => {
      await tx.fileArtifact.create({
        data: {
          documentId: document.id,
          artifactType: 'ORIGINAL',
          path: storedOriginal.relativePath,
          mimeType: file.mimetype,
          size: storedOriginal.size,
          checksum: storedOriginal.checksum,
        },
      });

      return tx.document.update({
        where: { id: document.id },
        data: {
          status: 'OCR_PENDING',
          checksum: storedOriginal.checksum,
          fileSize: storedOriginal.size,
        },
        include: {
          tenant: true,
          documentType: true,
          tags: { include: { tag: true } },
          calendarEvents: { select: { kind: true } },
        },
      });
    });

    const pendingJob = await this.processingJobs.createDocumentProcessingJob(
      document.id,
      'OCR_DOCUMENT',
    );
    await this.documentHistory.record({
      documentId: updatedDocument.id,
      actorUserId: user.id,
      type: 'DOCUMENT_UPLOADED',
      summary: 'Dokument wurde hochgeladen.',
      metadata: {
        originalFileName: file.originalname,
        mimeType: file.mimetype,
        size: storedOriginal.size,
      },
    });
    await this.notifications.publish({
      type: 'document.uploaded',
      severity: 'info',
      title: 'Dokument hochgeladen',
      message: `${documentNotificationTitle(updatedDocument)} wurde hochgeladen und wird vorbereitet.`,
      documentId: updatedDocument.id,
      documentTitle: documentNotificationTitle(updatedDocument),
      tenantId: updatedDocument.tenantId,
      jobId: pendingJob.id,
      status: updatedDocument.status,
    });
    await this.realtimeEvents.documentChanged({
      documentId: updatedDocument.id,
      tenantId: updatedDocument.tenantId,
      jobId: pendingJob.id,
      status: updatedDocument.status,
      reason: 'DOCUMENT_UPLOADED',
    });

    const job =
      await this.processingJobs.enqueueCreatedDocumentProcessingJob(pendingJob);
    await this.documentHistory.record({
      documentId: updatedDocument.id,
      actorUserId: user.id,
      type: 'DOCUMENT_PROCESSING_QUEUED',
      summary: 'Dokument wurde zur OCR-Verarbeitung eingestellt.',
      metadata: {
        jobId: job.id,
        jobType: 'OCR_DOCUMENT',
        status: updatedDocument.status,
      },
    });

    await this.audit.record({
      actorUserId: user.id,
      action: 'DOCUMENT_UPLOADED',
      entityType: 'Document',
      entityId: document.id,
      metadata: {
        originalFileName: file.originalname,
        mimeType: file.mimetype,
        size: storedOriginal.size,
        jobId: job.id,
      },
    });

    return {
      document: toDocumentSummaryDto(updatedDocument, this.storage),
      jobId: job.id,
    };
  }

  configResponse(): UploadConfigResponse {
    return {
      maxUploadSizeBytes: this.config.maxUploadSizeBytes,
      allowedMimeTypes: [...ALLOWED_UPLOAD_MIME_TYPES],
    };
  }

  private defaultTitle(originalFileName: string): string {
    return originalFileName.replace(/\.[^.]+$/, '') || originalFileName;
  }
}

function documentNotificationTitle(document: {
  readonly title: string | null;
  readonly originalFileName: string;
}): string {
  return document.title?.trim() || document.originalFileName;
}
