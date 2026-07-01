export class AiProviderHealthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AiProviderHealthError';
  }
}

export class AiProviderResponseError extends Error {
  constructor(message: string) {
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
    ? new AiProviderHealthError(errorMessage)
    : new AiProviderResponseError(errorMessage);
}

export function providerNetworkError(error: unknown, context: string): Error {
  return new AiProviderHealthError(`${context}: ${errorMessage(error)}`);
}

export function providerResponseError(error: unknown): AiProviderResponseError {
  if (error instanceof AiProviderResponseError) {
    return error;
  }
  return new AiProviderResponseError(errorMessage(error));
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
