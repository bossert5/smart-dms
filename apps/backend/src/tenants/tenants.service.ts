import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type {
  CreateTenantRequest,
  DeleteTenantRequest,
  ListTenantsResponse,
  PaginationRequest,
  TenantDto,
  UpdateTenantRequest,
} from '@smart-dms/shared-dto';
import { ScannerImportDirectoryService } from '../common/scanner-import-directory.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { toTenantDto } from './tenant.mapper';

export const DEFAULT_TENANT_ID = '00000000-0000-4000-8000-000000000001';
export const DEFAULT_TENANT_KEY = 'default';
export const DEFAULT_TENANT_NAME = 'Default';

@Injectable()
export class TenantsService {
  private readonly logger = new Logger(TenantsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly scannerImportDirectories: ScannerImportDirectoryService,
  ) {}

  async list(pagination: PaginationRequest): Promise<ListTenantsResponse> {
    const page = pagination.page;
    const pageSize = pagination.pageSize;
    const [items, totalItems] = await this.prisma.$transaction([
      this.prisma.tenant.findMany({
        orderBy: [{ name: 'asc' }, { createdAt: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          _count: {
            select: {
              documents: true,
              memberships: true,
            },
          },
        },
      }),
      this.prisma.tenant.count(),
    ]);

    return {
      items: items.map(toTenantDto),
      meta: {
        page,
        pageSize,
        totalItems,
        totalPages: Math.ceil(totalItems / pageSize),
      },
    };
  }

  async listActive(): Promise<TenantDto[]> {
    const tenants = await this.prisma.tenant.findMany({
      where: { isActive: true },
      orderBy: [{ name: 'asc' }, { createdAt: 'asc' }],
      include: {
        _count: {
          select: {
            documents: true,
            memberships: true,
          },
        },
      },
    });

    return tenants.map(toTenantDto);
  }

  async create(input: CreateTenantRequest): Promise<TenantDto> {
    const key = input.key.trim();
    const scannerImportPath =
      this.normalizeScannerImportPath(input.scannerImportPath) ?? key;

    await this.assertScannerImportPathIsUnique(scannerImportPath);
    const scannerImportDirectoryCreated =
      await this.scannerImportDirectories.ensureDirectory(scannerImportPath);

    try {
      const tenant = await this.prisma.tenant.create({
        data: {
          key,
          name: input.name.trim(),
          scannerImportPath,
          isActive: input.isActive,
        },
        include: {
          _count: {
            select: {
              documents: true,
              memberships: true,
            },
          },
        },
      });

      return toTenantDto(tenant);
    } catch (error: unknown) {
      await this.removeCreatedScannerImportDirectory(
        scannerImportPath,
        scannerImportDirectoryCreated,
      );
      if (isUniqueConstraintError(error)) {
        throw new ConflictException(
          'A tenant with this key or scanner import path already exists.',
        );
      }
      throw error;
    }
  }

  async update(id: string, input: UpdateTenantRequest): Promise<TenantDto> {
    const existing = await this.prisma.tenant.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Tenant not found.');
    }

    const scannerImportPath =
      input.scannerImportPath === undefined
        ? undefined
        : this.normalizeScannerImportPath(input.scannerImportPath);
    if (scannerImportPath !== undefined) {
      await this.assertScannerImportPathIsUnique(scannerImportPath, id);
      await this.scannerImportDirectories.ensureDirectory(scannerImportPath);
    }

    const tenant = await this.prisma.tenant
      .update({
        where: { id },
        data: {
          key: input.key?.trim(),
          name: input.name?.trim(),
          scannerImportPath,
          isActive: input.isActive,
        },
        include: {
          _count: {
            select: {
              documents: true,
              memberships: true,
            },
          },
        },
      })
      .catch((error: unknown) => {
        if (isUniqueConstraintError(error)) {
          throw new ConflictException(
            'A tenant with this key or scanner import path already exists.',
          );
        }
        throw error;
      });

    return toTenantDto(tenant);
  }

  async delete(id: string, input: DeleteTenantRequest): Promise<void> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id },
      select: { id: true, name: true, scannerImportPath: true },
    });
    if (!tenant) {
      throw new NotFoundException('Tenant not found.');
    }

    if (input.confirmationName !== tenant.name) {
      throw new BadRequestException('Tenant name confirmation does not match.');
    }

    if (input.documentAction === 'MOVE') {
      if (input.targetTenantId === id) {
        throw new BadRequestException(
          'Target tenant must differ from the deleted tenant.',
        );
      }

      const targetTenant = await this.prisma.tenant.findUnique({
        where: { id: input.targetTenantId },
        select: { id: true },
      });
      if (!targetTenant) {
        throw new NotFoundException('Target tenant not found.');
      }
    }

    const documentsToDelete =
      input.documentAction === 'DELETE'
        ? await this.prisma.document.findMany({
            where: { tenantId: id },
            select: {
              id: true,
              pdfPath: true,
              thumbnailPath: true,
              artifacts: {
                select: {
                  path: true,
                },
              },
            },
          })
        : [];
    const emailAttachmentsToDelete = await this.prisma.emailAttachment.findMany(
      {
        where: {
          message: {
            mailbox: {
              tenantId: id,
            },
          },
        },
        select: {
          storagePath: true,
        },
      },
    );

    await this.deleteStoredTenantFiles(
      documentsToDelete,
      emailAttachmentsToDelete,
    );

    await this.prisma
      .$transaction(async (tx) => {
        await tx.editLock.deleteMany({
          where: { tenantIds: { has: id } },
        });

        if (input.documentAction === 'MOVE') {
          await tx.documentTag.deleteMany({
            where: { document: { tenantId: id } },
          });
          await tx.document.updateMany({
            where: { tenantId: id },
            data: { tenantId: input.targetTenantId },
          });
        } else {
          await tx.document.deleteMany({ where: { tenantId: id } });
        }

        await tx.tag.deleteMany({ where: { tenantId: id } });
        await tx.emailMailbox.deleteMany({ where: { tenantId: id } });

        if (input.userAction === 'REMOVE_ASSIGNMENTS') {
          await tx.userTenantMembership.deleteMany({
            where: { tenantId: id },
          });
        }

        await tx.tenant.delete({ where: { id } });
      })
      .catch((error: unknown) => {
        if (isRecordNotFoundError(error)) {
          throw new NotFoundException('Tenant not found.');
        }
        if (isForeignKeyConstraintError(error)) {
          throw new ConflictException(
            'Tenant still has related data and cannot be deleted.',
          );
        }
        throw error;
      });

    await this.removeScannerImportDirectoryIfEmpty(
      tenant.id,
      tenant.scannerImportPath,
    );
  }

  async ensureDefaultTenant(
    scannerImportPath?: string | null,
  ): Promise<string> {
    const normalizedScannerImportPath =
      this.normalizeScannerImportPath(scannerImportPath) ?? DEFAULT_TENANT_KEY;
    await this.scannerImportDirectories.ensureDirectory(
      normalizedScannerImportPath,
    );

    const tenant = await this.prisma.tenant.upsert({
      where: { id: DEFAULT_TENANT_ID },
      create: {
        id: DEFAULT_TENANT_ID,
        key: DEFAULT_TENANT_KEY,
        name: DEFAULT_TENANT_NAME,
        scannerImportPath: normalizedScannerImportPath,
        isActive: true,
      },
      update: {
        key: DEFAULT_TENANT_KEY,
        name: DEFAULT_TENANT_NAME,
        isActive: true,
        scannerImportPath: normalizedScannerImportPath ?? undefined,
      },
      include: {
        _count: {
          select: {
            documents: true,
            memberships: true,
          },
        },
      },
    });

    return tenant.id;
  }

  private normalizeScannerImportPath(
    value: string | null | undefined,
  ): string | null {
    const trimmed = value?.trim() ?? '';
    return trimmed.length > 0 ? trimmed : null;
  }

  private async assertScannerImportPathIsUnique(
    scannerImportPath: string | null,
    excludedTenantId?: string,
  ): Promise<void> {
    if (!scannerImportPath) {
      return;
    }

    const owner = await this.prisma.tenant.findFirst({
      where: {
        scannerImportPath,
        id: excludedTenantId ? { not: excludedTenantId } : undefined,
      },
      select: { id: true },
    });

    if (owner) {
      throw new ConflictException(
        'Scanner import path is already assigned to another tenant.',
      );
    }
  }

  private async deleteStoredTenantFiles(
    documents: readonly {
      readonly id: string;
      readonly pdfPath: string | null;
      readonly thumbnailPath: string | null;
      readonly artifacts: readonly { readonly path: string }[];
    }[],
    emailAttachments: readonly { readonly storagePath: string | null }[],
  ): Promise<void> {
    const storedFilePaths = new Set<string>();
    for (const document of documents) {
      for (const path of this.documentStoragePaths(document)) {
        storedFilePaths.add(path);
      }
    }
    for (const attachment of emailAttachments) {
      if (attachment.storagePath) {
        storedFilePaths.add(attachment.storagePath);
      }
    }

    await Promise.all([
      ...[...storedFilePaths].map((path) =>
        this.storage.deleteStoredFile(path),
      ),
      ...documents.map((document) =>
        this.storage.deleteDocumentTemporaryFiles(document.id),
      ),
    ]);
  }

  private async removeScannerImportDirectoryIfEmpty(
    tenantId: string,
    scannerImportPath: string | null,
  ): Promise<void> {
    try {
      await this.scannerImportDirectories.removeDirectoryIfEmpty(
        scannerImportPath,
      );
    } catch (error: unknown) {
      this.logger.warn(
        `Failed to remove scanner import directory for deleted tenant ${tenantId} (${this.errorCode(error)}).`,
      );
    }
  }

  private async removeCreatedScannerImportDirectory(
    scannerImportPath: string,
    wasCreated: boolean,
  ): Promise<void> {
    if (!wasCreated) {
      return;
    }

    try {
      await this.scannerImportDirectories.removeDirectoryIfEmpty(
        scannerImportPath,
      );
    } catch (error: unknown) {
      this.logger.warn(
        `Failed to clean up scanner import directory after failed tenant creation (${this.errorCode(error)}).`,
      );
    }
  }

  private documentStoragePaths(document: {
    readonly pdfPath: string | null;
    readonly thumbnailPath: string | null;
    readonly artifacts: readonly { readonly path: string }[];
  }): string[] {
    return [
      ...new Set(
        [
          document.pdfPath,
          document.thumbnailPath,
          ...document.artifacts.map((artifact) => artifact.path),
        ].filter((path): path is string => Boolean(path)),
      ),
    ];
  }

  private errorCode(error: unknown): string {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      typeof error.code === 'string'
    ) {
      return error.code;
    }

    return 'UNKNOWN';
  }
}

function isUniqueConstraintError(error: unknown): boolean {
  return isPrismaErrorCode(error, 'P2002');
}

function isRecordNotFoundError(error: unknown): boolean {
  return isPrismaErrorCode(error, 'P2025');
}

function isForeignKeyConstraintError(error: unknown): boolean {
  return isPrismaErrorCode(error, 'P2003');
}

function isPrismaErrorCode(error: unknown, code: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { readonly code?: unknown }).code === code
  );
}
