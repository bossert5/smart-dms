import { AiOcrTextPreprocessor } from './ai-ocr-text-preprocessor';

describe('AiOcrTextPreprocessor', () => {
  const preprocessor = new AiOcrTextPreprocessor();

  it('removes repeated layout lines while preserving document content', () => {
    const result = preprocessor.preprocess(
      [
        'Smart DMS Export',
        'Invoice R-100',
        'Smart DMS Export',
        'Please pay 119,90 EUR.',
        'Smart DMS Export',
      ].join('\n'),
    );

    expect(result.cleanedText).not.toContain('Smart DMS Export');
    expect(result.cleanedText).toContain('Invoice R-100');
    expect(result.cleanedText).toContain('119,90 EUR');
  });

  it('repairs simple hyphenation and soft line breaks', () => {
    const result = preprocessor.preprocess(
      ['Please trans-', 'fer the amount', 'by tomorrow.'].join('\n'),
    );

    expect(result.cleanedText).toContain('Please transfer the amount');
  });

  it('keeps critical identifiers, amounts, and dates even when repeated', () => {
    const text = [
      'IBAN DE02120300000000202051',
      'IBAN DE02120300000000202051',
      'IBAN DE02120300000000202051',
      'Invoice dated 20 May 2026',
      'Amount 119.90 EUR',
    ].join('\n');

    const result = preprocessor.preprocess(text);

    expect(result.cleanedText).toContain('DE02120300000000202051');
    expect(result.cleanedText).toContain('20 May 2026');
    expect(result.cleanedText).toContain('119.90 EUR');
  });
});
