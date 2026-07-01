import { expectAny, expectObjectContaining } from '../testing/expect-matchers';
import { AiProviderService } from './ai-provider.service';

const now = new Date('2026-06-12T12:00:00.000Z');
const providerId = '018f1a44-9093-7f55-a515-278f4d9bd777';

function providerRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: providerId,
    name: 'Local Ollama',
    type: 'OPENAI_COMPATIBLE',
    baseUrl: 'http://localhost:11434/v1',
    encryptedApiKey: null,
    selectedModel: null,
    priority: 1,
    isActive: true,
    status: 'UNKNOWN',
    lastCheckedAt: null,
    lastError: null,
    availableModels: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function createService() {
  const prisma = {
    aiProvider: {
      create: jest.fn().mockResolvedValue(providerRecord()),
      findUnique: jest.fn().mockResolvedValue(providerRecord()),
      update: jest.fn().mockResolvedValue(
        providerRecord({
          status: 'AVAILABLE',
          lastCheckedAt: now,
          availableModels: [
            {
              name: 'qwen3:8b',
              model: 'qwen3:8b',
              createdAt: null,
              ownedBy: 'library',
            },
          ],
          selectedModel: 'qwen3:8b',
        }),
      ),
      findFirst: jest.fn().mockResolvedValue(null),
    },
  };
  const models = {
    listModels: jest.fn().mockResolvedValue([
      {
        name: 'qwen3:8b',
        model: 'qwen3:8b',
        createdAt: null,
        ownedBy: 'library',
      },
    ]),
  };
  const secrets = {
    encrypt: jest.fn((value: string) => `encrypted:${value}`),
    decrypt: jest.fn((value: string) => value.replace(/^encrypted:/, '')),
  };
  const realtimeEvents = {
    aiProviderChanged: jest.fn().mockResolvedValue(undefined),
  };

  return {
    service: new AiProviderService(
      prisma as never,
      models as never,
      secrets as never,
      realtimeEvents as never,
    ),
    prisma,
    models,
  };
}

describe('AiProviderService', () => {
  it('refreshes models after creating a provider', async () => {
    const { service, models } = createService();

    const result = await service.createProvider({
      name: 'Local Ollama',
      baseUrl: 'http://localhost:11434',
      selectedMetadataModel: 'qwen3:8b',
    });

    expect(models.listModels).toHaveBeenCalledWith(
      expectObjectContaining({ id: providerId }),
      expectAny(Object),
    );
    expect(result.status).toBe('AVAILABLE');
    expect(result.selectedModel).toBe('qwen3:8b');
  });

  it('loads provider models without persisting a provider', async () => {
    const { service, models, prisma } = createService();

    const result = await service.loadProviderModels({
      baseUrl: 'http://localhost:11434',
      apiKey: 'secret',
    });

    expect(models.listModels).toHaveBeenCalledWith(
      {
        baseUrl: 'http://localhost:11434/v1',
        encryptedApiKey: 'encrypted:secret',
      },
      expectAny(Object),
    );
    expect(prisma.aiProvider.create).not.toHaveBeenCalled();
    expect(result.models.map((model) => model.name)).toEqual(['qwen3:8b']);
  });

  it('refreshes models after updating a provider', async () => {
    const { service, models, prisma } = createService();
    prisma.aiProvider.findUnique.mockResolvedValueOnce(providerRecord());

    const result = await service.updateProvider(providerId, {
      baseUrl: 'http://localhost:11434/v1',
    });

    expect(models.listModels).toHaveBeenCalledWith(
      expectObjectContaining({ id: providerId }),
      expectAny(Object),
    );
    expect(result.availableModels.map((model) => model.name)).toEqual([
      'qwen3:8b',
    ]);
  });
});
