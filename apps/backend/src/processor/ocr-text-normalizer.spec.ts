import { normalizeOcrText } from './ocr-text-normalizer';

describe('normalizeOcrText', () => {
  it('removes OCR whitespace before punctuation without changing words', () => {
    expect(normalizeOcrText('Attached is the brief dated 31 .03.2026 . ')).toBe(
      'Attached is the brief dated 31.03.2026.',
    );
  });

  it('keeps uncertain OCR word recognition unchanged', () => {
    expect(normalizeOcrText('Submissi0n of docurnents')).toBe(
      'Submissi0n of docurnents',
    );
  });

  it('normalizes date punctuation confused by OCR', () => {
    expect(normalizeOcrText('Attached is the brief dated 31 ‚03.2026 ..')).toBe(
      'Attached is the brief dated 31.03.2026.',
    );
  });

  it('joins hyphenated line breaks and normalizes repeated spaces', () => {
    expect(normalizeOcrText('court  docu-\n  ment')).toBe('court document');
  });
});
