import type { DocumentStatus } from '@smart-dms/shared-dto';
import { DOCUMENT_STATUSES, documentStatusColor } from './document-presentation';

describe('document presentation', () => {
  it('contains every backend document status exposed by the shared DTO', () => {
    expect(DOCUMENT_STATUSES).toEqual([
      'NEW',
      'INGESTING',
      'OCR_PENDING',
      'OCR_RUNNING',
      'READY',
      'AI_PENDING',
      'AI_RUNNING',
      'FAILED',
      'ARCHIVED',
    ]);
  });

  it.each([
    ['READY', 'green'],
    ['FAILED', 'red'],
    ['ARCHIVED', 'default'],
    ['OCR_RUNNING', 'blue'],
  ] satisfies Array<[DocumentStatus, string]>)(
    'maps %s to the expected tag color',
    (status, color) => {
      expect(documentStatusColor(status)).toBe(color);
    },
  );
});
