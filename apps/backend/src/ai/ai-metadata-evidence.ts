import type { AiMetadataPromptScope } from '@smart-dms/shared-dto';

export type AiPromptSourceTextKind =
  | 'RAW_OCR'
  | 'CLEANED_OCR'
  | 'EVIDENCE_CONTEXT';

export interface AiOcrPreprocessingResult {
  readonly rawText: string;
  readonly cleanedText: string;
  readonly lineCountBefore: number;
  readonly lineCountAfter: number;
  readonly charCountBefore: number;
  readonly charCountAfter: number;
}

export interface AiEvidenceCandidate {
  readonly value: string;
  readonly label?: string;
  readonly snippet: string;
  readonly offset: number;
  readonly lineNumber: number;
}

export interface AiMetadataEvidencePack {
  readonly sourceText: string;
  readonly dateCandidates: readonly AiEvidenceCandidate[];
  readonly amountCandidates: readonly AiEvidenceCandidate[];
  readonly paymentCandidates: readonly AiEvidenceCandidate[];
  readonly partyCandidates: readonly AiEvidenceCandidate[];
  readonly referenceCandidates: readonly AiEvidenceCandidate[];
  readonly calendarCandidates: readonly AiEvidenceCandidate[];
  readonly attributeCandidateSnippets: readonly AiEvidenceCandidate[];
}

export interface AiPromptExecutionDecision {
  readonly key: string;
  readonly action: 'RUN' | 'SKIP';
  readonly enableThinking: boolean;
  readonly sourceTextKind: AiPromptSourceTextKind;
  readonly skipReason?: string;
}

export interface AiPromptExecutionPlan {
  readonly decisions: readonly AiPromptExecutionDecision[];
  readonly skippedResult: Record<string, unknown>;
}

const EMPTY_RESULTS_BY_SCOPE: Partial<
  Record<AiMetadataPromptScope, Record<string, unknown>>
> = {
  DOCUMENT_DATE: { documentDate: null },
  PAYMENTS: { payments: [] },
  REFERENCES: { references: [] },
  ATTRIBUTES: { attributes: [] },
  CALENDAR_EVENTS: { calendarEvents: [] },
};

export function emptyResultForScope(
  scope: AiMetadataPromptScope,
): Record<string, unknown> {
  return EMPTY_RESULTS_BY_SCOPE[scope] ?? {};
}

export function isEvidenceEmpty(
  evidence: AiMetadataEvidencePack,
  scope: AiMetadataPromptScope,
): boolean {
  return evidenceCandidatesForScope(evidence, scope).length === 0;
}

export function evidenceCandidatesForScope(
  evidence: AiMetadataEvidencePack,
  scope: AiMetadataPromptScope,
): readonly AiEvidenceCandidate[] {
  switch (scope) {
    case 'DOCUMENT_DATE':
      return evidence.dateCandidates;
    case 'PAYMENTS':
      return [...evidence.paymentCandidates, ...evidence.amountCandidates];
    case 'REFERENCES':
      return evidence.referenceCandidates;
    case 'ATTRIBUTES':
      return evidence.attributeCandidateSnippets;
    case 'CALENDAR_EVENTS':
      return evidence.calendarCandidates;
    case 'PARTIES':
      return evidence.partyCandidates;
    default:
      return [];
  }
}

export function uniqueEvidenceSnippets(
  candidates: readonly AiEvidenceCandidate[],
  limit: number,
): string[] {
  const snippets: string[] = [];
  const seen = new Set<string>();
  for (const candidate of candidates) {
    const normalized = candidate.snippet.replace(/\s+/g, ' ').trim();
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    snippets.push(normalized);
    seen.add(normalized);
    if (snippets.length >= limit) {
      break;
    }
  }
  return snippets;
}
