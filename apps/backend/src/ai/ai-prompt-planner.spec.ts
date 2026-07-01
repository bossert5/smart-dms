import { expectObjectContaining } from '../testing/expect-matchers';
import type { AiMetadataPromptStep } from '@smart-dms/shared-dto';
import type { AiMetadataEvidencePack } from './ai-metadata-evidence';
import { AiPromptPlanner } from './ai-prompt-planner';

const prompts: AiMetadataPromptStep[] = [
  { key: 'CORE_METADATA', text: 'core', resultSchema: {} },
  { key: 'PAYMENTS', text: 'payments', resultSchema: {} },
  { key: 'REFERENCES', text: 'references', resultSchema: {} },
  { key: 'CALENDAR_EVENTS', text: 'calendar', resultSchema: {} },
  { key: 'ATTRIBUTES', text: 'attributes', resultSchema: {} },
];

describe('AiPromptPlanner', () => {
  const planner = new AiPromptPlanner();

  it('skips irrelevant automatic scopes with schema-compatible empty results', () => {
    const plan = planner.plan(
      prompts,
      emptyEvidence({ sourceText: 'No reference evidence. '.repeat(500) }),
      {
        hasFieldDefinitions: false,
      },
    );

    expect(plan.decisions.map((decision) => decision.action)).toEqual([
      'RUN',
      'SKIP',
      'SKIP',
      'SKIP',
      'SKIP',
    ]);
    expect(plan.skippedResult).toEqual({
      payments: [],
      references: [],
      calendarEvents: [],
      attributes: [],
    });
  });

  it('runs manually requested scopes even without evidence', () => {
    const plan = planner.plan(prompts, emptyEvidence(), {
      manualScopes: ['PAYMENTS'],
      hasFieldDefinitions: false,
    });

    const paymentDecision = plan.decisions.find(
      (decision) => decision.key === 'PAYMENTS',
    );
    expect(paymentDecision).toEqual(
      expectObjectContaining({
        action: 'RUN',
        sourceTextKind: 'CLEANED_OCR',
      }),
    );
    expect(plan.skippedResult).not.toHaveProperty('payments');
  });

  it('enables thinking only when complex evidence is ambiguous', () => {
    const evidence = emptyEvidence({
      paymentCandidates: [
        candidate('IBAN DE02120300000000202051'),
        candidate('Bitte zahlen Sie 119,90 EUR'),
      ],
    });

    const plan = planner.plan(prompts, evidence, {
      hasFieldDefinitions: false,
    });

    expect(
      plan.decisions.find((decision) => decision.key === 'PAYMENTS'),
    ).toEqual(
      expectObjectContaining({
        action: 'RUN',
        enableThinking: true,
        sourceTextKind: 'EVIDENCE_CONTEXT',
      }),
    );
    expect(
      plan.decisions.find((decision) => decision.key === 'CORE_METADATA'),
    ).toEqual(expectObjectContaining({ enableThinking: false }));
  });

  it('runs reference extraction on short documents even without regex evidence', () => {
    const plan = planner.plan(
      prompts,
      emptyEvidence({ sourceText: 'Internal ID AB-2026/42' }),
      {
        hasFieldDefinitions: false,
      },
    );

    expect(
      plan.decisions.find((decision) => decision.key === 'REFERENCES'),
    ).toEqual(expectObjectContaining({ action: 'RUN' }));
    expect(plan.skippedResult).not.toHaveProperty('references');
  });
});

function emptyEvidence(
  overrides: Partial<AiMetadataEvidencePack> = {},
): AiMetadataEvidencePack {
  return {
    sourceText: 'Document text',
    dateCandidates: [],
    amountCandidates: [],
    paymentCandidates: [],
    partyCandidates: [],
    referenceCandidates: [],
    calendarCandidates: [],
    attributeCandidateSnippets: [],
    ...overrides,
  };
}

function candidate(value: string) {
  return {
    value,
    snippet: value,
    offset: 0,
    lineNumber: 1,
  };
}
