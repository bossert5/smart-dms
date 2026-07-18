import {
  expectArrayContaining,
  expectObjectContaining,
} from '../testing/expect-matchers';
import { ConflictException, ServiceUnavailableException } from '@nestjs/common';
import type { AiMetadataExtractionJobPayload } from '@smart-dms/shared-dto';
import { AiMetadataPromptBuilder } from './ai-metadata-prompt.builder';
import {
  AiProcessingService,
  activeJobProgress,
  chunkOcrText,
} from './ai-processing.service';

const documentId = '018f1a44-9093-7f55-a515-278f4d9bd99f';
const userId = '018f1a44-9093-7f55-a515-278f4d9bd991';

function eligibleProvider() {
  return {
    id: '018f1a44-9093-7f55-a515-278f4d9bd992',
    name: 'Local Ollama',
    type: 'OPENAI_COMPATIBLE',
    isActive: true,
    status: 'AVAILABLE',
    selectedModel: 'llama3.2',
    priority: 1,
  };
}

function createService() {
  const tx = {
    aiProvider: {
      findMany: jest.fn().mockResolvedValue([eligibleProvider()]),
    },
    systemSetting: {
      findUnique: jest.fn().mockResolvedValue({
        value: 'DOCUMENT_LANGUAGE',
      }),
    },
    processingJob: {
      findFirst: jest.fn().mockResolvedValue(null),
      findUnique: jest.fn().mockResolvedValue({
        id: '018f1a44-9093-7f55-a515-278f4d9bd990',
        createdAt: new Date('2026-06-13T12:00:00.000Z'),
        status: 'WAITING',
      }),
      count: jest.fn().mockResolvedValue(0),
      findMany: jest
        .fn()
        .mockResolvedValue([{ id: '018f1a44-9093-7f55-a515-278f4d9bd990' }]),
      create: jest.fn().mockResolvedValue({
        id: '018f1a44-9093-7f55-a515-278f4d9bd990',
      }),
      update: jest.fn().mockResolvedValue({}),
    },
    document: {
      findUnique: jest.fn().mockResolvedValue({
        acceptedAt: null,
        tenantId: '018f1a44-9093-7f55-a515-278f4d9bd900',
        status: 'READY',
        ocrLanguage: 'german',
      }),
      findMany: jest.fn().mockResolvedValue([
        {
          id: documentId,
          tenantId: '018f1a44-9093-7f55-a515-278f4d9bd900',
          ocrLanguage: 'german',
        },
      ]),
      update: jest.fn().mockResolvedValue({}),
    },
    editLock: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
  };
  const prisma = {
    aiProvider: {
      findMany: jest.fn().mockResolvedValue([eligibleProvider()]),
    },
    document: {
      findUnique: jest.fn().mockResolvedValue({
        id: documentId,
        title: 'Invoice',
        status: 'READY',
        ocrLanguage: 'german',
        ocrText: 'OCR text',
      }),
    },
    processingJob: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
    $transaction: jest.fn(
      <TResult>(callback: (transaction: typeof tx) => TResult) => callback(tx),
    ),
  };
  const documentHistory = {
    record: jest.fn().mockResolvedValue(undefined),
  };
  const notifications = {
    publish: jest.fn().mockResolvedValue(undefined),
  };
  const aiService = {
    applyMetadataExtractionResult: jest.fn().mockResolvedValue(undefined),
  };
  const aiProviderRouter = {
    hasAvailableProvider: jest.fn().mockResolvedValue(true),
    promptRunner: jest.fn(() =>
      jest.fn().mockResolvedValue({ title: 'Invoice' }),
    ),
  };
  const service = new AiProcessingService(
    prisma as never,
    documentHistory as never,
    notifications as never,
    aiService as never,
    aiProviderRouter as never,
  );

  return {
    aiProviderRouter,
    aiService,
    documentHistory,
    notifications,
    prisma,
    service,
    tx,
  };
}

function metadataPayloadTx() {
  return {
    documentType: {
      findMany: jest
        .fn()
        .mockResolvedValue([{ key: 'invoice', name: 'Invoice' }]),
    },
    documentFieldDefinition: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    aiMetadataPrompt: {
      findMany: jest.fn().mockResolvedValue([
        {
          key: 'TITLE',
          label: 'Title',
          description: 'Title prompt',
          promptText: 'Extract a concise title.',
          displayOrder: 10,
        },
      ]),
    },
  };
}

describe('AiProcessingService', () => {
  it('keeps active job progress below completion', () => {
    expect(activeJobProgress(110)).toBe(99);
    expect(activeJobProgress(85.4)).toBe(85);
    expect(activeJobProgress(-10)).toBe(0);
    expect(activeJobProgress(Number.NaN)).toBe(0);
  });

  it('queues automatic AI extraction after OCR when a provider is available', async () => {
    const { documentHistory, service, tx } = createService();

    const result = await service.createAutomaticMetadataJobAfterOcr(
      tx as never,
      documentId,
      'OCR text',
    );

    expect(result.status).toBe('AI_PENDING');
    expect(tx.processingJob.create).toHaveBeenCalledWith({
      data: {
        documentId,
        jobType: 'EXTRACT_AI_METADATA',
        status: 'WAITING',
        payload: {
          aiMetadataLanguage: 'german',
        },
      },
    });
    expect(documentHistory.record).toHaveBeenCalledWith(
      expectObjectContaining({
        documentId,
        type: 'DOCUMENT_PROCESSING_QUEUED',
      }),
      tx,
    );
  });

  it('snapshots configured AI metadata language in queued jobs', async () => {
    const { service, tx } = createService();
    tx.systemSetting.findUnique.mockResolvedValue({ value: 'eng' });

    await service.createAutomaticMetadataJobAfterOcr(
      tx as never,
      documentId,
      'OCR text',
    );

    expect(tx.processingJob.create).toHaveBeenCalledWith({
      data: {
        documentId,
        jobType: 'EXTRACT_AI_METADATA',
        status: 'WAITING',
        payload: {
          aiMetadataLanguage: 'eng',
        },
      },
    });
  });

  it('leaves OCR-complete documents ready when no provider is available', async () => {
    const { service, tx } = createService();
    tx.aiProvider.findMany.mockResolvedValue([]);

    const result = await service.createAutomaticMetadataJobAfterOcr(
      tx as never,
      documentId,
      'OCR text',
    );

    expect(result.status).toBe('READY');
    expect(tx.processingJob.create).not.toHaveBeenCalled();
  });

  it('leaves OCR-complete documents ready when no provider has a selected model', async () => {
    const { service, tx } = createService();
    tx.aiProvider.findMany.mockResolvedValue([]);

    const result = await service.createAutomaticMetadataJobAfterOcr(
      tx as never,
      documentId,
      'OCR text',
    );

    expect(result.status).toBe('READY');
    expect(tx.processingJob.create).not.toHaveBeenCalled();
  });

  it('rejects manual AI starts when no provider is available', async () => {
    const { aiProviderRouter, service } = createService();
    aiProviderRouter.hasAvailableProvider.mockResolvedValue(false);

    await expect(
      service.triggerDocumentAiExtraction(documentId, userId),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('locks documents while AI is pending or running', () => {
    const { service } = createService();

    expect(() => service.assertDocumentIsNotAiRunning('AI_PENDING')).toThrow(
      ConflictException,
    );
    expect(() => service.assertDocumentIsNotAiRunning('AI_RUNNING')).toThrow(
      ConflictException,
    );
    expect(() => service.assertDocumentIsNotAiRunning('READY')).not.toThrow();
  });

  it('requeues interrupted active metadata jobs', async () => {
    const { documentHistory, service, tx } = createService();
    const jobId = '018f1a44-9093-7f55-a515-278f4d9bd990';
    const tenantId = '018f1a44-9093-7f55-a515-278f4d9bd900';
    tx.processingJob.findMany.mockResolvedValueOnce([
      {
        id: jobId,
        document: {
          id: documentId,
          tenantId,
          title: null,
          originalFileName: 'invoice.pdf',
        },
      },
    ]);
    tx.document.update.mockResolvedValueOnce({
      id: documentId,
      tenantId,
      title: null,
      originalFileName: 'invoice.pdf',
      status: 'AI_PENDING',
    });

    const result = await service.requeueInterruptedMetadataJobs();

    expect(result).toEqual([
      {
        jobId,
        documentId,
        tenantId,
        documentTitle: 'invoice.pdf',
        status: 'AI_PENDING',
      },
    ]);
    expect(tx.processingJob.findMany).toHaveBeenCalledWith({
      where: {
        jobType: 'EXTRACT_AI_METADATA',
        status: 'ACTIVE',
      },
      select: {
        id: true,
        document: {
          select: {
            id: true,
            tenantId: true,
            title: true,
            originalFileName: true,
          },
        },
      },
      orderBy: [{ startedAt: 'asc' }, { createdAt: 'asc' }],
    });
    expect(tx.processingJob.update).toHaveBeenCalledWith({
      where: { id: jobId },
      data: {
        status: 'WAITING',
        assignedAiProviderId: null,
        startedAt: null,
        finishedAt: null,
        progress: 0,
        errorCode: null,
        errorMessage: null,
      },
    });
    expect(tx.document.update).toHaveBeenCalledWith({
      where: { id: documentId },
      data: {
        status: 'AI_PENDING',
        failedReason: null,
      },
      select: {
        id: true,
        tenantId: true,
        title: true,
        originalFileName: true,
        status: true,
      },
    });
    expect(documentHistory.record).toHaveBeenCalledWith(
      expectObjectContaining({
        documentId,
        type: 'DOCUMENT_PROCESSING_QUEUED',
        metadata: expectObjectContaining({
          jobId,
          requeuedAfterInterruption: true,
          status: 'AI_PENDING',
        }),
      }),
      tx,
    );
  });

  it('does not claim a metadata job while the provider already has an active AI job', async () => {
    const { service, tx } = createService();
    tx.processingJob.findMany.mockResolvedValueOnce([
      { assignedAiProviderId: eligibleProvider().id },
    ]);

    const result = await service.claimNextMetadataJob();

    expect(result).toBeNull();
    expect(tx.processingJob.findMany).toHaveBeenCalledWith({
      where: {
        assignedAiProviderId: { not: null },
        jobType: 'EXTRACT_AI_METADATA',
        status: 'ACTIVE',
      },
      select: { assignedAiProviderId: true },
    });
    expect(tx.processingJob.findFirst).not.toHaveBeenCalled();
  });

  it('bulk-queues unprocessed ready documents', async () => {
    const { service, tx } = createService();

    const result = await service.triggerBulkAiExtraction(userId);

    expect(result.queuedCount).toBe(1);
    expect(result.queuedDocuments).toEqual([
      {
        documentId,
        tenantId: '018f1a44-9093-7f55-a515-278f4d9bd900',
        jobId: '018f1a44-9093-7f55-a515-278f4d9bd990',
        status: 'AI_PENDING',
        queuePosition: 1,
      },
    ]);
    expect(tx.document.findMany).toHaveBeenCalledWith(
      expectObjectContaining({
        where: expectObjectContaining({
          status: 'READY',
          aiProcessedAt: null,
        }),
      }),
    );
    expect(tx.document.update).toHaveBeenCalledWith({
      where: { id: documentId },
      data: {
        status: 'AI_PENDING',
        failedReason: null,
      },
    });
    expect(tx.processingJob.count).toHaveBeenCalledWith({
      where: {
        jobType: 'EXTRACT_AI_METADATA',
        status: 'ACTIVE',
      },
    });
    expect(tx.processingJob.count).toHaveBeenCalledWith({
      where: {
        jobType: 'EXTRACT_AI_METADATA',
        status: 'WAITING',
        OR: [
          { createdAt: { lt: new Date('2026-06-13T12:00:00.000Z') } },
          {
            createdAt: new Date('2026-06-13T12:00:00.000Z'),
            id: { lt: '018f1a44-9093-7f55-a515-278f4d9bd990' },
          },
        ],
      },
    });
  });

  it('renders backend prompts into metadata job payloads', async () => {
    const { service } = createService();
    const tx = {
      documentType: {
        findMany: jest.fn().mockResolvedValue([
          { key: 'invoice', name: 'Invoice' },
          { key: 'custom_contract', name: 'Custom contract' },
          { key: 'other', name: 'Other' },
        ]),
      },
      documentFieldDefinition: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { key: 'costCenter', label: 'Cost center', valueType: 'TEXT' },
          ]),
      },
      aiMetadataPrompt: {
        findMany: jest.fn().mockResolvedValue([
          {
            key: 'TITLE',
            label: 'Title',
            description: 'Title prompt',
            promptText: 'Extract a concise title.',
            displayOrder: 10,
          },
          {
            key: 'DOCUMENT_TYPE',
            label: 'Document type',
            description: 'Document type prompt',
            promptText: 'Choose one document type.',
            displayOrder: 20,
          },
          {
            key: 'ATTRIBUTES',
            label: 'Attributes',
            description: 'Attributes prompt',
            promptText: 'Extract configured attributes.',
            displayOrder: 30,
          },
        ]),
      },
    };
    const document = {
      id: documentId,
      title: 'Invoice',
      originalFileName: 'invoice.pdf',
      documentDate: null,
      ocrLanguage: 'german',
      sender: null,
      recipient: null,
      ocrText: 'Invoice R-100',
      extractedMarkdown: null,
    };
    const serviceWithPrivate = service as unknown as {
      metadataPayload: (
        tx: unknown,
        document: unknown,
      ) => Promise<AiMetadataExtractionJobPayload>;
    };

    const payload = await serviceWithPrivate.metadataPayload(tx, document);

    expect(payload.metadata.ocrLanguage).toBe('german');
    expect(payload.prompts).toHaveLength(2);
    const [corePrompt, attributesPrompt] = payload.prompts;
    expect(corePrompt.key).toBe('CORE_METADATA');
    expect(attributesPrompt.key).toBe('ATTRIBUTES');
    expect(corePrompt.text).toContain('invoice');
    expect(corePrompt.text).toContain('custom_contract');
    expect(corePrompt.text).toContain('other');
    expect(corePrompt.text).toContain('Choose one document type.');
    expect(corePrompt.text).toContain(
      'If no category fits confidently, choose "other"',
    );
    expect(corePrompt.text).toContain('Extract a concise title.');
    expect(corePrompt.text).toContain('OCR-detected language: german');
    expect(corePrompt.text).toContain(
      'Generate human-readable metadata values in german',
    );
    expect(attributesPrompt.text).toContain('costCenter');
    expect(attributesPrompt.text).toContain('OCR-detected language: german');
    expect(corePrompt.text).toContain('Required final JSON schema');
    expect(attributesPrompt.text).toContain('Required final JSON schema');
    expect(corePrompt.text).toContain('Response format');
    expect(attributesPrompt.text).toContain('Response format');
    expect(corePrompt.text).not.toContain('private thinking channel');
    expect(attributesPrompt.text).toContain(
      'final visible answer after any thinking channel',
    );
    const mergePrompt = new AiMetadataPromptBuilder().buildMerge(payload, [
      { result: { title: 'Invoice' } },
    ]);
    expect(mergePrompt.text).toContain('Required final JSON schema');
    expect(mergePrompt.text).toContain('Response format');
    expect(mergePrompt.text).toContain('private thinking channel');
    expect(mergePrompt.text).toContain('OCR-detected language: german');
    expect(mergePrompt.text).toContain(
      'Generate human-readable metadata values in german',
    );
    expect(corePrompt.text).toContain('Invoice R-100');
    expect(attributesPrompt.text).toContain('Invoice R-100');
    expect(payload.sourceTextFormat).toBe('PLAIN_TEXT');
    expect(corePrompt.resultSchema).toEqual(
      expectObjectContaining({
        required: expectArrayContaining(['documentTypeKey']),
        properties: expectObjectContaining({
          documentTypeKey: {
            type: 'string',
            enum: ['invoice', 'custom_contract', 'other'],
          },
        }),
      }),
    );
    expect(attributesPrompt.resultSchema).toEqual(
      expectObjectContaining({
        required: expectArrayContaining(['attributes']),
        properties: expectObjectContaining({
          attributes: expectObjectContaining({
            maxItems: 50,
            items: expectObjectContaining({
              required: ['key', 'value', 'valueType'],
              properties: expectObjectContaining({
                key: { type: 'string', enum: ['costCenter'] },
              }),
            }),
          }),
        }),
      }),
    );
    expect(attributesPrompt.resultSchema.required).not.toContain('note');
    expect(
      Object.keys(
        (attributesPrompt.resultSchema.properties ?? {}) as Record<
          string,
          unknown
        >,
      ),
    ).not.toContain('note');
  });

  it('uses payment prompt guardrails', () => {
    const [paymentsPrompt] = new AiMetadataPromptBuilder().build({
      documentId,
      ocrText: 'Please pay 370.00 EUR in installments to TARGOBANK AG.',
      metadata: {
        title: 'Installment payment',
        originalFileName: 'payment.pdf',
        documentDate: null,
        ocrLanguage: 'german',
        sender: null,
        recipient: null,
      },
      documentTypes: [],
      fieldDefinitions: [],
      scopes: ['PAYMENTS'],
      promptTemplates: [],
    });

    expect(paymentsPrompt.key).toBe('PAYMENTS');
    expect(paymentsPrompt.text).toContain(
      'Extract `payments` from the full OCR text',
    );
    expect(paymentsPrompt.text).toContain(
      'A monetary amount alone is not a payment',
    );
    expect(paymentsPrompt.text).toContain(
      'For invoices with multiple line items but one payable total',
    );
    expect(paymentsPrompt.text).toContain(
      'not necessarily the document recipient',
    );
    expect(paymentsPrompt.text).toContain(
      'Do not use invoice date, document date, service date',
    );
    expect(paymentsPrompt.text).toContain(
      'Return `payments: []` when money is mentioned',
    );
    expect(paymentsPrompt.text).not.toContain('Do not extract payment plans');
    expect(paymentsPrompt.text).not.toContain(
      'never create one payment entry per installment',
    );
    expect(paymentsPrompt.resultSchema).toEqual(
      expectObjectContaining({
        required: ['payments'],
        properties: expectObjectContaining({
          payments: expectObjectContaining({
            items: expectObjectContaining({
              properties: expectObjectContaining({
                iban: {
                  anyOf: [{ type: 'string', maxLength: 80 }, { type: 'null' }],
                },
                amount: {
                  anyOf: [{ type: 'number' }, { type: 'null' }],
                },
              }),
            }),
          }),
        }),
      }),
    );
  });

  it('uses configured AI metadata target language while preserving OCR language', async () => {
    const { service } = createService();
    const tx = metadataPayloadTx();
    const document = {
      id: documentId,
      title: 'Invoice',
      originalFileName: 'invoice.pdf',
      documentDate: null,
      ocrLanguage: 'german',
      sender: null,
      recipient: null,
      ocrText: 'Invoice R-100',
      extractedMarkdown: null,
    };
    const serviceWithPrivate = service as unknown as {
      metadataPayload: (
        tx: unknown,
        document: unknown,
        options: { aiMetadataLanguage: string },
      ) => Promise<AiMetadataExtractionJobPayload>;
    };

    const payload = await serviceWithPrivate.metadataPayload(tx, document, {
      aiMetadataLanguage: 'eng',
    });

    expect(payload.metadata.ocrLanguage).toBe('german');
    expect(payload.metadata.aiMetadataLanguage).toBe('eng');
    expect(payload.prompts[0]?.text).toContain('OCR-detected language: german');
    expect(payload.prompts[0]?.text).toContain(
      'Generate human-readable metadata values in english',
    );
  });

  it('prefers extracted Markdown for metadata payloads', async () => {
    const { service } = createService();
    const tx = metadataPayloadTx();
    const serviceWithPrivate = service as unknown as {
      metadataPayload: (
        tx: unknown,
        document: unknown,
      ) => Promise<AiMetadataExtractionJobPayload>;
    };

    const payload = await serviceWithPrivate.metadataPayload(tx, {
      id: documentId,
      title: 'Invoice',
      originalFileName: 'invoice.pdf',
      documentDate: null,
      ocrLanguage: 'german',
      sender: null,
      recipient: null,
      ocrText: 'Plain OCR Invoice R-100',
      extractedMarkdown:
        '# Invoice\n\n| No. | Amount |\n| --- | --- |\n| R-100 | 42.00 EUR |',
    });

    expect(payload.ocrText).toContain('| No. | Amount |');
    expect(payload.ocrText).not.toContain('Plain OCR Invoice R-100');
    expect(payload.sourceTextFormat).toBe('MARKDOWN');
    expect(payload.prompts[0]?.text).toContain(
      'Markdown converted from the PDF',
    );
  });

  it('falls back to OCR text when extracted Markdown is empty', async () => {
    const { service } = createService();
    const tx = metadataPayloadTx();
    const serviceWithPrivate = service as unknown as {
      metadataPayload: (
        tx: unknown,
        document: unknown,
      ) => Promise<AiMetadataExtractionJobPayload>;
    };

    const payload = await serviceWithPrivate.metadataPayload(tx, {
      id: documentId,
      title: 'Invoice',
      originalFileName: 'invoice.pdf',
      documentDate: null,
      ocrLanguage: 'german',
      sender: null,
      recipient: null,
      ocrText: 'Plain OCR Invoice R-100',
      extractedMarkdown: '   ',
    });

    expect(payload.ocrText).toBe('Plain OCR Invoice R-100');
    expect(payload.sourceTextFormat).toBe('PLAIN_TEXT');
    expect(payload.prompts[0]?.text).toContain('plain OCR text');
  });

  it('uses calendar event prompt guardrails', () => {
    const [calendarPrompt] = new AiMetadataPromptBuilder().build({
      documentId,
      ocrText: 'Please respond by 30 June 2026.',
      metadata: {
        title: 'Deadline',
        originalFileName: 'deadline.pdf',
        documentDate: null,
        ocrLanguage: 'english',
        sender: null,
        recipient: null,
      },
      documentTypes: [],
      fieldDefinitions: [],
      scopes: ['CALENDAR_EVENTS'],
      promptTemplates: [],
    });

    expect(calendarPrompt.key).toBe('CALENDAR_EVENTS');
    expect(calendarPrompt.text).toContain(
      'Extract `calendarEvents` from the full OCR text.',
    );
    expect(calendarPrompt.text).toContain('ACTIONABLE_EVENT -> extract');
    expect(calendarPrompt.text).toContain('NON_EVENT_METADATA -> ignore');
    expect(calendarPrompt.text).toContain('wage/salary payout dates');
    expect(calendarPrompt.text).toContain('`Tarif 12.24`');
    expect(calendarPrompt.text).toContain('Never infer missing years');
    expect(calendarPrompt.text).toContain(
      'If a payment date is already represented as `payments.dueDate`',
    );
    expect(calendarPrompt.text).toContain(
      'If no actionable event exists, return `calendarEvents: []`',
    );
    expect(calendarPrompt.text).not.toContain(
      'Calendar event recency guardrails',
    );
    expect(calendarPrompt.text).not.toContain('not older than 8 weeks');
  });

  it('uses document date prompt guardrails', () => {
    const [documentDatePrompt] = new AiMetadataPromptBuilder().build({
      documentId,
      ocrText: 'Invoice date: 2 January 2026\nPayable by 16 January 2026.',
      metadata: {
        title: 'Invoice',
        originalFileName: 'invoice.pdf',
        documentDate: null,
        ocrLanguage: 'english',
        sender: null,
        recipient: null,
      },
      documentTypes: [],
      fieldDefinitions: [],
      scopes: ['DOCUMENT_DATE'],
      promptTemplates: [],
    });

    expect(documentDatePrompt.key).toBe('DOCUMENT_DATE');
    expect(documentDatePrompt.text).toContain(
      'Extract `documentDate` from the full OCR text.',
    );
    expect(documentDatePrompt.text).toContain('current document only');
    expect(documentDatePrompt.text).toContain('Do not use payment due dates');
    expect(documentDatePrompt.text).toContain(
      'Never combine localized source date formats with an ISO time component',
    );
    expect(documentDatePrompt.text).toContain(
      'Return `documentDate: null` when no reliable current-document date exists',
    );
  });

  it('runs the optimized prompt sequence and skips irrelevant automatic scopes', async () => {
    const { service } = createService();
    const evidenceExtractor = {
      extract: jest.fn().mockReturnValue({
        sourceText: 'Plain office document with general information.',
        dateCandidates: [],
        amountCandidates: [],
        paymentCandidates: [],
        partyCandidates: [],
        referenceCandidates: [],
        calendarCandidates: [],
        attributeCandidateSnippets: [],
      }),
    };
    (
      service as unknown as {
        evidenceExtractor: typeof evidenceExtractor;
      }
    ).evidenceExtractor = evidenceExtractor;
    const payload = {
      documentId,
      ocrText: 'Plain office document with general information.',
      sourceTextFormat: 'PLAIN_TEXT',
      metadata: {
        title: 'Invoice',
        originalFileName: 'invoice.pdf',
        documentDate: null,
        ocrLanguage: 'german',
        aiMetadataLanguage: 'eng',
        sender: null,
        recipient: null,
      },
      documentTypes: [],
      fieldDefinitions: [],
      prompts: [
        {
          key: 'CORE_METADATA',
          text: 'Core prompt',
          resultSchema: { type: 'object' },
        },
        {
          key: 'DOCUMENT_DATE',
          text: 'Date prompt',
          resultSchema: { type: 'object' },
        },
      ],
    } satisfies AiMetadataExtractionJobPayload;
    const calls: Array<{
      text: string;
      maxTokens: number;
      temperature: number;
      enableThinking: boolean;
      structuredOutputMode: string;
      logThinkingStream: boolean;
    }> = [];

    const result = await service.extractMetadataWithPromptRunner(
      payload,
      (input) => {
        calls.push(input);
        return Promise.resolve({ title: 'Invoice' });
      },
    );

    expect(result).toEqual({
      title: 'Invoice',
      payments: [],
      references: [],
      attributes: [],
      calendarEvents: [],
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual(
      expectObjectContaining({
        maxTokens: 3200,
        temperature: 0.1,
        enableThinking: false,
        structuredOutputMode: 'FREE_JSON',
        logThinkingStream: false,
        sourceTextKind: 'CLEANED_OCR',
      }),
    );
    expect(calls[0].text).toContain('Input document:');
    expect(calls[0].text).toContain(
      'Plain office document with general information.',
    );
    expect(evidenceExtractor.extract).toHaveBeenCalledWith(
      'Plain office document with general information.',
      'german',
    );
    expect(calls.map((call) => call.structuredOutputMode)).not.toContain(
      'FREE_TEXT',
    );
  });

  it('sends invoice payment OCR directly to the payment prompt', async () => {
    const { service } = createService();
    const ocrText = [
      'Invoice R-100',
      'Please transfer the outstanding amount of 119.90 EUR.',
      'IBAN: DE02120300000000202051',
      'Payment reference: Invoice R-100 customer K-42',
    ].join('\n');
    const payload = {
      documentId,
      ocrText,
      sourceTextFormat: 'PLAIN_TEXT',
      metadata: {
        title: 'Invoice',
        originalFileName: 'invoice.pdf',
        documentDate: null,
        ocrLanguage: 'english',
        sender: null,
        recipient: null,
      },
      documentTypes: [],
      fieldDefinitions: [],
      scopes: ['PAYMENTS'],
      promptTemplates: [],
    } satisfies Omit<AiMetadataExtractionJobPayload, 'prompts'>;
    const fullPayload = {
      ...payload,
      prompts: new AiMetadataPromptBuilder().build(payload),
    } satisfies AiMetadataExtractionJobPayload;
    const calls: Array<{
      text: string;
      structuredOutputMode: string;
      sourceTextKind?: string;
    }> = [];

    const result = await service.extractMetadataWithPromptRunner(
      fullPayload,
      (input) => {
        calls.push(input);
        return Promise.resolve({
          payments: [
            {
              iban: 'DE02120300000000202051',
              amount: 119.9,
              currency: 'EUR',
              purpose: 'Invoice R-100 customer K-42',
            },
          ],
        });
      },
    );

    expect(result).toEqual({
      payments: [
        {
          iban: 'DE02120300000000202051',
          amount: 119.9,
          currency: 'EUR',
          purpose: 'Invoice R-100 customer K-42',
        },
      ],
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual(
      expectObjectContaining({
        structuredOutputMode: 'FREE_JSON',
      }),
    );
    expect(calls[0].text).toContain('Evidence candidates:');
    expect(calls[0].text).toContain('IBAN: DE02120300000000202051');
    expect(calls[0].text).toContain(
      'Payment reference: Invoice R-100 customer K-42',
    );
    expect(calls[0].sourceTextKind).toBe('CLEANED_OCR');
  });

  it('runs the structured prompt sequence for each OCR chunk before merging', async () => {
    const { service } = createService();
    const payload = {
      documentId,
      ocrText: `${'Invoice A '.repeat(5000)}\n\n${'Invoice B '.repeat(5000)}`,
      sourceTextFormat: 'PLAIN_TEXT',
      metadata: {
        title: 'Long invoice',
        originalFileName: 'invoice.pdf',
        documentDate: null,
        ocrLanguage: 'english',
        sender: null,
        recipient: null,
      },
      documentTypes: [],
      fieldDefinitions: [],
      scopes: ['TITLE'],
      promptTemplates: [],
      prompts: new AiMetadataPromptBuilder().build({
        documentId,
        ocrText: `${'Invoice A '.repeat(5000)}\n\n${'Invoice B '.repeat(5000)}`,
        metadata: {
          title: 'Long invoice',
          originalFileName: 'invoice.pdf',
          documentDate: null,
          ocrLanguage: 'english',
          sender: null,
          recipient: null,
        },
        documentTypes: [],
        fieldDefinitions: [],
        scopes: ['TITLE'],
        promptTemplates: [],
      }),
    } satisfies AiMetadataExtractionJobPayload;
    const calls: Array<{
      text: string;
      structuredOutputMode: string;
    }> = [];

    const result = await service.extractMetadataWithPromptRunner(
      payload,
      (input) => {
        calls.push(input);
        return Promise.resolve({ title: 'Long invoice' });
      },
    );

    expect(result).toEqual({ title: 'Long invoice' });
    expect(calls.map((call) => call.structuredOutputMode)).toEqual([
      'FREE_JSON',
      'FREE_JSON',
      'FREE_JSON',
    ]);
    expect(calls[0].text).toContain('Input document:');
    expect(calls[1].text).toContain('Input document:');
    expect(calls[2].text).toContain('Chunk extraction results');
  });

  it('chunks OCR text above the 24k document-token budget', () => {
    const directText = 'a'.repeat(72000);
    const chunkedText = 'a'.repeat(72001);

    expect(chunkOcrText(directText)).toHaveLength(1);
    const chunks = chunkOcrText(chunkedText);

    expect(chunks).toHaveLength(2);
    expect(chunks[0].text.length).toBeLessThanOrEqual(72000);
    expect(chunks[0].text.length).toBeGreaterThanOrEqual(54000 * 0.6);
    expect(chunks[1].text.length).toBeGreaterThan(0);
  });
});
