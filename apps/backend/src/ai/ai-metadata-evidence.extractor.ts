import { Injectable } from '@nestjs/common';
import type {
  AiEvidenceCandidate,
  AiMetadataEvidencePack,
} from './ai-metadata-evidence';
import { evidenceTriggersForLanguage } from './evidence-triggers';
import type { EvidenceTriggerSet } from './evidence-triggers';

const SNIPPET_RADIUS = 260;
const MAX_CANDIDATES_PER_KIND = 40;

const DATE_PATTERN =
  /(?<!\d)(?:\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4})(?!\d)/g;
const AMOUNT_PATTERN =
  /\b\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})\s?(?:EUR|USD|CHF|GBP|€|\$|£)\b|\b(?:EUR|USD|CHF|GBP|€|\$|£)\s?\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})\b/gi;
const IBAN_PATTERN = /\b[A-Z]{2}\d{2}(?:[ \u00a0]?[A-Z0-9]){10,30}\b/gi;

@Injectable()
export class AiMetadataEvidenceExtractor {
  extract(
    sourceText: string,
    ocrLanguage?: string | null,
  ): AiMetadataEvidencePack {
    const normalized = sourceText.trim();
    const triggers = evidenceTriggersForLanguage(ocrLanguage);
    const patterns = patternsForTriggers(triggers);
    return {
      sourceText: normalized,
      dateCandidates: regexCandidates(normalized, DATE_PATTERN),
      amountCandidates: regexCandidates(normalized, AMOUNT_PATTERN),
      paymentCandidates: [
        ...ibanCandidates(normalized),
        ...hintCandidates(normalized, triggers.payment),
      ].slice(0, MAX_CANDIDATES_PER_KIND),
      partyCandidates: hintCandidates(normalized, triggers.party),
      referenceCandidates: referenceCandidates(
        normalized,
        patterns.reference,
        patterns.gluedNextLabel,
        patterns.trailingOcrLabel,
      ),
      calendarCandidates: hintCandidates(normalized, triggers.calendar),
      attributeCandidateSnippets: hintCandidates(
        normalized,
        triggers.attribute,
      ),
    };
  }
}

function ibanCandidates(text: string): AiEvidenceCandidate[] {
  const candidates: AiEvidenceCandidate[] = [];
  for (const match of text.matchAll(IBAN_PATTERN)) {
    const value = normalizeIban(match[0]);
    if (!value || !isValidIban(value)) {
      continue;
    }
    candidates.push(candidateFor(text, match.index ?? 0, value, 'iban'));
    if (candidates.length >= MAX_CANDIDATES_PER_KIND) {
      break;
    }
  }
  return dedupeCandidates(candidates);
}

function regexCandidates(
  text: string,
  pattern: RegExp,
  label?: string,
): AiEvidenceCandidate[] {
  const candidates: AiEvidenceCandidate[] = [];
  for (const match of text.matchAll(pattern)) {
    const value = match[0]?.trim();
    if (!value) {
      continue;
    }
    candidates.push(candidateFor(text, match.index ?? 0, value, label));
    if (candidates.length >= MAX_CANDIDATES_PER_KIND) {
      break;
    }
  }
  return dedupeCandidates(candidates);
}

function referenceCandidates(
  text: string,
  referencePattern: RegExp,
  gluedNextLabelPattern: RegExp | null,
  trailingOcrLabelPattern: RegExp | null,
): AiEvidenceCandidate[] {
  const candidates: AiEvidenceCandidate[] = [];
  for (const match of text.matchAll(referencePattern)) {
    const value = cleanReferenceValue(
      (match[2] ?? match[0])?.trim(),
      gluedNextLabelPattern,
      trailingOcrLabelPattern,
    );
    if (!value) {
      continue;
    }
    candidates.push(
      candidateFor(
        text,
        match.index ?? 0,
        value,
        cleanReferenceLabel(match[1] ?? 'reference'),
      ),
    );
    if (candidates.length >= MAX_CANDIDATES_PER_KIND) {
      break;
    }
  }
  return dedupeCandidates(candidates);
}

function cleanReferenceLabel(label: string): string {
  return label
    .replace(/\s+/g, ' ')
    .replace(/[-\s]+$/g, '')
    .trim();
}

function cleanReferenceValue(
  value: string,
  gluedNextLabelPattern: RegExp | null,
  trailingOcrLabelPattern: RegExp | null,
): string {
  let cleaned = value
    .trim()
    .replace(gluedNextLabelPattern ?? /$^/, '')
    .replace(/[.,;:]+$/g, '');
  for (let pass = 0; pass < 3; pass += 1) {
    const next = cleaned.replace(trailingOcrLabelPattern ?? /$^/, '');
    if (next === cleaned) {
      break;
    }
    cleaned = next.replace(/[._/-]+$/g, '');
  }
  return cleaned;
}

function patternsForTriggers(triggers: EvidenceTriggerSet): {
  reference: RegExp;
  gluedNextLabel: RegExp | null;
  trailingOcrLabel: RegExp | null;
} {
  const referenceLabels = alternationPattern(triggers.referenceLabels);
  const gluedNextLabels = alternationPattern(triggers.gluedNextLabels);
  const trailingOcrLabels = alternationPattern(triggers.trailingOcrLabels);

  return {
    reference: new RegExp(
      `(?:^|[^\\p{L}_])(${referenceLabels})\\s*(?:#|:|：)?\\s*([\\p{L}\\p{N}][\\p{L}\\p{N}._/-]{1,})`,
      'giu',
    ),
    gluedNextLabel: gluedNextLabels
      ? new RegExp(`(${gluedNextLabels}).*$`, 'iu')
      : null,
    trailingOcrLabel: trailingOcrLabels
      ? new RegExp(`(${trailingOcrLabels})$`, 'iu')
      : null,
  };
}

function alternationPattern(values: readonly string[]): string {
  return values
    .map((value) => escapeRegExp(value).replace(/\s+/g, String.raw`\s+`))
    .sort((left, right) => right.length - left.length)
    .join('|');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
}

function normalizeIban(value: string): string {
  return value.replace(/[\s\u00a0]+/g, '').toUpperCase();
}

function isValidIban(value: string): boolean {
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(value)) {
    return false;
  }

  const rearranged = `${value.slice(4)}${value.slice(0, 4)}`;
  let remainder = 0;
  for (const char of rearranged) {
    const code = char.charCodeAt(0);
    const digits = code >= 65 && code <= 90 ? String(code - 55) : char;
    for (const digit of digits) {
      remainder = (remainder * 10 + Number(digit)) % 97;
    }
  }
  return remainder === 1;
}

function hintCandidates(
  text: string,
  hints: readonly string[],
): AiEvidenceCandidate[] {
  const lower = text.toLowerCase();
  const candidates: AiEvidenceCandidate[] = [];
  for (const hint of hints) {
    let searchFrom = 0;
    const needle = hint.toLowerCase();
    while (searchFrom < lower.length) {
      const index = lower.indexOf(needle, searchFrom);
      if (index < 0) {
        break;
      }
      candidates.push(
        candidateFor(text, index, text.slice(index, index + hint.length), hint),
      );
      searchFrom = index + Math.max(needle.length, 1);
      if (candidates.length >= MAX_CANDIDATES_PER_KIND) {
        return dedupeCandidates(candidates);
      }
    }
  }
  return dedupeCandidates(candidates);
}

function candidateFor(
  text: string,
  offset: number,
  value: string,
  label?: string,
): AiEvidenceCandidate {
  return {
    value,
    label,
    snippet: snippetAt(text, offset),
    offset,
    lineNumber: lineNumberAt(text, offset),
  };
}

function snippetAt(text: string, offset: number): string {
  const start = Math.max(0, offset - SNIPPET_RADIUS);
  const end = Math.min(text.length, offset + SNIPPET_RADIUS);
  return text.slice(start, end).replace(/\s+/g, ' ').trim();
}

function lineNumberAt(text: string, offset: number): number {
  return text.slice(0, offset).split(/\r?\n/).length;
}

function dedupeCandidates(
  candidates: readonly AiEvidenceCandidate[],
): AiEvidenceCandidate[] {
  const seen = new Set<string>();
  const result: AiEvidenceCandidate[] = [];
  for (const candidate of candidates) {
    const key = `${candidate.label ?? ''}:${candidate.value}:${candidate.snippet}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(candidate);
  }
  return result;
}
