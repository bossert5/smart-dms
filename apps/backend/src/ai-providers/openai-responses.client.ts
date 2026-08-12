import { Injectable } from '@nestjs/common';
import type {
  AiProcessingAttemptKind,
  AiProcessingErrorCode,
  AiProcessingResponseMetadata,
} from '@smart-dms/shared-dto';
import Ajv from 'ajv';
import type { ErrorObject, ValidateFunction } from 'ajv';
import { createHash } from 'node:crypto';
import type { AiPromptRunInput } from '../ai/ai-processing.service';
import {
  AiProcessingDiagnosticsService,
  type StartAiDiagnosticAttemptInput,
} from './ai-processing-diagnostics.service';
import type { AiProviderSecretService } from './ai-provider-secret.service';
import {
  AiProviderResponseError,
  aiProcessingErrorCode,
  AiProviderHealthError,
  errorMessage,
  isAiProviderHealthError,
  isAiProviderResponseError,
  providerHttpError,
  providerNetworkError,
  providerResponseError,
} from './ai-provider-errors';

export interface OpenAiResponsesProvider {
  id: string;
  name: string;
  baseUrl: string;
  encryptedApiKey: string | null;
  selectedModel: string | null;
  availableModels: unknown;
}

type ResponsesBody = {
  output?: unknown;
  status?: unknown;
  incomplete_details?: unknown;
  usage?: {
    input_tokens?: unknown;
    output_tokens?: unknown;
    total_tokens?: unknown;
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

  constructor(private readonly diagnostics?: AiProcessingDiagnosticsService) {}

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
      return await this.runPromptOnce(
        provider,
        secrets,
        input,
        input.text,
        'INITIAL',
      );
    } catch (error) {
      if (isAiProviderHealthError(error)) {
        throw error;
      }
      const repairText = repairPrompt(input.text, input.resultSchema, error);
      return this.runPromptOnce(
        provider,
        secrets,
        input,
        repairText,
        'REPAIR',
        0,
        false,
      );
    }
  }

  private async runPromptOnce(
    provider: OpenAiResponsesProvider,
    secrets: AiProviderSecrets,
    input: AiPromptRunInput,
    text: string,
    attemptKind: AiProcessingAttemptKind,
    temperature = input.temperature,
    enableThinking = input.enableThinking,
  ): Promise<Record<string, unknown>> {
    const maxOutputTokens = maxOutputTokensFor(input, enableThinking);
    const diagnosticInput = diagnosticAttemptInput(
      provider,
      input,
      attemptKind,
      temperature,
      maxOutputTokens,
      enableThinking,
      text,
    );
    const attempt =
      diagnosticInput && this.diagnostics
        ? await this.diagnostics.tryStartAttempt(diagnosticInput)
        : null;
    let rawResponse: string | null = null;
    let httpStatus: number | null = null;
    let responseMetadata: AiProcessingResponseMetadata | null = null;
    try {
      const disableLlamaCppThinking =
        !enableThinking && isLlamaCppProvider(provider);
      const response = await this.fetchResponses(provider, secrets, {
        model: provider.selectedModel,
        input: text,
        temperature,
        max_output_tokens: maxOutputTokens,
        reasoning: {
          effort: enableThinking ? 'low' : 'none',
        },
        ...(disableLlamaCppThinking
          ? { chat_template_kwargs: { enable_thinking: false } }
          : {}),
        stream: false,
      });
      httpStatus = response.status;
      try {
        rawResponse = await response.text();
      } catch (error) {
        throw providerNetworkError(
          error,
          'OpenAI Responses response read failed',
        );
      }
      const body = parseResponseBody(rawResponse, response.ok);
      responseMetadata = responseMetadataFor(body);
      if (!response.ok) {
        throw providerHttpError(
          response.status,
          stringValue(body.error?.message),
          `OpenAI Responses request failed with HTTP ${response.status}.`,
        );
      }

      const outputText = responseText(body, maxOutputTokens);
      const parsed = parseJsonObject(outputText);
      this.validateResult(input.resultSchema, parsed);
      await this.diagnostics?.tryCompleteAttempt(attempt, {
        httpStatus,
        responseMetadata,
      });
      return parsed;
    } catch (error) {
      const classifiedError =
        isAiProviderHealthError(error) || isAiProviderResponseError(error)
          ? error
          : providerResponseError(error);
      if (diagnosticInput) {
        await this.diagnostics?.tryFailAttempt(attempt, diagnosticInput, {
          httpStatus,
          responseMetadata,
          errorCode: aiProcessingErrorCode(classifiedError),
          errorMessage: errorMessage(classifiedError),
          rawResponse,
        });
      }
      throw classifiedError;
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
      throw new AiProviderResponseError(
        `AI result did not match schema: ${formatAjvErrors(validator.errors)}`,
        'AI_SCHEMA_MISMATCH',
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
  const collected = collectFinalOutputText(body.output);
  if (collected.trim()) {
    return collected;
  }

  const errorCode = emptyOutputErrorCode(body, maxOutputTokens);
  throw new AiProviderResponseError(
    errorCode === 'AI_REASONING_BUDGET_EXHAUSTED'
      ? reasoningBudgetExhaustedErrorMessage(body, maxOutputTokens)
      : emptyOutputErrorMessage(body, maxOutputTokens),
    errorCode,
  );
}

function emptyOutputErrorCode(
  body: ResponsesBody,
  maxOutputTokens: number,
): AiProcessingErrorCode {
  if (isReasoningBudgetExhausted(body, maxOutputTokens)) {
    return 'AI_REASONING_BUDGET_EXHAUSTED';
  }
  return isIncompleteResponse(body)
    ? 'AI_INCOMPLETE_OUTPUT'
    : 'AI_EMPTY_OUTPUT';
}

function collectFinalOutputText(value: unknown): string {
  if (!Array.isArray(value)) {
    return '';
  }
  return value
    .filter(
      (item): item is Record<string, unknown> =>
        Boolean(item) &&
        typeof item === 'object' &&
        (item as { type?: unknown }).type === 'message',
    )
    .flatMap((message) => {
      if (!Array.isArray(message.content)) {
        return [];
      }
      return message.content
        .filter(
          (content): content is Record<string, unknown> =>
            Boolean(content) &&
            typeof content === 'object' &&
            (content as { type?: unknown }).type === 'output_text',
        )
        .map((content) => stringValue(content.text) ?? '');
    })
    .join('');
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

  throw new AiProviderResponseError(
    'AI response did not contain a valid JSON object.',
    'AI_INVALID_JSON',
  );
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
  return [
    'OpenAI Responses result did not contain final text output.',
    'The provider may have spent the output budget on reasoning before producing JSON.',
    `Response details: ${responseDetails(body, maxOutputTokens).join('; ')}.`,
  ].join(' ');
}

function reasoningBudgetExhaustedErrorMessage(
  body: ResponsesBody,
  maxOutputTokens: number,
): string {
  return [
    'The provider exhausted the output token budget with reasoning before producing final text.',
    `Response details: ${responseDetails(body, maxOutputTokens).join('; ')}.`,
  ].join(' ');
}

function responseDetails(
  body: ResponsesBody,
  maxOutputTokens: number,
): string[] {
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
  return details;
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

function isReasoningBudgetExhausted(
  body: ResponsesBody,
  maxOutputTokens: number,
): boolean {
  const outputTokens = numberValue(body.usage?.output_tokens);
  const types = outputTypes(body.output);
  return (
    outputTokens !== null &&
    outputTokens >= maxOutputTokens &&
    types.length > 0 &&
    types.every((type) => type === 'reasoning')
  );
}

function isLlamaCppProvider(provider: OpenAiResponsesProvider): boolean {
  const selectedModel = provider.selectedModel?.trim();
  if (!selectedModel || !Array.isArray(provider.availableModels)) {
    return false;
  }

  return provider.availableModels.some((model) => {
    if (!model || typeof model !== 'object') {
      return false;
    }
    const candidate = model as {
      name?: unknown;
      model?: unknown;
      ownedBy?: unknown;
    };
    const modelName =
      stringValue(candidate.model) ?? stringValue(candidate.name);
    return (
      modelName === selectedModel &&
      stringValue(candidate.ownedBy)?.toLowerCase() === 'llamacpp'
    );
  });
}

function parseResponseBody(
  rawResponse: string,
  responseOk: boolean,
): ResponsesBody {
  try {
    const parsed = JSON.parse(rawResponse) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed;
    }
  } catch {
    if (!responseOk) {
      return {};
    }
  }
  if (!responseOk) {
    return {};
  }
  throw new AiProviderResponseError(
    'OpenAI Responses result was not a valid JSON response envelope.',
    'AI_INVALID_JSON',
  );
}

function responseMetadataFor(
  body: ResponsesBody,
): AiProcessingResponseMetadata {
  return {
    responseStatus: stringValue(body.status),
    outputTypes: outputTypes(body.output),
    outputContentTypes: outputContentTypes(body.output),
    inputTokens: numberValue(body.usage?.input_tokens),
    outputTokens: numberValue(body.usage?.output_tokens),
    totalTokens: numberValue(body.usage?.total_tokens),
    incompleteDetails: body.incomplete_details ?? null,
  };
}

function outputContentTypes(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') {
      return [];
    }
    const content = (item as { content?: unknown }).content;
    if (!Array.isArray(content)) {
      return [];
    }
    return content
      .map((entry) =>
        entry && typeof entry === 'object'
          ? stringValue((entry as { type?: unknown }).type)
          : null,
      )
      .filter((type): type is string => type !== null);
  });
}

function isIncompleteResponse(body: ResponsesBody): boolean {
  return (
    stringValue(body.status) === 'incomplete' ||
    Boolean(body.incomplete_details)
  );
}

function diagnosticAttemptInput(
  provider: OpenAiResponsesProvider,
  input: AiPromptRunInput,
  attemptKind: AiProcessingAttemptKind,
  temperature: number,
  maxOutputTokens: number,
  enableThinking: boolean,
  text: string,
): StartAiDiagnosticAttemptInput | null {
  if (!input.diagnosticContext) {
    return null;
  }
  return {
    ...input.diagnosticContext,
    providerId: provider.id,
    model: provider.selectedModel?.trim() || 'unknown',
    promptKey: input.promptKey ?? 'UNKNOWN',
    sequenceIndex: input.promptSequenceIndex ?? 0,
    attemptKind,
    requestMetadata: {
      temperature,
      maxOutputTokens,
      reasoningEffort: enableThinking ? 'low' : 'none',
      inputCharacterCount: text.length,
      resultSchemaHash: createHash('sha256')
        .update(JSON.stringify(input.resultSchema), 'utf8')
        .digest('hex'),
    },
  };
}
