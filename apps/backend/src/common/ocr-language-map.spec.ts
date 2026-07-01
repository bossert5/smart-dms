import {
  OCR_LANGUAGE_CODE_TO_ENGLISH_NAME,
  ocrLanguageCodeForCodeOrName,
  ocrLanguageNameForCode,
  ocrLanguageNameForPrompt,
} from './ocr-language-map';

describe('OCR language mapping', () => {
  it('maps supported Tesseract language codes to English names', () => {
    expect(OCR_LANGUAGE_CODE_TO_ENGLISH_NAME).toEqual({
      deu: 'german',
      eng: 'english',
      fra: 'french',
      spa: 'spanish',
      por: 'portuguese',
      chi_sim: 'simplified chinese',
    });
    expect(ocrLanguageNameForCode('deu')).toBe('german');
    expect(ocrLanguageNameForCode('eng')).toBe('english');
    expect(ocrLanguageNameForCode('unknown')).toBeNull();
  });

  it('normalizes English names and legacy codes for downstream AI logic', () => {
    expect(ocrLanguageCodeForCodeOrName('german')).toBe('deu');
    expect(ocrLanguageCodeForCodeOrName('deu')).toBe('deu');
    expect(ocrLanguageCodeForCodeOrName('simplified chinese')).toBe('chi_sim');
    expect(ocrLanguageNameForPrompt('deu')).toBe('german');
    expect(ocrLanguageNameForPrompt('german')).toBe('german');
    expect(ocrLanguageNameForPrompt('Esperanto')).toBe('Esperanto');
  });
});
