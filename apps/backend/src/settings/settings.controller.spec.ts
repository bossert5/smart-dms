import { ROLES_KEY } from '../common/auth.decorators';
import { SettingsController } from './settings.controller';

describe('SettingsController', () => {
  it('restricts settings endpoints to admins', () => {
    expect(Reflect.getMetadata(ROLES_KEY, SettingsController)).toEqual([
      'Admin',
    ]);
  });

  it('delegates model refresh to the AI provider service', async () => {
    const provider = { id: '018f1a44-9093-7f55-a515-278f4d9bd777' };
    const aiProviders = {
      refreshProviderModels: jest.fn().mockResolvedValue(provider),
    };
    const controller = new SettingsController(
      {} as never,
      aiProviders as never,
      {} as never,
    );

    await expect(
      controller.refreshAiProviderModels(
        '018f1a44-9093-7f55-a515-278f4d9bd777',
      ),
    ).resolves.toBe(provider);

    expect(aiProviders.refreshProviderModels).toHaveBeenCalledWith(
      '018f1a44-9093-7f55-a515-278f4d9bd777',
    );
  });

  it('delegates provider model previews to the AI provider service', async () => {
    const response = { models: [] };
    const aiProviders = {
      loadProviderModels: jest.fn().mockResolvedValue(response),
    };
    const controller = new SettingsController(
      {} as never,
      aiProviders as never,
      {} as never,
    );

    await expect(
      controller.loadAiProviderModels({
        baseUrl: 'http://localhost:11434/v1',
      }),
    ).resolves.toBe(response);

    expect(aiProviders.loadProviderModels).toHaveBeenCalledWith({
      baseUrl: 'http://localhost:11434/v1',
    });
  });

  it('normalizes and delegates AI diagnostic log queries', async () => {
    const aiDiagnostics = {
      list: jest.fn().mockResolvedValue({ items: [] }),
      detail: jest.fn().mockResolvedValue({ jobId: 'job-id' }),
    };
    const controller = new SettingsController(
      {} as never,
      {} as never,
      aiDiagnostics as never,
    );

    await controller.listAiProcessingLogs({
      page: '2',
      pageSize: '10',
      status: 'FAILED',
      errorCode: 'AI_INVALID_JSON',
    });

    expect(aiDiagnostics.list).toHaveBeenCalledWith({
      page: 2,
      pageSize: 10,
      status: 'FAILED',
      errorCode: 'AI_INVALID_JSON',
    });

    await controller.aiProcessingLogDetail(
      '018f1a44-9093-7f55-a515-278f4d9bd700',
    );
    expect(aiDiagnostics.detail).toHaveBeenCalledWith(
      '018f1a44-9093-7f55-a515-278f4d9bd700',
    );
  });
});
