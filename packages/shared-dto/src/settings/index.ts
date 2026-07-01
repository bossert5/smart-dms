import { z } from 'zod';

export const ExtractionModeSchema = z.literal('fast');
export type ExtractionMode = z.infer<typeof ExtractionModeSchema>;

export const AiMetadataLanguageSchema = z.enum([
  'DOCUMENT_LANGUAGE',
  'deu',
  'eng',
  'fra',
  'spa',
  'por',
  'chi_sim',
]);
export type AiMetadataLanguage = z.infer<typeof AiMetadataLanguageSchema>;

export const SystemSettingsDtoSchema = z.object({
  ocrReprocessExistingTextLayer: z.boolean(),
  pdfRemoveBlankPages: z.boolean(),
  documentsRequireAiMetadataBeforeAcceptance: z.boolean(),
  extractionMode: ExtractionModeSchema,
  aiMetadataLanguage: AiMetadataLanguageSchema,
});
export type SystemSettingsDto = z.infer<typeof SystemSettingsDtoSchema>;

export const UpdateSystemSettingsRequestSchema = z
  .object({
    ocrReprocessExistingTextLayer: z.boolean().optional(),
    pdfRemoveBlankPages: z.boolean().optional(),
    documentsRequireAiMetadataBeforeAcceptance: z.boolean().optional(),
    extractionMode: ExtractionModeSchema.optional(),
    aiMetadataLanguage: AiMetadataLanguageSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be provided.',
  });
export type UpdateSystemSettingsRequest = z.infer<
  typeof UpdateSystemSettingsRequestSchema
>;
