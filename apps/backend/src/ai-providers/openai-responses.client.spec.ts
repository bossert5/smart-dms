import { OpenAiResponsesClient } from './openai-responses.client';
import type {
  FailAiDiagnosticAttemptInput,
  FinishAiDiagnosticAttemptInput,
  StartAiDiagnosticAttemptInput,
} from './ai-processing-diagnostics.service';
import {
  AiProviderHealthError,
  AiProviderResponseError,
} from './ai-provider-errors';
import { expectStringContaining, mockArg } from '../testing/expect-matchers';

const provider = {
  id: '018f1a44-9093-7f55-a515-278f4d9bd777',
  name: 'Local llama.cpp',
  baseUrl: 'http://localhost:11434/v1',
  encryptedApiKey: null,
  selectedModel: 'gemma4:12b',
  availableModels: [
    {
      name: 'gemma4:12b',
      model: 'gemma4:12b',
      createdAt: null,
      ownedBy: 'llamacpp',
    },
  ],
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
        output_text: '{"title":"Wrong top-level output"}',
        output: [
          {
            type: 'message',
            content: [
              '{"title":"Wrong untyped message content"}',
              { type: 'output_text', text: '{"title":"Invoice"}' },
            ],
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
      chat_template_kwargs: { enable_thinking: false },
    });
  });

  it('does not send llama.cpp template options to other providers', async () => {
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

    await new OpenAiResponsesClient().runPrompt(
      {
        ...provider,
        name: 'OpenAI',
        selectedModel: 'gpt-5-mini',
        availableModels: [
          {
            name: 'gpt-5-mini',
            model: 'gpt-5-mini',
            createdAt: null,
            ownedBy: 'openai',
          },
        ],
      },
      secrets,
      input,
    );

    expect(parsedFetchBody(fetchMock)).not.toHaveProperty(
      'chat_template_kwargs',
    );
  });

  it('ignores llama.cpp reasoning text and parses only final output text', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        output: [
          {
            type: 'reasoning',
            content: [
              {
                type: 'reasoning_text',
                text: 'Schema {"type":"object"}; candidate {"title":"Draft"}',
              },
            ],
          },
          {
            type: 'message',
            content: [{ type: 'output_text', text: '{"title":"Invoice"}' }],
          },
        ],
      }),
    );

    await expect(
      new OpenAiResponsesClient().runPrompt(provider, secrets, input),
    ).resolves.toEqual({ title: 'Invoice' });
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
    expect(parsedFetchBody(fetchMock)).not.toHaveProperty(
      'chat_template_kwargs',
    );
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
      chat_template_kwargs: { enable_thinking: false },
    });
  });

  it.each([
    [401, 'AI_AUTH_ERROR'],
    [429, 'AI_RATE_LIMIT'],
    [500, 'AI_PROVIDER_HTTP_ERROR'],
  ] as const)(
    'classifies HTTP %s responses as provider health failures',
    async (status, code) => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({ error: { message: 'provider unavailable' } }, status),
      );

      await expect(
        new OpenAiResponsesClient().runPrompt(provider, secrets, input),
      ).rejects.toMatchObject({
        name: AiProviderHealthError.name,
        code,
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    },
  );

  it('classifies network failures as provider health failures', async () => {
    fetchMock.mockRejectedValueOnce(new Error('timeout'));

    await expect(
      new OpenAiResponsesClient().runPrompt(provider, secrets, input),
    ).rejects.toMatchObject({
      name: AiProviderHealthError.name,
      code: 'AI_TIMEOUT',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('distinguishes non-timeout network failures', async () => {
    fetchMock.mockRejectedValueOnce(new Error('socket closed'));

    await expect(
      new OpenAiResponsesClient().runPrompt(provider, secrets, input),
    ).rejects.toMatchObject({
      name: AiProviderHealthError.name,
      code: 'AI_NETWORK_ERROR',
    });
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
    ).rejects.toMatchObject({
      name: AiProviderResponseError.name,
      code: 'AI_SCHEMA_MISMATCH',
    });
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

  it('classifies incomplete provider output separately', async () => {
    const incomplete = {
      status: 'incomplete',
      incomplete_details: { reason: 'max_output_tokens' },
      output: [{ type: 'message', content: [] }],
      usage: { output_tokens: 1200 },
    };
    fetchMock
      .mockResolvedValueOnce(jsonResponse(incomplete))
      .mockResolvedValueOnce(jsonResponse(incomplete));

    await expect(
      new OpenAiResponsesClient().runPrompt(provider, secrets, input),
    ).rejects.toMatchObject({
      name: AiProviderResponseError.name,
      code: 'AI_INCOMPLETE_OUTPUT',
    });
  });

  it('classifies reasoning-only output at the token limit separately', async () => {
    const reasoningOnly = {
      status: 'completed',
      output: [
        {
          type: 'reasoning',
          content: [{ type: 'reasoning_text', text: 'Thinking only' }],
        },
      ],
      usage: { output_tokens: 1200 },
    };
    fetchMock
      .mockResolvedValueOnce(jsonResponse(reasoningOnly))
      .mockResolvedValueOnce(jsonResponse(reasoningOnly));

    await expect(
      new OpenAiResponsesClient().runPrompt(provider, secrets, input),
    ).rejects.toMatchObject({
      name: AiProviderResponseError.name,
      code: 'AI_REASONING_BUDGET_EXHAUSTED',
      message: expectStringContaining(
        'exhausted the output token budget with reasoning',
      ),
    });
  });

  it('records failed response bodies but only metadata for successful repair attempts', async () => {
    const diagnostics = {
      tryStartAttempt: jest
        .fn()
        .mockImplementation((attemptInput: Record<string, unknown>) =>
          Promise.resolve({
            ...attemptInput,
            id: `attempt-${diagnostics.tryStartAttempt.mock.calls.length}`,
            startedAt: new Date('2026-08-11T20:00:00.000Z'),
          }),
        ),
      tryFailAttempt: jest.fn().mockResolvedValue(undefined),
      tryCompleteAttempt: jest.fn().mockResolvedValue(undefined),
    };
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          status: 'completed',
          output: [
            {
              type: 'message',
              content: [{ type: 'output_text', text: 'not json' }],
            },
          ],
          usage: { input_tokens: 20, output_tokens: 10, total_tokens: 30 },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          status: 'completed',
          output: [
            {
              type: 'message',
              content: [{ type: 'output_text', text: '{"title":"Invoice"}' }],
            },
          ],
          usage: { input_tokens: 22, output_tokens: 8, total_tokens: 30 },
        }),
      );

    await expect(
      new OpenAiResponsesClient(diagnostics as never).runPrompt(
        provider,
        secrets,
        {
          ...input,
          promptKey: 'TITLE',
          promptSequenceIndex: 2,
          diagnosticContext: {
            processingJobId: '018f1a44-9093-7f55-a515-278f4d9bd700',
            documentId: '018f1a44-9093-7f55-a515-278f4d9bd701',
          },
        },
      ),
    ).resolves.toEqual({ title: 'Invoice' });

    expect(diagnostics.tryStartAttempt).toHaveBeenCalledTimes(2);
    const initialAttempt = mockArg<StartAiDiagnosticAttemptInput>(
      diagnostics.tryStartAttempt,
    );
    expect(initialAttempt).toMatchObject({
      attemptKind: 'INITIAL',
      promptKey: 'TITLE',
      sequenceIndex: 2,
    });
    expect(initialAttempt.requestMetadata).not.toHaveProperty('text');
    expect(
      mockArg<StartAiDiagnosticAttemptInput>(diagnostics.tryStartAttempt, 1),
    ).toMatchObject({ attemptKind: 'REPAIR' });
    const failedAttempt = mockArg<FailAiDiagnosticAttemptInput>(
      diagnostics.tryFailAttempt,
      0,
      2,
    );
    expect(failedAttempt.errorCode).toBe('AI_INVALID_JSON');
    expect(failedAttempt.rawResponse).toContain('not json');
    expect(diagnostics.tryCompleteAttempt).toHaveBeenCalledTimes(1);
    expect(
      mockArg<FinishAiDiagnosticAttemptInput>(
        diagnostics.tryCompleteAttempt,
        0,
        1,
      ),
    ).not.toHaveProperty('rawResponse');
  });
});

function jsonResponse(body: unknown, status = 200): Response {
  const serialized = JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(serialized),
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
