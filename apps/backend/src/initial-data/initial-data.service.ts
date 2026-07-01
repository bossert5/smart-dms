import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import * as argon2 from 'argon2';
import { DEFAULT_AI_METADATA_PROMPTS } from '../ai/ai-metadata-prompt.defaults';
import { ScannerImportDirectoryService } from '../common/scanner-import-directory.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  DEFAULT_TENANT_ID,
  DEFAULT_TENANT_KEY,
  DEFAULT_TENANT_NAME,
} from '../tenants/tenants.service';

const INITIAL_ADMIN_USERNAME = 'admin';
const INITIAL_ADMIN_PASSWORD = 'admin';
const INITIAL_ADMIN_DISPLAY_NAME = 'Admin';
const OCR_REPROCESS_EXISTING_TEXT_LAYER_KEY = 'ocr.reprocessExistingTextLayer';
const EXTRACTION_MODE_KEY = 'extraction.mode';
const AI_METADATA_LANGUAGE_KEY = 'ai.metadataLanguage';

interface InitialDocumentType {
  readonly key: string;
  readonly name: string;
  readonly displayOrder: number;
}

const INITIAL_DOCUMENT_TYPES: readonly InitialDocumentType[] = [
  { key: 'invoice', name: 'Invoice', displayOrder: 10 },
  { key: 'receipt', name: 'Receipt', displayOrder: 20 },
  { key: 'credit_note', name: 'Credit note', displayOrder: 30 },
  { key: 'quote', name: 'Quote', displayOrder: 40 },
  { key: 'purchase_order', name: 'Purchase order', displayOrder: 50 },
  { key: 'delivery_note', name: 'Delivery note', displayOrder: 60 },
  { key: 'payment_reminder', name: 'Payment reminder', displayOrder: 70 },
  { key: 'bank_document', name: 'Bank document', displayOrder: 80 },
  { key: 'tax_document', name: 'Tax document', displayOrder: 90 },
  { key: 'insurance_document', name: 'Insurance document', displayOrder: 100 },
  { key: 'contract', name: 'Contract', displayOrder: 110 },
  { key: 'legal_document', name: 'Legal document', displayOrder: 120 },
  { key: 'government_notice', name: 'Government notice', displayOrder: 130 },
  { key: 'correspondence', name: 'Correspondence', displayOrder: 140 },
  { key: 'report', name: 'Report', displayOrder: 150 },
  { key: 'minutes', name: 'Minutes', displayOrder: 160 },
  { key: 'certificate', name: 'Certificate', displayOrder: 170 },
  { key: 'form', name: 'Form', displayOrder: 180 },
  { key: 'payroll', name: 'Payroll', displayOrder: 190 },
  {
    key: 'employment_document',
    name: 'Employment document',
    displayOrder: 200,
  },
  { key: 'medical_document', name: 'Medical document', displayOrder: 210 },
  { key: 'education_document', name: 'Education document', displayOrder: 220 },
  { key: 'property_document', name: 'Property document', displayOrder: 230 },
  { key: 'vehicle_document', name: 'Vehicle document', displayOrder: 240 },
  { key: 'identity_document', name: 'Identity document', displayOrder: 250 },
  { key: 'warranty_document', name: 'Warranty document', displayOrder: 260 },
  { key: 'technical_document', name: 'Technical document', displayOrder: 270 },
  { key: 'other', name: 'Other', displayOrder: 280 },
];

@Injectable()
export class InitialDataService implements OnApplicationBootstrap {
  private readonly logger = new Logger(InitialDataService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly scannerImportDirectories: ScannerImportDirectoryService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.ensureDefaultTenant();
    await this.ensureInitialAdmin();
    await this.ensureUserTenantMemberships();
    await this.ensureSystemSettings();
    await this.ensureDocumentTypes();
    await this.ensureAiMetadataPrompts();
  }

  private async ensureDefaultTenant(): Promise<void> {
    await this.scannerImportDirectories.ensureDirectory(DEFAULT_TENANT_KEY);

    const tenant = await this.prisma.tenant.upsert({
      where: { id: DEFAULT_TENANT_ID },
      create: {
        id: DEFAULT_TENANT_ID,
        key: DEFAULT_TENANT_KEY,
        name: DEFAULT_TENANT_NAME,
        scannerImportPath: DEFAULT_TENANT_KEY,
        isActive: true,
      },
      update: {
        key: DEFAULT_TENANT_KEY,
        name: DEFAULT_TENANT_NAME,
        scannerImportPath: DEFAULT_TENANT_KEY,
        isActive: true,
      },
    });

    this.logger.log(`Ensured default tenant ${tenant.key}.`);
  }

  private async ensureInitialAdmin(): Promise<void> {
    const userCount = await this.prisma.user.count();
    if (userCount > 0) {
      return;
    }

    const user = await this.prisma.user.create({
      data: {
        username: INITIAL_ADMIN_USERNAME,
        displayName: INITIAL_ADMIN_DISPLAY_NAME,
        passwordHash: await argon2.hash(INITIAL_ADMIN_PASSWORD, {
          type: argon2.argon2id,
        }),
        role: 'Admin',
        passwordChangeRequired: true,
      },
    });

    this.logger.log(`Created initial admin user ${user.username}.`);
  }

  private async ensureUserTenantMemberships(): Promise<void> {
    const usersWithoutMembership = await this.prisma.user.findMany({
      where: { tenantMemberships: { none: {} } },
      select: { id: true },
    });

    if (usersWithoutMembership.length === 0) {
      return;
    }

    await this.prisma.userTenantMembership.createMany({
      data: usersWithoutMembership.map((user) => ({
        userId: user.id,
        tenantId: DEFAULT_TENANT_ID,
        isDefault: true,
      })),
      skipDuplicates: true,
    });
    this.logger.log(
      `Assigned ${usersWithoutMembership.length} users to default tenant.`,
    );
  }

  private async ensureSystemSettings(): Promise<void> {
    await Promise.all([
      this.prisma.systemSetting.upsert({
        where: { key: OCR_REPROCESS_EXISTING_TEXT_LAYER_KEY },
        create: {
          key: OCR_REPROCESS_EXISTING_TEXT_LAYER_KEY,
          value: false,
        },
        update: {},
      }),
      this.prisma.systemSetting.upsert({
        where: { key: EXTRACTION_MODE_KEY },
        create: {
          key: EXTRACTION_MODE_KEY,
          value: 'fast',
        },
        update: {},
      }),
      this.prisma.systemSetting.upsert({
        where: { key: AI_METADATA_LANGUAGE_KEY },
        create: {
          key: AI_METADATA_LANGUAGE_KEY,
          value: 'DOCUMENT_LANGUAGE',
        },
        update: {},
      }),
    ]);
    this.logger.log('Ensured initial system settings.');
  }

  private async ensureDocumentTypes(): Promise<void> {
    await Promise.all(
      INITIAL_DOCUMENT_TYPES.map((documentType) =>
        this.prisma.documentType.upsert({
          where: { key: documentType.key },
          create: {
            ...documentType,
            active: true,
            isSystem: true,
          },
          update: {
            name: documentType.name,
            displayOrder: documentType.displayOrder,
            isSystem: true,
          },
        }),
      ),
    );

    this.logger.log(
      `Ensured ${INITIAL_DOCUMENT_TYPES.length} system document types.`,
    );
  }

  private async ensureAiMetadataPrompts(): Promise<void> {
    await Promise.all(
      DEFAULT_AI_METADATA_PROMPTS.map((prompt) =>
        this.prisma.aiMetadataPrompt.upsert({
          where: { key: prompt.key },
          create: {
            key: prompt.key,
            label: prompt.label,
            description: prompt.description,
            promptText: prompt.promptText,
            defaultPromptText: prompt.promptText,
            displayOrder: prompt.displayOrder,
          },
          update: {
            label: prompt.label,
            description: prompt.description,
            defaultPromptText: prompt.promptText,
            displayOrder: prompt.displayOrder,
          },
        }),
      ),
    );

    this.logger.log(
      `Ensured ${DEFAULT_AI_METADATA_PROMPTS.length} AI metadata prompts.`,
    );
  }
}
