import { BadRequestException, NotFoundException } from '@nestjs/common';
import { SettingsService } from './settings.service';

const now = new Date('2026-05-09T10:00:00.000Z');
const documentTypeId = '00000000-0000-4000-8000-000000000101';
const customDocumentTypeId = '00000000-0000-4000-8000-000000000102';
const fieldDefinitionId = '00000000-0000-4000-8000-000000000201';

function documentType(overrides: Record<string, unknown> = {}) {
  return {
    id: documentTypeId,
    key: 'invoice',
    name: 'Invoice',
    active: true,
    isSystem: false,
    displayOrder: 10,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function fieldDefinition(overrides: Record<string, unknown> = {}) {
  return {
    id: fieldDefinitionId,
    key: 'customer_number',
    label: 'Customer number',
    valueType: 'TEXT',
    required: false,
    active: true,
    displayOrder: 10,
    appliesToAllDocumentTypes: true,
    includeInFullTextSearch: false,
    includeInAiExtraction: false,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function createService() {
  const prisma = {
    $transaction: jest.fn(),
    documentType: {
      delete: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    documentFieldDefinition: {
      delete: jest.fn(),
      findUnique: jest.fn(),
    },
    systemSetting: {
      findMany: jest.fn(),
      upsert: jest.fn(),
    },
  };
  const service = new SettingsService(prisma as never);

  return { prisma, service };
}

describe('SettingsService', () => {
  it('returns system settings with false defaults', async () => {
    const { prisma, service } = createService();
    prisma.systemSetting.findMany.mockResolvedValue([]);

    await expect(service.getSettings()).resolves.toEqual({
      ocrReprocessExistingTextLayer: false,
      pdfRemoveBlankPages: false,
      documentsRequireAiMetadataBeforeAcceptance: false,
      extractionMode: 'fast',
      aiMetadataLanguage: 'DOCUMENT_LANGUAGE',
    });
  });

  it('updates blank page removal settings', async () => {
    const { prisma, service } = createService();
    prisma.systemSetting.findMany.mockResolvedValue([
      { key: 'pdf.removeBlankPages', value: true },
    ]);

    await expect(
      service.updateSettings({ pdfRemoveBlankPages: true }),
    ).resolves.toEqual({
      ocrReprocessExistingTextLayer: false,
      pdfRemoveBlankPages: true,
      documentsRequireAiMetadataBeforeAcceptance: false,
      extractionMode: 'fast',
      aiMetadataLanguage: 'DOCUMENT_LANGUAGE',
    });
    expect(prisma.systemSetting.upsert).toHaveBeenCalledWith({
      where: { key: 'pdf.removeBlankPages' },
      create: {
        key: 'pdf.removeBlankPages',
        value: true,
      },
      update: {
        value: true,
      },
    });
  });

  it('updates extraction mode settings', async () => {
    const { prisma, service } = createService();
    prisma.systemSetting.findMany.mockResolvedValue([
      { key: 'extraction.mode', value: 'fast' },
    ]);

    await expect(
      service.updateSettings({ extractionMode: 'fast' }),
    ).resolves.toEqual({
      ocrReprocessExistingTextLayer: false,
      pdfRemoveBlankPages: false,
      documentsRequireAiMetadataBeforeAcceptance: false,
      extractionMode: 'fast',
      aiMetadataLanguage: 'DOCUMENT_LANGUAGE',
    });
    expect(prisma.systemSetting.upsert).toHaveBeenCalledWith({
      where: { key: 'extraction.mode' },
      create: {
        key: 'extraction.mode',
        value: 'fast',
      },
      update: {
        value: 'fast',
      },
    });
  });

  it('updates AI metadata language settings', async () => {
    const { prisma, service } = createService();
    prisma.systemSetting.findMany.mockResolvedValue([
      { key: 'ai.metadataLanguage', value: 'eng' },
    ]);

    await expect(
      service.updateSettings({ aiMetadataLanguage: 'eng' }),
    ).resolves.toEqual({
      ocrReprocessExistingTextLayer: false,
      pdfRemoveBlankPages: false,
      documentsRequireAiMetadataBeforeAcceptance: false,
      extractionMode: 'fast',
      aiMetadataLanguage: 'eng',
    });
    expect(prisma.systemSetting.upsert).toHaveBeenCalledWith({
      where: { key: 'ai.metadataLanguage' },
      create: {
        key: 'ai.metadataLanguage',
        value: 'eng',
      },
      update: {
        value: 'eng',
      },
    });
  });

  it('allows admins to deactivate system document types', async () => {
    const { prisma, service } = createService();
    prisma.documentType.findUnique.mockResolvedValue(
      documentType({ isSystem: true }),
    );
    prisma.documentType.update.mockResolvedValue(
      documentType({ active: false, isSystem: true }),
    );

    const updated = await service.updateDocumentType(documentTypeId, {
      active: false,
    });

    expect(updated.active).toBe(false);
    expect(updated.isSystem).toBe(true);
    expect(prisma.documentType.update).toHaveBeenCalledWith({
      where: { id: documentTypeId },
      data: { active: false },
    });
  });

  it('rejects changing locked system document type fields', async () => {
    const { prisma, service } = createService();
    prisma.documentType.findUnique.mockResolvedValue(
      documentType({ isSystem: true }),
    );

    await expect(
      service.updateDocumentType(documentTypeId, { name: 'Changed' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.documentType.update).not.toHaveBeenCalled();
  });

  it('allows updating custom document types', async () => {
    const { prisma, service } = createService();
    prisma.documentType.findUnique.mockResolvedValue(documentType());
    prisma.documentType.update.mockResolvedValue(
      documentType({
        key: 'custom_invoice',
        name: 'Custom invoice',
        displayOrder: 50,
      }),
    );

    const updated = await service.updateDocumentType(documentTypeId, {
      key: 'custom_invoice',
      name: 'Custom invoice',
      displayOrder: 50,
    });

    expect(updated.name).toBe('Custom invoice');
    expect(updated.isSystem).toBe(false);
    expect(prisma.documentType.update).toHaveBeenCalledWith({
      where: { id: documentTypeId },
      data: {
        key: 'custom_invoice',
        name: 'Custom invoice',
        displayOrder: 50,
      },
    });
  });

  it('updates display order in 10 point steps when document types are reordered', async () => {
    const { prisma, service } = createService();
    prisma.documentType.findMany
      .mockResolvedValueOnce([
        { id: documentTypeId },
        { id: customDocumentTypeId },
      ])
      .mockResolvedValueOnce([
        documentType({
          id: customDocumentTypeId,
          key: 'custom',
          name: 'Custom',
          displayOrder: 10,
        }),
        documentType({ displayOrder: 20 }),
      ]);
    prisma.$transaction.mockResolvedValue([]);

    const documentTypes = await service.reorderDocumentTypes({
      documentTypeIds: [customDocumentTypeId, documentTypeId],
    });

    expect(documentTypes.map((documentType) => documentType.id)).toEqual([
      customDocumentTypeId,
      documentTypeId,
    ]);
    expect(prisma.documentType.update).toHaveBeenNthCalledWith(1, {
      where: { id: customDocumentTypeId },
      data: { displayOrder: 10 },
    });
    expect(prisma.documentType.update).toHaveBeenNthCalledWith(2, {
      where: { id: documentTypeId },
      data: { displayOrder: 20 },
    });
  });

  it('rejects incomplete or duplicate document type reorder payloads', async () => {
    const { prisma, service } = createService();

    await expect(
      service.reorderDocumentTypes({
        documentTypeIds: [documentTypeId, documentTypeId],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.documentType.findMany).not.toHaveBeenCalled();
  });

  it('deletes custom document types', async () => {
    const { prisma, service } = createService();
    prisma.documentType.findUnique.mockResolvedValue(documentType());
    prisma.documentType.delete.mockResolvedValue(documentType());

    await service.deleteDocumentType(documentTypeId);

    expect(prisma.documentType.delete).toHaveBeenCalledWith({
      where: { id: documentTypeId },
    });
  });

  it('rejects deleting system document types', async () => {
    const { prisma, service } = createService();
    prisma.documentType.findUnique.mockResolvedValue(
      documentType({ isSystem: true }),
    );

    await expect(
      service.deleteDocumentType(documentTypeId),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.documentType.delete).not.toHaveBeenCalled();
  });

  it('deletes document field definitions', async () => {
    const { prisma, service } = createService();
    prisma.documentFieldDefinition.findUnique.mockResolvedValue(
      fieldDefinition(),
    );
    prisma.documentFieldDefinition.delete.mockResolvedValue(fieldDefinition());

    await service.deleteDocumentFieldDefinition(fieldDefinitionId);

    expect(prisma.documentFieldDefinition.delete).toHaveBeenCalledWith({
      where: { id: fieldDefinitionId },
    });
  });

  it('rejects deleting unknown document field definitions', async () => {
    const { prisma, service } = createService();
    prisma.documentFieldDefinition.findUnique.mockResolvedValue(null);

    await expect(
      service.deleteDocumentFieldDefinition(fieldDefinitionId),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.documentFieldDefinition.delete).not.toHaveBeenCalled();
  });
});
