import { AiMetadataProcessingDispatcher } from './ai-metadata-processing.dispatcher';

describe('AiMetadataProcessingDispatcher', () => {
  function createDispatcher() {
    const aiProcessing = {
      requeueInterruptedMetadataJobs: jest.fn().mockResolvedValue([]),
      dispatchWaitingJobs: jest.fn().mockResolvedValue(undefined),
    };
    const aiProviders = {
      recoverUnavailableProviders: jest.fn().mockResolvedValue([]),
    };

    return {
      aiProcessing,
      aiProviders,
      dispatcher: new AiMetadataProcessingDispatcher(
        aiProcessing as never,
        aiProviders as never,
      ),
    };
  }

  it('dispatches waiting jobs after recovering unavailable providers', async () => {
    const { aiProcessing, aiProviders, dispatcher } = createDispatcher();
    aiProviders.recoverUnavailableProviders.mockResolvedValueOnce([
      { id: 'provider-1' },
    ]);

    await dispatcher.recoverUnavailableProviders();

    expect(aiProviders.recoverUnavailableProviders).toHaveBeenCalledTimes(1);
    expect(aiProcessing.dispatchWaitingJobs).toHaveBeenCalledTimes(1);
  });

  it('does not dispatch waiting jobs when no provider recovered', async () => {
    const { aiProcessing, dispatcher } = createDispatcher();

    await dispatcher.recoverUnavailableProviders();

    expect(aiProcessing.dispatchWaitingJobs).not.toHaveBeenCalled();
  });

  it('ignores concurrent recovery ticks', async () => {
    const { aiProviders, dispatcher } = createDispatcher();
    let resolveRecovery: (providers: unknown[]) => void = () => undefined;
    aiProviders.recoverUnavailableProviders.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveRecovery = resolve;
      }),
    );

    const firstRun = dispatcher.recoverUnavailableProviders();
    await dispatcher.recoverUnavailableProviders();
    resolveRecovery([]);
    await firstRun;

    expect(aiProviders.recoverUnavailableProviders).toHaveBeenCalledTimes(1);
  });
});
