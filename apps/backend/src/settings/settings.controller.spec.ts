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
});
