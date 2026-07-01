import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  AiProviderModelsResponse,
  AiProviderDto,
  CreateAiProviderRequest,
  LoadAiProviderModelsRequest,
  ReorderAiProvidersRequest,
  UpdateAiProviderRequest,
} from '@smart-dms/shared-dto';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeEventsService } from '../realtime/realtime-events.service';
import { AiProviderSecretService } from './ai-provider-secret.service';
import { toAiProviderDto, type AiProviderRecord } from './ai-provider.mapper';
import { OpenAiModelsClient } from './openai-models.client';

const PROVIDER_RECOVERY_RETRY_MS = 60_000;

@Injectable()
export class AiProviderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly models: OpenAiModelsClient,
    private readonly secrets: AiProviderSecretService,
    private readonly realtimeEvents?: RealtimeEventsService,
  ) {}

  async listProviders(): Promise<AiProviderDto[]> {
    const providers = await this.prisma.aiProvider.findMany({
      orderBy: [{ priority: 'asc' }, { name: 'asc' }],
    });
    return providers.map(toAiProviderDto);
  }

  async availableProviders(): Promise<AiProviderRecord[]> {
    return this.prisma.aiProvider.findMany({
      where: {
        isActive: true,
        status: 'AVAILABLE',
        selectedModel: { not: null },
      },
      orderBy: [{ priority: 'asc' }, { name: 'asc' }],
    });
  }

  async createProvider(input: CreateAiProviderRequest): Promise<AiProviderDto> {
    const selectedModel =
      input.selectedMetadataModel?.trim() || input.selectedModel?.trim();
    if (!selectedModel) {
      throw new BadRequestException('AI provider model must be selected.');
    }

    const priority = input.priority ?? (await this.nextPriority());
    const provider = await this.prisma.aiProvider.create({
      data: {
        name: input.name.trim(),
        type: 'OPENAI_COMPATIBLE',
        baseUrl: normalizeOpenAiBaseUrl(input.baseUrl),
        encryptedApiKey: input.apiKey
          ? this.secrets.encrypt(input.apiKey)
          : null,
        selectedModel,
        priority,
        isActive: input.isActive ?? true,
      },
    });
    const dto = toAiProviderDto(provider);
    await this.realtimeEvents?.aiProviderChanged({
      providerId: dto.id,
      action: 'UPSERT',
      provider: dto,
      reason: 'PROVIDER_CREATED',
    });
    return this.refreshProviderModels(dto.id);
  }

  async loadProviderModels(
    input: LoadAiProviderModelsRequest,
  ): Promise<AiProviderModelsResponse> {
    try {
      const apiKey = input.apiKey?.trim();
      const models = await this.models.listModels(
        {
          baseUrl: normalizeOpenAiBaseUrl(input.baseUrl),
          encryptedApiKey: apiKey ? this.secrets.encrypt(apiKey) : null,
        },
        this.secrets,
      );
      return { models };
    } catch {
      throw new BadRequestException('AI provider models could not be loaded.');
    }
  }

  async updateProvider(
    id: string,
    input: UpdateAiProviderRequest,
  ): Promise<AiProviderDto> {
    await this.requireProvider(id);
    const data: Prisma.AiProviderUpdateInput = {};

    if (input.name !== undefined) {
      data.name = input.name.trim();
    }
    if (input.baseUrl !== undefined) {
      data.baseUrl = normalizeOpenAiBaseUrl(input.baseUrl);
      data.status = 'UNKNOWN';
      data.lastError = null;
      data.lastCheckedAt = null;
      data.availableModels = [];
    }
    if (input.selectedModel !== undefined) {
      data.selectedModel = input.selectedModel?.trim() || null;
    }
    if (input.selectedMetadataModel !== undefined) {
      data.selectedModel = input.selectedMetadataModel?.trim() || null;
    }
    if (input.apiKey !== undefined) {
      data.encryptedApiKey = input.apiKey
        ? this.secrets.encrypt(input.apiKey)
        : null;
      data.status = 'UNKNOWN';
      data.lastError = null;
      data.lastCheckedAt = null;
    }
    if (input.priority !== undefined) {
      data.priority = input.priority;
    }
    if (input.isActive !== undefined) {
      data.isActive = input.isActive;
    }

    const provider = await this.prisma.aiProvider.update({
      where: { id },
      data,
    });
    const dto = toAiProviderDto(provider);
    await this.realtimeEvents?.aiProviderChanged({
      providerId: dto.id,
      action: 'UPSERT',
      provider: dto,
      reason: 'PROVIDER_UPDATED',
    });
    return this.refreshProviderModels(dto.id);
  }

  async deleteProvider(id: string): Promise<void> {
    await this.prisma.aiProvider.delete({ where: { id } });
    await this.realtimeEvents?.aiProviderChanged({
      providerId: id,
      action: 'DELETE',
      reason: 'PROVIDER_DELETED',
    });
  }

  async reorderProviders(
    input: ReorderAiProvidersRequest,
  ): Promise<AiProviderDto[]> {
    const providers = await this.prisma.aiProvider.findMany({
      select: { id: true },
    });
    const existingIds = new Set(providers.map((provider) => provider.id));
    const uniqueIds = new Set(input.providerIds);
    if (
      uniqueIds.size !== input.providerIds.length ||
      existingIds.size !== input.providerIds.length ||
      !input.providerIds.every((id) => existingIds.has(id))
    ) {
      throw new BadRequestException(
        'Provider reorder payload must contain every AI provider exactly once.',
      );
    }

    await this.prisma.$transaction(
      input.providerIds.map((id, index) =>
        this.prisma.aiProvider.update({
          where: { id },
          data: { priority: index + 1 },
        }),
      ),
    );
    return this.listProviders();
  }

  async refreshProviderModels(id: string): Promise<AiProviderDto> {
    const provider = await this.requireProvider(id);

    try {
      const models = await this.models.listModels(provider, this.secrets);
      const selectedModel =
        provider.selectedModel ??
        (models.length === 1 ? (models[0]?.name ?? null) : null);
      const updated = await this.prisma.aiProvider.update({
        where: { id },
        data: {
          availableModels: models,
          selectedModel,
          status: 'AVAILABLE',
          lastCheckedAt: new Date(),
          lastError: null,
        },
      });
      const dto = toAiProviderDto(updated);
      await this.realtimeEvents?.aiProviderChanged({
        providerId: dto.id,
        action: 'UPSERT',
        provider: dto,
        reason: 'PROVIDER_MODEL_REFRESHED',
      });
      return dto;
    } catch (error) {
      return this.markUnavailable(id, error, 'PROVIDER_HEALTH_CHANGED');
    }
  }

  async recoverUnavailableProviders(
    now = new Date(),
  ): Promise<AiProviderDto[]> {
    const retryBefore = new Date(now.getTime() - PROVIDER_RECOVERY_RETRY_MS);
    const providers = await this.prisma.aiProvider.findMany({
      where: {
        isActive: true,
        status: 'UNAVAILABLE',
        OR: [{ lastCheckedAt: null }, { lastCheckedAt: { lt: retryBefore } }],
      },
      orderBy: [{ priority: 'asc' }, { name: 'asc' }],
      select: { id: true },
    });
    const recovered: AiProviderDto[] = [];

    for (const provider of providers) {
      const refreshed = await this.refreshProviderModels(provider.id);
      if (refreshed.status === 'AVAILABLE') {
        recovered.push(refreshed);
      }
    }

    return recovered;
  }

  async markProviderUnavailable(id: string, error: unknown): Promise<void> {
    await this.markUnavailable(id, error, 'PROVIDER_HEALTH_CHANGED');
  }

  private async markUnavailable(
    id: string,
    error: unknown,
    reason: Parameters<RealtimeEventsService['aiProviderChanged']>[0]['reason'],
  ): Promise<AiProviderDto> {
    const provider = await this.prisma.aiProvider.update({
      where: { id },
      data: {
        status: 'UNAVAILABLE',
        lastCheckedAt: new Date(),
        lastError: errorMessage(error),
      },
    });
    const dto = toAiProviderDto(provider);
    await this.realtimeEvents?.aiProviderChanged({
      providerId: id,
      action: 'UPSERT',
      provider: dto,
      reason,
    });
    return dto;
  }

  private async requireProvider(id: string): Promise<AiProviderRecord> {
    const provider = await this.prisma.aiProvider.findUnique({ where: { id } });
    if (!provider) {
      throw new NotFoundException('AI provider does not exist.');
    }
    return provider;
  }

  private async nextPriority(): Promise<number> {
    const last = await this.prisma.aiProvider.findFirst({
      select: { priority: true },
      orderBy: { priority: 'desc' },
    });
    return (last?.priority ?? 0) + 1;
  }
}

export function normalizeOpenAiBaseUrl(value: string): string {
  return normalizeBaseUrl(value, '/v1');
}

function normalizeBaseUrl(value: string, suffix: '/v1'): string {
  const url = new URL(value.trim());
  url.pathname = url.pathname.replace(/\/+$/, '');
  if (!url.pathname.endsWith(suffix)) {
    url.pathname = `${url.pathname}/${suffix}`.replace(/\/+/g, '/');
  }
  url.search = '';
  url.hash = '';
  return url.toString().replace(/\/$/, '');
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
