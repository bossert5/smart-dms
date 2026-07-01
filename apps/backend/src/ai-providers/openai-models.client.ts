import { Injectable } from '@nestjs/common';
import type { AiProviderModelDto } from '@smart-dms/shared-dto';

export interface OpenAiModelsProvider {
  baseUrl: string;
  encryptedApiKey: string | null;
}

export interface OpenAiModelsClientAuth {
  decrypt(encryptedSecret: string): string;
}

type OpenAiModelsResponse = {
  data?: Array<{
    id?: unknown;
    created?: unknown;
    owned_by?: unknown;
  }>;
  error?: {
    message?: unknown;
  };
};

@Injectable()
export class OpenAiModelsClient {
  async listModels(
    provider: OpenAiModelsProvider,
    auth: OpenAiModelsClientAuth,
  ): Promise<AiProviderModelDto[]> {
    const response = await fetch(
      `${provider.baseUrl.replace(/\/+$/, '')}/models`,
      {
        headers: this.headers(provider, auth),
        signal: AbortSignal.timeout(15_000),
      },
    );

    const body = (await response
      .json()
      .catch(() => ({}))) as OpenAiModelsResponse;
    if (!response.ok) {
      throw new Error(
        stringValue(body.error?.message) ??
          `OpenAI-compatible model list failed with HTTP ${response.status}.`,
      );
    }

    return (body.data ?? []).map(toModelDto).filter(isModelDto);
  }

  private headers(
    provider: OpenAiModelsProvider,
    auth: OpenAiModelsClientAuth,
  ): HeadersInit {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (provider.encryptedApiKey) {
      headers.Authorization = `Bearer ${auth.decrypt(provider.encryptedApiKey)}`;
    }
    return headers;
  }
}

function toModelDto(
  model: NonNullable<OpenAiModelsResponse['data']>[number],
): AiProviderModelDto | null {
  const id = stringValue(model.id);
  if (!id) {
    return null;
  }

  return {
    name: id,
    model: id,
    createdAt: unixSecondsToIsoDate(model.created),
    ownedBy: stringValue(model.owned_by),
  };
}

function isModelDto(
  value: AiProviderModelDto | null,
): value is AiProviderModelDto {
  return value !== null;
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function unixSecondsToIsoDate(value: unknown): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return null;
  }
  return new Date(value * 1000).toISOString();
}
