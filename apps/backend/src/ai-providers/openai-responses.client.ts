import { Injectable } from '@nestjs/common';
import Ajv from 'ajv';
import type { ErrorObject, ValidateFunction } from 'ajv';
import type { AiPromptRunInput } from '../ai/ai-processing.service';
import type { AiProviderSecretService } from './ai-provider-secret.service';
import {
  AiProviderHealthError,
  errorMessage,
  isAiProviderHealthError,
  providerHttpError,
  providerNetworkError,
  providerResponseError,
} from './ai-provider-errors';

export interface OpenAiResponsesProvider {
  baseUrl: string;
  encryptedApiKey: string | null;
  selectedModel: string | null;
}

type ResponsesBody = {
  output_text?: unknown;
  output?: unknown;
  status?: unknown;
  incomplete_details?: unknown;
  usage?: {
    output_tokens?: unknown;
  };
  error?: {
    message?: unknown;
  };
};

type AiProviderSecrets = Pick<AiProviderSecretService, 'decrypt'>;

const THINKING_OUTPUT_TOKEN_HEADROOM = 4096;

@Injectable()
export class OpenAiResponsesClient {
  private readonly ajv = new Ajv({
    allErrors: true,
    strict: false,
    validateFormats: false,
  });
  private readonly validators = new Map<string, ValidateFunction>();

  async runPrompt(
    provider: OpenAiResponsesProvider,
    secrets: AiProviderSecrets,
    input: AiPromptRunInput,
  ): Promise<Record<string, unknown>> {
    const model = provider.selectedModel?.trim();
    if (!model) {
      throw new AiProviderHealthError('AI provider has no selected model.');
    }

    try {
      return await this.runPromptOnce(provider, secrets, input, input.text);
    } catch (error) {
      if (isAiProviderHealthError(error)) {
        throw error;
      }
      const repairText = repairPrompt(input.text, input.resultSchema, error);
      return this.runPromptOnce(provider, secrets, input, repairText, 0, false);
    }
  }

  private async runPromptOnce(
    provider: OpenAiResponsesProvider,
    secrets: AiProviderSecrets,
    input: AiPromptRunInput,
    text: string,
    temperature = input.temperature,
    enableThinking = input.enableThinking,
  ): Promise<Record<string, unknown>> {
    const maxOutputTokens = maxOutputTokensFor(input, enableThinking);
    const response = await this.fetchResponses(provider, secrets, {
      model: provider.selectedModel,
      input: text,
      temperature,
      max_output_tokens: maxOutputTokens,
      reasoning: {
        effort: enableThinking ? 'low' : 'none',
      },
      stream: false,
    });

    const body = (await response.json().catch(() => ({}))) as ResponsesBody;
    if (!response.ok) {
      throw providerHttpError(
        response.status,
        stringValue(body.error?.message),
        `OpenAI Responses request failed with HTTP ${response.status}.`,
      );
    }

    try {
      const outputText = responseText(body, maxOutputTokens);
      const parsed = parseJsonObject(outputText);
      this.validateResult(input.resultSchema, parsed);
      return parsed;
    } catch (error) {
      throw providerResponseError(error);
    }
  }

  private headers(
    provider: OpenAiResponsesProvider,
    secrets: AiProviderSecrets,
  ): HeadersInit {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (provider.encryptedApiKey) {
      headers.Authorization = `Bearer ${secrets.decrypt(provider.encryptedApiKey)}`;
    }
    return headers;
  }

  private async fetchResponses(
    provider: OpenAiResponsesProvider,
    secrets: AiProviderSecrets,
    body: Record<string, unknown>,
  ): Promise<Response> {
    try {
      return await fetch(`${provider.baseUrl.replace(/\/+$/, '')}/responses`, {
        method: 'POST',
        headers: this.headers(provider, secrets),
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(600_000),
      });
    } catch (error) {
      throw providerNetworkError(error, 'OpenAI Responses request failed');
    }
  }

  private validateResult(
    resultSchema: Record<string, unknown>,
    result: Record<string, unknown>,
  ): void {
    const validator = this.validatorFor(resultSchema);
    if (!validator(result)) {
      throw new Error(
        `AI result did not match schema: ${formatAjvErrors(validator.errors)}`,
      );
    }
  }

  private validatorFor(schema: Record<string, unknown>): ValidateFunction {
    const key = JSON.stringify(schema);
    const existing = this.validators.get(key);
    if (existing) {
      return existing;
    }

    const validator = this.ajv.compile(schema);
    this.validators.set(key, validator);
    return validator;
  }
}

function maxOutputTokensFor(
  input: AiPromptRunInput,
  enableThinking: boolean,
): number {
  return enableThinking
    ? input.maxTokens + THINKING_OUTPUT_TOKEN_HEADROOM
    : input.maxTokens;
}

function responseText(body: ResponsesBody, maxOutputTokens: number): string {
  const outputText = stringValue(body.output_text);
  if (outputText) {
    return outputText;
  }

  const collected = collectOutputText(body.output);
  if (collected.trim()) {
    return collected;
  }

  throw new Error(emptyOutputErrorMessage(body, maxOutputTokens));
}

function collectOutputText(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(collectOutputText).join('');
  }
  if (!value || typeof value !== 'object') {
    return '';
  }

  const record = value as Record<string, unknown>;
  if (typeof record.text === 'string') {
    return record.text;
  }
  if (typeof record.content === 'string') {
    return record.content;
  }
  return collectOutputText(record.content ?? record.output ?? record.message);
}

function parseJsonObject(text: string): Record<string, unknown> {
  const candidates = [
    text.trim(),
    ...[...text.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)].map((match) =>
      match[1].trim(),
    ),
    jsonObjectSlice(text),
  ].filter((candidate): candidate is string => Boolean(candidate));

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      continue;
    }
  }

  throw new Error('AI response did not contain a valid JSON object.');
}

function jsonObjectSlice(text: string): string | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  return start >= 0 && end > start ? text.slice(start, end + 1) : null;
}

function repairPrompt(
  originalPrompt: string,
  resultSchema: Record<string, unknown>,
  error: unknown,
): string {
  return [
    'Return only a corrected JSON object for the previous Smart DMS metadata extraction task.',
    'The JSON must match the required schema exactly.',
    `Validation error: ${errorMessage(error)}`,
    '',
    'Required JSON schema:',
    JSON.stringify(resultSchema, null, 2),
    '',
    'Original task:',
    originalPrompt,
  ].join('\n');
}

function formatAjvErrors(errors: ErrorObject[] | null | undefined): string {
  if (!errors?.length) {
    return 'unknown validation error';
  }

  return errors
    .slice(0, 5)
    .map(
      (error) => `${error.instancePath || '/'} ${error.message ?? 'invalid'}`,
    )
    .join('; ');
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function emptyOutputErrorMessage(
  body: ResponsesBody,
  maxOutputTokens: number,
): string {
  const details = [
    `status=${stringValue(body.status) ?? 'unknown'}`,
    `outputTokens=${numberValue(body.usage?.output_tokens) ?? 'unknown'}`,
    `maxOutputTokens=${maxOutputTokens}`,
    `outputTypes=${outputTypes(body.output).join(',') || 'none'}`,
  ];
  if (body.incomplete_details) {
    details.push(
      `incompleteDetails=${JSON.stringify(body.incomplete_details)}`,
    );
  }

  return [
    'OpenAI Responses result did not contain final text output.',
    'The provider may have spent the output budget on reasoning before producing JSON.',
    `Response details: ${details.join('; ')}.`,
  ].join(' ');
}

function outputTypes(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) =>
      item && typeof item === 'object'
        ? stringValue((item as { type?: unknown }).type)
        : null,
    )
    .filter((type): type is string => type !== null);
}

function numberValue(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
