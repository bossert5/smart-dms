import { Injectable } from '@nestjs/common';
import type {
  AiMetadataPromptScope,
  AiMetadataPromptStep,
} from '@smart-dms/shared-dto';
import {
  emptyResultForScope,
  evidenceCandidatesForScope,
  isEvidenceEmpty,
  type AiMetadataEvidencePack,
  type AiPromptExecutionDecision,
  type AiPromptExecutionPlan,
} from './ai-metadata-evidence';

const COMPLEX_SCOPE_KEYS = new Set<AiMetadataPromptScope>([
  'DOCUMENT_DATE',
  'PAYMENTS',
  'REFERENCES',
  'ATTRIBUTES',
  'CALENDAR_EVENTS',
]);
const SHORT_DOCUMENT_FULL_SCAN_CHAR_LIMIT = 8000;

@Injectable()
export class AiPromptPlanner {
  plan(
    prompts: readonly AiMetadataPromptStep[],
    evidence: AiMetadataEvidencePack,
    options: {
      readonly manualScopes?: readonly AiMetadataPromptScope[];
      readonly hasFieldDefinitions: boolean;
    },
  ): AiPromptExecutionPlan {
    const manualScopes = new Set(options.manualScopes ?? []);
    const skippedResult: Record<string, unknown> = {};

    const decisions = prompts.map((prompt): AiPromptExecutionDecision => {
      if (prompt.key === 'CORE_METADATA' || !isScopeKey(prompt.key)) {
        return runDecision(prompt.key, false, 'CLEANED_OCR');
      }

      if (manualScopes.has(prompt.key)) {
        return runDecision(
          prompt.key,
          shouldThink(prompt.key, evidence, options.hasFieldDefinitions),
          isEvidenceEmpty(evidence, prompt.key)
            ? 'CLEANED_OCR'
            : 'EVIDENCE_CONTEXT',
        );
      }

      const skipReason = skipReasonFor(
        prompt.key,
        evidence,
        options.hasFieldDefinitions,
      );
      if (skipReason) {
        Object.assign(skippedResult, emptyResultForScope(prompt.key));
        return {
          key: prompt.key,
          action: 'SKIP',
          enableThinking: false,
          sourceTextKind: 'EVIDENCE_CONTEXT',
          skipReason,
        };
      }

      return runDecision(
        prompt.key,
        shouldThink(prompt.key, evidence, options.hasFieldDefinitions),
        COMPLEX_SCOPE_KEYS.has(prompt.key) ? 'EVIDENCE_CONTEXT' : 'CLEANED_OCR',
      );
    });

    return { decisions, skippedResult };
  }
}

function skipReasonFor(
  scope: AiMetadataPromptScope,
  evidence: AiMetadataEvidencePack,
  hasFieldDefinitions: boolean,
): string | null {
  switch (scope) {
    case 'PAYMENTS':
      return evidence.paymentCandidates.length === 0 &&
        evidence.amountCandidates.length === 0
        ? 'No payment instruction evidence was found.'
        : null;
    case 'CALENDAR_EVENTS':
      return evidence.calendarCandidates.length === 0 &&
        evidence.dateCandidates.length === 0
        ? 'No calendar, deadline, or appointment evidence was found.'
        : null;
    case 'REFERENCES':
      return evidence.referenceCandidates.length === 0 &&
        !hasReferenceFallbackSignal(evidence.sourceText)
        ? 'No reference identifier evidence was found.'
        : null;
    case 'ATTRIBUTES':
      if (!hasFieldDefinitions) {
        return 'No AI-enabled field definitions are configured.';
      }
      return evidence.attributeCandidateSnippets.length === 0
        ? 'No configured attribute evidence was found.'
        : null;
    case 'DOCUMENT_DATE':
      return evidence.dateCandidates.length === 0
        ? 'No date evidence was found.'
        : null;
    default:
      return null;
  }
}

function hasReferenceFallbackSignal(sourceText: string): boolean {
  return (
    sourceText.length <= SHORT_DOCUMENT_FULL_SCAN_CHAR_LIMIT &&
    /(?:[A-Z]{1,8}[-/][A-Z0-9]{2,}|\b\d{3,}[A-Z0-9/-]*\b)/i.test(sourceText)
  );
}

function shouldThink(
  scope: AiMetadataPromptScope,
  evidence: AiMetadataEvidencePack,
  hasFieldDefinitions: boolean,
): boolean {
  if (!COMPLEX_SCOPE_KEYS.has(scope)) {
    return false;
  }
  if (scope === 'ATTRIBUTES') {
    return (
      hasFieldDefinitions && evidence.attributeCandidateSnippets.length > 0
    );
  }
  return evidenceCandidatesForScope(evidence, scope).length > 1;
}

function runDecision(
  key: string,
  enableThinking: boolean,
  sourceTextKind: AiPromptExecutionDecision['sourceTextKind'],
): AiPromptExecutionDecision {
  return {
    key,
    action: 'RUN',
    enableThinking,
    sourceTextKind,
  };
}

function isScopeKey(key: string): key is AiMetadataPromptScope {
  return key !== 'CORE_METADATA';
}
