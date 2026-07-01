import { expectStringContaining } from '../testing/expect-matchers';
import { expectAny, expectObjectContaining } from '../testing/expect-matchers';
import { DocumentProcessingConsumer } from './document-processing.consumer';

const tenantId = '018f1a44-9093-7f55-a515-278f4d9bd900';
const runningDocument = {
  tenantId,
  title: 'Invoice',
  originalFileName: 'invoice.pdf',
  status: 'OCR_RUNNING',
};
const failedDocument = {
  tenantId,
  title: 'Invoice',
  originalFileName: 'invoice.pdf',
  status: 'FAILED',
};

describe('DocumentProcessingConsumer', () => {
  it('marks a job active and delegates OCR processing', async () => {
    const prisma = createPrisma();
    const ocrProcessing = {
      processDocument: jest.fn().mockResolvedValue(undefined),
    };
    const notifications = { publish: jest.fn() };
    const realtimeEvents = { documentChanged: jest.fn() };
    const documentHistory = { record: jest.fn() };
    const consumer = new DocumentProcessingConsumer(
      prisma as never,
      { writeErrorArtifact: jest.fn() } as never,
      ocrProcessing as never,
      realtimeEvents as never,
      notifications as never,
      documentHistory as never,
    );

    await consumer.process(job());

    expect(prisma.processingJob.update).toHaveBeenCalledWith({
      where: { id: 'processing-job-id' },
      data: expectObjectContaining({
        status: 'ACTIVE',
        attempts: 2,
        progress: 5,
      }),
    });
    expect(prisma.document.update).toHaveBeenCalledWith({
      where: { id: 'document-id' },
      data: { status: 'OCR_RUNNING', failedReason: null },
      select: expectAny(Object),
    });
    expect(ocrProcessing.processDocument).toHaveBeenCalledWith(
      'document-id',
      'processing-job-id',
      { rotationDegrees: 180, forceOcr: true },
    );
    expect(notifications.publish).toHaveBeenCalledWith(
      expectObjectContaining({ type: 'ocr.started', status: 'OCR_RUNNING' }),
    );
    expect(realtimeEvents.documentChanged).toHaveBeenCalledWith(
      expectObjectContaining({ reason: 'OCR_STARTED' }),
    );
    expect(documentHistory.record).toHaveBeenCalledWith(
      expectObjectContaining({ type: 'OCR_PROCESSING_STARTED' }),
    );
  });

  it('records failed processing state, error artifacts, and rethrows', async () => {
    const prisma = createPrisma();
    prisma.document.update
      .mockResolvedValueOnce(runningDocument)
      .mockResolvedValueOnce(failedDocument);
    const storage = {
      writeErrorArtifact: jest.fn().mockResolvedValue({
        relativePath: 'documents/document-id/errors/error.txt',
        size: 42,
        checksum: 'checksum',
      }),
    };
    const ocrProcessing = {
      processDocument: jest.fn().mockRejectedValue(new Error('ocr failed')),
    };
    const notifications = { publish: jest.fn() };
    const realtimeEvents = { documentChanged: jest.fn() };
    const documentHistory = { record: jest.fn() };
    const consumer = new DocumentProcessingConsumer(
      prisma as never,
      storage as never,
      ocrProcessing as never,
      realtimeEvents as never,
      notifications as never,
      documentHistory as never,
    );

    await expect(consumer.process(job())).rejects.toThrow('ocr failed');

    expect(storage.writeErrorArtifact).toHaveBeenCalledWith(
      'document-id',
      expectStringContaining('ocr failed'),
    );
    expect(prisma.fileArtifact.create).toHaveBeenCalledWith({
      data: expectObjectContaining({
        documentId: 'document-id',
        artifactType: 'ERROR_ARTIFACT',
        checksum: 'checksum',
      }),
    });
    expect(prisma.processingJob.update).toHaveBeenLastCalledWith({
      where: { id: 'processing-job-id' },
      data: expectObjectContaining({
        status: 'FAILED',
        progress: 100,
        errorCode: 'PROCESSING_FAILED',
        errorMessage: 'ocr failed',
      }),
    });
    expect(prisma.document.update).toHaveBeenLastCalledWith({
      where: { id: 'document-id' },
      data: { status: 'FAILED', failedReason: 'ocr failed' },
      select: expectAny(Object),
    });
    expect(notifications.publish).toHaveBeenLastCalledWith(
      expectObjectContaining({ type: 'processing.failed', severity: 'error' }),
    );
    expect(realtimeEvents.documentChanged).toHaveBeenLastCalledWith(
      expectObjectContaining({ reason: 'PROCESSING_FAILED' }),
    );
    expect(documentHistory.record).toHaveBeenLastCalledWith(
      expectObjectContaining({ type: 'DOCUMENT_PROCESSING_FAILED' }),
    );
  });
});

function createPrisma() {
  return {
    processingJob: {
      update: jest.fn().mockResolvedValue({}),
    },
    document: {
      update: jest.fn().mockResolvedValue(runningDocument),
    },
    fileArtifact: {
      create: jest.fn().mockResolvedValue({}),
    },
  };
}

function job() {
  return {
    attemptsMade: 1,
    data: {
      documentId: 'document-id',
      processingJobId: 'processing-job-id',
      processingOptions: { rotationDegrees: 180, forceOcr: true },
    },
  } as never;
}
