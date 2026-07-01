import {
  expectObjectContaining,
  mockArg,
  mockCalls,
} from '../testing/expect-matchers';
import { DashboardService } from './dashboard.service';

type StatusFilter = 'READY' | 'FAILED' | 'PAID' | { not: 'ARCHIVED' };

interface DashboardWhereInput {
  acceptedAt?: null | { not: null };
  aiProcessedAt?: { not: null };
  calendarEvents?: unknown;
  completedAt?: { gte?: Date };
  createdAt?: unknown;
  date?: { gte?: Date; lt?: Date };
  document?: unknown;
  id?: { in: string[] };
  kind?: { in: string[] };
  status?: StatusFilter;
}

interface DashboardQueryInput {
  where: DashboardWhereInput;
}

function hasArchivedExclusion(status: StatusFilter | undefined): boolean {
  return (
    typeof status === 'object' && status !== null && status.not === 'ARCHIVED'
  );
}

const tenant = {
  id: '018f1a44-9093-7f55-a515-278f4d9bd900',
  key: 'default',
  name: 'Default',
  scannerImportPath: null,
  isActive: true,
  createdAt: new Date('2026-05-01T00:00:00.000Z'),
  updatedAt: new Date('2026-05-01T00:00:00.000Z'),
};
const assignee = {
  id: '018f1a44-9093-7f55-a515-278f4d9bd904',
  username: 'assignee',
  displayName: 'Assigned User',
};
const document = {
  id: '018f1a44-9093-7f55-a515-278f4d9bd901',
  title: 'Invoice',
  originalFileName: 'invoice.pdf',
  source: 'UPLOAD',
  status: 'READY',
  createdAt: new Date('2026-05-27T09:00:00.000Z'),
  updatedAt: new Date('2026-05-27T09:00:00.000Z'),
  acceptedAt: null,
  documentDate: null,
  sender: 'Sender GmbH',
  tenant,
};
const dueDateEvent = {
  id: '018f1a44-9093-7f55-a515-278f4d9bd902',
  paymentId: '018f1a44-9093-7f55-a515-278f4d9bd903',
  kind: 'DUE_DATE',
  title: 'Payment due',
  date: new Date('2026-05-29T00:00:00.000Z'),
  time: null,
  assignedTo: assignee,
  document,
};
const appointmentEvent = {
  id: '018f1a44-9093-7f55-a515-278f4d9bd905',
  kind: 'APPOINTMENT',
  title: 'Past appointment',
  date: new Date('2026-05-20T00:00:00.000Z'),
  time: '09:00',
  assignedTo: assignee,
  document,
};
const deadlineEvent = {
  id: '018f1a44-9093-7f55-a515-278f4d9bd906',
  kind: 'DEADLINE',
  title: 'Reply deadline',
  date: new Date('2026-05-30T00:00:00.000Z'),
  time: null,
  assignedTo: null,
  document,
};
const payment = {
  id: '018f1a44-9093-7f55-a515-278f4d9bd903',
  recipient: 'Sender GmbH',
  purpose: 'R-100',
  amount: 120.5,
  currency: 'EUR',
  createdAt: new Date('2026-05-27T09:00:00.000Z'),
  assignedTo: assignee,
  calendarEvents: [dueDateEvent],
  document: {
    ...document,
  },
};

describe('DashboardService', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-27T10:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('builds tenant-wide dashboard buckets, inbox overview, and AI worker counts', async () => {
    const rawRows = [[{ count: 1 }], [{ count: 4 }], [{ id: document.id }]];
    const prisma = {
      $queryRaw: jest
        .fn()
        .mockImplementation(() => Promise.resolve(rawRows.shift() ?? [])),
      document: {
        count: jest.fn().mockImplementation((input: DashboardQueryInput) => {
          const where = input.where;
          if (where.acceptedAt === null && hasArchivedExclusion(where.status)) {
            return Promise.resolve(3);
          }
          if (hasArchivedExclusion(where.status)) {
            return Promise.resolve(9);
          }
          if (where.acceptedAt === null && where.status === 'READY') {
            return Promise.resolve(2);
          }
          if (where.status === 'FAILED') {
            return Promise.resolve(1);
          }
          return Promise.resolve(0);
        }),
        findMany: jest.fn().mockImplementation((input: DashboardQueryInput) => {
          const where = input.where;
          if (where.acceptedAt === null && where.status === 'READY') {
            return Promise.resolve([document]);
          }
          if (where.status === 'FAILED') {
            return Promise.resolve([{ ...document, status: 'FAILED' }]);
          }
          if (where.id?.in) {
            return Promise.resolve([document]);
          }
          if (where.createdAt) {
            return Promise.resolve([document]);
          }
          return Promise.resolve([]);
        }),
      },
      documentCalendarEvent: {
        count: jest.fn().mockImplementation((input: DashboardQueryInput) => {
          if (!input.where.date) {
            return Promise.resolve(3);
          }
          return Promise.resolve(input.where.date?.gte ? 5 : 1);
        }),
        findMany: jest.fn().mockImplementation((input: DashboardQueryInput) => {
          const where = input.where;
          if (where.completedAt?.gte) {
            return Promise.resolve([]);
          }
          if (where.date?.lt && !where.kind) {
            return Promise.resolve([
              appointmentEvent,
              dueDateEvent,
              deadlineEvent,
            ]);
          }
          if (where.kind?.in) {
            return Promise.resolve([dueDateEvent]);
          }
          return Promise.resolve([]);
        }),
      },
      documentPayment: {
        count: jest.fn().mockResolvedValue(1),
        groupBy: jest
          .fn()
          .mockResolvedValue([{ currency: 'EUR', _sum: { amount: 120.5 } }]),
        findMany: jest.fn().mockImplementation((input: DashboardQueryInput) => {
          const where = input.where;
          if (where.status === 'PAID') {
            return Promise.resolve([]);
          }
          if (where.calendarEvents) {
            return Promise.resolve([payment]);
          }
          return Promise.resolve([payment]);
        }),
      },
      aiProvider: {
        findMany: jest.fn().mockResolvedValue([
          { status: 'AVAILABLE', selectedModel: null },
          { status: 'UNAVAILABLE', selectedModel: 'model-a' },
        ]),
      },
      user: {
        count: jest.fn().mockResolvedValue(4),
      },
      emailMessage: {
        count: jest.fn().mockResolvedValueOnce(3).mockResolvedValueOnce(2),
      },
      emailMailbox: {
        count: jest.fn().mockResolvedValue(1),
      },
    };
    const settings = {
      getSettings: jest.fn().mockResolvedValue({
        ocrReprocessExistingTextLayer: false,
        pdfRemoveBlankPages: false,
        documentsRequireAiMetadataBeforeAcceptance: true,
        extractionMode: 'fast',
        aiMetadataLanguage: 'DOCUMENT_LANGUAGE',
      }),
    };
    const service = new DashboardService(prisma as never, settings as never);

    const summary = await service.summary([tenant.id], {
      includeAdminData: false,
      includeTenantBreakdown: false,
    });

    expect(summary.inboxOverview).toEqual({ ready: 2, open: 1, total: 3 });
    expect(summary.aiWorkers).toEqual({ connected: 1, total: 2 });
    expect(summary.dateEntries.overdue).toEqual([
      expectObjectContaining({
        id: appointmentEvent.id,
        kind: 'APPOINTMENT',
        isOverdue: true,
        assignedTo: expectObjectContaining({ id: assignee.id }),
      }),
    ]);
    expect(summary.dateEntries.upcoming).toEqual([
      expectObjectContaining({
        id: dueDateEvent.id,
        paymentId: payment.id,
        kind: 'DUE_DATE',
        date: '2026-05-29',
        isOverdue: false,
      }),
      expectObjectContaining({
        id: deadlineEvent.id,
        kind: 'DEADLINE',
        date: '2026-05-30',
        isOverdue: false,
      }),
    ]);
    expect(summary.payments.upcoming).toEqual([
      expectObjectContaining({
        id: payment.id,
        calendarEventId: dueDateEvent.id,
        dueDate: '2026-05-29',
        amount: 120.5,
        assignedTo: expectObjectContaining({ id: assignee.id }),
      }),
    ]);
    expect(summary.combinedEntries).toEqual([
      expectObjectContaining({
        id: `combined-${document.id}-2026-05-20`,
        date: '2026-05-20',
        dateEntries: [
          expectObjectContaining({
            id: appointmentEvent.id,
            kind: 'APPOINTMENT',
          }),
        ],
        payments: [],
      }),
      expectObjectContaining({
        id: `combined-${document.id}-2026-05-29`,
        date: '2026-05-29',
        dateEntries: [],
        payments: [
          expectObjectContaining({
            id: payment.id,
            calendarEventId: dueDateEvent.id,
            dueDate: '2026-05-29',
          }),
        ],
      }),
      expectObjectContaining({
        id: `combined-${document.id}-2026-05-30`,
        date: '2026-05-30',
        dateEntries: [
          expectObjectContaining({
            id: deadlineEvent.id,
            kind: 'DEADLINE',
          }),
        ],
        payments: [],
      }),
    ]);
    expect(summary.facts).toEqual({
      documents: 9,
      users: 4,
      openPayments: 1,
      openDateEntries: 3,
      inbox: { ready: 2, open: 1, total: 3 },
      emails: { accounts: 1, processed: 2, open: 1, total: 3 },
      aiWorkers: { connected: 1, total: 2 },
    });
    expect(summary.kpis).toEqual(
      expectObjectContaining({
        inboxTotal: 3,
        inboxReady: 2,
        dueThisWeek: 5,
        overdue: 1,
        openPaymentCount: 1,
        failedProcessing: 1,
        failedOcr: 1,
        missingMetadata: 4,
      }),
    );
    expect(summary.processingHealth).toBeNull();
    expect(prisma.document.count).toHaveBeenNthCalledWith(
      2,
      expectObjectContaining({
        where: expectObjectContaining({
          aiProcessedAt: { not: null },
        }),
      }),
    );
    expect(
      mockCalls<readonly [DashboardQueryInput]>(
        prisma.documentCalendarEvent.findMany,
      ).some(([input]) => JSON.stringify(input.where).includes('assignedToId')),
    ).toBe(false);
    expect(
      mockCalls<readonly [DashboardQueryInput]>(
        prisma.documentPayment.findMany,
      ).some(([input]) => JSON.stringify(input.where).includes('assignedToId')),
    ).toBe(false);
    const calendarDocumentFilters = [
      ...mockCalls<readonly [DashboardQueryInput]>(
        prisma.documentCalendarEvent.count,
      ),
      ...mockCalls<readonly [DashboardQueryInput]>(
        prisma.documentCalendarEvent.findMany,
      ),
    ]
      .map(([input]) => input.where.document)
      .filter(Boolean);
    expect(calendarDocumentFilters.length).toBeGreaterThan(0);
    for (const documentFilter of calendarDocumentFilters) {
      expect(documentFilter).toEqual(
        expectObjectContaining({
          acceptedAt: { not: null },
          status: { not: 'ARCHIVED' },
        }),
      );
    }
    const paymentDocumentFilters = [
      ...mockCalls<readonly [DashboardQueryInput]>(
        prisma.documentPayment.count,
      ),
      ...mockCalls<readonly [DashboardQueryInput]>(
        prisma.documentPayment.groupBy,
      ),
      ...mockCalls<readonly [DashboardQueryInput]>(
        prisma.documentPayment.findMany,
      ),
    ]
      .map(([input]) => input.where.document)
      .filter(Boolean);
    expect(paymentDocumentFilters.length).toBeGreaterThan(0);
    for (const documentFilter of paymentDocumentFilters) {
      expect(documentFilter).toEqual(
        expectObjectContaining({
          acceptedAt: { not: null },
          status: { not: 'ARCHIVED' },
        }),
      );
    }
  });

  it('filters tenant breakdown payment and due-date raw counts to accepted documents', async () => {
    const prisma = {
      tenant: {
        findMany: jest.fn().mockResolvedValue([tenant]),
      },
      $queryRaw: jest.fn().mockResolvedValue([
        {
          tenantId: tenant.id,
          inboxTotal: 3,
          failedProcessing: 1,
          openPaymentCount: 1,
          dueThisWeek: 2,
        },
      ]),
    };
    const service = new DashboardService(prisma as never, {} as never);

    const dashboardInternals = service as unknown as {
      tenantBreakdown(tenantIds: readonly string[]): Promise<unknown>;
    };
    await dashboardInternals.tenantBreakdown([tenant.id]);

    const sql = String(mockArg<{ sql?: string }>(prisma.$queryRaw)?.sql ?? '');
    expect(sql).toContain('WHERE p."status" = ');
    expect(sql).toContain('AND d."acceptedAt" IS NOT NULL');
    expect(sql).toContain('AND ce."completedAt" IS NULL');
  });
});
