export type OcrEvidenceLanguage =
  | 'deu'
  | 'eng'
  | 'fra'
  | 'spa'
  | 'por'
  | 'chi_sim';

export interface EvidenceTriggerSet {
  readonly payment: readonly string[];
  readonly calendar: readonly string[];
  readonly party: readonly string[];
  readonly attribute: readonly string[];
  readonly referenceLabels: readonly string[];
  readonly gluedNextLabels: readonly string[];
  readonly trailingOcrLabels: readonly string[];
}
