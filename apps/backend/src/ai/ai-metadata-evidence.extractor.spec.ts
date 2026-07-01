import { expectArrayContaining } from '../testing/expect-matchers';
import { AiMetadataEvidenceExtractor } from './ai-metadata-evidence.extractor';

describe('AiMetadataEvidenceExtractor', () => {
  const extractor = new AiMetadataEvidenceExtractor();

  it('extracts payment evidence with amount, iban, and purpose context', () => {
    const evidence = extractor.extract(
      [
        'Rechnung R-100',
        'Bitte ueberweisen Sie den offenen Betrag von 119,90 EUR.',
        'IBAN: DE02120300000000202051',
        'Verwendungszweck: Rechnung R-100 Kundennummer K-42',
      ].join('\n'),
      'deu',
    );

    expect(
      evidence.amountCandidates.map((candidate) => candidate.value),
    ).toContain('119,90 EUR');
    expect(
      evidence.paymentCandidates.map((candidate) => candidate.value),
    ).toContain('DE02120300000000202051');
    expect(evidence.referenceCandidates.length).toBeGreaterThan(0);
  });

  it('extracts calendar evidence from appointment and deadline wording', () => {
    const evidence = extractor.extract(
      'Bitte erscheinen Sie zum Termin am 30.06.2026 und antworten Sie bis zum 15.06.2026.',
      'deu',
    );

    expect(evidence.dateCandidates).toHaveLength(2);
    expect(evidence.calendarCandidates.length).toBeGreaterThan(0);
  });

  it('does not create payment evidence for an isolated amount', () => {
    const evidence = extractor.extract(
      'Der Vertrag nennt einen Projektwert von 119,90 EUR fuer die Planung.',
      'deu',
    );

    expect(evidence.amountCandidates).toHaveLength(1);
    expect(evidence.paymentCandidates).toHaveLength(0);
  });

  it('uses all language hints when OCR language is missing', () => {
    const evidence = extractor.extract(
      'Le paiement est dû le 12.07.2026. Référence facture FAC-2026-7.',
      null,
    );

    expect(evidence.paymentCandidates.length).toBeGreaterThan(0);
    expect(
      evidence.dateCandidates.map((candidate) => candidate.value),
    ).toContain('12.07.2026');
  });

  it('extracts dates and references from OCR text with glued labels', () => {
    const evidence = extractor.extract(
      [
        'Rechnungs-Nr.: 406050Datum: 20.05.2026Liefer-/Leistungsdatum: 24.04.2026Kunden-Nr.: 1920Sachbearbeiter/-in: Carsten',
        'Zahlbar innerhalb von 7 Tagen ohne Abzug Gesamtbetrag: 281,80 €',
      ].join(''),
      'deu',
    );

    expect(evidence.dateCandidates.map((candidate) => candidate.value)).toEqual(
      expectArrayContaining(['20.05.2026', '24.04.2026']),
    );
    expect(
      evidence.referenceCandidates.map((candidate) => ({
        value: candidate.value,
        label: candidate.label,
      })),
    ).toEqual(
      expectArrayContaining([
        { value: '406050', label: 'Rechnungs-Nr.' },
        { value: '1920', label: 'Kunden-Nr.' },
      ]),
    );
    expect(
      evidence.calendarCandidates.map((candidate) => candidate.label),
    ).toEqual(expectArrayContaining(['zahlbar', 'innerhalb von']));
  });

  it('validates spaced IBANs and rejects tax-id shaped OCR fragments', () => {
    const evidence = extractor.extract(
      [
        'USt-IdNr: DE315477406Fahrzeugtechnik Löw',
        'IBAN: DE79 5095 0068 0002 1420 32',
      ].join('\n'),
      'deu',
    );

    expect(
      evidence.paymentCandidates.map((candidate) => candidate.value),
    ).toContain('DE79509500680002142032');
    expect(
      evidence.paymentCandidates.map((candidate) => candidate.value),
    ).not.toContain('DE315477406FAHRZEUGTECHNIK');
  });

  it('extracts letter reference labels from compact header OCR', () => {
    const evidence = extractor.extract(
      'Unser Zeichen: CBA/FEFrau Mara BeispielDatum: 19.05.2026BV: 70177 Musterstadt 4. BA',
      'deu',
    );

    expect(
      evidence.referenceCandidates.map((candidate) => ({
        value: candidate.value,
        label: candidate.label,
      })),
    ).toEqual(
      expectArrayContaining([
        { value: 'CBA/FE', label: 'Zeichen' },
        { value: '70177', label: 'BV' },
      ]),
    );
  });

  it.each([
    {
      language: 'eng',
      text: 'Invoice INV-42. Amount due 119.90 EUR. Respond by 12.07.2026.',
      reference: 'INV-42',
    },
    {
      language: 'fra',
      text: 'Facture FAC-42. Montant dû 119,90 EUR. Répondre avant 12.07.2026.',
      reference: 'FAC-42',
    },
    {
      language: 'spa',
      text: 'Factura FAC-42. Importe adeudado 119,90 EUR. Responder antes 12.07.2026.',
      reference: 'FAC-42',
    },
    {
      language: 'por',
      text: 'Fatura FAT-42. Valor devido 119,90 EUR. Responder até 12.07.2026.',
      reference: 'FAT-42',
    },
    {
      language: 'chi_sim',
      text: '发票号：FP2026 应付金额 119.90 EUR 回复截止 12.07.2026',
      reference: 'FP2026',
    },
  ])(
    'extracts payment, calendar, and reference evidence for $language',
    ({ language, text, reference }) => {
      const evidence = extractor.extract(text, language);

      expect(evidence.paymentCandidates.length).toBeGreaterThan(0);
      expect(evidence.calendarCandidates.length).toBeGreaterThan(0);
      expect(
        evidence.referenceCandidates.map((candidate) => candidate.value),
      ).toContain(reference);
    },
  );

  it('uses only the selected language triggers for known OCR languages', () => {
    const englishEvidence = extractor.extract(
      'Please pay 119.90 EUR. Bitte antworten Sie bis zum 12.07.2026.',
      'english',
    );
    const germanEvidence = extractor.extract(
      'Please pay 119.90 EUR. Bitte antworten Sie bis zum 12.07.2026.',
      'german',
    );

    expect(
      englishEvidence.paymentCandidates.map((candidate) => candidate.label),
    ).toContain('pay');
    expect(englishEvidence.calendarCandidates).toHaveLength(0);
    expect(germanEvidence.paymentCandidates).toHaveLength(0);
    expect(
      germanEvidence.calendarCandidates.map((candidate) => candidate.label),
    ).toContain('antworten sie bis');
  });

  it.each([undefined, 'unknown', 'deu+eng'])(
    'falls back to all trigger files for %s',
    (language) => {
      const evidence = extractor.extract(
        [
          'Payment due 119.90 EUR.',
          'Bitte antworten Sie bis zum 12.07.2026.',
          'Référence FAC-2026-7.',
        ].join('\n'),
        language,
      );

      expect(evidence.paymentCandidates.length).toBeGreaterThan(0);
      expect(evidence.calendarCandidates.length).toBeGreaterThan(0);
      expect(
        evidence.referenceCandidates.map((candidate) => candidate.value),
      ).toContain('FAC-2026-7');
    },
  );
});
