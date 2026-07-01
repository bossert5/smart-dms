import type { AiProviderDto, AiProviderModelDto } from '@smart-dms/shared-dto';

export type AiProviderRecord = {
  id: string;
  name: string;
  type: AiProviderDto['type'];
  baseUrl: string;
  encryptedApiKey: string | null;
  selectedModel: string | null;
  priority: number;
  isActive: boolean;
  status: AiProviderDto['status'];
  lastCheckedAt: Date | null;
  lastError: string | null;
  availableModels: unknown;
  createdAt: Date;
  updatedAt: Date;
};

export function toAiProviderDto(provider: AiProviderRecord): AiProviderDto {
  return {
    id: provider.id,
    name: provider.name,
    type: provider.type,
    baseUrl: provider.baseUrl,
    selectedModel: provider.selectedModel,
    selectedMetadataModel: provider.selectedModel,
    priority: provider.priority,
    isActive: provider.isActive,
    status: provider.status,
    lastCheckedAt: provider.lastCheckedAt?.toISOString() ?? null,
    lastError: provider.lastError,
    availableModels: modelsFromUnknown(provider.availableModels),
    hasApiKey: Boolean(provider.encryptedApiKey),
    createdAt: provider.createdAt.toISOString(),
    updatedAt: provider.updatedAt.toISOString(),
    isAvailable:
      provider.isActive &&
      provider.status === 'AVAILABLE' &&
      Boolean(provider.selectedModel),
  };
}

export function modelsFromUnknown(value: unknown): AiProviderModelDto[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(isAiProviderModel);
}

function isAiProviderModel(value: unknown): value is AiProviderModelDto {
  return (
    Boolean(value) &&
    typeof value === 'object' &&
    typeof (value as { name?: unknown }).name === 'string' &&
    typeof (value as { model?: unknown }).model === 'string' &&
    ((value as { createdAt?: unknown }).createdAt === null ||
      typeof (value as { createdAt?: unknown }).createdAt === 'string') &&
    ((value as { ownedBy?: unknown }).ownedBy === null ||
      typeof (value as { ownedBy?: unknown }).ownedBy === 'string')
  );
}
