import { ocrLanguageCodeForCodeOrName } from '../../common/ocr-language-map';
import { chiSimEvidenceTriggers } from './chi-sim';
import { deuEvidenceTriggers } from './deu';
import { engEvidenceTriggers } from './eng';
import { fraEvidenceTriggers } from './fra';
import { porEvidenceTriggers } from './por';
import { spaEvidenceTriggers } from './spa';
import type { EvidenceTriggerSet, OcrEvidenceLanguage } from './types';

const TRIGGERS_BY_LANGUAGE: Record<OcrEvidenceLanguage, EvidenceTriggerSet> = {
  deu: deuEvidenceTriggers,
  eng: engEvidenceTriggers,
  fra: fraEvidenceTriggers,
  spa: spaEvidenceTriggers,
  por: porEvidenceTriggers,
  chi_sim: chiSimEvidenceTriggers,
};

const ALL_TRIGGER_SETS = Object.values(TRIGGERS_BY_LANGUAGE);

export function evidenceTriggersForLanguage(
  language: string | null | undefined,
): EvidenceTriggerSet {
  const normalized = normalizeEvidenceLanguage(language);
  return normalized
    ? TRIGGERS_BY_LANGUAGE[normalized]
    : mergeTriggerSets(ALL_TRIGGER_SETS);
}

export function normalizeEvidenceLanguage(
  language: string | null | undefined,
): OcrEvidenceLanguage | null {
  return ocrLanguageCodeForCodeOrName(language);
}

function mergeTriggerSets(
  triggerSets: readonly EvidenceTriggerSet[],
): EvidenceTriggerSet {
  return {
    payment: unique(triggerSets.flatMap((set) => set.payment)),
    calendar: unique(triggerSets.flatMap((set) => set.calendar)),
    party: unique(triggerSets.flatMap((set) => set.party)),
    attribute: unique(triggerSets.flatMap((set) => set.attribute)),
    referenceLabels: unique(triggerSets.flatMap((set) => set.referenceLabels)),
    gluedNextLabels: unique(triggerSets.flatMap((set) => set.gluedNextLabels)),
    trailingOcrLabels: unique(
      triggerSets.flatMap((set) => set.trailingOcrLabels),
    ),
  };
}

function unique(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = value.trim();
    const key = normalized.toLowerCase();
    if (!normalized || seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(normalized);
  }
  return result;
}

export type { EvidenceTriggerSet, OcrEvidenceLanguage };
