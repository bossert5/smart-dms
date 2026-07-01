import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import type {
  AiPromptRunInput,
  AiPromptRunner,
} from '../ai/ai-processing.service';
import { AiProviderSecretService } from './ai-provider-secret.service';
import { AiProviderService } from './ai-provider.service';
import { OpenAiResponsesClient } from './openai-responses.client';
import { errorMessage, isAiProviderHealthError } from './ai-provider-errors';

@Injectable()
export class AiProviderRouter {
  constructor(
    private readonly providers: AiProviderService,
    private readonly responses: OpenAiResponsesClient,
    private readonly secrets: AiProviderSecretService,
  ) {}

  async hasAvailableProvider(): Promise<boolean> {
    return (await this.providers.availableProviders()).length > 0;
  }

  promptRunner(): AiPromptRunner {
    return (input) => this.runPrompt(input);
  }

  async runPrompt(input: AiPromptRunInput): Promise<Record<string, unknown>> {
    const providers = await this.providers.availableProviders();
    if (providers.length === 0) {
      throw new ServiceUnavailableException('No AI provider is available.');
    }

    const errors: string[] = [];
    for (const provider of providers) {
      try {
        return await this.responses.runPrompt(provider, this.secrets, input);
      } catch (error) {
        if (!isAiProviderHealthError(error)) {
          throw error;
        }
        errors.push(`${provider.name}: ${errorMessage(error)}`);
        await this.providers.markProviderUnavailable(provider.id, error);
      }
    }

    throw new ServiceUnavailableException(
      `All AI providers failed. ${errors.join(' | ')}`,
    );
  }
}
