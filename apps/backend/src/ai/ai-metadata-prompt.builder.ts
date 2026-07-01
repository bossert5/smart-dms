import { Injectable } from '@nestjs/common';
import type {
  AiMetadataExtractionJobPayload,
  AiMetadataPromptScope,
  AiMetadataPromptSequence,
  AiMetadataPromptStep,
} from '@smart-dms/shared-dto';
import { ocrLanguageNameForPrompt } from '../common/ocr-language-map';
import {
  DEFAULT_AI_METADATA_PROMPTS,
  type DefaultAiMetadataPrompt,
} from './ai-metadata-prompt.defaults';
import {
  evidenceCandidatesForScope,
  uniqueEvidenceSnippets,
  type AiMetadataEvidencePack,
  type AiPromptSourceTextKind,
} from './ai-metadata-evidence';

type MetadataPromptInput = Pick<
  AiMetadataExtractionJobPayload,
  | 'documentId'
  | 'ocrText'
  | 'metadata'
  | 'documentTypes'
  | 'fieldDefinitions'
  | 'scopes'
  | 'promptTemplates'
> & {
  readonly sourceTextFormat?: AiMetadataExtractionJobPayload['sourceTextFormat'];
};

type JsonSchema = Record<string, unknown>;

const DATE_CANDIDATE_LIMIT = 30;
const DATE_SNIPPET_RADIUS = 140;
const FULL_CONTEXT_COMPLEX_CHAR_LIMIT = 8000;
const DEFAULT_SCOPE_ORDER = DEFAULT_AI_METADATA_PROMPTS.map(
  (prompt) => prompt.key,
);
const SIMPLE_CORE_SCOPES = new Set<AiMetadataPromptScope>([
  'TITLE',
  'DOCUMENT_TYPE',
  'SUMMARY',
  'TAGS',
  'PARTIES',
]);
const FULL_CONTEXT_COMPLEX_SCOPES = new Set<AiMetadataPromptScope>([
  'DOCUMENT_DATE',
  'PAYMENTS',
  'REFERENCES',
  'CALENDAR_EVENTS',
]);

export interface AiMetadataTextChunk {
  readonly text: string;
  readonly chunkIndex: number;
  readonly chunkCount: number;
  readonly startOffset: number;
  readonly endOffset: number;
}

export interface AiOptimizedPromptStep extends AiMetadataPromptStep {
  readonly sourceTextKind: AiPromptSourceTextKind;
}

@Injectable()
export class AiMetadataPromptBuilder {
  build(input: MetadataPromptInput): AiMetadataPromptSequence {
    return this.buildForText(
      input,
      input.ocrText.trim(),
    ) as AiMetadataPromptSequence;
  }

  buildOptimized(
    input: MetadataPromptInput,
    evidence: AiMetadataEvidencePack,
    options: {
      readonly manualScopes?: readonly AiMetadataPromptScope[];
    } = {},
  ): readonly AiOptimizedPromptStep[] {
    return this.buildForText(input, input.ocrText.trim(), {
      evidence,
      manualScopes: options.manualScopes,
    }) as readonly AiOptimizedPromptStep[];
  }

  buildChunk(
    input: MetadataPromptInput,
    chunk: AiMetadataTextChunk,
  ): AiMetadataPromptSequence {
    const header = [
      `Document chunk ${chunk.chunkIndex + 1} of ${chunk.chunkCount}.`,
      `Character range: ${chunk.startOffset}-${chunk.endOffset}.`,
      'Extract metadata grounded only in this chunk. Empty/null values are acceptable when evidence is outside this chunk.',
      '',
    ].join('\n');

    return this.buildForText(
      input,
      `${header}${chunk.text.trim()}`,
    ) as AiMetadataPromptSequence;
  }

  buildMerge(
    input: MetadataPromptInput,
    chunkResults: unknown[],
  ): {
    text: string;
    resultSchema: JsonSchema;
  } {
    const resultSchema = mergedMetadataResultSchema(input);
    return {
      resultSchema,
      text: [
        'You are the final metadata merge step for Smart DMS.',
        'Merge multiple chunk-level AI extraction results into one final metadata result for the original document.',
        '',
        'Rules:',
        '- Produce final metadata values for the configured extraction scopes.',
        '- Prefer values with the strongest source evidence and remove duplicates.',
        '- Preserve useful references, payments, calendar events, tags, and configured attributes from all chunks.',
        '- For unavailable scalar fields, return null only when the schema allows null.',
        '- For unavailable list fields, return [] when no chunk provides reliable evidence.',
        '- Do not invent values that are absent from the chunk results.',
        '',
        'Use the private thinking channel to compare the chunk results carefully before producing the final JSON.',
        '',
        responseInstructions(true),
        '',
        languageInstructions(
          input.metadata.ocrLanguage,
          input.metadata.aiMetadataLanguage,
        ),
        '',
        'Existing metadata:',
        jsonForPrompt(input.metadata),
        '',
        'Available active document types:',
        jsonForPrompt(input.documentTypes),
        '',
        'Configured field definitions for attributes:',
        jsonForPrompt(input.fieldDefinitions),
        '',
        'Required final JSON schema:',
        jsonForPrompt(resultSchema),
        '',
        'Chunk extraction results:',
        jsonForPrompt(chunkResults),
      ].join('\n'),
    };
  }

  private buildForText(
    input: MetadataPromptInput,
    ocrText: string,
    optimization?: {
      readonly evidence: AiMetadataEvidencePack;
      readonly manualScopes?: readonly AiMetadataPromptScope[];
    },
  ): AiMetadataPromptSequence | readonly AiOptimizedPromptStep[] {
    const prompts = selectedPrompts(input);
    const simplePrompts = prompts.filter((prompt) =>
      SIMPLE_CORE_SCOPES.has(prompt.key),
    );
    const complexPrompts = prompts.filter(
      (prompt) => !SIMPLE_CORE_SCOPES.has(prompt.key),
    );
    const sequence: Array<AiMetadataPromptStep | AiOptimizedPromptStep> = [];

    if (simplePrompts.length) {
      const resultSchema = coreMetadataResultSchema(input, simplePrompts);
      sequence.push({
        key: 'CORE_METADATA',
        text: coreMetadataPrompt(input, ocrText, simplePrompts, resultSchema),
        resultSchema,
        ...(optimization ? { sourceTextKind: 'CLEANED_OCR' as const } : {}),
      });
    }

    sequence.push(
      ...complexPrompts.map((prompt) => {
        const resultSchema = resultSchemaForScope(input, prompt.key);
        const optimizedSource = optimization
          ? optimizedSourceForScope(
              input,
              optimization.evidence,
              prompt.key,
              optimization.manualScopes?.includes(prompt.key) ?? false,
            )
          : null;
        return {
          key: prompt.key,
          text: optimizedSource
            ? metadataScopePrompt(
                input,
                optimizedSource.text,
                prompt,
                resultSchema,
                false,
                optimizedSource.evidenceText,
              )
            : metadataScopePrompt(input, ocrText, prompt, resultSchema, true),
          resultSchema,
          ...(optimizedSource
            ? { sourceTextKind: optimizedSource.sourceTextKind }
            : {}),
        };
      }),
    );

    return sequence;
  }
}

function selectedPrompts(
  input: MetadataPromptInput,
): readonly DefaultAiMetadataPrompt[] {
  const promptsByKey = new Map(
    (input.promptTemplates?.length
      ? input.promptTemplates
      : DEFAULT_AI_METADATA_PROMPTS
    ).map((prompt) => [
      prompt.key,
      {
        key: prompt.key,
        label: prompt.label,
        description: prompt.description,
        promptText: prompt.promptText,
        displayOrder: prompt.displayOrder,
      },
    ]),
  );
  const scopeKeys = input.scopes?.length ? input.scopes : DEFAULT_SCOPE_ORDER;

  return scopeKeys
    .map((key) => promptsByKey.get(key))
    .filter((prompt): prompt is DefaultAiMetadataPrompt => Boolean(prompt))
    .sort((left, right) => left.displayOrder - right.displayOrder);
}

function metadataScopePrompt(
  input: MetadataPromptInput,
  ocrText: string,
  prompt: DefaultAiMetadataPrompt,
  resultSchema: JsonSchema,
  enableThinking: boolean,
  evidenceText = '',
): string {
  return [
    `You are a metadata extraction system for Smart DMS scope ${prompt.key}.`,
    enableThinking
      ? 'Use the private thinking channel to inspect the document carefully before producing the final JSON.'
      : '',
    '',
    'Task:',
    prompt.promptText,
    '',
    responseInstructions(enableThinking),
    '',
    languageInstructions(
      input.metadata.ocrLanguage,
      input.metadata.aiMetadataLanguage,
    ),
    '',
    scopeSpecificContext(input, prompt.key),
    '',
    evidenceText,
    '',
    prompt.key === 'DOCUMENT_DATE' || prompt.key === 'CALENDAR_EVENTS'
      ? dateCandidateChecklist(ocrText)
      : '',
    '',
    'Existing metadata:',
    jsonForPrompt(input.metadata),
    '',
    'Required final JSON schema:',
    jsonForPrompt(resultSchema),
    '',
    'Input document:',
    inputDocumentFormatLabel(input),
    '-----------------------------',
    ocrText,
  ]
    .filter((part) => part !== '')
    .join('\n');
}

function optimizedSourceForScope(
  input: MetadataPromptInput,
  evidence: AiMetadataEvidencePack,
  scope: AiMetadataPromptScope,
  manualScope: boolean,
): {
  readonly text: string;
  readonly evidenceText: string;
  readonly sourceTextKind: AiPromptSourceTextKind;
} {
  const candidates = evidenceCandidatesForScope(evidence, scope);
  const snippets = uniqueEvidenceSnippets(candidates, 16);
  const evidenceText = [
    'Evidence candidates:',
    jsonForPrompt(
      candidates.slice(0, 24).map((candidate) => ({
        value: candidate.value,
        label: candidate.label ?? null,
        lineNumber: candidate.lineNumber,
        snippet: candidate.snippet,
      })),
    ),
  ].join('\n');

  if (
    manualScope ||
    (FULL_CONTEXT_COMPLEX_SCOPES.has(scope) &&
      input.ocrText.trim().length <= FULL_CONTEXT_COMPLEX_CHAR_LIMIT)
  ) {
    return {
      text: input.ocrText.trim(),
      evidenceText,
      sourceTextKind: 'CLEANED_OCR',
    };
  }

  if (snippets.length > 0) {
    return {
      text: snippets.join('\n---\n'),
      evidenceText,
      sourceTextKind: 'EVIDENCE_CONTEXT',
    };
  }

  return {
    text: manualScope ? input.ocrText.trim() : evidence.sourceText,
    evidenceText: 'Evidence candidates: []',
    sourceTextKind: manualScope ? 'CLEANED_OCR' : 'EVIDENCE_CONTEXT',
  };
}

function coreMetadataPrompt(
  input: MetadataPromptInput,
  ocrText: string,
  prompts: readonly DefaultAiMetadataPrompt[],
  resultSchema: JsonSchema,
): string {
  return [
    'You are a fast metadata extraction system for Smart DMS core fields.',
    'Extract the requested simple metadata fields in one pass.',
    '',
    'Tasks:',
    ...prompts.map((prompt) => `- ${prompt.key}: ${prompt.promptText}`),
    '',
    responseInstructions(false),
    '',
    languageInstructions(
      input.metadata.ocrLanguage,
      input.metadata.aiMetadataLanguage,
    ),
    '',
    'Available active document types:',
    jsonForPrompt(input.documentTypes),
    documentTypeInstructions(input),
    '',
    'Existing metadata:',
    jsonForPrompt(input.metadata),
    '',
    'Required final JSON schema:',
    jsonForPrompt(resultSchema),
    '',
    'Input document:',
    inputDocumentFormatLabel(input),
    '-----------------------------',
    ocrText,
  ]
    .filter((part) => part !== '')
    .join('\n');
}

function inputDocumentFormatLabel(input: MetadataPromptInput): string {
  return input.sourceTextFormat === 'MARKDOWN'
    ? '(Markdown converted from the PDF)'
    : '(plain OCR text)';
}

function scopeSpecificContext(
  input: MetadataPromptInput,
  scope: AiMetadataPromptScope,
): string {
  if (scope === 'DOCUMENT_TYPE') {
    return [
      'Available active document types:',
      jsonForPrompt(input.documentTypes),
      documentTypeInstructions(input),
    ].join('\n');
  }

  if (scope === 'ATTRIBUTES') {
    return [
      'Configured field definitions for attributes:',
      jsonForPrompt(input.fieldDefinitions),
    ].join('\n');
  }

  return [
    'Available active document types:',
    jsonForPrompt(input.documentTypes),
    '',
    'Configured field definitions for attributes:',
    jsonForPrompt(input.fieldDefinitions),
  ].join('\n');
}

function mergedMetadataResultSchema(input: MetadataPromptInput): JsonSchema {
  return mergedResultSchemaForPrompts(input, selectedPrompts(input));
}

function coreMetadataResultSchema(
  input: MetadataPromptInput,
  prompts: readonly DefaultAiMetadataPrompt[],
): JsonSchema {
  return mergedResultSchemaForPrompts(input, prompts);
}

function mergedResultSchemaForPrompts(
  input: MetadataPromptInput,
  prompts: readonly DefaultAiMetadataPrompt[],
): JsonSchema {
  const required: string[] = [];
  const properties: Record<string, unknown> = {};

  for (const prompt of prompts) {
    const schema = resultSchemaForScope(input, prompt.key);
    const scopeProperties =
      typeof schema.properties === 'object' && schema.properties
        ? (schema.properties as Record<string, unknown>)
        : {};
    Object.assign(properties, scopeProperties);
    required.push(...requiredSchemaKeys(schema));
  }

  return {
    type: 'object',
    additionalProperties: false,
    required: [...new Set(required)],
    properties,
  };
}

function resultSchemaForScope(
  input: MetadataPromptInput,
  scope: AiMetadataPromptScope,
): JsonSchema {
  switch (scope) {
    case 'TITLE':
      return objectSchema(['title'], {
        title: { type: 'string', minLength: 1, maxLength: 500 },
      });
    case 'DOCUMENT_TYPE': {
      const documentTypeKeys = input.documentTypes.map((entry) => entry.key);
      return objectSchema(documentTypeKeys.length ? ['documentTypeKey'] : [], {
        ...(documentTypeKeys.length
          ? {
              documentTypeKey: {
                type: 'string',
                enum: documentTypeKeys,
              },
            }
          : {}),
      });
    }
    case 'SUMMARY':
      return objectSchema(['summary'], {
        summary: nullableStringSchema(4000),
      });
    case 'TAGS':
      return objectSchema(['tags'], {
        tags: {
          type: 'array',
          maxItems: 50,
          items: { type: 'string', minLength: 1, maxLength: 80 },
        },
      });
    case 'PARTIES':
      return objectSchema(['sender', 'recipient'], {
        sender: nullableStringSchema(300),
        recipient: nullableStringSchema(300),
      });
    case 'DOCUMENT_DATE':
      return objectSchema(['documentDate'], {
        documentDate: nullableSchema({ type: 'string', format: 'date-time' }),
      });
    case 'PAYMENTS':
      return objectSchema(['payments'], {
        payments: {
          type: 'array',
          maxItems: 50,
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              iban: nullableSchema({ type: 'string', maxLength: 80 }),
              recipient: nullableSchema({ type: 'string', maxLength: 300 }),
              purpose: nullableSchema({ type: 'string', maxLength: 500 }),
              amount: nullableSchema({ type: 'number' }),
              currency: nullableSchema({
                type: 'string',
                minLength: 1,
                maxLength: 3,
              }),
              dueDate: nullableSchema({ type: 'string', format: 'date' }),
              dueDateSourceText: nullableSchema({
                type: 'string',
                maxLength: 1000,
              }),
            },
          },
        },
      });
    case 'REFERENCES':
      return objectSchema(['references'], {
        references: {
          type: 'array',
          maxItems: 100,
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['referenceNumber', 'referenceType'],
            properties: {
              referenceNumber: { type: 'string', minLength: 1, maxLength: 200 },
              referenceType: { type: 'string', minLength: 1, maxLength: 120 },
            },
          },
        },
      });
    case 'ATTRIBUTES': {
      const attributeKeys = input.fieldDefinitions.map((entry) => entry.key);
      return objectSchema(['attributes'], {
        attributes: {
          type: 'array',
          maxItems: 50,
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['key', 'value', 'valueType'],
            properties: {
              key: attributeKeys.length
                ? { type: 'string', enum: attributeKeys }
                : { type: 'string', maxLength: 100 },
              value: { type: ['string', 'number', 'boolean'] },
              valueType: {
                type: 'string',
                enum: ['TEXT', 'NUMBER', 'DATE', 'BOOLEAN'],
              },
            },
          },
        },
      });
    }
    case 'CALENDAR_EVENTS':
      return objectSchema(['calendarEvents'], {
        calendarEvents: {
          type: 'array',
          maxItems: 50,
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['kind', 'title'],
            properties: {
              kind: {
                type: 'string',
                enum: ['DUE_DATE', 'DEADLINE', 'APPOINTMENT'],
              },
              title: { type: 'string', minLength: 1, maxLength: 500 },
              description: { type: 'string', maxLength: 2000 },
              date: { type: 'string', format: 'date' },
              relativeDate: {
                type: 'object',
                additionalProperties: false,
                required: ['amount', 'unit', 'anchor'],
                properties: {
                  amount: { type: 'number' },
                  unit: { type: 'string', enum: ['DAYS', 'WEEKS'] },
                  anchor: { type: 'string', enum: ['DOCUMENT_DATE'] },
                },
              },
              time: {
                type: 'string',
                pattern: '^([01][0-9]|2[0-3]):[0-5][0-9]$',
              },
              endDate: { type: 'string', format: 'date' },
              endTime: {
                type: 'string',
                pattern: '^([01][0-9]|2[0-3]):[0-5][0-9]$',
              },
              sourceText: { type: 'string', maxLength: 1000 },
            },
          },
        },
      });
  }
}

function objectSchema(
  required: string[],
  properties: Record<string, unknown>,
): JsonSchema {
  return {
    type: 'object',
    additionalProperties: false,
    required,
    properties,
  };
}

function requiredSchemaKeys(schema: JsonSchema): string[] {
  return Array.isArray(schema.required)
    ? schema.required.filter(
        (entry): entry is string => typeof entry === 'string',
      )
    : [];
}

function nullableStringSchema(maxLength: number): JsonSchema {
  return nullableSchema({ type: 'string', minLength: 1, maxLength });
}

function nullableSchema(schema: JsonSchema): JsonSchema {
  return {
    anyOf: [schema, { type: 'null' }],
  };
}

function documentTypeInstructions(input: MetadataPromptInput): string {
  if (input.documentTypes.length === 0) {
    return 'documentTypeKey: omit this field because no active document types are configured.';
  }

  if (
    input.documentTypes.some((documentType) => documentType.key === 'other')
  ) {
    return 'documentTypeKey is required. If no category fits confidently, choose "other"; "other" is the mandatory fallback before leaving the document uncategorized.';
  }

  return 'documentTypeKey is required. If no specific category fits, choose the closest available active document type.';
}

function responseInstructions(allowThinking: boolean): string {
  return [
    'Response format:',
    allowThinking
      ? '- The final visible answer after any thinking channel must be exactly one valid JSON object that matches the supplied JSON schema.'
      : '- The answer must be exactly one valid JSON object that matches the supplied JSON schema.',
    '- The final JSON object must be flat and must not contain a top-level metadata field.',
    '- Return every top-level key listed as required in the schema.',
    '- Do not wrap the JSON in markdown or code fences.',
    '- Do not include reasoning, explanations, or comments in the final visible answer.',
    '- The response must end immediately after the final closing brace.',
    '',
    'Evidence constraints:',
    '- Use only information present in or clearly inferable from the document.',
    '- If uncertain, use null for nullable scalar fields and [] for array fields instead of guessing.',
    '- Do not hallucinate or introduce unsupported external knowledge.',
  ].join('\n');
}

function dateCandidateChecklist(ocrText: string): string {
  const snippets = extractDateCandidateSnippets(ocrText);
  if (snippets.length === 0) {
    return [
      'Date extraction checklist:',
      '- No obvious absolute or relative date expressions were pre-detected. Still inspect the full OCR text for documentDate and calendarEvents.',
    ].join('\n');
  }

  return [
    'Date extraction checklist:',
    '- Review every candidate snippet before finalizing documentDate or calendarEvents.',
    '- Each candidate may be a document date, appointment, deadline, due date, service period, payroll payout date, product version, birth date, or irrelevant date; classify it from context.',
    '- Include every candidate that schedules, limits, or triggers an action. Exclude candidates that are only identifiers, versions, payout or value dates, birth dates, service periods, print timestamps, or background history.',
    '- Do not invent a missing year for a two-part numeric label; product, software, tariff, package, plan, module, or edition names followed by such a label are version context by default.',
    ...snippets.map((snippet, index) => `- Candidate ${index + 1}: ${snippet}`),
  ].join('\n');
}

function extractDateCandidateSnippets(ocrText: string): string[] {
  const normalized = ocrText.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return [];
  }

  const matches = [
    ...normalized.matchAll(
      /\b(?:\d{1,2}[./-]\d{1,2}[./-]\d{2,4}|\d{4}-\d{2}-\d{2})\b/g,
    ),
    ...normalized.matchAll(
      /\b(?:innerhalb|binnen|within|in)\s+(?:von\s+)?(?:\d+|ein(?:e|en|er|em|es)?|zwei|drei|vier|fuenf|funf|sechs|sieben|acht|neun|zehn|elf|zwoelf|zwolf|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+(?:tag(?:e|en)?|tagen|woche(?:n)?|wochen|day(?:s)?|week(?:s)?)\b/gi,
    ),
  ].sort((left, right) => left.index - right.index);

  const snippets: string[] = [];
  const seen = new Set<string>();
  for (const match of matches) {
    if (match.index === undefined) {
      continue;
    }

    const start = Math.max(0, match.index - DATE_SNIPPET_RADIUS);
    const end = Math.min(
      normalized.length,
      match.index + match[0].length + DATE_SNIPPET_RADIUS,
    );
    const snippet = normalized
      .slice(start, end)
      .replace(/^\S*\s/, '')
      .replace(/\s\S*$/, '')
      .trim();

    if (!snippet || seen.has(snippet)) {
      continue;
    }

    seen.add(snippet);
    snippets.push(snippet);
    if (snippets.length >= DATE_CANDIDATE_LIMIT) {
      break;
    }
  }

  return snippets;
}

function languageInstructions(
  ocrLanguage: string | null | undefined,
  aiMetadataLanguage: string | null | undefined,
): string {
  const normalizedSourceLanguage = ocrLanguageNameForPrompt(ocrLanguage);
  const normalizedTargetLanguage = ocrLanguageNameForPrompt(
    aiMetadataLanguage ?? ocrLanguage,
  );
  return [
    'Language constraint:',
    normalizedSourceLanguage
      ? `- OCR-detected language: ${normalizedSourceLanguage}.`
      : '- No OCR language is available. Use the dominant language of the document text.',
    normalizedTargetLanguage
      ? `- Generate human-readable metadata values in ${normalizedTargetLanguage} when the source text supports it.`
      : '- Generate human-readable metadata values in the dominant language of the document text.',
    '- Do not mix languages in metadata fields.',
    '- Do not return a language field.',
  ].join('\n');
}

function jsonForPrompt(value: unknown): string {
  return JSON.stringify(value, null, 2);
}
