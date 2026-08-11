import { TestBed } from '@angular/core/testing';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import type { AiProcessingLogDetail, AiProcessingLogListItem } from '@smart-dms/shared-dto';
import { of } from 'rxjs';
import { SettingsApiService } from '../../core/api/settings-api.service';
import { provideI18nTesting } from '../../testing/i18n-testing';
import { AiDiagnosticsComponent } from './ai-diagnostics.component';

const now = '2026-08-11T20:00:00.000Z';
const jobId = '018f1a44-9093-7f55-a515-278f4d9bd700';
const documentId = '018f1a44-9093-7f55-a515-278f4d9bd701';
const providerId = '018f1a44-9093-7f55-a515-278f4d9bd777';

const failedLog: AiProcessingLogListItem = {
  jobId,
  documentId,
  documentTitle: 'invoice.pdf',
  providerId,
  providerName: 'PC-PB',
  model: 'gemma4-12b',
  status: 'FAILED',
  startedAt: now,
  finishedAt: '2026-08-11T20:00:05.000Z',
  durationMs: 5000,
  attemptCount: 1,
  failedAttemptCount: 1,
  errorCode: 'AI_INVALID_JSON',
  errorMessage: 'invalid JSON',
  hasDetailedDiagnostics: true,
};

const detail: AiProcessingLogDetail = {
  ...failedLog,
  attempts: [
    {
      id: '018f1a44-9093-7f55-a515-278f4d9bd702',
      status: 'FAILED',
      attemptKind: 'INITIAL',
      promptKey: 'TITLE',
      sequenceIndex: 0,
      providerId,
      providerName: 'PC-PB',
      model: 'gemma4-12b',
      startedAt: now,
      finishedAt: '2026-08-11T20:00:05.000Z',
      durationMs: 5000,
      httpStatus: 200,
      requestMetadata: {
        temperature: 0.1,
        maxOutputTokens: 1200,
        reasoningEffort: 'none',
        inputCharacterCount: 120,
        resultSchemaHash: 'a'.repeat(64),
      },
      responseMetadata: {
        responseStatus: 'completed',
        outputTypes: ['message'],
        outputContentTypes: ['output_text'],
        inputTokens: 20,
        outputTokens: 10,
        totalTokens: 30,
        incompleteDetails: null,
      },
      errorCode: 'AI_INVALID_JSON',
      errorMessage: 'invalid JSON',
      rawResponse: '<script>window.compromised=true</script>',
      rawResponseTruncated: false,
    },
  ],
};

describe('AiDiagnosticsComponent', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('loads paginated diagnostic jobs and renders legacy jobs explicitly', async () => {
    const legacy = {
      ...failedLog,
      jobId: '018f1a44-9093-7f55-a515-278f4d9bd703',
      hasDetailedDiagnostics: false,
      attemptCount: 0,
      failedAttemptCount: 0,
      errorCode: null,
    } satisfies AiProcessingLogListItem;
    const api = apiMock([legacy]);
    const fixture = await createComponent(api);

    expect(api.aiProcessingLogs).toHaveBeenCalledWith({
      page: 1,
      pageSize: 25,
      status: undefined,
      providerId: undefined,
      errorCode: undefined,
      from: undefined,
      to: undefined,
    });
    expect(fixture.nativeElement.textContent).toContain(
      'No detailed diagnostic data is available for this historical job.',
    );
  });

  it('renders raw provider responses as escaped text in the admin detail', async () => {
    const api = apiMock([failedLog]);
    const fixture = await createComponent(api);

    fixture.componentInstance.openDetail(failedLog);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(api.aiProcessingLogDetail).toHaveBeenCalledWith(jobId);
    expect(document.body.textContent).toContain('<script>window.compromised=true</script>');
    expect(document.body.querySelector('script')).toBeNull();
  });
});

function apiMock(items: AiProcessingLogListItem[]) {
  return {
    aiProcessingLogs: vi.fn().mockReturnValue(
      of({
        items,
        pagination: {
          page: 1,
          pageSize: 25,
          totalItems: items.length,
          totalPages: items.length ? 1 : 0,
        },
      }),
    ),
    aiProcessingLogDetail: vi.fn().mockReturnValue(of(detail)),
  };
}

async function createComponent(api: ReturnType<typeof apiMock>) {
  TestBed.configureTestingModule({
    imports: [AiDiagnosticsComponent],
    providers: [
      provideAnimationsAsync(),
      provideI18nTesting(),
      { provide: SettingsApiService, useValue: api },
    ],
  });
  const fixture = TestBed.createComponent(AiDiagnosticsComponent);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}
