import { DatePipe, JsonPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import type {
  AiProcessingAttemptDto,
  AiProcessingErrorCode,
  AiProcessingLogDetail,
  AiProcessingLogListItem,
  AiProcessingLogStatus,
  AiProviderDto,
} from '@smart-dms/shared-dto';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzModalModule } from 'ng-zorro-antd/modal';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzTableModule } from 'ng-zorro-antd/table';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzTimelineModule } from 'ng-zorro-antd/timeline';
import { finalize } from 'rxjs';
import { SettingsApiService } from '../../core/api/settings-api.service';

const PAGE_SIZE = 25;

const LOG_STATUSES: readonly AiProcessingLogStatus[] = [
  'RUNNING',
  'SUCCESS',
  'FAILED',
  'RECOVERED',
  'INTERRUPTED',
];

const ERROR_CODES: readonly AiProcessingErrorCode[] = [
  'AI_NETWORK_ERROR',
  'AI_TIMEOUT',
  'AI_AUTH_ERROR',
  'AI_RATE_LIMIT',
  'AI_PROVIDER_HTTP_ERROR',
  'AI_EMPTY_OUTPUT',
  'AI_REASONING_BUDGET_EXHAUSTED',
  'AI_INCOMPLETE_OUTPUT',
  'AI_INVALID_JSON',
  'AI_SCHEMA_MISMATCH',
  'AI_INTERNAL_ERROR',
  'AI_PROCESS_INTERRUPTED',
];

@Component({
  selector: 'app-ai-diagnostics',
  imports: [
    DatePipe,
    FormsModule,
    JsonPipe,
    TranslatePipe,
    NzAlertModule,
    NzButtonModule,
    NzModalModule,
    NzSelectModule,
    NzTableModule,
    NzTagModule,
    NzTimelineModule,
  ],
  templateUrl: './ai-diagnostics.component.html',
  styleUrl: './ai-diagnostics.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AiDiagnosticsComponent implements OnInit {
  private readonly settingsApi = inject(SettingsApiService);

  readonly providers = input<readonly AiProviderDto[]>([]);
  readonly statuses = LOG_STATUSES;
  readonly errorCodes = ERROR_CODES;
  readonly items = signal<AiProcessingLogListItem[]>([]);
  readonly detail = signal<AiProcessingLogDetail | null>(null);
  readonly isLoading = signal(false);
  readonly isDetailLoading = signal(false);
  readonly error = signal<string | null>(null);
  readonly page = signal(1);
  readonly totalItems = signal(0);
  readonly statusFilter = signal<AiProcessingLogStatus | null>(null);
  readonly providerFilter = signal<string | null>(null);
  readonly errorCodeFilter = signal<AiProcessingErrorCode | null>(null);
  readonly fromFilter = signal('');
  readonly toFilter = signal('');

  ngOnInit(): void {
    this.load();
  }

  load(page = 1): void {
    this.page.set(page);
    this.isLoading.set(true);
    this.error.set(null);
    this.settingsApi
      .aiProcessingLogs({
        page,
        pageSize: PAGE_SIZE,
        status: this.statusFilter() ?? undefined,
        providerId: this.providerFilter() ?? undefined,
        errorCode: this.errorCodeFilter() ?? undefined,
        from: toIsoDateTime(this.fromFilter()),
        to: toIsoDateTime(this.toFilter()),
      })
      .pipe(finalize(() => this.isLoading.set(false)))
      .subscribe({
        next: (response) => {
          this.items.set(response.items);
          this.totalItems.set(response.pagination.totalItems);
        },
        error: () => this.error.set('settings.ai.diagnostics.loadFailed'),
      });
  }

  resetFilters(): void {
    this.statusFilter.set(null);
    this.providerFilter.set(null);
    this.errorCodeFilter.set(null);
    this.fromFilter.set('');
    this.toFilter.set('');
    this.load(1);
  }

  openDetail(item: AiProcessingLogListItem): void {
    this.isDetailLoading.set(true);
    this.error.set(null);
    this.settingsApi
      .aiProcessingLogDetail(item.jobId)
      .pipe(finalize(() => this.isDetailLoading.set(false)))
      .subscribe({
        next: (detail) => this.detail.set(detail),
        error: () => this.error.set('settings.ai.diagnostics.detailLoadFailed'),
      });
  }

  closeDetail(): void {
    this.detail.set(null);
  }

  copyRawResponse(attempt: AiProcessingAttemptDto): void {
    if (attempt.rawResponse) {
      void navigator.clipboard.writeText(attempt.rawResponse);
    }
  }

  statusColor(status: AiProcessingLogStatus): string {
    return {
      RUNNING: 'processing',
      SUCCESS: 'success',
      FAILED: 'error',
      RECOVERED: 'warning',
      INTERRUPTED: 'default',
    }[status];
  }

  attemptColor(status: AiProcessingAttemptDto['status']): string {
    return {
      ACTIVE: 'blue',
      SUCCESS: 'green',
      FAILED: 'red',
      INTERRUPTED: 'gray',
    }[status];
  }

  formatDuration(value: number | null): string {
    if (value === null) {
      return '–';
    }
    return value < 1000 ? `${value} ms` : `${(value / 1000).toFixed(value < 10_000 ? 1 : 0)} s`;
  }
}

function toIsoDateTime(value: string): string | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}
