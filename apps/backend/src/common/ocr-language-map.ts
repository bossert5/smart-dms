export const OCR_LANGUAGE_CODE_TO_ENGLISH_NAME = {
  deu: 'german',
  eng: 'english',
  fra: 'french',
  spa: 'spanish',
  por: 'portuguese',
  chi_sim: 'simplified chinese',
} as const;

export type OcrLanguageCode = keyof typeof OCR_LANGUAGE_CODE_TO_ENGLISH_NAME;

export type OcrLanguageName =
  (typeof OCR_LANGUAGE_CODE_TO_ENGLISH_NAME)[OcrLanguageCode];

const OCR_LANGUAGE_NAME_TO_CODE: Record<string, OcrLanguageCode> = {
  german: 'deu',
  english: 'eng',
  french: 'fra',
  spanish: 'spa',
  portuguese: 'por',
  chinese: 'chi_sim',
  'simplified chinese': 'chi_sim',
};

export function ocrLanguageNameForCode(
  code: string | null | undefined,
): OcrLanguageName | null {
  const normalized = normalizeLanguageKey(code);
  return isOcrLanguageCode(normalized)
    ? OCR_LANGUAGE_CODE_TO_ENGLISH_NAME[normalized]
    : null;
}

export function ocrLanguageCodeForCodeOrName(
  language: string | null | undefined,
): OcrLanguageCode | null {
  const normalized = normalizeLanguageKey(language);
  if (isOcrLanguageCode(normalized)) {
    return normalized;
  }

  return OCR_LANGUAGE_NAME_TO_CODE[normalized.replaceAll('_', ' ')] ?? null;
}

export function ocrLanguageNameForPrompt(
  language: string | null | undefined,
): string | null {
  const normalized = language?.trim();
  if (!normalized) {
    return null;
  }

  const code = ocrLanguageCodeForCodeOrName(normalized);
  return code ? OCR_LANGUAGE_CODE_TO_ENGLISH_NAME[code] : normalized;
}

function normalizeLanguageKey(language: string | null | undefined): string {
  return language?.trim().toLowerCase().replaceAll('-', '_') ?? '';
}

function isOcrLanguageCode(language: string): language is OcrLanguageCode {
  return language in OCR_LANGUAGE_CODE_TO_ENGLISH_NAME;
}
