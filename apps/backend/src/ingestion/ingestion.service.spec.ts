import { IngestionService } from './ingestion.service';

const documentId = '018f1a44-9093-7f55-a515-278f4d9bd99f';
const jobId = '018f1a44-9093-7f55-a515-278f4d9bd990';
const tenantId = '018f1a44-9093-7f55-a515-278f4d9bd900';

function createService() {
  const updatedDocument = {
    id: documentId,
    title: 'invoice',
    status: 'OCR_PENDING',
  };
  const tx = {
    fileArtifact: {
      create: jest.fn().mockResolvedValue({}),
    },
    document: {
      update: jest.fn().mockResolvedValue(updatedDocument),
    },
  };
  const prisma = {
    document: {
      create: jest.fn().mockResolvedValue({ id: documentId }),
    },
    $transaction: jest.fn(
      <TResult>(callback: (transaction: typeof tx) => TResult) => callback(tx),
    ),
  };
  const storage = {
    moveUploadedOriginal: jest.fn().mockResolvedValue({
      relativePath: 'documents/original/invoice.pdf',
      size: 1234,
      checksum: 'sha256:invoice',
    }),
  };
  const processingJobs = {
    createDocumentProcessingJob: jest.fn().mockResolvedValue({
      id: jobId,
      documentId,
    }),
    enqueueCreatedDocumentProcessingJob: jest.fn().mockResolvedValue({
      id: jobId,
      documentId,
    }),
  };
  const audit = {
    record: jest.fn().mockResolvedValue(undefined),
  };
  const realtimeEvents = {
    documentChanged: jest.fn().mockResolvedValue(undefined),
  };
  const notifications = {
    publish: jest.fn().mockResolvedValue(undefined),
  };
  const documentHistory = {
    record: jest.fn().mockResolvedValue(undefined),
  };
  const service = new IngestionService(
    {
      resolveScannerImportPath: (scannerImportPath: string) =>
        scannerImportPath,
    } as never,
    prisma as never,
    storage as never,
    processingJobs as never,
    audit as never,
    realtimeEvents as never,
    notifications as never,
    documentHistory as never,
  );

  return {
    documentHistory,
    notifications,
    processingJobs,
    realtimeEvents,
    service,
  };
}

describe('IngestionService', () => {
  it('publishes the scanner detection notification before starting OCR queue processing', async () => {
    const { notifications, processingJobs, realtimeEvents, service } =
      createService();

    await (
      service as unknown as {
        ingestStableFile(
          tenantId: string,
          absolutePath: string,
          fileName: string,
          mimeType: string,
        ): Promise<void>;
      }
    ).ingestStableFile(
      tenantId,
      'D:\\scan\\invoice.pdf',
      'invoice.pdf',
      'application/pdf',
    );

    expect(notifications.publish).toHaveBeenCalledWith({
      type: 'document.scanner_ingested',
      severity: 'info',
      documentId,
      documentTitle: 'invoice',
      tenantId,
      jobId,
      status: 'OCR_PENDING',
    });
    expect(realtimeEvents.documentChanged).toHaveBeenCalledWith({
      documentId,
      tenantId,
      jobId,
      status: 'OCR_PENDING',
      reason: 'SCANNER_INGESTED',
    });
    expect(notifications.publish.mock.invocationCallOrder[0]).toBeLessThan(
      processingJobs.enqueueCreatedDocumentProcessingJob.mock
        .invocationCallOrder[0],
    );
    expect(
      realtimeEvents.documentChanged.mock.invocationCallOrder[0],
    ).toBeLessThan(
      processingJobs.enqueueCreatedDocumentProcessingJob.mock
        .invocationCallOrder[0],
    );
  });
});
