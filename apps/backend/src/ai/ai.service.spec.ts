import { expectObjectContaining, mockArg } from '../testing/expect-matchers';
import { AiService } from './ai.service';

const documentId = '018f1a44-9093-7f55-a515-278f4d9bd99f';
const tenantId = '018f1a44-9093-7f55-a515-278f4d9bd900';

interface DocumentFindUniqueInput {
  select?: {
    documentDate?: boolean;
    tenantId?: boolean;
    title?: boolean;
    titleSource?: boolean;
  };
}

interface DocumentUpdateInput {
  data: Record<string, unknown>;
}

function createService(
  existingDocumentDate: Date | null = null,
  coreMetadata: {
    readonly title: string | null;
    readonly titleSource: 'AI_EXTRACTED' | 'MANUAL';
    readonly documentTypeId: string | null;
    readonly documentTypeSource: 'AI_EXTRACTED' | 'MANUAL';
    readonly documentDate: Date | null;
    readonly documentDateSource: 'AI_EXTRACTED' | 'MANUAL';
    readonly sender: string | null;
    readonly senderSource: 'AI_EXTRACTED' | 'MANUAL';
  } | null = null,
) {
  const tx = {
    document: {
      update: jest.fn().mockResolvedValue({}),
    },
    documentPayment: {
      findMany: jest.fn().mockResolvedValue([]),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
      create: jest
        .fn()
        .mockResolvedValue({ id: '018f1a44-9093-7f55-a515-278f4d9bd901' }),
    },
    documentCalendarEvent: {
      create: jest.fn().mockResolvedValue({}),
    },
    documentReference: {
      findMany: jest.fn().mockResolvedValue([]),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    documentTag: {
      findMany: jest.fn().mockResolvedValue([]),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      create: jest.fn().mockResolvedValue({}),
    },
    tag: {
      upsert: jest.fn(),
    },
  };
  const prisma = {
    document: {
      findUnique: jest
        .fn()
        .mockImplementation(({ select }: DocumentFindUniqueInput) => {
          if (select?.titleSource) {
            return Promise.resolve(
              coreMetadata ?? {
                title: 'Document',
                titleSource: 'AI_EXTRACTED',
                documentTypeId: null,
                documentTypeSource: 'AI_EXTRACTED',
                documentDate: existingDocumentDate,
                documentDateSource: 'AI_EXTRACTED',
                sender: null,
                senderSource: 'AI_EXTRACTED',
              },
            );
          }
          if (select?.documentDate) {
            return Promise.resolve({ documentDate: existingDocumentDate });
          }
          if (select?.tenantId && !select?.title) {
            return Promise.resolve({ tenantId });
          }

          return Promise.resolve({
            title: 'Document',
            tenantId,
            status: 'READY',
          });
        }),
    },
    documentType: {
      findFirst: jest.fn(),
    },
    documentFieldDefinition: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    $transaction: jest.fn(
      <TResult>(callback: (transaction: typeof tx) => TResult) => callback(tx),
    ),
  };
  const calendarService = {
    replaceAiExtractedEvents: jest.fn().mockResolvedValue(undefined),
  };
  const documentHistory = {
    record: jest.fn().mockResolvedValue(undefined),
  };
  const notifications = {
    publish: jest.fn().mockResolvedValue(undefined),
  };
  const service = new AiService(
    calendarService as never,
    prisma as never,
    notifications as never,
    documentHistory as never,
  );

  return { calendarService, documentHistory, prisma, service, tx };
}

describe('AiService', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('resolves relative calendar days and weeks from extracted document date', async () => {
    const { calendarService, documentHistory, service } = createService();

    await service.applyMetadataExtractionResult(documentId, {
      summary: 'Document with relative deadlines',
      documentDate: '2026-05-09T00:00:00.000Z',
      calendarEvents: [
        {
          kind: 'DEADLINE',
          title: 'Response deadline',
          relativeDate: {
            amount: 14,
            unit: 'DAYS',
            anchor: 'DOCUMENT_DATE',
          },
        },
        {
          kind: 'DUE_DATE',
          title: 'Payment deadline',
          relativeDate: {
            amount: 3,
            unit: 'WEEKS',
            anchor: 'DOCUMENT_DATE',
          },
        },
        {
          kind: 'DEADLINE',
          title: 'Amended complaint',
          description: 'Amended complaint dated 8 July 2025',
          sourceText:
            'The presiding judge hands the amended complaint dated 8 July 2025 to counsel for the defendant.',
        },
      ],
    });

    expect(calendarService.replaceAiExtractedEvents).toHaveBeenCalledWith(
      documentId,
      [
        {
          kind: 'DEADLINE',
          title: 'Response deadline',
          date: '2026-05-23',
        },
        {
          kind: 'DUE_DATE',
          title: 'Payment deadline',
          date: '2026-05-30',
        },
      ],
      [],
    );
    expect(documentHistory.record).toHaveBeenCalledWith(
      expectObjectContaining({
        metadata: expectObjectContaining({ calendarEventCount: 2 }),
      }),
    );
  });

  it('uses the existing document date when the extraction result has no document date', async () => {
    const { calendarService, service } = createService(
      new Date('2026-05-09T00:00:00.000Z'),
    );

    await service.applyMetadataExtractionResult(documentId, {
      summary: 'Document with a relative deadline',
      calendarEvents: [
        {
          kind: 'DEADLINE',
          title: 'Response deadline',
          relativeDate: {
            amount: 14,
            unit: 'DAYS',
            anchor: 'DOCUMENT_DATE',
          },
        },
      ],
    });

    expect(calendarService.replaceAiExtractedEvents).toHaveBeenCalledWith(
      documentId,
      [
        {
          kind: 'DEADLINE',
          title: 'Response deadline',
          date: '2026-05-23',
        },
      ],
      [],
    );
  });

  it('normalizes mixed localized document date times before validation', async () => {
    const { calendarService, service } = createService();

    await service.applyMetadataExtractionResult(documentId, {
      summary: 'Document with a mixed-format document date',
      documentDate: '26.04.2026T00:00:00.000Z',
      calendarEvents: [
        {
          kind: 'DEADLINE',
          title: 'Response deadline',
          relativeDate: {
            amount: 3,
            unit: 'WEEKS',
            anchor: 'DOCUMENT_DATE',
          },
        },
      ],
    });

    expect(calendarService.replaceAiExtractedEvents).toHaveBeenCalledWith(
      documentId,
      [
        {
          kind: 'DEADLINE',
          title: 'Response deadline',
          date: '2026-05-17',
        },
      ],
      [],
    );
  });

  it('omits relative calendar events when no document date is available', async () => {
    const { calendarService, documentHistory, service } = createService();

    await service.applyMetadataExtractionResult(documentId, {
      summary: 'Document with an unresolved relative deadline',
      calendarEvents: [
        {
          kind: 'DEADLINE',
          title: 'Response deadline',
          relativeDate: {
            amount: 14,
            unit: 'DAYS',
            anchor: 'DOCUMENT_DATE',
          },
        },
      ],
    });

    expect(calendarService.replaceAiExtractedEvents).toHaveBeenCalledWith(
      documentId,
      [],
      [],
    );
    expect(documentHistory.record).toHaveBeenCalledWith(
      expectObjectContaining({
        metadata: expectObjectContaining({ calendarEventCount: 0 }),
      }),
    );
  });

  it('clears previous AI calendar events when extraction returns none', async () => {
    const { calendarService, documentHistory, service } = createService();

    await service.applyMetadataExtractionResult(documentId, {
      summary: 'Document without extracted calendar events',
    });

    expect(calendarService.replaceAiExtractedEvents).toHaveBeenCalledWith(
      documentId,
      [],
      [],
    );
    expect(documentHistory.record).toHaveBeenCalledWith(
      expectObjectContaining({
        metadata: expectObjectContaining({ calendarEventCount: 0 }),
      }),
    );
  });

  it('keeps only upcoming or calendar events up to six months old', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-06-01T12:00:00.000Z'));
    const { calendarService, service } = createService();

    await service.applyMetadataExtractionResult(documentId, {
      summary: 'Document with stale and current calendar events',
      documentDate: '2026-03-25T00:00:00.000Z',
      calendarEvents: [
        {
          kind: 'DEADLINE',
          title: 'Too old deadline',
          date: '2025-11-30',
        },
        {
          kind: 'DEADLINE',
          title: 'Cutoff deadline',
          date: '2025-12-01',
        },
        {
          kind: 'APPOINTMENT',
          title: 'Future appointment',
          date: '2026-06-15',
        },
        {
          kind: 'DUE_DATE',
          title: 'Recent relative due date',
          relativeDate: {
            amount: 14,
            unit: 'DAYS',
            anchor: 'DOCUMENT_DATE',
          },
        },
      ],
    });

    expect(calendarService.replaceAiExtractedEvents).toHaveBeenCalledWith(
      documentId,
      [
        {
          kind: 'DEADLINE',
          title: 'Cutoff deadline',
          date: '2025-12-01',
        },
        {
          kind: 'APPOINTMENT',
          title: 'Future appointment',
          date: '2026-06-15',
        },
        {
          kind: 'DUE_DATE',
          title: 'Recent relative due date',
          date: '2026-04-08',
        },
      ],
      [],
    );
  });

  it('drops extracted payment schedule rows before persisting payments', async () => {
    const { service, tx } = createService();

    await service.applyMetadataExtractionResult(documentId, {
      summary: 'Loan contract with repayment schedule and a current fee',
      payments: [
        {
          recipient: 'Example Bank AG',
          purpose: 'Rate 01.07.2026',
          amount: 370,
          currency: 'EUR',
        },
        {
          recipient: 'Example Bank AG',
          purpose: 'Rate 01.08.2026',
          amount: 370,
          currency: 'EUR',
        },
        {
          recipient: 'Example Bank AG',
          purpose: 'Rate 01.09.2026',
          amount: 370,
          currency: 'EUR',
        },
        {
          recipient: 'Example Bank AG',
          purpose: 'Rate 01.10.2026',
          amount: 370,
          currency: 'EUR',
        },
        {
          recipient: 'Example Bank AG',
          purpose: 'Processing fee',
          amount: 42,
          currency: 'EUR',
        },
      ],
    });

    expect(tx.documentPayment.deleteMany).toHaveBeenCalledWith({
      where: { documentId, source: 'AI_EXTRACTED' },
    });
    expect(tx.documentPayment.createMany).toHaveBeenCalledWith({
      data: [
        {
          documentId,
          iban: null,
          recipient: 'Example Bank AG',
          purpose: 'Processing fee',
          amount: 42,
          currency: 'EUR',
          source: 'AI_EXTRACTED',
          displayOrder: 0,
        },
      ],
    });
  });

  it('creates linked due-date calendar events for extracted payment due dates', async () => {
    const { calendarService, service, tx } = createService();

    await service.applyMetadataExtractionResult(documentId, {
      summary: 'Invoice with payment due date',
      payments: [
        {
          recipient: 'Sender GmbH',
          purpose: 'R-100',
          amount: 120.5,
          currency: 'EUR',
          dueDate: '2026-05-29',
          dueDateSourceText: 'payable by 29 May 2026',
        },
      ],
      calendarEvents: [
        {
          kind: 'DUE_DATE',
          title: 'Payment due',
          date: '2026-05-29',
          sourceText: 'payable by 29 May 2026',
        },
      ],
    });

    expect(tx.documentPayment.create).toHaveBeenCalledWith(
      expectObjectContaining({
        data: expectObjectContaining({
          documentId,
          recipient: 'Sender GmbH',
          amount: 120.5,
        }),
      }),
    );
    expect(tx.documentCalendarEvent.create).toHaveBeenCalledWith({
      data: expectObjectContaining({
        documentId,
        paymentId: '018f1a44-9093-7f55-a515-278f4d9bd901',
        kind: 'DUE_DATE',
        date: new Date('2026-05-29T00:00:00.000Z'),
        sourceText: 'payable by 29 May 2026',
      }),
    });
    expect(calendarService.replaceAiExtractedEvents).toHaveBeenCalledWith(
      documentId,
      [],
      [{ date: '2026-05-29', sourceText: 'payable by 29 May 2026' }],
    );
  });

  it('uses the extracted calendar title for a matching payment due date', async () => {
    const { calendarService, service, tx } = createService();

    await service.applyMetadataExtractionResult(documentId, {
      summary: 'Fee notice with payment due date',
      payments: [
        {
          recipient: 'Authority',
          purpose: 'Fees',
          amount: 80,
          currency: 'EUR',
          dueDate: '2027-01-02',
          dueDateSourceText: 'by 2 January 2027',
        },
      ],
      calendarEvents: [
        {
          kind: 'DUE_DATE',
          title: 'Fee payment',
          date: '2027-01-02',
          sourceText: 'Pay the fees by 2 January 2027',
        },
      ],
    });

    expect(tx.documentCalendarEvent.create).toHaveBeenCalledWith({
      data: expectObjectContaining({
        documentId,
        paymentId: '018f1a44-9093-7f55-a515-278f4d9bd901',
        kind: 'DUE_DATE',
        title: 'Fee payment',
        description: 'Fees',
        date: new Date('2027-01-02T00:00:00.000Z'),
        sourceText: 'Pay the fees by 2 January 2027',
      }),
    });
    expect(calendarService.replaceAiExtractedEvents).toHaveBeenCalledWith(
      documentId,
      [],
      [
        {
          date: '2027-01-02',
          sourceText: 'Pay the fees by 2 January 2027',
        },
      ],
    );
  });

  it('persists extracted invoice IBAN and payment purpose', async () => {
    const { service, tx } = createService();

    await service.applyMetadataExtractionResult(documentId, {
      summary: 'Invoice with payment details',
      payments: [
        {
          iban: 'DE02120300000000202051',
          recipient: 'Example GmbH',
          purpose: 'Invoice R-100 customer K-42',
          amount: 119.9,
          currency: 'EUR',
        },
      ],
    });

    expect(tx.documentPayment.createMany).toHaveBeenCalledWith({
      data: [
        {
          documentId,
          iban: 'DE02120300000000202051',
          recipient: 'Example GmbH',
          purpose: 'Invoice R-100 customer K-42',
          amount: 119.9,
          currency: 'EUR',
          source: 'AI_EXTRACTED',
          displayOrder: 0,
        },
      ],
    });
  });

  it('uses a unique invoice reference as payment purpose when no explicit purpose was extracted', async () => {
    const { service, tx } = createService();

    await service.applyMetadataExtractionResult(documentId, {
      summary: 'Invoice with a payment and invoice number',
      payments: [
        {
          iban: 'DE02120300000000202051',
          recipient: 'Example GmbH',
          amount: 119.9,
          currency: 'EUR',
        },
      ],
      references: [
        {
          referenceNumber: 'R-100',
          referenceType: 'Invoice',
        },
      ],
    });

    expect(tx.documentPayment.createMany).toHaveBeenCalledWith({
      data: [
        {
          documentId,
          iban: 'DE02120300000000202051',
          recipient: 'Example GmbH',
          purpose: 'R-100',
          amount: 119.9,
          currency: 'EUR',
          source: 'AI_EXTRACTED',
          displayOrder: 0,
        },
      ],
    });
  });

  it('keeps an explicit payment purpose instead of replacing it with an invoice reference', async () => {
    const { service, tx } = createService();

    await service.applyMetadataExtractionResult(documentId, {
      summary: 'Invoice with a payment purpose',
      payments: [
        {
          recipient: 'Example GmbH',
          purpose: 'Customer K-42',
          amount: 119.9,
          currency: 'EUR',
        },
      ],
      references: [
        {
          referenceNumber: 'R-100',
          referenceType: 'Invoice number',
        },
      ],
    });

    expect(tx.documentPayment.createMany).toHaveBeenCalledWith({
      data: [
        {
          documentId,
          iban: null,
          recipient: 'Example GmbH',
          purpose: 'Customer K-42',
          amount: 119.9,
          currency: 'EUR',
          source: 'AI_EXTRACTED',
          displayOrder: 0,
        },
      ],
    });
  });

  it('does not use an invoice reference as payment purpose when multiple invoice references exist', async () => {
    const { service, tx } = createService();

    await service.applyMetadataExtractionResult(documentId, {
      summary: 'Invoice with multiple invoice references',
      payments: [
        {
          recipient: 'Example GmbH',
          amount: 119.9,
          currency: 'EUR',
        },
      ],
      references: [
        {
          referenceNumber: 'R-100',
          referenceType: 'Invoice number',
        },
        {
          referenceNumber: 'R-101',
          referenceType: 'Invoice number',
        },
      ],
    });

    expect(tx.documentPayment.createMany).toHaveBeenCalledWith({
      data: [
        {
          documentId,
          iban: null,
          recipient: 'Example GmbH',
          purpose: null,
          amount: 119.9,
          currency: 'EUR',
          source: 'AI_EXTRACTED',
          displayOrder: 0,
        },
      ],
    });
  });

  it('replaces only AI-owned extracted entries and avoids manual duplicates', async () => {
    const { service, tx } = createService();
    tx.documentPayment.findMany.mockResolvedValue([
      {
        iban: null,
        recipient: 'Manual recipient',
        purpose: null,
        amount: { toFixed: () => '80' },
        currency: 'EUR',
      },
    ]);
    tx.documentReference.findMany.mockResolvedValue([
      {
        referenceNumber: 'MAN-1',
        referenceType: 'Manual',
      },
    ]);
    tx.documentTag.findMany.mockResolvedValue([
      {
        source: 'MANUAL',
        tag: { name: 'manual' },
      },
    ]);
    tx.tag.upsert.mockResolvedValue({ id: 'tag-ai' });

    await service.applyMetadataExtractionResult(documentId, {
      summary: 'Document with mixed ownership entries',
      payments: [
        {
          recipient: 'Manual recipient',
          amount: 80,
          currency: 'EUR',
        },
        {
          recipient: 'AI recipient',
          amount: 42,
          currency: 'EUR',
        },
      ],
      references: [
        {
          referenceNumber: 'MAN-1',
          referenceType: 'Manual',
        },
        {
          referenceNumber: 'AI-1',
          referenceType: 'AI',
        },
      ],
      tags: ['manual', 'ai'],
    });

    expect(tx.documentPayment.deleteMany).toHaveBeenCalledWith({
      where: { documentId, source: 'AI_EXTRACTED' },
    });
    expect(tx.documentPayment.createMany).toHaveBeenCalledWith({
      data: [
        {
          documentId,
          iban: null,
          recipient: 'AI recipient',
          purpose: null,
          amount: 42,
          currency: 'EUR',
          source: 'AI_EXTRACTED',
          displayOrder: 0,
        },
      ],
    });
    expect(tx.documentReference.deleteMany).toHaveBeenCalledWith({
      where: { documentId, source: 'AI_EXTRACTED' },
    });
    expect(tx.documentReference.createMany).toHaveBeenCalledWith({
      data: [
        {
          documentId,
          referenceNumber: 'AI-1',
          referenceType: 'AI',
          source: 'AI_EXTRACTED',
          displayOrder: 0,
        },
      ],
    });
    expect(tx.documentTag.deleteMany).toHaveBeenCalledWith({
      where: { documentId, source: 'AI_EXTRACTED' },
    });
    expect(tx.tag.upsert).toHaveBeenCalledWith({
      where: { tenantId_name: { tenantId, name: 'ai' } },
      create: { tenantId, name: 'ai' },
      update: {},
    });
    expect(tx.documentTag.create).toHaveBeenCalledWith({
      data: {
        documentId,
        tagId: 'tag-ai',
        source: 'AI_EXTRACTED',
      },
    });
  });

  it('does not overwrite manually owned core metadata unless the value was cleared', async () => {
    const { service, tx } = createService(null, {
      title: 'Manual title',
      titleSource: 'MANUAL',
      documentTypeId: 'manual-type',
      documentTypeSource: 'MANUAL',
      documentDate: new Date('2026-05-07T00:00:00.000Z'),
      documentDateSource: 'MANUAL',
      sender: null,
      senderSource: 'MANUAL',
    });

    await service.applyMetadataExtractionResult(documentId, {
      title: 'AI title',
      sender: 'AI Sender',
      documentDate: '2026-06-01T00:00:00.000Z',
    });

    expect(tx.document.update).toHaveBeenCalledWith(
      expectObjectContaining({
        data: expectObjectContaining({
          sender: 'AI Sender',
          senderSource: 'AI_EXTRACTED',
        }),
      }),
    );
    const updateInput = mockArg<DocumentUpdateInput>(tx.document.update);
    expect(updateInput.data).not.toHaveProperty('title');
    expect(updateInput.data).not.toHaveProperty('documentDate');
  });
});
