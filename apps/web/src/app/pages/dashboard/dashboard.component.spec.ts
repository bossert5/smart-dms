import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import {
  ApiOutline,
  CalendarOutline,
  CheckCircleOutline,
  DashboardOutline,
  DollarOutline,
  DownOutline,
  FileTextOutline,
  FireOutline,
  InboxOutline,
  MailOutline,
  TeamOutline,
} from '@ant-design/icons-angular/icons';
import type { DashboardSummaryDto, UserAssigneeDto } from '@smart-dms/shared-dto';
import { provideNzIcons } from 'ng-zorro-antd/icon';
import { of } from 'rxjs';
import { DashboardApiService } from '../../core/api/dashboard-api.service';
import { DocumentApiService } from '../../core/api/document-api.service';
import { UserApiService } from '../../core/api/user-api.service';
import { LanguageService } from '../../core/i18n/language.service';
import { AuthService } from '../../core/services/auth.service';
import { RealtimeClientService } from '../../core/services/realtime-client.service';
import { TenantContextService } from '../../core/services/tenant-context.service';
import { provideI18nTesting } from '../../testing/i18n-testing';
import { DashboardComponent } from './dashboard.component';

const tenant = {
  id: '018f1a44-9093-7f55-a515-278f4d9bd900',
  key: 'default',
  name: 'Default',
  isActive: true,
};
const assignee: UserAssigneeDto = {
  id: '018f1a44-9093-7f55-a515-278f4d9bd904',
  username: 'assignee',
  displayName: 'Assigned User',
};
const documentId = '018f1a44-9093-7f55-a515-278f4d9bd901';
const paymentId = '018f1a44-9093-7f55-a515-278f4d9bd903';
const appointmentId = '018f1a44-9093-7f55-a515-278f4d9bd905';
const todayAppointmentId = '018f1a44-9093-7f55-a515-278f4d9bd906';
const dueDateId = '018f1a44-9093-7f55-a515-278f4d9bd902';

const summary: DashboardSummaryDto = {
  generatedAt: '2026-05-27T10:00:00.000Z',
  kpis: {
    inboxTotal: 3,
    inboxReady: 2,
    dueThisWeek: 1,
    overdue: 1,
    openPaymentCount: 1,
    openPaymentTotals: [{ currency: 'EUR', amount: 120.5 }],
    failedProcessing: 0,
    failedOcr: 0,
    missingMetadata: 0,
  },
  dateEntries: {
    overdue: [
      {
        id: appointmentId,
        tenant,
        documentId,
        documentTitle: 'Invoice',
        documentSender: 'Sender GmbH',
        kind: 'APPOINTMENT',
        title: 'Past appointment',
        date: '2026-05-20',
        time: '09:00',
        isOverdue: true,
        assignedTo: assignee,
      },
    ],
    upcoming: [
      {
        id: dueDateId,
        tenant,
        documentId,
        documentTitle: 'Invoice',
        documentSender: 'Sender GmbH',
        kind: 'DUE_DATE',
        title: 'Payment due',
        date: '2026-05-29',
        time: null,
        isOverdue: false,
        assignedTo: null,
      },
    ],
  },
  payments: {
    overdue: [],
    upcoming: [
      {
        id: paymentId,
        tenant,
        documentId,
        documentTitle: 'Invoice',
        documentSender: 'Sender GmbH',
        recipient: 'Sender GmbH',
        purpose: 'R-100',
        dueDate: '2026-05-29',
        amount: 120.5,
        currency: 'EUR',
        isOverdue: false,
        assignedTo: null,
      },
    ],
  },
  combinedEntries: [
    {
      id: `combined-${documentId}-2026-05-20`,
      tenant,
      documentId,
      documentTitle: 'Invoice',
      documentSender: 'Sender GmbH',
      date: '2026-05-20',
      isOverdue: true,
      dateEntries: [
        {
          id: appointmentId,
          tenant,
          documentId,
          documentTitle: 'Invoice',
          documentSender: 'Sender GmbH',
          kind: 'APPOINTMENT',
          title: 'Past appointment',
          date: '2026-05-20',
          time: '09:00',
          isOverdue: true,
          assignedTo: assignee,
        },
      ],
      payments: [],
    },
    {
      id: `combined-${documentId}-2026-05-29`,
      tenant,
      documentId,
      documentTitle: 'Invoice',
      documentSender: 'Sender GmbH',
      date: '2026-05-29',
      isOverdue: false,
      dateEntries: [
        {
          id: dueDateId,
          tenant,
          documentId,
          documentTitle: 'Invoice',
          documentSender: 'Sender GmbH',
          kind: 'DUE_DATE',
          title: 'Payment due',
          date: '2026-05-29',
          time: null,
          isOverdue: false,
          assignedTo: null,
        },
      ],
      payments: [
        {
          id: paymentId,
          tenant,
          documentId,
          documentTitle: 'Invoice',
          documentSender: 'Sender GmbH',
          recipient: 'Sender GmbH',
          purpose: 'R-100',
          dueDate: '2026-05-29',
          amount: 120.5,
          currency: 'EUR',
          isOverdue: false,
          assignedTo: null,
        },
      ],
    },
  ],
  inboxOverview: {
    ready: 2,
    open: 1,
    total: 3,
  },
  aiWorkers: {
    connected: 1,
    total: 2,
  },
  facts: {
    documents: 8,
    users: 3,
    openPayments: 1,
    openDateEntries: 2,
    inbox: {
      ready: 2,
      open: 1,
      total: 3,
    },
    emails: {
      accounts: 1,
      processed: 1,
      open: 1,
      total: 2,
    },
    aiWorkers: {
      connected: 1,
      total: 2,
    },
  },
  actionItems: [],
  upcomingEvents: [],
  recentCompleted: [],
  recentDocuments: [],
  processingHealth: null,
};

function realtimeMock(isConnected = true) {
  return {
    isConnected: signal(isConnected),
    connectionRevision: signal(0),
    latestDocumentChange: signal(null),
    latestAiProviderChange: signal(null),
  };
}

function tenantContextMock(hasNoActiveTenants = false) {
  return {
    activeScope: () => 'all',
    hasNoActiveTenants: () => hasNoActiveTenants,
  };
}

describe('DashboardComponent', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('renders the redesigned dashboard and wires task actions to document task endpoints', async () => {
    const api = { summary: vi.fn().mockReturnValue(of(summary)) };
    const documentsApi = {
      updatePaymentTask: vi.fn().mockReturnValue(of({})),
      updateCalendarEventTask: vi.fn().mockReturnValue(of({})),
    };
    const usersApi = {
      assignees: vi.fn().mockReturnValue(of({ items: [assignee] })),
    };

    await TestBed.configureTestingModule({
      imports: [DashboardComponent],
      providers: [
        provideRouter([]),
        provideI18nTesting(),
        provideNzIcons([
          ApiOutline,
          CalendarOutline,
          CheckCircleOutline,
          DashboardOutline,
          DollarOutline,
          DownOutline,
          FileTextOutline,
          FireOutline,
          InboxOutline,
          MailOutline,
          TeamOutline,
        ]),
        { provide: DashboardApiService, useValue: api },
        { provide: DocumentApiService, useValue: documentsApi },
        { provide: UserApiService, useValue: usersApi },
        {
          provide: AuthService,
          useValue: { canEditDocuments: () => true, isAdmin: () => false },
        },
        { provide: RealtimeClientService, useValue: realtimeMock() },
        { provide: TenantContextService, useValue: tenantContextMock() },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(DashboardComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const component = fixture.componentInstance;
    const text = fixture.nativeElement.textContent;

    expect(api.summary).toHaveBeenCalledTimes(1);
    expect(usersApi.assignees).toHaveBeenCalledTimes(1);
    expect(text).not.toContain('Chronologie');
    expect(text).not.toContain('Kombiniert');
    expect(text).toContain('Documents');
    expect(text).toContain('User');
    expect(text).toContain('Emails');
    expect(text).toContain('Date entries');
    expect(text).toContain('Payments');
    expect(text).toContain('Inbox');
    expect(text).toContain('AI workers');
    expect(text).not.toContain('Past appointment');
    expect(text).toContain('Payment due');
    expect(text).toContain('Sender GmbH');
    expect(text).not.toContain('Dashboard');
    expect(text).not.toContain('Refresh');
    expect(text).not.toContain('System health');
    expect(text).not.toContain('Default');
    expect(text).not.toContain('All');
    expect(text).toContain('€120.50');
    expect(text).toContain('Sender GmbH');
    expect(text).not.toContain('overdue for 7 days');
    expect(text).toContain('in 2 days');
    expect(fixture.nativeElement.querySelector('.dashboard-panel')).toBeNull();
    expect(fixture.nativeElement.querySelector('.overview-grid')).toBeNull();
    expect(fixture.nativeElement.querySelector('.overview-sidebar')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.timeline-table')).toBeNull();
    const cards = Array.from(
      fixture.nativeElement.querySelectorAll('.timeline-grid .timeline-card'),
    ) as HTMLElement[];
    expect(cards).toHaveLength(1);
    expect(cards[0].classList).not.toContain('timeline-card--overdue');
    expect(fixture.nativeElement.querySelector('.timeline-document .timeline-date')).toBeNull();
    const firstCardDate = cards[0].querySelector<HTMLElement>('.timeline-date');
    expect(firstCardDate?.querySelector('.timeline-date__line')).not.toBeNull();
    expect(firstCardDate?.querySelector('.timeline-date__times')).toBeNull();
    expect(firstCardDate?.querySelector('.timeline-status')).toBeNull();
    const firstCardTags = cards[0].querySelector<HTMLElement>(
      '.timeline-card__headline > .timeline-tags',
    );
    expect(firstCardTags).not.toBeNull();
    expect(firstCardTags?.firstElementChild?.classList).toContain('timeline-status');
    expect(firstCardTags?.firstElementChild?.textContent).toContain('in 2 days');
    const firstCardBody = cards[0].querySelector<HTMLElement>('.timeline-card__body');
    expect(firstCardBody?.children[0]?.classList).toContain('timeline-details');
    expect(firstCardBody?.children[1]?.classList).toContain('timeline-document');
    const combinedRowDetails = Array.from(
      cards[0].querySelectorAll('.timeline-details .timeline-detail'),
    ) as HTMLElement[];
    expect(combinedRowDetails).toHaveLength(1);
    expect(combinedRowDetails[0].textContent).toContain('Payment due');
    expect(combinedRowDetails[0].textContent).toContain('€120.50');
    expect(cards[0].querySelector('.timeline-card__footer .assignee-select')).not.toBeNull();
    expect(fixture.nativeElement.querySelectorAll('.timeline-done-button')).toHaveLength(1);
    expect(fixture.nativeElement.querySelector('.timeline-done-button')?.textContent).toContain(
      'Mark as done',
    );
    const widgetLabels = Array.from(
      fixture.nativeElement.querySelectorAll('.overview-sidebar .overview-tile__body > span'),
      (element) => (element as HTMLElement).textContent?.trim(),
    );
    expect(widgetLabels).toEqual([
      'Documents',
      'Inbox',
      'Emails',
      'Payments',
      'Date entries',
      'Users',
      'AI workers',
    ]);
    const widgetValues = Array.from(
      fixture.nativeElement.querySelectorAll('.overview-sidebar .overview-tile__body > strong'),
      (element) => (element as HTMLElement).textContent?.trim(),
    );
    expect(widgetValues[0]).toBe('5');
    expect(widgetValues[1]).toBe('3');
    expect(
      fixture.nativeElement.querySelector(
        `[aria-label="Mark date entry Past appointment as done"]`,
      ),
    ).toBeNull();
    expect(
      fixture.nativeElement.querySelector(`[aria-label="Assign date entry Payment due"]`),
    ).toBeNull();
    expect(
      fixture.nativeElement.querySelector(`[aria-label="Mark date entry Payment due as done"]`),
    ).toBeNull();
    expect(
      fixture.nativeElement.querySelector(`[aria-label="Assign entry Invoice"]`),
    ).not.toBeNull();
    expect(
      fixture.nativeElement.querySelector(`[aria-label="Mark entry Invoice as done"]`),
    ).not.toBeNull();

    component.assignPayment(summary.payments.upcoming[0], assignee.id);
    expect(documentsApi.updatePaymentTask).toHaveBeenCalledWith(documentId, paymentId, {
      assignedToId: assignee.id,
    });

    component.markPaymentDone(summary.payments.upcoming[0]);
    expect(documentsApi.updatePaymentTask).toHaveBeenCalledWith(documentId, paymentId, {
      completed: true,
    });

    component.assignDateEntry(summary.dateEntries.upcoming[0], assignee.id);
    expect(documentsApi.updateCalendarEventTask).toHaveBeenCalledWith(documentId, dueDateId, {
      assignedToId: assignee.id,
    });

    component.markDateEntryDone(summary.dateEntries.upcoming[0]);
    expect(documentsApi.updateCalendarEventTask).toHaveBeenCalledWith(documentId, dueDateId, {
      completed: true,
    });

    documentsApi.updateCalendarEventTask.mockClear();
    component.markDateEntryDone(summary.dateEntries.overdue[0]);
    expect(documentsApi.updateCalendarEventTask).not.toHaveBeenCalled();

    documentsApi.updatePaymentTask.mockClear();
    documentsApi.updateCalendarEventTask.mockClear();
    component.assignCombinedEntry(summary.combinedEntries[1], assignee.id);
    expect(documentsApi.updatePaymentTask).toHaveBeenCalledWith(documentId, paymentId, {
      assignedToId: assignee.id,
    });
    expect(documentsApi.updateCalendarEventTask).toHaveBeenCalledWith(documentId, dueDateId, {
      assignedToId: assignee.id,
    });

    documentsApi.updatePaymentTask.mockClear();
    documentsApi.updateCalendarEventTask.mockClear();
    component.markCombinedEntryDone(summary.combinedEntries[1]);
    expect(documentsApi.updatePaymentTask).toHaveBeenCalledWith(documentId, paymentId, {
      completed: true,
    });
    expect(documentsApi.updateCalendarEventTask).toHaveBeenCalledWith(documentId, dueDateId, {
      completed: true,
    });

    documentsApi.updatePaymentTask.mockClear();
    documentsApi.updateCalendarEventTask.mockClear();
    component.markCombinedEntryDone({
      ...summary.combinedEntries[0],
      payments: [summary.payments.upcoming[0]],
    });
    expect(documentsApi.updatePaymentTask).toHaveBeenCalledWith(documentId, paymentId, {
      completed: true,
    });
    expect(documentsApi.updateCalendarEventTask).not.toHaveBeenCalled();
    await settleTimers();
    fixture.destroy();
    await settleTimers();
  });

  it('formats dashboard dates with long German month names', async () => {
    const api = { summary: vi.fn().mockReturnValue(of(summary)) };
    const documentsApi = {
      updatePaymentTask: vi.fn().mockReturnValue(of({})),
      updateCalendarEventTask: vi.fn().mockReturnValue(of({})),
    };

    await TestBed.configureTestingModule({
      imports: [DashboardComponent],
      providers: [
        provideRouter([]),
        provideI18nTesting(),
        provideNzIcons([
          ApiOutline,
          CalendarOutline,
          CheckCircleOutline,
          DashboardOutline,
          DollarOutline,
          DownOutline,
          FileTextOutline,
          FireOutline,
          InboxOutline,
          MailOutline,
          TeamOutline,
        ]),
        { provide: DashboardApiService, useValue: api },
        { provide: DocumentApiService, useValue: documentsApi },
        { provide: LanguageService, useValue: { currentLocale: signal('de-DE') } },
        {
          provide: UserApiService,
          useValue: { assignees: vi.fn().mockReturnValue(of({ items: [assignee] })) },
        },
        {
          provide: AuthService,
          useValue: { canEditDocuments: () => true, isAdmin: () => false },
        },
        { provide: RealtimeClientService, useValue: realtimeMock() },
        { provide: TenantContextService, useValue: tenantContextMock() },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(DashboardComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent;
    expect(text).toContain('29. Mai 2026');
    expect(text).not.toContain('29.05.2026');
    fixture.destroy();
    await settleTimers();
  });

  it('keeps current-day appointments without time visible while hiding earlier appointments', async () => {
    const todayAppointment = {
      ...summary.dateEntries.overdue[0],
      id: todayAppointmentId,
      title: 'Today appointment',
      date: '2026-05-27',
      time: null,
      isOverdue: false,
      assignedTo: null,
    };
    const summaryWithTodayAppointment: DashboardSummaryDto = {
      ...summary,
      dateEntries: {
        ...summary.dateEntries,
        upcoming: [todayAppointment, ...summary.dateEntries.upcoming],
      },
      combinedEntries: [
        summary.combinedEntries[0],
        {
          ...summary.combinedEntries[0],
          id: `combined-${documentId}-2026-05-27`,
          date: '2026-05-27',
          isOverdue: false,
          dateEntries: [todayAppointment],
          payments: [],
        },
        summary.combinedEntries[1],
      ],
    };
    const api = { summary: vi.fn().mockReturnValue(of(summaryWithTodayAppointment)) };

    await TestBed.configureTestingModule({
      imports: [DashboardComponent],
      providers: [
        provideRouter([]),
        provideI18nTesting(),
        provideNzIcons([
          ApiOutline,
          CalendarOutline,
          CheckCircleOutline,
          DashboardOutline,
          DollarOutline,
          DownOutline,
          FileTextOutline,
          FireOutline,
          InboxOutline,
          MailOutline,
          TeamOutline,
        ]),
        { provide: DashboardApiService, useValue: api },
        {
          provide: DocumentApiService,
          useValue: { updatePaymentTask: vi.fn(), updateCalendarEventTask: vi.fn() },
        },
        {
          provide: UserApiService,
          useValue: { assignees: vi.fn().mockReturnValue(of({ items: [] })) },
        },
        {
          provide: AuthService,
          useValue: { canEditDocuments: () => true, isAdmin: () => false },
        },
        { provide: RealtimeClientService, useValue: realtimeMock() },
        { provide: TenantContextService, useValue: tenantContextMock() },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(DashboardComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent;
    expect(text).not.toContain('Past appointment');
    expect(text).toContain('Today appointment');
    expect(text).toContain('Payment due');
    const cards = Array.from(
      fixture.nativeElement.querySelectorAll('.timeline-grid .timeline-card'),
    ) as HTMLElement[];
    expect(cards).toHaveLength(2);
    const todayCard = cards.find((card) => card.textContent?.includes('Today appointment'));
    expect(todayCard).toBeDefined();
    expect(todayCard?.textContent).toContain('May 27, 2026');
    expect(todayCard?.querySelector('.timeline-date__times')).toBeNull();
    expect(todayCard?.querySelector('.timeline-done-button')).toBeNull();
    expect(todayCard?.querySelector('.timeline-done-button-placeholder')).not.toBeNull();
    await settleTimers();
    fixture.destroy();
    await settleTimers();
  });

  it('does not request dashboard data or show a load error without active tenants', async () => {
    const api = { summary: vi.fn().mockReturnValue(of(summary)) };
    const usersApi = {
      assignees: vi.fn().mockReturnValue(of({ items: [assignee] })),
    };

    await TestBed.configureTestingModule({
      imports: [DashboardComponent],
      providers: [
        provideRouter([]),
        provideI18nTesting(),
        provideNzIcons([
          ApiOutline,
          CalendarOutline,
          CheckCircleOutline,
          DashboardOutline,
          DollarOutline,
          DownOutline,
          FileTextOutline,
          FireOutline,
          InboxOutline,
          MailOutline,
          TeamOutline,
        ]),
        { provide: DashboardApiService, useValue: api },
        {
          provide: DocumentApiService,
          useValue: { updatePaymentTask: vi.fn(), updateCalendarEventTask: vi.fn() },
        },
        { provide: UserApiService, useValue: usersApi },
        {
          provide: AuthService,
          useValue: { canEditDocuments: () => true, isAdmin: () => false },
        },
        { provide: RealtimeClientService, useValue: realtimeMock() },
        { provide: TenantContextService, useValue: tenantContextMock(true) },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(DashboardComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(api.summary).not.toHaveBeenCalled();
    expect(usersApi.assignees).not.toHaveBeenCalled();
    expect(fixture.componentInstance.summary()).toBeNull();
    expect(fixture.componentInstance.error()).toBeNull();
    expect(fixture.nativeElement.querySelector('nz-alert')).toBeNull();
    await settleTimers();
    fixture.destroy();
    await settleTimers();
  });

  it('hides the email widget when no email account is configured', async () => {
    const summaryWithoutEmailAccounts: DashboardSummaryDto = {
      ...summary,
      facts: {
        ...summary.facts,
        emails: {
          ...summary.facts.emails,
          accounts: 0,
        },
      },
    };
    const api = { summary: vi.fn().mockReturnValue(of(summaryWithoutEmailAccounts)) };

    await TestBed.configureTestingModule({
      imports: [DashboardComponent],
      providers: [
        provideRouter([]),
        provideI18nTesting(),
        provideNzIcons([
          ApiOutline,
          CalendarOutline,
          CheckCircleOutline,
          DashboardOutline,
          DollarOutline,
          DownOutline,
          FileTextOutline,
          FireOutline,
          InboxOutline,
          MailOutline,
          TeamOutline,
        ]),
        { provide: DashboardApiService, useValue: api },
        {
          provide: DocumentApiService,
          useValue: { updatePaymentTask: vi.fn(), updateCalendarEventTask: vi.fn() },
        },
        {
          provide: UserApiService,
          useValue: { assignees: vi.fn().mockReturnValue(of({ items: [] })) },
        },
        {
          provide: AuthService,
          useValue: { canEditDocuments: () => true, isAdmin: () => false },
        },
        { provide: RealtimeClientService, useValue: realtimeMock() },
        { provide: TenantContextService, useValue: tenantContextMock() },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(DashboardComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const widgetLabels = Array.from(
      fixture.nativeElement.querySelectorAll('.overview-sidebar .overview-tile__body > span'),
      (element) => (element as HTMLElement).textContent?.trim(),
    );
    expect(widgetLabels).toEqual([
      'Documents',
      'Inbox',
      'Payments',
      'Date entries',
      'Users',
      'AI workers',
    ]);
    await settleTimers();
    fixture.destroy();
    await settleTimers();
  });

  it('keeps recently completed items visible in muted timeline cards for 60 minutes', async () => {
    const dateNowSpy = vi
      .spyOn(Date, 'now')
      .mockReturnValue(new Date('2026-05-27T10:45:00.000Z').getTime());
    const summaryWithRecentCompleted: DashboardSummaryDto = {
      ...summary,
      dateEntries: { overdue: [], upcoming: [] },
      payments: { overdue: [], upcoming: [] },
      combinedEntries: [],
      recentCompleted: [
        {
          id: `payment-${paymentId}`,
          type: 'PAYMENT',
          tenant,
          documentId,
          title: 'Invoice',
          subtitle: 'Sender GmbH',
          completedAt: '2026-05-27T10:00:01.000Z',
          amount: 120.5,
          currency: 'EUR',
          completedBy: assignee,
        },
        {
          id: `event-${dueDateId}`,
          type: 'CALENDAR_EVENT',
          tenant,
          documentId,
          title: 'Old deadline',
          subtitle: 'Invoice',
          completedAt: '2026-05-27T09:44:59.000Z',
          amount: null,
          currency: null,
          completedBy: null,
        },
      ],
    };
    const api = {
      summary: vi
        .fn()
        .mockReturnValueOnce(of(summary))
        .mockReturnValue(of(summaryWithRecentCompleted)),
    };
    const documentsApi = {
      updatePaymentTask: vi.fn().mockReturnValue(of({})),
      updateCalendarEventTask: vi.fn().mockReturnValue(of({})),
    };

    try {
      await TestBed.configureTestingModule({
        imports: [DashboardComponent],
        providers: [
          provideRouter([]),
          provideI18nTesting(),
          provideNzIcons([
            ApiOutline,
            CalendarOutline,
            CheckCircleOutline,
            DashboardOutline,
            DollarOutline,
            DownOutline,
            FileTextOutline,
            FireOutline,
            InboxOutline,
            MailOutline,
            TeamOutline,
          ]),
          { provide: DashboardApiService, useValue: api },
          { provide: DocumentApiService, useValue: documentsApi },
          {
            provide: UserApiService,
            useValue: { assignees: vi.fn().mockReturnValue(of({ items: [] })) },
          },
          {
            provide: AuthService,
            useValue: { canEditDocuments: () => true, isAdmin: () => false },
          },
          { provide: RealtimeClientService, useValue: realtimeMock() },
          { provide: TenantContextService, useValue: tenantContextMock() },
        ],
      }).compileComponents();

      const fixture = TestBed.createComponent(DashboardComponent);
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();

      fixture.componentInstance.markCombinedEntryDone(summary.combinedEntries[1]);
      await fixture.whenStable();
      fixture.detectChanges();

      const completedCards = fixture.nativeElement.querySelectorAll('.timeline-card--completed');
      expect(completedCards).toHaveLength(1);
      expect(completedCards[0].textContent).toContain('Invoice');
      expect(completedCards[0].querySelector('.timeline-date')?.textContent).toContain(
        'May 29, 2026',
      );
      expect(completedCards[0].textContent).toContain('Sender GmbH');
      expect(completedCards[0].textContent).toContain('€120.50');
      expect(completedCards[0].textContent).toContain('done 44 minutes ago');
      expect(completedCards[0].textContent).not.toContain('Old deadline');
      expect(
        completedCards[0].querySelector('.timeline-detail--completed strong')?.textContent,
      ).toContain('Sender GmbH');
      expect(fixture.nativeElement.querySelector('nz-empty.dashboard-empty')).toBeNull();
      await settleTimers();
      fixture.destroy();
      await settleTimers();
    } finally {
      dateNowSpy.mockRestore();
    }
  });

  it('uses the centered page empty state when no timeline entries exist', async () => {
    const emptySummary: DashboardSummaryDto = {
      ...summary,
      combinedEntries: [],
    };
    const api = { summary: vi.fn().mockReturnValue(of(emptySummary)) };

    await TestBed.configureTestingModule({
      imports: [DashboardComponent],
      providers: [
        provideRouter([]),
        provideI18nTesting(),
        provideNzIcons([
          ApiOutline,
          CalendarOutline,
          CheckCircleOutline,
          DashboardOutline,
          DollarOutline,
          DownOutline,
          FileTextOutline,
          FireOutline,
          InboxOutline,
          MailOutline,
          TeamOutline,
        ]),
        { provide: DashboardApiService, useValue: api },
        {
          provide: DocumentApiService,
          useValue: { updatePaymentTask: vi.fn(), updateCalendarEventTask: vi.fn() },
        },
        {
          provide: UserApiService,
          useValue: { assignees: vi.fn().mockReturnValue(of({ items: [] })) },
        },
        {
          provide: AuthService,
          useValue: { canEditDocuments: () => true, isAdmin: () => false },
        },
        { provide: RealtimeClientService, useValue: realtimeMock() },
        { provide: TenantContextService, useValue: tenantContextMock() },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(DashboardComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const emptyState = fixture.nativeElement.querySelector('nz-empty.dashboard-empty');
    expect(emptyState).not.toBeNull();
    expect(emptyState.classList).toContain('page-empty-state');
    expect(fixture.nativeElement.querySelector('.timeline-grid')).toBeNull();
    await settleTimers();
    fixture.destroy();
    await settleTimers();
  });

  it('polls while realtime is disconnected', async () => {
    const intervalCallbacks: Array<() => void> = [];
    const setIntervalSpy = vi
      .spyOn(globalThis, 'setInterval')
      .mockImplementation((handler: TimerHandler, timeout?: number) => {
        if (typeof handler === 'function' && timeout === 30000) {
          intervalCallbacks.push(() => handler());
        }
        return 1 as never;
      });
    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval').mockImplementation(() => {});
    const api = { summary: vi.fn().mockReturnValue(of(summary)) };

    try {
      await TestBed.configureTestingModule({
        imports: [DashboardComponent],
        providers: [
          provideRouter([]),
          provideI18nTesting(),
          provideNzIcons([
            ApiOutline,
            CalendarOutline,
            CheckCircleOutline,
            DashboardOutline,
            DollarOutline,
            DownOutline,
            FileTextOutline,
            FireOutline,
            InboxOutline,
            MailOutline,
            TeamOutline,
          ]),
          { provide: DashboardApiService, useValue: api },
          {
            provide: DocumentApiService,
            useValue: { updatePaymentTask: vi.fn(), updateCalendarEventTask: vi.fn() },
          },
          {
            provide: UserApiService,
            useValue: { assignees: vi.fn().mockReturnValue(of({ items: [] })) },
          },
          {
            provide: AuthService,
            useValue: { canEditDocuments: () => true, isAdmin: () => false },
          },
          { provide: RealtimeClientService, useValue: realtimeMock(false) },
          { provide: TenantContextService, useValue: tenantContextMock() },
        ],
      }).compileComponents();

      const fixture = TestBed.createComponent(DashboardComponent);
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(api.summary).toHaveBeenCalledTimes(1);
      expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 30000);
      expect(intervalCallbacks).toHaveLength(1);

      intervalCallbacks[0]();
      expect(api.summary).toHaveBeenCalledTimes(2);
      await settleTimers();
      fixture.destroy();
      await settleTimers();
    } finally {
      TestBed.resetTestingModule();
      setIntervalSpy.mockRestore();
      clearIntervalSpy.mockRestore();
    }
  });
});

function settleTimers(): Promise<void> {
  return new Promise((resolve) => globalThis.setTimeout(resolve, 0));
}
