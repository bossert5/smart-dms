import { OpenAiResponsesClient } from './openai-responses.client';
import {
  AiProviderHealthError,
  AiProviderResponseError,
} from './ai-provider-errors';
import { expectStringContaining, mockArg } from '../testing/expect-matchers';

const provider = {
  baseUrl: 'http://localhost:11434/v1',
  encryptedApiKey: null,
  selectedModel: 'gemma4:12b',
};

const input = {
  text: 'Return JSON.',
  resultSchema: { type: 'object' },
  maxTokens: 1200,
  temperature: 0.1,
  enableThinking: false,
  structuredOutputMode: 'FREE_JSON' as const,
  logThinkingStream: false,
};

describe('OpenAiResponsesClient', () => {
  const fetchMock = jest.fn();
  const secrets = { decrypt: jest.fn() };

  beforeEach(() => {
    fetchMock.mockReset();
    secrets.decrypt.mockReset();
    jest.spyOn(global, 'fetch').mockImplementation(fetchMock);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('disables provider reasoning for non-thinking extraction prompts', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        output: [
          {
            type: 'message',
            content: [{ type: 'output_text', text: '{"title":"Invoice"}' }],
          },
        ],
      }),
    );

    const result = await new OpenAiResponsesClient().runPrompt(
      provider,
      secrets,
      input,
    );

    expect(result).toEqual({ title: 'Invoice' });
    expect(parsedFetchBody(fetchMock)).toMatchObject({
      max_output_tokens: 1200,
      reasoning: { effort: 'none' },
    });
  });

  it('adds output headroom for thinking extraction prompts', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        output: [
          {
            type: 'message',
            content: [{ type: 'output_text', text: '{"documentDate":null}' }],
          },
        ],
      }),
    );

    await new OpenAiResponsesClient().runPrompt(provider, secrets, {
      ...input,
      enableThinking: true,
      temperature: 1,
    });

    expect(parsedFetchBody(fetchMock)).toMatchObject({
      max_output_tokens: 5296,
      reasoning: { effort: 'low' },
    });
  });

  it('retries repair prompts without thinking after validation failures', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          output: [
            {
              type: 'message',
              content: [{ type: 'output_text', text: '{"title":7}' }],
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          output: [
            {
              type: 'message',
              content: [{ type: 'output_text', text: '{"title":"Invoice"}' }],
            },
          ],
        }),
      );

    const result = await new OpenAiResponsesClient().runPrompt(
      provider,
      secrets,
      {
        ...input,
        enableThinking: true,
        resultSchema: {
          type: 'object',
          properties: { title: { type: 'string' } },
          required: ['title'],
        },
      },
    );

    expect(result).toEqual({ title: 'Invoice' });
    expect(parsedFetchBody(fetchMock, 1)).toMatchObject({
      temperature: 0,
      max_output_tokens: 1200,
      reasoning: { effort: 'none' },
    });
  });

  it.each([500, 429])(
    'classifies HTTP %s responses as provider health failures',
    async (status) => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({ error: { message: 'provider unavailable' } }, status),
      );

      await expect(
        new OpenAiResponsesClient().runPrompt(provider, secrets, input),
      ).rejects.toBeInstanceOf(AiProviderHealthError);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    },
  );

  it('classifies network failures as provider health failures', async () => {
    fetchMock.mockRejectedValueOnce(new Error('timeout'));

    await expect(
      new OpenAiResponsesClient().runPrompt(provider, secrets, input),
    ).rejects.toBeInstanceOf(AiProviderHealthError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('classifies schema failures after repair as AI response failures', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          output: [
            {
              type: 'message',
              content: [{ type: 'output_text', text: '{"title":7}' }],
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          output: [
            {
              type: 'message',
              content: [{ type: 'output_text', text: '{"title":8}' }],
            },
          ],
        }),
      );

    await expect(
      new OpenAiResponsesClient().runPrompt(provider, secrets, {
        ...input,
        resultSchema: {
          type: 'object',
          properties: { title: { type: 'string' } },
          required: ['title'],
        },
      }),
    ).rejects.toBeInstanceOf(AiProviderResponseError);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('reports empty final output with response diagnostics', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          status: 'completed',
          output: [
            {
              type: 'reasoning',
              summary: [{ type: 'summary_text', text: 'Thinking only' }],
            },
            {
              type: 'message',
              content: [{ type: 'output_text', text: '' }],
            },
          ],
          usage: { output_tokens: 1200 },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          status: 'completed',
          output: [{ type: 'message', content: [] }],
          usage: { output_tokens: 1200 },
        }),
      );

    await expect(
      new OpenAiResponsesClient().runPrompt(provider, secrets, input),
    ).rejects.toMatchObject({
      name: AiProviderResponseError.name,
      message: expectStringContaining(
        'The provider may have spent the output budget on reasoning before producing JSON.',
      ),
    });
  });
});

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response;
}

function parsedFetchBody(
  fetchMock: { mock: { calls: readonly (readonly unknown[])[] } },
  callIndex = 0,
): Record<string, unknown> {
  const init = mockArg<{ body: string }>(fetchMock, callIndex, 1);
  const parsed: unknown = JSON.parse(init.body);
  return parsed as Record<string, unknown>;
}
