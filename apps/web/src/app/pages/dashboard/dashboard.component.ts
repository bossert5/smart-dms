import { FormsModule } from '@angular/forms';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import type {
  CalendarEventKind,
  DashboardCombinedEntryDto,
  DashboardDateEntryDto,
  DashboardPaymentEntryDto,
  DashboardRecentCompletedItemDto,
  DashboardSummaryDto,
  UserAssigneeDto,
} from '@smart-dms/shared-dto';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzEmptyModule } from 'ng-zorro-antd/empty';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzTooltipModule } from 'ng-zorro-antd/tooltip';
import type { Observable } from 'rxjs';
import { finalize, forkJoin } from 'rxjs';
import { DashboardApiService } from '../../core/api/dashboard-api.service';
import { DocumentApiService } from '../../core/api/document-api.service';
import { UserApiService } from '../../core/api/user-api.service';
import { LanguageService } from '../../core/i18n/language.service';
import { AuthService } from '../../core/services/auth.service';
import { OpenDocumentsService } from '../../core/services/open-documents.service';
import { RealtimeClientService } from '../../core/services/realtime-client.service';
import { TenantContextService } from '../../core/services/tenant-context.service';
import { localizedLongDate } from '../../shared/formatters/date.formatter';
import {
  calendarEventColor,
  calendarEventIcon,
  calendarEventKindLabelKey,
} from '../../shared/presentation/calendar-presentation';

interface OverviewTile {
  readonly labelKey: string;
  readonly icon: string;
  readonly value: string;
  readonly detail: string;
  readonly tone: 'neutral' | 'success' | 'warning';
}

interface CompletedEntryContext {
  readonly dueDate: string;
  readonly dueTime: string | null;
}

interface RecentCompletedTimelineItem extends DashboardRecentCompletedItemDto {
  readonly dueDate: string;
  readonly dueTime: string | null;
}

const DASHBOARD_POLLING_INTERVAL_MS = 30_000;
const RECENT_COMPLETED_VISIBLE_MS = 60 * 60_000;
const RECENT_COMPLETED_REFRESH_INTERVAL_MS = 60_000;
const MIXED_ASSIGNEE_VALUE = '__mixed__';
const DAY_IN_MS = 86_400_000;
const MINUTE_IN_MS = 60_000;

@Component({
  selector: 'app-dashboard',
  imports: [
    FormsModule,
    RouterLink,
    TranslatePipe,
    NzAlertModule,
    NzButtonModule,
    NzEmptyModule,
    NzIconModule,
    NzSelectModule,
    NzSpinModule,
    NzTagModule,
    NzTooltipModule,
  ],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardComponent {
  readonly auth = inject(AuthService);
  private readonly api = inject(DashboardApiService);
  private readonly documentsApi = inject(DocumentApiService);
  private readonly language = inject(LanguageService);
  private readonly openDocuments = inject(OpenDocumentsService);
  private readonly realtime = inject(RealtimeClientService);
  private readonly tenantContext = inject(TenantContextService);
  private readonly translate = inject(TranslateService);
  private readonly usersApi = inject(UserApiService);
  private lastDocumentChangeKey = this.documentChangeKey(this.realtime.latestDocumentChange());
  private lastAiProviderChangeKey = this.aiProviderChangeKey(
    this.realtime.latestAiProviderChange(),
  );
  private lastConnectionRevision = this.realtime.connectionRevision();
  private lastTenantScope = this.tenantContext.activeScope();

  readonly summary = signal<DashboardSummaryDto | null>(null);
  readonly assignees = signal<UserAssigneeDto[]>([]);
  readonly isLoading = signal(false);
  readonly isAssigneesLoading = signal(false);
  readonly error = signal<string | null>(null);
  readonly pendingTaskIds = signal<ReadonlySet<string>>(new Set());
  readonly mixedAssigneeValue = MIXED_ASSIGNEE_VALUE;
  private readonly currentTimeMs = signal(Date.now());
  private readonly completedEntryContexts = signal<ReadonlyMap<string, CompletedEntryContext>>(
    new Map(),
  );
  readonly recentCompletedTimelineItems = computed<RecentCompletedTimelineItem[]>(() => {
    const summary = this.summary();
    if (!summary) {
      return [];
    }

    const now = this.currentTimeMs();
    const contexts = this.completedEntryContexts();
    return (summary.recentCompleted ?? [])
      .flatMap((item): RecentCompletedTimelineItem[] => {
        const context = contexts.get(item.id);
        if (!context || !this.isRecentCompletedVisible(item, now)) {
          return [];
        }

        return [{ ...item, ...context }];
      })
      .sort((left, right) => right.completedAt.localeCompare(left.completedAt));
  });
  readonly visibleCombinedEntries = computed<DashboardCombinedEntryDto[]>(() => {
    const summary = this.summary();
    if (!summary) {
      return [];
    }

    const todayStart = this.dashboardTodayStart();
    return summary.combinedEntries.flatMap((entry): DashboardCombinedEntryDto[] => {
      const dateEntries = entry.dateEntries.filter(
        (dateEntry) => !this.isExpiredAppointment(dateEntry, todayStart),
      );
      if (dateEntries.length === entry.dateEntries.length) {
        return [entry];
      }

      if (dateEntries.length === 0 && entry.payments.length === 0) {
        return [];
      }

      return [{ ...entry, dateEntries }];
    });
  });
  readonly hasTimelineEntries = computed(
    () =>
      this.visibleCombinedEntries().length > 0 ||
      this.recentCompletedTimelineItems().length > 0,
  );
  readonly overviewTiles = computed<OverviewTile[]>(() => {
    const summary = this.summary();
    if (!summary) {
      return [];
    }
    const facts = summary.facts;
    const tiles: OverviewTile[] = [
      {
        labelKey: 'dashboard.widgets.documents',
        icon: 'file-text',
        value: this.formatNumber(this.acceptedDocumentCount(facts)),
        detail: this.translate.instant('dashboard.widgets.documentsDetail'),
        tone: 'neutral',
      },
      {
        labelKey: 'dashboard.widgets.inbox',
        icon: 'inbox',
        value: this.formatNumber(facts.inbox.total),
        detail: this.translate.instant('dashboard.widgets.inboxDetail', {
          ready: this.formatNumber(facts.inbox.ready),
          open: this.formatNumber(facts.inbox.open),
        }),
        tone: facts.inbox.open > 0 ? 'warning' : 'success',
      },
      {
        labelKey: 'dashboard.widgets.emails',
        icon: 'mail',
        value: this.formatNumber(facts.emails.total),
        detail: this.translate.instant('dashboard.widgets.emailsDetail', {
          processed: this.formatNumber(facts.emails.processed),
          open: this.formatNumber(facts.emails.open),
        }),
        tone: facts.emails.open > 0 ? 'warning' : 'success',
      },
      {
        labelKey: 'dashboard.widgets.openPayments',
        icon: 'dollar',
        value: this.formatNumber(facts.openPayments),
        detail: this.translate.instant('dashboard.widgets.openPaymentsDetail'),
        tone: facts.openPayments > 0 ? 'warning' : 'success',
      },
      {
        labelKey: 'dashboard.widgets.openDateEntries',
        icon: 'calendar',
        value: this.formatNumber(facts.openDateEntries),
        detail: this.translate.instant('dashboard.widgets.openDateEntriesDetail'),
        tone: facts.openDateEntries > 0 ? 'warning' : 'success',
      },
      {
        labelKey: 'dashboard.widgets.users',
        icon: 'team',
        value: this.formatNumber(facts.users),
        detail: this.translate.instant('dashboard.widgets.usersDetail'),
        tone: 'neutral',
      },
      {
        labelKey: 'dashboard.widgets.aiWorkers',
        icon: 'api',
        value: `${this.formatNumber(facts.aiWorkers.connected)} / ${this.formatNumber(
          facts.aiWorkers.total,
        )}`,
        detail: this.translate.instant('dashboard.widgets.aiWorkersDetail'),
        tone: facts.aiWorkers.connected > 0 ? 'success' : 'neutral',
      },
    ];

    return facts.emails.accounts > 0
      ? tiles
      : tiles.filter((tile) => tile.labelKey !== 'dashboard.widgets.emails');
  });

  constructor() {
    effect(() => {
      const tenantScope = this.tenantContext.activeScope();
      if (tenantScope === this.lastTenantScope) {
        return;
      }

      this.lastTenantScope = tenantScope;
      untracked(() => this.load());
    });
    effect(() => {
      const event = this.realtime.latestDocumentChange();
      const eventKey = this.documentChangeKey(event);
      if (!event || eventKey === this.lastDocumentChangeKey) {
        return;
      }

      this.lastDocumentChangeKey = eventKey;
      untracked(() => this.load());
    });
    effect(() => {
      const event = this.realtime.latestAiProviderChange();
      const eventKey = this.aiProviderChangeKey(event);
      if (!event || eventKey === this.lastAiProviderChangeKey) {
        return;
      }

      this.lastAiProviderChangeKey = eventKey;
      untracked(() => this.load());
    });
    effect((onCleanup) => {
      if (this.realtime.isConnected()) {
        return;
      }

      const intervalId = globalThis.setInterval(() => {
        if (!this.isLoading()) {
          this.load();
        }
      }, DASHBOARD_POLLING_INTERVAL_MS);
      onCleanup(() => globalThis.clearInterval(intervalId));
    });
    effect(() => {
      const connectionRevision = this.realtime.connectionRevision();
      if (connectionRevision === this.lastConnectionRevision) {
        return;
      }

      this.lastConnectionRevision = connectionRevision;
      untracked(() => this.load());
    });
    effect((onCleanup) => {
      const intervalId = globalThis.setInterval(() => {
        this.currentTimeMs.set(Date.now());
      }, RECENT_COMPLETED_REFRESH_INTERVAL_MS);
      onCleanup(() => globalThis.clearInterval(intervalId));
    });
    this.loadAssignees();
    this.load();
  }

  load(): void {
    if (this.tenantContext.hasNoActiveTenants()) {
      this.summary.set(null);
      this.error.set(null);
      this.isLoading.set(false);
      return;
    }

    this.isLoading.set(true);
    this.error.set(null);
    this.api.summary().subscribe({
      next: (summary) => {
        this.summary.set(summary);
        this.isLoading.set(false);
      },
      error: () => {
        this.summary.set(null);
        this.error.set('dashboard.errors.loadFailed');
        this.isLoading.set(false);
      },
    });
  }

  assignDateEntry(entry: DashboardDateEntryDto, assignedToId: string | null): void {
    if (!this.auth.canEditDocuments() || this.assigneeId(entry.assignedTo) === assignedToId) {
      return;
    }

    this.runTaskUpdate(
      this.dateEntryTaskKey(entry),
      this.documentsApi.updateCalendarEventTask(entry.documentId, entry.id, { assignedToId }),
    );
  }

  assignPayment(payment: DashboardPaymentEntryDto, assignedToId: string | null): void {
    if (!this.auth.canEditDocuments() || this.assigneeId(payment.assignedTo) === assignedToId) {
      return;
    }

    this.runTaskUpdate(
      this.paymentTaskKey(payment),
      this.documentsApi.updatePaymentTask(payment.documentId, payment.id, { assignedToId }),
    );
  }

  markDateEntryDone(entry: DashboardDateEntryDto): void {
    if (!this.auth.canEditDocuments() || !this.canCompleteDateEntry(entry)) {
      return;
    }

    this.rememberCompletedDateEntry(entry);
    this.runTaskUpdate(
      this.dateEntryTaskKey(entry),
      this.documentsApi.updateCalendarEventTask(entry.documentId, entry.id, {
        completed: true,
      }),
    );
  }

  markPaymentDone(payment: DashboardPaymentEntryDto): void {
    if (!this.auth.canEditDocuments()) {
      return;
    }

    this.rememberCompletedPayment(payment);
    this.runTaskUpdate(
      this.paymentTaskKey(payment),
      this.documentsApi.updatePaymentTask(payment.documentId, payment.id, {
        completed: true,
      }),
    );
  }

  assignCombinedEntry(entry: DashboardCombinedEntryDto, assignedToId: string | null): void {
    if (
      !this.auth.canEditDocuments() ||
      assignedToId === MIXED_ASSIGNEE_VALUE ||
      this.combinedAssigneeId(entry) === assignedToId
    ) {
      return;
    }

    const requests: Observable<unknown>[] = [
      ...entry.dateEntries
        .filter((dateEntry) => this.assigneeId(dateEntry.assignedTo) !== assignedToId)
        .map((dateEntry) =>
          this.documentsApi.updateCalendarEventTask(dateEntry.documentId, dateEntry.id, {
            assignedToId,
          }),
        ),
      ...entry.payments
        .filter((payment) => this.assigneeId(payment.assignedTo) !== assignedToId)
        .map((payment) =>
          this.documentsApi.updatePaymentTask(payment.documentId, payment.id, {
            assignedToId,
          }),
        ),
    ];

    this.runCombinedTaskUpdate(entry, requests);
  }

  markCombinedEntryDone(entry: DashboardCombinedEntryDto): void {
    if (!this.auth.canEditDocuments() || !this.canCompleteCombinedEntry(entry)) {
      return;
    }

    this.rememberCompletedCombinedEntry(entry);
    const requests: Observable<unknown>[] = [
      ...entry.dateEntries
        .filter((dateEntry) => this.canCompleteDateEntry(dateEntry))
        .map((dateEntry) =>
          this.documentsApi.updateCalendarEventTask(dateEntry.documentId, dateEntry.id, {
            completed: true,
          }),
        ),
      ...entry.payments.map((payment) =>
        this.documentsApi.updatePaymentTask(payment.documentId, payment.id, {
          completed: true,
        }),
      ),
    ];

    this.runCombinedTaskUpdate(entry, requests);
  }

  isDateEntryUpdating(entry: DashboardDateEntryDto): boolean {
    return this.pendingTaskIds().has(this.dateEntryTaskKey(entry));
  }

  isPaymentUpdating(payment: DashboardPaymentEntryDto): boolean {
    return this.pendingTaskIds().has(this.paymentTaskKey(payment));
  }

  isCombinedEntryUpdating(entry: DashboardCombinedEntryDto): boolean {
    return this.pendingTaskIds().has(this.combinedEntryTaskKey(entry));
  }

  canCompleteDateEntry(entry: DashboardDateEntryDto): boolean {
    return entry.kind !== 'APPOINTMENT';
  }

  canCompleteCombinedEntry(entry: DashboardCombinedEntryDto): boolean {
    return (
      entry.payments.length > 0 ||
      entry.dateEntries.some((dateEntry) => this.canCompleteDateEntry(dateEntry))
    );
  }

  isCombinedEntry(entry: DashboardCombinedEntryDto): boolean {
    return entry.dateEntries.length > 0 && entry.payments.length > 0;
  }

  entryTimes(entry: DashboardCombinedEntryDto): string[] {
    return [...new Set(entry.dateEntries.flatMap((dateEntry) => dateEntry.time ?? []))].sort();
  }

  relativeDueLabel(entry: DashboardCombinedEntryDto): string {
    const daysUntilDue = this.daysUntil(entry.date);
    if (daysUntilDue === null) {
      return this.translate.instant('common.emptyValue');
    }

    if (daysUntilDue < 0) {
      const count = Math.abs(daysUntilDue);
      return this.translate.instant(
        count === 1
          ? 'dashboard.timeline.relative.overdueOne'
          : 'dashboard.timeline.relative.overdueMany',
        { count },
      );
    }

    if (daysUntilDue === 0) {
      return this.translate.instant('dashboard.timeline.relative.today');
    }

    return this.translate.instant(
      daysUntilDue === 1
        ? 'dashboard.timeline.relative.dueOne'
        : 'dashboard.timeline.relative.dueMany',
      { count: daysUntilDue },
    );
  }

  relativeDueColor(entry: DashboardCombinedEntryDto): string {
    const daysUntilDue = this.daysUntil(entry.date);
    if (daysUntilDue === null) {
      return 'default';
    }

    if (daysUntilDue < 0) {
      return 'red';
    }

    return daysUntilDue === 0 ? 'gold' : 'blue';
  }

  primaryDateEntry(entry: DashboardCombinedEntryDto): DashboardDateEntryDto | null {
    return entry.dateEntries[0] ?? null;
  }

  combinedAssigneeId(entry: DashboardCombinedEntryDto): string | null {
    const values = new Set(
      [...entry.dateEntries, ...entry.payments].map((item) => this.assigneeId(item.assignedTo)),
    );
    if (values.size > 1) {
      return MIXED_ASSIGNEE_VALUE;
    }

    return values.values().next().value ?? null;
  }

  isMixedAssignee(entry: DashboardCombinedEntryDto): boolean {
    return this.combinedAssigneeId(entry) === MIXED_ASSIGNEE_VALUE;
  }

  eventColor(kind: CalendarEventKind): string {
    return calendarEventColor(kind);
  }

  eventIcon(kind: CalendarEventKind): string {
    return calendarEventIcon(kind);
  }

  eventLabelKey(kind: CalendarEventKind): string {
    return calendarEventKindLabelKey(kind);
  }

  paymentTitle(payment: DashboardPaymentEntryDto): string {
    return payment.recipient?.trim() || payment.purpose?.trim() || payment.documentTitle;
  }

  combinedDetailIcon(entry: DashboardCombinedEntryDto): string {
    const primaryDateEntry = this.primaryDateEntry(entry);
    return primaryDateEntry ? this.eventIcon(primaryDateEntry.kind) : 'dollar';
  }

  combinedDetailTitle(entry: DashboardCombinedEntryDto): string {
    const dateTitles = entry.dateEntries
      .map((dateEntry) => dateEntry.title.trim())
      .filter((title) => title.length > 0);
    if (dateTitles.length > 0) {
      return dateTitles.join(' / ');
    }

    return (
      entry.payments
        .map((payment) => this.paymentTitle(payment).trim())
        .find((title) => title.length > 0) ?? entry.documentTitle
    );
  }

  combinedDetailSubtext(entry: DashboardCombinedEntryDto): string {
    return entry.payments
      .map((payment) => this.paymentSubtext(payment))
      .filter((subtext) => subtext.trim().length > 0)
      .join(' / ');
  }

  paymentSubtext(payment: DashboardPaymentEntryDto): string {
    return [this.formatAmount(payment.amount, payment.currency), payment.recipient?.trim() ?? '']
      .filter((value) => value.trim().length > 0)
      .join(' / ');
  }

  completedItemIcon(item: DashboardRecentCompletedItemDto): string {
    return item.type === 'PAYMENT' ? 'dollar' : 'calendar';
  }

  completedItemTagLabelKey(item: DashboardRecentCompletedItemDto): string {
    return item.type === 'PAYMENT'
      ? 'dashboard.recentCompleted.types.payment'
      : 'dashboard.recentCompleted.types.deadline';
  }

  completedDocumentTitle(item: DashboardRecentCompletedItemDto): string {
    if (item.type === 'CALENDAR_EVENT') {
      return item.subtitle?.trim() || item.title;
    }

    return item.title;
  }

  completedDetailTitle(item: DashboardRecentCompletedItemDto): string {
    if (item.type === 'PAYMENT') {
      return item.subtitle?.trim() || item.title;
    }

    return item.title;
  }

  completedDetailSubtext(item: DashboardRecentCompletedItemDto): string {
    if (item.type !== 'PAYMENT' || item.amount === null) {
      return '';
    }

    return this.formatAmount(item.amount, item.currency);
  }

  completedByLabel(item: DashboardRecentCompletedItemDto): string {
    return item.completedBy?.displayName ?? '';
  }

  completedRelativeLabel(item: DashboardRecentCompletedItemDto): string {
    const completedAt = Date.parse(item.completedAt);
    if (!Number.isFinite(completedAt)) {
      return this.translate.instant('common.done');
    }

    const minutes = Math.floor((this.currentTimeMs() - completedAt) / MINUTE_IN_MS);
    if (minutes <= 0) {
      return this.translate.instant('dashboard.timeline.relative.completedJustNow');
    }

    return this.translate.instant(
      minutes === 1
        ? 'dashboard.timeline.relative.completedOneMinuteAgo'
        : 'dashboard.timeline.relative.completedManyMinutesAgo',
      { count: minutes },
    );
  }

  assigneeId(assignee: UserAssigneeDto | null | undefined): string | null {
    return assignee?.id ?? null;
  }

  assigneeLabel(assignee: UserAssigneeDto | null | undefined): string {
    return assignee?.displayName ?? this.translate.instant('dashboard.actions.unassigned');
  }

  formatAmount(amount: number | null, currency: string | null): string {
    if (amount === null) {
      return this.translate.instant('common.emptyValue');
    }

    try {
      return new Intl.NumberFormat(this.language.currentLocale(), {
        style: 'currency',
        currency: currency || 'EUR',
      }).format(amount);
    } catch {
      return `${this.formatNumber(amount)} ${currency ?? ''}`.trim();
    }
  }

  formatDate(value: string | null): string {
    if (!value) {
      return this.translate.instant('common.emptyValue');
    }

    return localizedLongDate(
      value,
      this.language.currentLocale(),
      this.translate.instant('common.emptyValue'),
    );
  }

  preventMiddleMouseNavigation(event: MouseEvent): void {
    if (event.button === 1) {
      event.preventDefault();
    }
  }

  handleDocumentAuxClick(event: MouseEvent, documentId: string, documentTitle: string): void {
    if (event.button !== 1) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    this.openDocuments.open({ id: documentId, title: documentTitle });
  }

  private loadAssignees(): void {
    if (this.tenantContext.hasNoActiveTenants()) {
      this.assignees.set([]);
      this.isAssigneesLoading.set(false);
      return;
    }

    this.isAssigneesLoading.set(true);
    this.usersApi
      .assignees()
      .pipe(finalize(() => this.isAssigneesLoading.set(false)))
      .subscribe({
        next: (response) => this.assignees.set(response.items),
        error: () => this.assignees.set([]),
      });
  }

  private runCombinedTaskUpdate(
    entry: DashboardCombinedEntryDto,
    requests: readonly Observable<unknown>[],
  ): void {
    if (requests.length === 0) {
      return;
    }

    this.runTaskUpdate(this.combinedEntryTaskKey(entry), forkJoin(requests), {
      reloadOnError: true,
    });
  }

  private runTaskUpdate(
    taskId: string,
    request: Observable<unknown>,
    options: { readonly reloadOnError?: boolean } = {},
  ): void {
    this.error.set(null);
    this.pendingTaskIds.update((ids) => {
      const next = new Set(ids);
      next.add(taskId);
      return next;
    });

    request
      .pipe(
        finalize(() => {
          this.pendingTaskIds.update((ids) => {
            const next = new Set(ids);
            next.delete(taskId);
            return next;
          });
        }),
      )
      .subscribe({
        next: () => this.load(),
        error: () => {
          this.error.set('dashboard.errors.updateFailed');
          if (options.reloadOnError) {
            this.reloadSummaryAfterTaskError();
          }
        },
      });
  }

  private dateEntryTaskKey(entry: DashboardDateEntryDto): string {
    return `date-${entry.id}`;
  }

  private paymentTaskKey(payment: DashboardPaymentEntryDto): string {
    return `payment-${payment.id}`;
  }

  private combinedEntryTaskKey(entry: DashboardCombinedEntryDto): string {
    return `combined-${entry.id}`;
  }

  private reloadSummaryAfterTaskError(): void {
    this.api.summary().subscribe({
      next: (summary) => this.summary.set(summary),
      error: () => undefined,
    });
  }

  private daysUntil(value: string | null): number | null {
    const date = this.parseLocalDate(value);
    if (!date) {
      return null;
    }

    const todayStart = this.dashboardTodayStart();
    return Math.round((date.getTime() - todayStart.getTime()) / DAY_IN_MS);
  }

  private isExpiredAppointment(entry: DashboardDateEntryDto, todayStart: Date): boolean {
    if (entry.kind !== 'APPOINTMENT') {
      return false;
    }

    const date = this.parseLocalDate(entry.date);
    return date !== null && date.getTime() < todayStart.getTime();
  }

  private dashboardTodayStart(): Date {
    const generatedAt = this.summary()?.generatedAt;
    const generatedAtDate = generatedAt ? new Date(generatedAt) : null;
    const today =
      generatedAtDate && !Number.isNaN(generatedAtDate.getTime())
        ? generatedAtDate
        : new Date(this.currentTimeMs());
    return new Date(today.getFullYear(), today.getMonth(), today.getDate());
  }

  private parseLocalDate(value: string | null): Date | null {
    if (!value) {
      return null;
    }

    const date = new Date(`${value.slice(0, 10)}T00:00:00`);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  private formatNumber(value: number): string {
    return new Intl.NumberFormat(this.language.currentLocale()).format(value);
  }

  private rememberCompletedCombinedEntry(entry: DashboardCombinedEntryDto): void {
    this.completedEntryContexts.update((contexts) => {
      const next = new Map(contexts);
      for (const dateEntry of entry.dateEntries.filter((item) => this.canCompleteDateEntry(item))) {
        next.set(this.recentCompletedDateEntryId(dateEntry), this.dateEntryContext(dateEntry));
      }
      for (const payment of entry.payments) {
        next.set(this.recentCompletedPaymentId(payment), this.paymentContext(payment));
      }
      return next;
    });
  }

  private rememberCompletedDateEntry(entry: DashboardDateEntryDto): void {
    this.completedEntryContexts.update((contexts) => {
      const next = new Map(contexts);
      next.set(this.recentCompletedDateEntryId(entry), this.dateEntryContext(entry));
      return next;
    });
  }

  private rememberCompletedPayment(payment: DashboardPaymentEntryDto): void {
    this.completedEntryContexts.update((contexts) => {
      const next = new Map(contexts);
      next.set(this.recentCompletedPaymentId(payment), this.paymentContext(payment));
      return next;
    });
  }

  private dateEntryContext(entry: DashboardDateEntryDto): CompletedEntryContext {
    return {
      dueDate: entry.date,
      dueTime: entry.time,
    };
  }

  private paymentContext(payment: DashboardPaymentEntryDto): CompletedEntryContext {
    return {
      dueDate: payment.dueDate,
      dueTime: null,
    };
  }

  private recentCompletedDateEntryId(entry: DashboardDateEntryDto): string {
    return `event-${entry.id}`;
  }

  private recentCompletedPaymentId(payment: DashboardPaymentEntryDto): string {
    return `payment-${payment.id}`;
  }

  private isRecentCompletedVisible(item: DashboardRecentCompletedItemDto, now: number): boolean {
    const completedAt = Date.parse(item.completedAt);
    return Number.isFinite(completedAt) && now - completedAt < RECENT_COMPLETED_VISIBLE_MS;
  }

  private acceptedDocumentCount(facts: DashboardSummaryDto['facts']): number {
    return Math.max(facts.documents - facts.inbox.total, 0);
  }

  private documentChangeKey(
    event: ReturnType<RealtimeClientService['latestDocumentChange']>,
  ): string | null {
    return event
      ? [event.documentId, event.reason, event.jobId ?? '', event.changedAt].join('|')
      : null;
  }

  private aiProviderChangeKey(
    event: ReturnType<RealtimeClientService['latestAiProviderChange']>,
  ): string | null {
    return event ? [event.providerId, event.action, event.changedAt].join('|') : null;
  }
}
