import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  AiMetadataLanguage,
  AiMetadataPromptDto,
  AiMetadataPromptScope,
  CreateDocumentFieldDefinitionRequest,
  CreateDocumentTypeRequest,
  DocumentFieldDefinitionDto,
  DocumentTypeDto,
  ReorderDocumentTypesRequest,
  SystemSettingsDto,
  UpdateDocumentFieldDefinitionRequest,
  UpdateDocumentTypeRequest,
  UpdateAiMetadataPromptRequest,
  UpdateSystemSettingsRequest,
} from '@smart-dms/shared-dto';
import {
  DEFAULT_AI_METADATA_PROMPTS,
  defaultPromptByScope,
} from '../ai/ai-metadata-prompt.defaults';
import { toIsoDateTime } from '../common/date-mapper';
import {
  toDocumentFieldDefinitionDto,
  toDocumentTypeDto,
} from '../documents/document.mapper';
import { PrismaService } from '../prisma/prisma.service';

const OCR_REPROCESS_EXISTING_TEXT_LAYER_KEY = 'ocr.reprocessExistingTextLayer';
const PDF_REMOVE_BLANK_PAGES_KEY = 'pdf.removeBlankPages';
const DOCUMENTS_REQUIRE_AI_METADATA_BEFORE_ACCEPTANCE_KEY =
  'documents.requireAiMetadataBeforeAcceptance';
export const EXTRACTION_MODE_KEY = 'extraction.mode';
export const DEFAULT_EXTRACTION_MODE = 'fast' as const;
export const AI_METADATA_LANGUAGE_KEY = 'ai.metadataLanguage';
export const DEFAULT_AI_METADATA_LANGUAGE = 'DOCUMENT_LANGUAGE' as const;
const SYSTEM_DOCUMENT_TYPE_LOCKED_FIELDS = [
  'key',
  'name',
  'displayOrder',
] as const;

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async getSettings(): Promise<SystemSettingsDto> {
    const settings = await this.prisma.systemSetting.findMany({
      where: {
        key: {
          in: [
            OCR_REPROCESS_EXISTING_TEXT_LAYER_KEY,
            PDF_REMOVE_BLANK_PAGES_KEY,
            DOCUMENTS_REQUIRE_AI_METADATA_BEFORE_ACCEPTANCE_KEY,
            EXTRACTION_MODE_KEY,
            AI_METADATA_LANGUAGE_KEY,
          ],
        },
      },
    });
    const settingsByKey = new Map(
      settings.map((setting) => [setting.key, setting.value]),
    );

    return {
      ocrReprocessExistingTextLayer: booleanSetting(
        settingsByKey.get(OCR_REPROCESS_EXISTING_TEXT_LAYER_KEY),
        false,
      ),
      pdfRemoveBlankPages: booleanSetting(
        settingsByKey.get(PDF_REMOVE_BLANK_PAGES_KEY),
        false,
      ),
      documentsRequireAiMetadataBeforeAcceptance: booleanSetting(
        settingsByKey.get(DOCUMENTS_REQUIRE_AI_METADATA_BEFORE_ACCEPTANCE_KEY),
        false,
      ),
      extractionMode: extractionModeSetting(
        settingsByKey.get(EXTRACTION_MODE_KEY),
        DEFAULT_EXTRACTION_MODE,
      ),
      aiMetadataLanguage: aiMetadataLanguageSetting(
        settingsByKey.get(AI_METADATA_LANGUAGE_KEY),
        DEFAULT_AI_METADATA_LANGUAGE,
      ),
    };
  }

  async updateSettings(
    input: UpdateSystemSettingsRequest,
  ): Promise<SystemSettingsDto> {
    if (input.ocrReprocessExistingTextLayer !== undefined) {
      await this.prisma.systemSetting.upsert({
        where: { key: OCR_REPROCESS_EXISTING_TEXT_LAYER_KEY },
        create: {
          key: OCR_REPROCESS_EXISTING_TEXT_LAYER_KEY,
          value: input.ocrReprocessExistingTextLayer,
        },
        update: {
          value: input.ocrReprocessExistingTextLayer,
        },
      });
    }
    if (input.pdfRemoveBlankPages !== undefined) {
      await this.prisma.systemSetting.upsert({
        where: { key: PDF_REMOVE_BLANK_PAGES_KEY },
        create: {
          key: PDF_REMOVE_BLANK_PAGES_KEY,
          value: input.pdfRemoveBlankPages,
        },
        update: {
          value: input.pdfRemoveBlankPages,
        },
      });
    }
    if (input.documentsRequireAiMetadataBeforeAcceptance !== undefined) {
      await this.prisma.systemSetting.upsert({
        where: {
          key: DOCUMENTS_REQUIRE_AI_METADATA_BEFORE_ACCEPTANCE_KEY,
        },
        create: {
          key: DOCUMENTS_REQUIRE_AI_METADATA_BEFORE_ACCEPTANCE_KEY,
          value: input.documentsRequireAiMetadataBeforeAcceptance,
        },
        update: {
          value: input.documentsRequireAiMetadataBeforeAcceptance,
        },
      });
    }
    if (input.extractionMode !== undefined) {
      await this.prisma.systemSetting.upsert({
        where: { key: EXTRACTION_MODE_KEY },
        create: {
          key: EXTRACTION_MODE_KEY,
          value: input.extractionMode,
        },
        update: {
          value: input.extractionMode,
        },
      });
    }
    if (input.aiMetadataLanguage !== undefined) {
      await this.prisma.systemSetting.upsert({
        where: { key: AI_METADATA_LANGUAGE_KEY },
        create: {
          key: AI_METADATA_LANGUAGE_KEY,
          value: input.aiMetadataLanguage,
        },
        update: {
          value: input.aiMetadataLanguage,
        },
      });
    }

    return this.getSettings();
  }

  async listAiMetadataPrompts(): Promise<AiMetadataPromptDto[]> {
    const prompts = await this.prisma.aiMetadataPrompt.findMany({
      orderBy: [{ displayOrder: 'asc' }, { key: 'asc' }],
    });

    return prompts.map(toAiMetadataPromptDto);
  }

  async updateAiMetadataPrompt(
    key: AiMetadataPromptScope,
    input: UpdateAiMetadataPromptRequest,
  ): Promise<AiMetadataPromptDto> {
    const existing = await this.prisma.aiMetadataPrompt.findUnique({
      where: { key },
    });
    if (!existing) {
      throw new NotFoundException('AI metadata prompt not found.');
    }

    const prompt = await this.prisma.aiMetadataPrompt.update({
      where: { key },
      data: { promptText: input.promptText.trim() },
    });

    return toAiMetadataPromptDto(prompt);
  }

  async resetAiMetadataPrompt(
    key: AiMetadataPromptScope,
  ): Promise<AiMetadataPromptDto> {
    const defaults = defaultPromptByScope(key);
    const prompt = await this.prisma.aiMetadataPrompt.upsert({
      where: { key },
      create: {
        key,
        label: defaults.label,
        description: defaults.description,
        promptText: defaults.promptText,
        defaultPromptText: defaults.promptText,
        displayOrder: defaults.displayOrder,
      },
      update: {
        label: defaults.label,
        description: defaults.description,
        promptText: defaults.promptText,
        defaultPromptText: defaults.promptText,
        displayOrder: defaults.displayOrder,
      },
    });

    return toAiMetadataPromptDto(prompt);
  }

  async ensureAiMetadataPrompts(): Promise<void> {
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
  }

  async listDocumentTypes(): Promise<DocumentTypeDto[]> {
    const documentTypes = await this.prisma.documentType.findMany({
      orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
    });

    return documentTypes.map(toDocumentTypeDto);
  }

  async createDocumentType(
    input: CreateDocumentTypeRequest,
  ): Promise<DocumentTypeDto> {
    const documentType = await this.prisma.documentType.create({
      data: input,
    });

    return toDocumentTypeDto(documentType);
  }

  async updateDocumentType(
    id: string,
    input: UpdateDocumentTypeRequest,
  ): Promise<DocumentTypeDto> {
    const existingDocumentType = await this.prisma.documentType.findUnique({
      where: { id },
    });
    if (!existingDocumentType) {
      throw new NotFoundException('Document type not found.');
    }

    if (existingDocumentType.isSystem) {
      this.assertSystemDocumentTypeUpdate(input);
    }

    const documentType = await this.prisma.documentType.update({
      where: { id },
      data: existingDocumentType.isSystem
        ? { active: input.active ?? existingDocumentType.active }
        : input,
    });

    return toDocumentTypeDto(documentType);
  }

  async reorderDocumentTypes(
    input: ReorderDocumentTypesRequest,
  ): Promise<DocumentTypeDto[]> {
    const uniqueIds = new Set(input.documentTypeIds);
    if (uniqueIds.size !== input.documentTypeIds.length) {
      throw new BadRequestException(
        'Document type reorder payload must contain every document type exactly once.',
      );
    }

    const existingDocumentTypes = await this.prisma.documentType.findMany({
      select: { id: true },
    });
    const existingIds = new Set(
      existingDocumentTypes.map((documentType) => documentType.id),
    );
    const containsEveryDocumentType =
      existingIds.size === input.documentTypeIds.length &&
      input.documentTypeIds.every((id) => existingIds.has(id));
    if (!containsEveryDocumentType) {
      throw new BadRequestException(
        'Document type reorder payload must contain every document type exactly once.',
      );
    }

    await this.prisma.$transaction(
      input.documentTypeIds.map((id, index) =>
        this.prisma.documentType.update({
          where: { id },
          data: { displayOrder: (index + 1) * 10 },
        }),
      ),
    );

    return this.listDocumentTypes();
  }

  async deleteDocumentType(id: string): Promise<void> {
    const existingDocumentType = await this.prisma.documentType.findUnique({
      where: { id },
    });
    if (!existingDocumentType) {
      throw new NotFoundException('Document type not found.');
    }
    if (existingDocumentType.isSystem) {
      throw new BadRequestException('System document types cannot be deleted.');
    }

    await this.prisma.documentType.delete({ where: { id } });
  }

  async listDocumentFieldDefinitions(): Promise<DocumentFieldDefinitionDto[]> {
    const definitions = await this.prisma.documentFieldDefinition.findMany({
      include: { documentTypes: true },
      orderBy: [{ displayOrder: 'asc' }, { label: 'asc' }],
    });

    return definitions.map(toDocumentFieldDefinitionDto);
  }

  async createDocumentFieldDefinition(
    input: CreateDocumentFieldDefinitionRequest,
  ): Promise<DocumentFieldDefinitionDto> {
    const definition = await this.prisma.documentFieldDefinition.create({
      data: {
        key: input.key,
        label: input.label,
        valueType: input.valueType,
        required: input.required,
        active: input.active,
        displayOrder: input.displayOrder,
        appliesToAllDocumentTypes: input.appliesToAllDocumentTypes,
        includeInFullTextSearch: input.includeInFullTextSearch,
        includeInAiExtraction: input.includeInAiExtraction,
        documentTypes: input.appliesToAllDocumentTypes
          ? undefined
          : {
              createMany: {
                data: input.documentTypeIds.map((documentTypeId) => ({
                  documentTypeId,
                })),
              },
            },
      },
      include: { documentTypes: true },
    });

    return toDocumentFieldDefinitionDto(definition);
  }

  async updateDocumentFieldDefinition(
    id: string,
    input: UpdateDocumentFieldDefinitionRequest,
  ): Promise<DocumentFieldDefinitionDto> {
    const definition = await this.prisma.$transaction(async (tx) => {
      await tx.documentFieldDefinition.update({
        where: { id },
        data: {
          key: input.key,
          label: input.label,
          valueType: input.valueType,
          required: input.required,
          active: input.active,
          displayOrder: input.displayOrder,
          appliesToAllDocumentTypes: input.appliesToAllDocumentTypes,
          includeInFullTextSearch: input.includeInFullTextSearch,
          includeInAiExtraction: input.includeInAiExtraction,
        },
      });

      if (input.documentTypeIds || input.appliesToAllDocumentTypes === true) {
        await tx.documentFieldDefinitionScope.deleteMany({
          where: { fieldDefinitionId: id },
        });

        if (input.appliesToAllDocumentTypes !== true) {
          const documentTypeIds = input.documentTypeIds ?? [];
          if (documentTypeIds.length > 0) {
            await tx.documentFieldDefinitionScope.createMany({
              data: documentTypeIds.map((documentTypeId) => ({
                fieldDefinitionId: id,
                documentTypeId,
              })),
              skipDuplicates: true,
            });
          }
        }
      }

      return tx.documentFieldDefinition.findUniqueOrThrow({
        where: { id },
        include: { documentTypes: true },
      });
    });

    return toDocumentFieldDefinitionDto(definition);
  }

  async deleteDocumentFieldDefinition(id: string): Promise<void> {
    const existingDefinition =
      await this.prisma.documentFieldDefinition.findUnique({
        where: { id },
      });
    if (!existingDefinition) {
      throw new NotFoundException('Document field definition not found.');
    }

    await this.prisma.documentFieldDefinition.delete({ where: { id } });
  }

  private assertSystemDocumentTypeUpdate(
    input: UpdateDocumentTypeRequest,
  ): void {
    const hasLockedField = SYSTEM_DOCUMENT_TYPE_LOCKED_FIELDS.some(
      (field) => input[field] !== undefined,
    );
    if (hasLockedField || input.active === undefined) {
      throw new BadRequestException(
        'System document types can only be activated or deactivated.',
      );
    }
  }
}

function booleanSetting(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function extractionModeSetting(
  value: unknown,
  fallback: typeof DEFAULT_EXTRACTION_MODE,
): typeof DEFAULT_EXTRACTION_MODE {
  return value === 'fast' ? value : fallback;
}

function aiMetadataLanguageSetting(
  value: unknown,
  fallback: typeof DEFAULT_AI_METADATA_LANGUAGE,
): AiMetadataLanguage {
  return isAiMetadataLanguage(value) ? value : fallback;
}

function isAiMetadataLanguage(value: unknown): value is AiMetadataLanguage {
  return (
    value === 'DOCUMENT_LANGUAGE' ||
    value === 'deu' ||
    value === 'eng' ||
    value === 'fra' ||
    value === 'spa' ||
    value === 'por' ||
    value === 'chi_sim'
  );
}

function toAiMetadataPromptDto(prompt: {
  key: string;
  label: string;
  description: string;
  promptText: string;
  defaultPromptText: string;
  displayOrder: number;
  createdAt: Date;
  updatedAt: Date;
}): AiMetadataPromptDto {
  return {
    key: prompt.key as AiMetadataPromptScope,
    label: prompt.label,
    description: prompt.description,
    promptText: prompt.promptText,
    defaultPromptText: prompt.defaultPromptText,
    displayOrder: prompt.displayOrder,
    createdAt: toIsoDateTime(prompt.createdAt),
    updatedAt: toIsoDateTime(prompt.updatedAt),
  };
}
