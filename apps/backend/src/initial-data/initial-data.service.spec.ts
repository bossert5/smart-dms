import {
  expectAny,
  expectNotObjectContaining,
  expectObjectContaining,
} from '../testing/expect-matchers';
import { InitialDataService } from './initial-data.service';

const createdAt = new Date('2026-05-08T10:00:00.000Z');

describe('InitialDataService', () => {
  it('creates initial app data when tables are empty', async () => {
    const prisma = {
      user: {
        count: jest.fn().mockResolvedValue(0),
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: '00000000-0000-4000-8000-000000000001' }]),
        create: jest.fn().mockResolvedValue({
          id: '00000000-0000-4000-8000-000000000001',
          username: 'admin',
          displayName: 'Admin',
          passwordHash: 'hashed-password',
          role: 'Admin',
          isActive: true,
          passwordChangeRequired: true,
          createdAt,
          updatedAt: createdAt,
        }),
      },
      tenant: {
        upsert: jest.fn().mockResolvedValue({
          id: '00000000-0000-4000-8000-000000000001',
          key: 'default',
        }),
      },
      userTenantMembership: {
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      systemSetting: {
        upsert: jest.fn().mockResolvedValue({
          key: 'ocr.reprocessExistingTextLayer',
          value: false,
          createdAt,
          updatedAt: createdAt,
        }),
      },
      documentType: {
        upsert: jest.fn().mockResolvedValue({}),
      },
      aiMetadataPrompt: {
        upsert: jest.fn().mockResolvedValue({}),
      },
    };
    const scannerImportDirectories = scannerImportDirectoriesMock();
    const service = new InitialDataService(
      prisma as never,
      scannerImportDirectories as never,
    );

    await service.onApplicationBootstrap();

    expect(prisma.user.create).toHaveBeenCalledWith({
      data: {
        username: 'admin',
        displayName: 'Admin',
        passwordHash: expectAny(String),
        role: 'Admin',
        passwordChangeRequired: true,
      },
    });
    expect(prisma.systemSetting.upsert).toHaveBeenCalledWith({
      where: { key: 'ocr.reprocessExistingTextLayer' },
      create: {
        key: 'ocr.reprocessExistingTextLayer',
        value: false,
      },
      update: {},
    });
    expect(prisma.systemSetting.upsert).toHaveBeenCalledWith({
      where: { key: 'extraction.mode' },
      create: {
        key: 'extraction.mode',
        value: 'fast',
      },
      update: {},
    });
    expect(prisma.systemSetting.upsert).toHaveBeenCalledWith({
      where: { key: 'ai.metadataLanguage' },
      create: {
        key: 'ai.metadataLanguage',
        value: 'DOCUMENT_LANGUAGE',
      },
      update: {},
    });
    expect(prisma.tenant.upsert).toHaveBeenCalledWith({
      where: { id: '00000000-0000-4000-8000-000000000001' },
      create: {
        id: '00000000-0000-4000-8000-000000000001',
        key: 'default',
        name: 'Default',
        scannerImportPath: 'default',
        isActive: true,
      },
      update: {
        key: 'default',
        name: 'Default',
        scannerImportPath: 'default',
        isActive: true,
      },
    });
    expect(scannerImportDirectories.ensureDirectory).toHaveBeenCalledWith(
      'default',
    );
    expect(prisma.documentType.upsert).toHaveBeenCalledTimes(28);
    expect(prisma.aiMetadataPrompt.upsert).toHaveBeenCalledTimes(10);
    expect(prisma.aiMetadataPrompt.upsert).toHaveBeenCalledWith(
      expectObjectContaining({
        where: { key: 'TITLE' },
        update: expectNotObjectContaining({
          promptText: expectAny(String),
        }),
      }),
    );
    expect(prisma.documentType.upsert).toHaveBeenCalledWith({
      where: { key: 'invoice' },
      create: {
        key: 'invoice',
        name: 'Invoice',
        displayOrder: 10,
        active: true,
        isSystem: true,
      },
      update: {
        name: 'Invoice',
        displayOrder: 10,
        isSystem: true,
      },
    });
  });

  it('does not overwrite existing admin or settings', async () => {
    const prisma = {
      user: {
        count: jest.fn().mockResolvedValue(1),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(),
      },
      tenant: {
        upsert: jest.fn().mockResolvedValue({
          id: '00000000-0000-4000-8000-000000000001',
          key: 'default',
        }),
      },
      userTenantMembership: {
        createMany: jest.fn(),
      },
      systemSetting: {
        upsert: jest.fn().mockResolvedValue({}),
      },
      documentType: {
        upsert: jest.fn().mockResolvedValue({}),
      },
      aiMetadataPrompt: {
        upsert: jest.fn().mockResolvedValue({}),
      },
    };
    const scannerImportDirectories = scannerImportDirectoriesMock();
    const service = new InitialDataService(
      prisma as never,
      scannerImportDirectories as never,
    );

    await service.onApplicationBootstrap();

    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(prisma.systemSetting.upsert).toHaveBeenCalledTimes(3);
    expect(prisma.documentType.upsert).toHaveBeenCalledTimes(28);
    expect(prisma.aiMetadataPrompt.upsert).toHaveBeenCalledTimes(10);
    expect(scannerImportDirectories.ensureDirectory).toHaveBeenCalledWith(
      'default',
    );
  });
});

function scannerImportDirectoriesMock() {
  return {
    ensureDirectory: jest.fn().mockResolvedValue(undefined),
  };
}
