import { Injectable } from '@nestjs/common';
import type { AiOcrPreprocessingResult } from './ai-metadata-evidence';

const MAX_BLANK_LINES = 1;
const REPEATED_LINE_MIN_COUNT = 3;
const REPEATED_LINE_MAX_LENGTH = 140;

@Injectable()
export class AiOcrTextPreprocessor {
  preprocess(text: string): AiOcrPreprocessingResult {
    const rawText = text.trim();
    const originalLines = rawText.length ? rawText.split(/\r?\n/) : [];
    const cleanedLines = collapseBlankLines(
      removeRepeatedLayoutLines(originalLines.map(normalizeLine)),
    );
    const cleanedText = repairSoftLineBreaks(cleanedLines.join('\n')).trim();

    return {
      rawText,
      cleanedText,
      lineCountBefore: originalLines.length,
      lineCountAfter: cleanedText ? cleanedText.split(/\r?\n/).length : 0,
      charCountBefore: rawText.length,
      charCountAfter: cleanedText.length,
    };
  }
}

function normalizeLine(line: string): string {
  return line
    .replace(/\t/g, ' ')
    .replace(/[ \u00a0]+/g, ' ')
    .trimEnd();
}

function removeRepeatedLayoutLines(lines: readonly string[]): string[] {
  const counts = new Map<string, number>();
  for (const line of lines) {
    const key = repeatedLineKey(line);
    if (!key) {
      continue;
    }
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return lines.filter((line) => {
    const key = repeatedLineKey(line);
    return !key || (counts.get(key) ?? 0) < REPEATED_LINE_MIN_COUNT;
  });
}

function repeatedLineKey(line: string): string | null {
  const normalized = line.replace(/\s+/g, ' ').trim();
  if (
    normalized.length < 4 ||
    normalized.length > REPEATED_LINE_MAX_LENGTH ||
    containsCriticalData(normalized)
  ) {
    return null;
  }
  return normalized.toLowerCase();
}

function containsCriticalData(line: string): boolean {
  return (
    /\b[A-Z]{2}\d{2}[A-Z0-9]{10,30}\b/i.test(line) ||
    /\b\d{1,3}(?:[.,]\d{3})*[.,]\d{2}\s?[A-Z]{3}\b/i.test(line) ||
    /\b\d{4}[-/.]\d{1,2}[-/.]\d{1,2}\b/.test(line) ||
    /\b\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}\b/.test(line)
  );
}

function collapseBlankLines(lines: readonly string[]): string[] {
  const result: string[] = [];
  let blankCount = 0;
  for (const line of lines) {
    if (line.trim()) {
      blankCount = 0;
      result.push(line);
      continue;
    }
    blankCount += 1;
    if (blankCount <= MAX_BLANK_LINES) {
      result.push('');
    }
  }
  return result;
}

function repairSoftLineBreaks(text: string): string {
  return text
    .replace(/([A-Za-zÀ-ÖØ-öø-ÿ])-\n([A-Za-zÀ-ÖØ-öø-ÿ])/g, '$1$2')
    .replace(/([^\n.!?:;])\n([a-zà-öø-ÿ])/g, '$1 $2');
}
