import { normalizeOcrText } from './ocr-text-normalizer';

describe('normalizeOcrText', () => {
  it('removes OCR whitespace before punctuation without changing words', () => {
    expect(
      normalizeOcrText(
        'anliegend erhalten Sie den Schriftsatz vom 31 .03.2026 . ',
      ),
    ).toBe('anliegend erhalten Sie den Schriftsatz vom 31.03.2026.');
  });

  it('keeps uncertain OCR word recognition unchanged', () => {
    expect(normalizeOcrText('Ubermittiung von Schriftstiicken')).toBe(
      'Ubermittiung von Schriftstiicken',
    );
  });

  it('normalizes date punctuation confused by OCR', () => {
    expect(
      normalizeOcrText(
        'anliegend erhalten Sie den Schriftsatz vom 31 ‚03.2026 ..',
      ),
    ).toBe('anliegend erhalten Sie den Schriftsatz vom 31.03.2026.');
  });

  it('joins hyphenated line breaks and normalizes repeated spaces', () => {
    expect(normalizeOcrText('Schrift-\n  satz  vom  Gericht')).toBe(
      'Schriftsatz vom Gericht',
    );
  });
});
