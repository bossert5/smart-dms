import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  OnInit,
  signal,
  untracked,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import type { DocumentStatus, EmailAttachmentDto, EmailMessageDto } from '@smart-dms/shared-dto';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzEmptyModule } from 'ng-zorro-antd/empty';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzTableModule } from 'ng-zorro-antd/table';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { finalize } from 'rxjs';
import { EmailMailboxesApiService } from '../../core/api/email-mailboxes-api.service';
import { TenantContextService } from '../../core/services/tenant-context.service';
import { shortIsoDateTime } from '../../shared/formatters/date.formatter';
import { InfiniteTableScrollDirective } from '../../shared/table/infinite-table-scroll.directive';
import { TablePanelComponent } from '../../shared/table/table-panel.component';

const PAGE_SIZE = 25;

type EmailProcessingState = 'FAILED' | 'PROCESSING' | 'PROCESSED' | 'SKIPPED';

const PROCESSING_DOCUMENT_STATUSES = new Set<DocumentStatus>([
  'NEW',
  'INGESTING',
  'OCR_PENDING',
  'OCR_RUNNING',
  'AI_PENDING',
  'AI_RUNNING',
]);

@Component({
  selector: 'app-email',
  imports: [
    RouterLink,
    TranslatePipe,
    NzAlertModule,
    NzButtonModule,
    NzEmptyModule,
    NzIconModule,
    NzTableModule,
    NzTagModule,
    InfiniteTableScrollDirective,
    TablePanelComponent,
  ],
  templateUrl: './email.component.html',
  styleUrl: './email.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EmailComponent implements OnInit {
  private readonly emailApi = inject(EmailMailboxesApiService);
  private readonly tenantContext = inject(TenantContextService);
  private lastTenantScope = this.tenantContext.activeScope();
  private requestId = 0;
  private activeReplaceRequestId: number | null = null;
  private activeAppendRequestId: number | null = null;

  readonly messages = signal<EmailMessageDto[]>([]);
  readonly isLoading = signal(false);
  readonly isLoadingMore = signal(false);
  readonly error = signal<string | null>(null);
  readonly currentPage = signal(1);
  readonly pageSize = signal(PAGE_SIZE);
  readonly totalMessages = signal(0);

  constructor() {
    effect(() => {
      const tenantScope = this.tenantContext.activeScope();
      if (tenantScope === this.lastTenantScope) {
        return;
      }

      this.lastTenantScope = tenantScope;
      untracked(() => this.reload());
    });
  }

  ngOnInit(): void {
    this.reload();
  }

  reload(): void {
    this.currentPage.set(1);
    this.loadMessagesPage(1, { append: false });
  }

  loadNextPage(): void {
    if (this.isLoading() || this.isLoadingMore() || !this.hasMoreMessages()) {
      return;
    }

    this.loadMessagesPage(this.currentPage() + 1, { append: true });
  }

  hasMoreMessages(): boolean {
    return this.messages().length < this.totalMessages();
  }

  loadMessages(page: number): void {
    this.loadMessagesPage(page, { append: false });
  }

  private loadMessagesPage(page: number, options: { readonly append: boolean }): void {
    if (this.tenantContext.hasNoActiveTenants()) {
      this.activeReplaceRequestId = null;
      this.activeAppendRequestId = null;
      this.messages.set([]);
      this.totalMessages.set(0);
      this.currentPage.set(1);
      this.error.set(null);
      this.isLoading.set(false);
      this.isLoadingMore.set(false);
      return;
    }

    const requestId = ++this.requestId;
    if (options.append) {
      this.isLoadingMore.set(true);
      this.activeAppendRequestId = requestId;
    } else {
      this.isLoading.set(true);
      this.activeReplaceRequestId = requestId;
    }
    this.error.set(null);
    this.emailApi
      .allMessages({ page, pageSize: this.pageSize() })
      .pipe(
        finalize(() => {
          if (options.append && this.activeAppendRequestId === requestId) {
            this.isLoadingMore.set(false);
            this.activeAppendRequestId = null;
          }

          if (!options.append && this.activeReplaceRequestId === requestId) {
            this.isLoading.set(false);
            this.activeReplaceRequestId = null;
          }
        }),
      )
      .subscribe({
        next: (response) => {
          if (requestId !== this.requestId) {
            return;
          }

          this.messages.set(
            options.append ? appendUniqueMessages(this.messages(), response.items) : response.items,
          );
          this.totalMessages.set(response.meta.totalItems);
          this.currentPage.set(response.meta.page);
        },
        error: () => {
          if (requestId !== this.requestId) {
            return;
          }

          if (!options.append) {
            this.messages.set([]);
            this.totalMessages.set(0);
          }
          this.error.set('email.errors.messagesFailed');
        },
      });
  }

  shortDateTime(value: string | null): string {
    return shortIsoDateTime(value);
  }

  senderLabel(message: EmailMessageDto): string {
    return message.fromName || message.fromAddress || '';
  }

  messageProcessingState(message: EmailMessageDto): EmailProcessingState {
    const attachmentStates = message.attachments.map((attachment) =>
      this.attachmentProcessingState(attachment),
    );

    if (attachmentStates.includes('FAILED')) {
      return 'FAILED';
    }
    if (attachmentStates.includes('PROCESSING')) {
      return 'PROCESSING';
    }
    if (attachmentStates.includes('PROCESSED')) {
      return 'PROCESSED';
    }

    return 'SKIPPED';
  }

  processingStateLabelKey(state: EmailProcessingState): string {
    return `email.processing.${state}`;
  }

  processingStateColor(state: EmailProcessingState): string {
    switch (state) {
      case 'FAILED':
        return 'error';
      case 'PROCESSING':
        return 'processing';
      case 'PROCESSED':
        return 'success';
      case 'SKIPPED':
        return 'default';
    }
  }

  attachmentStatusLabelKey(attachment: EmailAttachmentDto): string {
    const state = this.attachmentProcessingState(attachment);
    if (state !== 'PROCESSED' || !attachment.documentStatus) {
      return this.processingStateLabelKey(state);
    }

    return `enums.documentStatus.${attachment.documentStatus}`;
  }

  trackMessage(_index: number, message: EmailMessageDto): string {
    return message.id;
  }

  trackAttachment(_index: number, attachment: EmailAttachmentDto): string {
    return attachment.id;
  }

  private attachmentProcessingState(attachment: EmailAttachmentDto): EmailProcessingState {
    if (!attachment.documentId || !attachment.documentStatus) {
      return 'SKIPPED';
    }
    if (attachment.documentStatus === 'FAILED') {
      return 'FAILED';
    }
    if (PROCESSING_DOCUMENT_STATUSES.has(attachment.documentStatus)) {
      return 'PROCESSING';
    }

    return 'PROCESSED';
  }
}

function appendUniqueMessages(
  current: readonly EmailMessageDto[],
  next: readonly EmailMessageDto[],
): EmailMessageDto[] {
  const messageIds = new Set(current.map((message) => message.id));
  return [...current, ...next.filter((message) => !messageIds.has(message.id))];
}
