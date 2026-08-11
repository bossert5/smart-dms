import type { AiProcessingErrorCode } from '@smart-dms/shared-dto';

export class AiProviderHealthError extends Error {
  constructor(
    message: string,
    readonly code: AiProcessingErrorCode = 'AI_NETWORK_ERROR',
    readonly httpStatus: number | null = null,
  ) {
    super(message);
    this.name = 'AiProviderHealthError';
  }
}

export class AiProviderResponseError extends Error {
  constructor(
    message: string,
    readonly code: AiProcessingErrorCode = 'AI_INTERNAL_ERROR',
    readonly httpStatus: number | null = null,
  ) {
    super(message);
    this.name = 'AiProviderResponseError';
  }
}

export function isAiProviderHealthError(
  error: unknown,
): error is AiProviderHealthError {
  return error instanceof AiProviderHealthError;
}

export function isAiProviderResponseError(
  error: unknown,
): error is AiProviderResponseError {
  return error instanceof AiProviderResponseError;
}

export function providerHttpError(
  status: number,
  message: string | null,
  fallback: string,
): Error {
  const errorMessage = message ?? fallback;
  return isProviderHealthStatus(status)
    ? new AiProviderHealthError(errorMessage, httpErrorCode(status), status)
    : new AiProviderResponseError(errorMessage, httpErrorCode(status), status);
}

export function providerNetworkError(error: unknown, context: string): Error {
  return new AiProviderHealthError(
    `${context}: ${errorMessage(error)}`,
    isTimeoutError(error) ? 'AI_TIMEOUT' : 'AI_NETWORK_ERROR',
  );
}

export function providerResponseError(
  error: unknown,
  fallbackCode: AiProcessingErrorCode = 'AI_INTERNAL_ERROR',
): AiProviderResponseError {
  if (error instanceof AiProviderResponseError) {
    return error;
  }
  return new AiProviderResponseError(errorMessage(error), fallbackCode);
}

export function aiProcessingErrorCode(error: unknown): AiProcessingErrorCode {
  return error instanceof AiProviderHealthError ||
    error instanceof AiProviderResponseError
    ? error.code
    : 'AI_INTERNAL_ERROR';
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isProviderHealthStatus(status: number): boolean {
  return (
    status === 401 ||
    status === 403 ||
    status === 404 ||
    status === 408 ||
    status === 429 ||
    status >= 500
  );
}

function httpErrorCode(status: number): AiProcessingErrorCode {
  if (status === 401 || status === 403) {
    return 'AI_AUTH_ERROR';
  }
  if (status === 408) {
    return 'AI_TIMEOUT';
  }
  if (status === 429) {
    return 'AI_RATE_LIMIT';
  }
  return 'AI_PROVIDER_HTTP_ERROR';
}

function isTimeoutError(error: unknown): boolean {
  if (error instanceof Error) {
    return (
      error.name === 'AbortError' ||
      error.name === 'TimeoutError' ||
      /timed?\s*out|timeout/i.test(error.message)
    );
  }
  return /timed?\s*out|timeout/i.test(String(error));
}
