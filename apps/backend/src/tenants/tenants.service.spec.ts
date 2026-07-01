import { expectObjectContaining } from '../testing/expect-matchers';
import { TenantsService } from './tenants.service';

const createdAt = new Date('2026-06-12T10:00:00.000Z');
const tenantId = '00000000-0000-4000-8000-000000000301';
const targetTenantId = '00000000-0000-4000-8000-000000000302';

function tenantRecord(
  overrides: Partial<{
    id: string;
    key: string;
    name: string;
    scannerImportPath: string | null;
    isActive: boolean;
  }> = {},
) {
  return {
    id: overrides.id ?? tenantId,
    key: overrides.key ?? 'new_tenant',
    name: overrides.name ?? 'New Tenant',
    scannerImportPath: overrides.scannerImportPath ?? 'new_tenant',
    isActive: overrides.isActive ?? true,
    createdAt,
    updatedAt: createdAt,
    _count: {
      documents: 0,
      memberships: 0,
    },
  };
}

describe('TenantsService', () => {
  it('uses the tenant key as the initial scanner import path when creating a tenant without an explicit path', async () => {
    const prisma = {
      tenant: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(tenantRecord()),
      },
    };
    const scannerImportDirectories = scannerImportDirectoriesMock();
    const service = new TenantsService(
      prisma as never,
      storageMock() as never,
      scannerImportDirectories as never,
    );

    const tenant = await service.create({
      key: 'new_tenant',
      name: 'New Tenant',
      scannerImportPath: null,
      isActive: true,
    });

    expect(prisma.tenant.findFirst).toHaveBeenCalledWith({
      where: {
        scannerImportPath: 'new_tenant',
        id: undefined,
      },
      select: { id: true },
    });
    expect(prisma.tenant.create).toHaveBeenCalledWith(
      expectObjectContaining({
        data: {
          key: 'new_tenant',
          name: 'New Tenant',
          scannerImportPath: 'new_tenant',
          isActive: true,
        },
      }),
    );
    expect(tenant.scannerImportPath).toBe('new_tenant');
    expect(scannerImportDirectories.ensureDirectory).toHaveBeenCalledWith(
      'new_tenant',
    );
  });

  it('keeps an explicit scanner import path when creating a tenant', async () => {
    const prisma = {
      tenant: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest
          .fn()
          .mockResolvedValue(
            tenantRecord({ scannerImportPath: '/scan/custom' }),
          ),
      },
    };
    const scannerImportDirectories = scannerImportDirectoriesMock();
    const service = new TenantsService(
      prisma as never,
      storageMock() as never,
      scannerImportDirectories as never,
    );

    await service.create({
      key: 'new_tenant',
      name: 'New Tenant',
      scannerImportPath: ' /scan/custom ',
      isActive: true,
    });

    expect(prisma.tenant.create).toHaveBeenCalledWith(
      expectObjectContaining({
        data: expectObjectContaining({
          scannerImportPath: '/scan/custom',
        }),
      }),
    );
    expect(scannerImportDirectories.ensureDirectory).toHaveBeenCalledWith(
      '/scan/custom',
    );
  });

  it('removes a newly created scanner import directory when tenant creation fails', async () => {
    const prisma = {
      tenant: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockRejectedValue({ code: 'P2002' }),
      },
    };
    const scannerImportDirectories = scannerImportDirectoriesMock();
    scannerImportDirectories.ensureDirectory.mockResolvedValue(true);
    const service = new TenantsService(
      prisma as never,
      storageMock() as never,
      scannerImportDirectories as never,
    );

    await expect(
      service.create({
        key: 'new_tenant',
        name: 'New Tenant',
        scannerImportPath: null,
        isActive: true,
      }),
    ).rejects.toThrow(
      'A tenant with this key or scanner import path already exists.',
    );
    expect(
      scannerImportDirectories.removeDirectoryIfEmpty,
    ).toHaveBeenCalledWith('new_tenant');
  });

  it('uses the default tenant key as the fallback scanner import path', async () => {
    const prisma = {
      tenant: {
        upsert: jest.fn().mockResolvedValue(
          tenantRecord({
            id: '00000000-0000-4000-8000-000000000001',
            key: 'default',
            name: 'Default',
            scannerImportPath: 'default',
          }),
        ),
      },
    };
    const scannerImportDirectories = scannerImportDirectoriesMock();
    const service = new TenantsService(
      prisma as never,
      storageMock() as never,
      scannerImportDirectories as never,
    );

    await service.ensureDefaultTenant();

    expect(prisma.tenant.upsert).toHaveBeenCalledWith(
      expectObjectContaining({
        create: expectObjectContaining({
          scannerImportPath: 'default',
        }),
        update: expectObjectContaining({
          scannerImportPath: 'default',
        }),
      }),
    );
    expect(scannerImportDirectories.ensureDirectory).toHaveBeenCalledWith(
      'default',
    );
  });

  it('creates the scanner import directory when updating the scanner import path', async () => {
    const prisma = {
      tenant: {
        findUnique: jest.fn().mockResolvedValue(tenantRecord()),
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest
          .fn()
          .mockResolvedValue(tenantRecord({ scannerImportPath: 'updated' })),
      },
    };
    const scannerImportDirectories = scannerImportDirectoriesMock();
    const service = new TenantsService(
      prisma as never,
      storageMock() as never,
      scannerImportDirectories as never,
    );

    const tenant = await service.update(tenantId, {
      scannerImportPath: ' updated ',
    });

    expect(prisma.tenant.findFirst).toHaveBeenCalledWith({
      where: {
        scannerImportPath: 'updated',
        id: { not: tenantId },
      },
      select: { id: true },
    });
    expect(scannerImportDirectories.ensureDirectory).toHaveBeenCalledWith(
      'updated',
    );
    expect(prisma.tenant.update).toHaveBeenCalledWith(
      expectObjectContaining({
        where: { id: tenantId },
        data: expectObjectContaining({
          scannerImportPath: 'updated',
        }),
      }),
    );
    expect(tenant.scannerImportPath).toBe('updated');
  });

  it('deletes a tenant and its related documents when requested', async () => {
    const tx = tenantDeleteTransactionMock();
    const runTransaction = jest.fn(
      async (
        callback: (
          tx: ReturnType<typeof tenantDeleteTransactionMock>,
        ) => Promise<unknown>,
      ) => callback(tx),
    );
    const storage = storageMock();
    const prisma = {
      tenant: {
        findUnique: jest.fn().mockResolvedValue({
          id: tenantId,
          name: 'New Tenant',
          scannerImportPath: 'new_tenant',
        }),
      },
      document: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'document-id',
            pdfPath: 'pdfs/document-id.pdf',
            thumbnailPath: 'thumbnails/document-id.jpg',
            artifacts: [
              { path: 'originals/document-id/original.pdf' },
              { path: 'pdfs/document-id.pdf' },
            ],
          },
        ]),
      },
      emailAttachment: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { storagePath: 'email-attachments/message-id/file.pdf' },
            { storagePath: null },
          ]),
      },
      $transaction: runTransaction,
    };
    const scannerImportDirectories = scannerImportDirectoriesMock();
    const service = new TenantsService(
      prisma as never,
      storage as never,
      scannerImportDirectories as never,
    );

    await service.delete(tenantId, {
      confirmationName: 'New Tenant',
      documentAction: 'DELETE',
      userAction: 'REMOVE_ASSIGNMENTS',
    });

    expect(tx.editLock.deleteMany).toHaveBeenCalledWith({
      where: { tenantIds: { has: tenantId } },
    });
    expect(tx.document.deleteMany).toHaveBeenCalledWith({
      where: { tenantId },
    });
    expect(tx.document.updateMany).not.toHaveBeenCalled();
    expect(tx.tag.deleteMany).toHaveBeenCalledWith({ where: { tenantId } });
    expect(tx.emailMailbox.deleteMany).toHaveBeenCalledWith({
      where: { tenantId },
    });
    expect(tx.userTenantMembership.deleteMany).toHaveBeenCalledWith({
      where: { tenantId },
    });
    expect(tx.tenant.delete).toHaveBeenCalledWith({
      where: { id: tenantId },
    });
    expect(storage.deleteStoredFile).toHaveBeenCalledTimes(4);
    expect(storage.deleteStoredFile).toHaveBeenCalledWith(
      'pdfs/document-id.pdf',
    );
    expect(storage.deleteStoredFile).toHaveBeenCalledWith(
      'thumbnails/document-id.jpg',
    );
    expect(storage.deleteStoredFile).toHaveBeenCalledWith(
      'originals/document-id/original.pdf',
    );
    expect(storage.deleteStoredFile).toHaveBeenCalledWith(
      'email-attachments/message-id/file.pdf',
    );
    expect(storage.deleteDocumentTemporaryFiles).toHaveBeenCalledWith(
      'document-id',
    );
    expect(
      scannerImportDirectories.removeDirectoryIfEmpty,
    ).toHaveBeenCalledWith('new_tenant');
  });

  it('moves tenant documents before deleting the source tenant', async () => {
    const tx = tenantDeleteTransactionMock();
    const runTransaction = jest.fn(
      async (
        callback: (
          tx: ReturnType<typeof tenantDeleteTransactionMock>,
        ) => Promise<unknown>,
      ) => callback(tx),
    );
    const storage = storageMock();
    const prisma = {
      tenant: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce({
            id: tenantId,
            name: 'New Tenant',
            scannerImportPath: 'new_tenant',
          })
          .mockResolvedValueOnce({ id: targetTenantId }),
      },
      document: {
        findMany: jest.fn(),
      },
      emailAttachment: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { storagePath: 'email-attachments/message-id/file.pdf' },
          ]),
      },
      $transaction: runTransaction,
    };
    const scannerImportDirectories = scannerImportDirectoriesMock();
    const service = new TenantsService(
      prisma as never,
      storage as never,
      scannerImportDirectories as never,
    );

    await service.delete(tenantId, {
      confirmationName: 'New Tenant',
      documentAction: 'MOVE',
      targetTenantId,
      userAction: 'REMOVE_ASSIGNMENTS',
    });

    expect(tx.documentTag.deleteMany).toHaveBeenCalledWith({
      where: { document: { tenantId } },
    });
    expect(tx.document.updateMany).toHaveBeenCalledWith({
      where: { tenantId },
      data: { tenantId: targetTenantId },
    });
    expect(tx.document.deleteMany).not.toHaveBeenCalled();
    expect(tx.tenant.delete).toHaveBeenCalledWith({
      where: { id: tenantId },
    });
    expect(prisma.document.findMany).not.toHaveBeenCalled();
    expect(storage.deleteStoredFile).toHaveBeenCalledWith(
      'email-attachments/message-id/file.pdf',
    );
    expect(storage.deleteDocumentTemporaryFiles).not.toHaveBeenCalled();
    expect(
      scannerImportDirectories.removeDirectoryIfEmpty,
    ).toHaveBeenCalledWith('new_tenant');
  });

  it('rejects tenant deletion when the confirmation name does not match', async () => {
    const prisma = {
      tenant: {
        findUnique: jest.fn().mockResolvedValue({
          id: tenantId,
          name: 'New Tenant',
          scannerImportPath: 'new_tenant',
        }),
      },
      $transaction: jest.fn(),
    };
    const scannerImportDirectories = scannerImportDirectoriesMock();
    const service = new TenantsService(
      prisma as never,
      storageMock() as never,
      scannerImportDirectories as never,
    );

    await expect(
      service.delete(tenantId, {
        confirmationName: 'Wrong Tenant',
        documentAction: 'DELETE',
        userAction: 'REMOVE_ASSIGNMENTS',
      }),
    ).rejects.toThrow('Tenant name confirmation does not match.');
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(
      scannerImportDirectories.removeDirectoryIfEmpty,
    ).not.toHaveBeenCalled();
  });
});

function tenantDeleteTransactionMock() {
  return {
    editLock: {
      deleteMany: jest.fn(),
    },
    documentTag: {
      deleteMany: jest.fn(),
    },
    document: {
      deleteMany: jest.fn(),
      updateMany: jest.fn(),
    },
    tag: {
      deleteMany: jest.fn(),
    },
    emailMailbox: {
      deleteMany: jest.fn(),
    },
    userTenantMembership: {
      deleteMany: jest.fn(),
    },
    tenant: {
      delete: jest.fn(),
    },
  };
}

function storageMock() {
  return {
    deleteStoredFile: jest.fn().mockResolvedValue(undefined),
    deleteDocumentTemporaryFiles: jest.fn().mockResolvedValue(undefined),
  };
}

function scannerImportDirectoriesMock() {
  return {
    ensureDirectory: jest.fn().mockResolvedValue(undefined),
    removeDirectoryIfEmpty: jest.fn().mockResolvedValue(undefined),
  };
}
