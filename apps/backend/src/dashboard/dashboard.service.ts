import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  DashboardAiWorkersDto,
  CalendarEventKind,
  DashboardActionItemDto,
  DashboardCombinedEntryDto,
  DashboardDateEntryDto,
  DashboardEmailOverviewDto,
  DashboardKpisDto,
  DashboardPaymentEntryDto,
  DashboardProcessingHealthDto,
  DashboardRecentDocumentDto,
  DashboardSummaryDto,
  DashboardTenantBreakdownDto,
  DashboardUpcomingEventDto,
  DocumentStatus,
} from '@smart-dms/shared-dto';
import { toIsoDate, toIsoDateTime, parseIsoDate } from '../common/date-mapper';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { toTenantSummaryDto } from '../tenants/tenant.mapper';

const DEADLINE_KINDS: readonly CalendarEventKind[] = ['DEADLINE', 'DUE_DATE'];
const PAYMENT_DOCUMENT_TYPES = ['invoice', 'payment_reminder'] as const;
const ACTION_ITEM_LIMIT = 12;
const UPCOMING_EVENT_LIMIT = 12;
const RECENT_DOCUMENT_LIMIT = 8;
const RECENT_COMPLETED_LIMIT = 8;
const DASHBOARD_WINDOW_DAYS = 14;

interface DashboardOptions {
  readonly includeAdminData: boolean;
  readonly includeTenantBreakdown: boolean;
}

interface CountRow {
  count: number | bigint | string;
}

interface TenantBreakdownRow {
  tenantId: string;
  inboxTotal: number | bigint | string;
  failedProcessing: number | bigint | string;
  openPaymentCount: number | bigint | string;
  dueThisWeek: number | bigint | string;
}

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  async summary(
    tenantIds: readonly string[],
    options: DashboardOptions,
  ): Promise<DashboardSummaryDto> {
    const today = startOfLocalDay(new Date());
    const ranges = dashboardRanges(today);
    const systemSettings = await this.settings.getSettings();

    const [
      inboxTotal,
      inboxReady,
      dueThisWeek,
      overdue,
      openPaymentCount,
      openPaymentTotals,
      failedProcessing,
      failedOcr,
      missingMetadata,
      upcomingEvents,
      dateEntries,
      payments,
      documentCount,
      openDateEntryCount,
      userCount,
      emailOverview,
      actionItems,
      recentCompleted,
      recentDocuments,
      aiWorkers,
      processingHealth,
    ] = await Promise.all([
      this.inboxTotal(tenantIds),
      this.inboxReady(
        tenantIds,
        systemSettings.documentsRequireAiMetadataBeforeAcceptance,
      ),
      this.eventCount(tenantIds, ranges.weekStart, ranges.weekEnd),
      this.overdueCount(tenantIds, ranges.today),
      this.openPaymentCount(tenantIds),
      this.openPaymentTotals(tenantIds),
      this.failedProcessingCount(tenantIds),
      this.failedOcrCount(tenantIds),
      this.missingMetadataCount(tenantIds),
      this.upcomingEvents(tenantIds, ranges.today, ranges.weekEnd),
      this.dateEntries(tenantIds, ranges.today, ranges.windowEnd),
      this.paymentEntries(tenantIds, ranges.today, ranges.windowEnd),
      this.documentCount(tenantIds),
      this.openDateEntryCount(tenantIds),
      this.userCount(tenantIds),
      this.emailOverview(tenantIds),
      this.actionItems(
        tenantIds,
        systemSettings.documentsRequireAiMetadataBeforeAcceptance,
      ),
      this.recentCompleted(tenantIds, ranges.recentStart),
      this.recentDocuments(tenantIds, ranges.recentStart),
      this.aiWorkers(),
      options.includeAdminData
        ? this.processingHealth(tenantIds, options.includeTenantBreakdown)
        : Promise.resolve(null),
    ]);
    const inboxOverview = {
      ready: inboxReady,
      open: Math.max(inboxTotal - inboxReady, 0),
      total: inboxTotal,
    };
    const combinedEntries = this.combinedEntries(dateEntries, payments);

    return {
      generatedAt: new Date().toISOString(),
      kpis: {
        inboxTotal,
        inboxReady,
        dueThisWeek,
        overdue,
        openPaymentCount,
        openPaymentTotals,
        failedProcessing,
        failedOcr,
        missingMetadata,
      },
      dateEntries,
      payments,
      combinedEntries,
      inboxOverview,
      aiWorkers,
      facts: {
        documents: documentCount,
        users: userCount,
        openPayments: openPaymentCount,
        openDateEntries: openDateEntryCount,
        inbox: inboxOverview,
        emails: emailOverview,
        aiWorkers,
      },
      upcomingEvents,
      actionItems,
      recentCompleted,
      recentDocuments,
      processingHealth,
    };
  }

  private inboxTotal(tenantIds: readonly string[]): Promise<number> {
    return this.prisma.document.count({
      where: this.documentWhere(tenantIds, {
        acceptedAt: null,
        status: { not: 'ARCHIVED' },
      }),
    });
  }

  private inboxReady(
    tenantIds: readonly string[],
    requireAiMetadata: boolean,
  ): Promise<number> {
    return this.prisma.document.count({
      where: this.documentWhere(tenantIds, {
        acceptedAt: null,
        status: 'READY',
        ...(requireAiMetadata ? { aiProcessedAt: { not: null } } : {}),
      }),
    });
  }

  private eventCount(
    tenantIds: readonly string[],
    from: Date,
    to: Date,
  ): Promise<number> {
    return this.prisma.documentCalendarEvent.count({
      where: {
        kind: { in: [...DEADLINE_KINDS] },
        date: { gte: from, lte: to },
        completedAt: null,
        document: this.activeDocumentRelationWhere(tenantIds),
      },
    });
  }

  private overdueCount(
    tenantIds: readonly string[],
    today: Date,
  ): Promise<number> {
    return this.prisma.documentCalendarEvent.count({
      where: {
        kind: { in: [...DEADLINE_KINDS] },
        date: { lt: today },
        completedAt: null,
        document: this.activeDocumentRelationWhere(tenantIds),
      },
    });
  }

  private openPaymentCount(tenantIds: readonly string[]): Promise<number> {
    return this.prisma.documentPayment.count({
      where: this.openPaymentWhere(tenantIds),
    });
  }

  private async openPaymentTotals(
    tenantIds: readonly string[],
  ): Promise<DashboardKpisDto['openPaymentTotals']> {
    const rows = await this.prisma.documentPayment.groupBy({
      by: ['currency'],
      where: this.openPaymentWhere(tenantIds),
      _sum: { amount: true },
      orderBy: { currency: 'asc' },
    });

    return rows
      .map((row) => ({
        currency: row.currency ?? 'EUR',
        amount: Number(row._sum.amount ?? 0),
      }))
      .filter((row) => row.amount > 0);
  }

  private failedProcessingCount(tenantIds: readonly string[]): Promise<number> {
    return this.prisma.document.count({
      where: this.documentWhere(tenantIds, { status: 'FAILED' }),
    });
  }

  private async failedOcrCount(tenantIds: readonly string[]): Promise<number> {
    const rows = await this.prisma.$queryRaw<CountRow[]>(Prisma.sql`
      SELECT COUNT(*)::int AS count
      FROM "Document" d
      JOIN LATERAL (
        SELECT pj."jobType", pj."status"
        FROM "ProcessingJob" pj
        WHERE pj."documentId" = d.id
        ORDER BY pj."createdAt" DESC, pj.id DESC
        LIMIT 1
      ) latest ON TRUE
      WHERE d."tenantId" IN (${uuidListSql(tenantIds)})
      AND d."status" = ${documentStatusSql('FAILED')}
      AND latest."status" = ${processingJobStatusSql('FAILED')}
      AND latest."jobType" = ${processingJobTypeSql('OCR_DOCUMENT')}
    `);

    return countFromRows(rows);
  }

  private async missingMetadataCount(
    tenantIds: readonly string[],
  ): Promise<number> {
    const rows = await this.prisma.$queryRaw<CountRow[]>(Prisma.sql`
      SELECT COUNT(*)::int AS count
      FROM "Document" d
      WHERE d."tenantId" IN (${uuidListSql(tenantIds)})
      AND d."acceptedAt" IS NOT NULL
      AND d."status" = ${documentStatusSql('READY')}
      AND (
        d."documentTypeId" IS NULL
        OR d."documentDate" IS NULL
        OR d."sender" IS NULL
        OR trim(d."sender") = ''
        OR NOT EXISTS (
          SELECT 1
          FROM "DocumentTag" dt
          WHERE dt."documentId" = d.id
        )
      )
    `);

    return countFromRows(rows);
  }

  private async upcomingEvents(
    tenantIds: readonly string[],
    today: Date,
    weekEnd: Date,
  ): Promise<DashboardUpcomingEventDto[]> {
    const events = await this.prisma.documentCalendarEvent.findMany({
      where: {
        kind: { in: [...DEADLINE_KINDS] },
        date: { lte: weekEnd },
        completedAt: null,
        document: this.activeDocumentRelationWhere(tenantIds),
      },
      include: {
        assignedTo: {
          select: { id: true, username: true, displayName: true },
        },
        document: {
          select: {
            id: true,
            title: true,
            originalFileName: true,
            sender: true,
            tenant: true,
          },
        },
      },
      orderBy: [{ date: 'asc' }, { time: 'asc' }, { title: 'asc' }],
      take: UPCOMING_EVENT_LIMIT,
    });

    return events.map((event) => ({
      id: event.id,
      paymentId: event.paymentId,
      tenant: toTenantSummaryDto(event.document.tenant),
      documentId: event.document.id,
      documentTitle: documentDisplayTitle(event.document),
      documentSender: event.document.sender,
      kind: event.kind,
      title: event.title,
      date: toIsoDate(event.date),
      time: event.time,
      isOverdue: event.date < today,
      assignedTo: event.assignedTo ? toUserAssigneeDto(event.assignedTo) : null,
    }));
  }

  private async dateEntries(
    tenantIds: readonly string[],
    today: Date,
    windowEnd: Date,
  ): Promise<DashboardSummaryDto['dateEntries']> {
    const events = await this.prisma.documentCalendarEvent.findMany({
      where: {
        date: { lt: windowEnd },
        completedAt: null,
        document: this.activeDocumentRelationWhere(tenantIds),
      },
      include: {
        assignedTo: {
          select: { id: true, username: true, displayName: true },
        },
        document: {
          select: {
            id: true,
            title: true,
            originalFileName: true,
            sender: true,
            tenant: true,
          },
        },
      },
      orderBy: [{ date: 'asc' }, { time: 'asc' }, { title: 'asc' }],
    });

    const entries: DashboardDateEntryDto[] = events.map((event) => ({
      id: event.id,
      paymentId: event.paymentId,
      tenant: toTenantSummaryDto(event.document.tenant),
      documentId: event.document.id,
      documentTitle: documentDisplayTitle(event.document),
      documentSender: event.document.sender,
      kind: event.kind,
      title: event.title,
      date: toIsoDate(event.date),
      time: event.time,
      isOverdue: event.date < today,
      assignedTo: event.assignedTo ? toUserAssigneeDto(event.assignedTo) : null,
    }));

    return bucketByOverdue(entries);
  }

  private async paymentEntries(
    tenantIds: readonly string[],
    today: Date,
    windowEnd: Date,
  ): Promise<DashboardSummaryDto['payments']> {
    const payments = await this.prisma.documentPayment.findMany({
      where: {
        status: 'OPEN',
        calendarEvents: {
          some: {
            kind: 'DUE_DATE',
            date: { lt: windowEnd },
          },
        },
        document: {
          ...this.activeDocumentRelationWhere(tenantIds),
          documentType: { key: { in: [...PAYMENT_DOCUMENT_TYPES] } },
        },
      },
      include: {
        assignedTo: {
          select: { id: true, username: true, displayName: true },
        },
        calendarEvents: {
          where: { kind: 'DUE_DATE' },
          orderBy: [{ date: 'asc' }, { time: 'asc' }, { createdAt: 'asc' }],
          take: 1,
        },
        document: {
          select: {
            id: true,
            title: true,
            originalFileName: true,
            sender: true,
            tenant: true,
          },
        },
      },
    });

    const entries = payments
      .flatMap((payment): DashboardPaymentEntryDto[] => {
        const dueDateEvent = payment.calendarEvents?.[0];
        const dueDate = dueDateEvent?.date;
        if (!dueDate || dueDate >= windowEnd) {
          return [];
        }

        return [
          {
            id: payment.id,
            calendarEventId: dueDateEvent.id,
            tenant: toTenantSummaryDto(payment.document.tenant),
            documentId: payment.document.id,
            documentTitle: documentDisplayTitle(payment.document),
            documentSender: payment.document.sender,
            recipient: payment.recipient,
            purpose: payment.purpose,
            dueDate: toIsoDate(dueDate),
            amount: payment.amount === null ? null : Number(payment.amount),
            currency: payment.currency,
            isOverdue: dueDate < today,
            assignedTo: payment.assignedTo
              ? toUserAssigneeDto(payment.assignedTo)
              : null,
          },
        ];
      })
      .sort((left, right) =>
        left.dueDate === right.dueDate
          ? left.documentTitle.localeCompare(right.documentTitle)
          : left.dueDate.localeCompare(right.dueDate),
      );

    return bucketByOverdue(entries);
  }

  private combinedEntries(
    dateEntries: DashboardSummaryDto['dateEntries'],
    payments: DashboardSummaryDto['payments'],
  ): DashboardCombinedEntryDto[] {
    const groups = new Map<string, DashboardCombinedEntryDto>();
    const paymentCalendarEventIds = new Set(
      [...payments.overdue, ...payments.upcoming]
        .map((payment) => payment.calendarEventId)
        .filter((id): id is string => Boolean(id)),
    );

    for (const entry of [...dateEntries.overdue, ...dateEntries.upcoming]) {
      if (paymentCalendarEventIds.has(entry.id)) {
        continue;
      }
      const group = getOrCreateCombinedEntry(groups, {
        date: entry.date,
        documentId: entry.documentId,
        documentSender: entry.documentSender,
        documentTitle: entry.documentTitle,
        isOverdue: entry.isOverdue,
        tenant: entry.tenant,
      });
      group.dateEntries.push(entry);
    }

    for (const payment of [...payments.overdue, ...payments.upcoming]) {
      const group = getOrCreateCombinedEntry(groups, {
        date: payment.dueDate,
        documentId: payment.documentId,
        documentSender: payment.documentSender,
        documentTitle: payment.documentTitle,
        isOverdue: payment.isOverdue,
        tenant: payment.tenant,
      });
      group.payments.push(payment);
    }

    return [...groups.values()]
      .map((group) => ({
        ...group,
        dateEntries: [...group.dateEntries].sort((left, right) =>
          compareStrings(
            [left.time ?? '', left.title, left.id].join('|'),
            [right.time ?? '', right.title, right.id].join('|'),
          ),
        ),
        payments: [...group.payments].sort((left, right) =>
          compareStrings(
            [left.recipient ?? '', left.purpose ?? '', left.id].join('|'),
            [right.recipient ?? '', right.purpose ?? '', right.id].join('|'),
          ),
        ),
      }))
      .sort((left, right) =>
        compareStrings(
          [left.date, left.documentTitle, left.documentId].join('|'),
          [right.date, right.documentTitle, right.documentId].join('|'),
        ),
      );
  }

  private documentCount(tenantIds: readonly string[]): Promise<number> {
    return this.prisma.document.count({
      where: this.documentWhere(tenantIds, { status: { not: 'ARCHIVED' } }),
    });
  }

  private openDateEntryCount(tenantIds: readonly string[]): Promise<number> {
    return this.prisma.documentCalendarEvent.count({
      where: {
        completedAt: null,
        document: this.activeDocumentRelationWhere(tenantIds),
      },
    });
  }

  private userCount(tenantIds: readonly string[]): Promise<number> {
    return this.prisma.user.count({
      where: {
        isActive: true,
        tenantMemberships: {
          some: { tenantId: { in: [...tenantIds] } },
        },
      },
    });
  }

  private async emailOverview(
    tenantIds: readonly string[],
  ): Promise<DashboardEmailOverviewDto> {
    const where: Prisma.EmailMessageWhereInput = {
      mailbox: { tenantId: { in: [...tenantIds] } },
    };
    const processedWhere: Prisma.EmailMessageWhereInput = {
      ...where,
      OR: [{ processedAt: { not: null } }, { skippedReason: { not: null } }],
    };
    const [total, processed, accounts] = await Promise.all([
      this.prisma.emailMessage.count({ where }),
      this.prisma.emailMessage.count({ where: processedWhere }),
      this.prisma.emailMailbox.count({
        where: { tenantId: { in: [...tenantIds] } },
      }),
    ]);

    return { accounts, processed, open: Math.max(total - processed, 0), total };
  }

  private async actionItems(
    tenantIds: readonly string[],
    requireAiMetadata: boolean,
  ): Promise<DashboardActionItemDto[]> {
    const [
      inboxDocuments,
      failedDocuments,
      missingMetadataDocuments,
      payments,
    ] = await Promise.all([
      this.prisma.document.findMany({
        where: this.documentWhere(tenantIds, {
          acceptedAt: null,
          status: 'READY',
          ...(requireAiMetadata ? { aiProcessedAt: { not: null } } : {}),
        }),
        include: { tenant: true },
        orderBy: [{ createdAt: 'asc' }],
        take: 4,
      }),
      this.prisma.document.findMany({
        where: this.documentWhere(tenantIds, { status: 'FAILED' }),
        include: { tenant: true },
        orderBy: [{ updatedAt: 'desc' }],
        take: 4,
      }),
      this.missingMetadataDocuments(tenantIds, 4),
      this.prisma.documentPayment.findMany({
        where: this.openPaymentWhere(tenantIds),
        include: {
          assignedTo: {
            select: { id: true, username: true, displayName: true },
          },
          calendarEvents: {
            where: { kind: 'DUE_DATE' },
            orderBy: [{ date: 'asc' }, { time: 'asc' }, { createdAt: 'asc' }],
            take: 1,
          },
          document: {
            select: {
              id: true,
              title: true,
              originalFileName: true,
              status: true,
              tenant: true,
            },
          },
        },
        orderBy: [{ createdAt: 'asc' }],
        take: 4,
      }),
    ]);

    const items: DashboardActionItemDto[] = [
      ...failedDocuments.map((document) =>
        this.documentActionItem(document, 'PROCESSING_FAILED', 'HIGH'),
      ),
      ...payments.map((payment) => ({
        id: `payment-${payment.id}`,
        type: 'OPEN_PAYMENT' as const,
        priority: 'MEDIUM' as const,
        tenant: toTenantSummaryDto(payment.document.tenant),
        documentId: payment.document.id,
        paymentId: payment.id,
        calendarEventId: payment.calendarEvents[0]?.id ?? null,
        title: documentDisplayTitle(payment.document),
        subtitle: payment.recipient ?? payment.purpose,
        dueDate: toIsoDate(payment.calendarEvents[0]?.date),
        amount: payment.amount === null ? null : Number(payment.amount),
        currency: payment.currency,
        status: payment.document.status,
        assignedTo: payment.assignedTo
          ? toUserAssigneeDto(payment.assignedTo)
          : null,
        createdAt: toIsoDateTime(payment.createdAt),
      })),
      ...inboxDocuments.map((document) =>
        this.documentActionItem(document, 'INBOX_READY', 'MEDIUM'),
      ),
      ...missingMetadataDocuments.map((document) =>
        this.documentActionItem(document, 'MISSING_METADATA', 'LOW'),
      ),
    ];

    return items.slice(0, ACTION_ITEM_LIMIT);
  }

  private async missingMetadataDocuments(
    tenantIds: readonly string[],
    take: number,
  ) {
    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT d.id::text AS id
      FROM "Document" d
      WHERE d."tenantId" IN (${uuidListSql(tenantIds)})
      AND d."acceptedAt" IS NOT NULL
      AND d."status" = ${documentStatusSql('READY')}
      AND (
        d."documentTypeId" IS NULL
        OR d."documentDate" IS NULL
        OR d."sender" IS NULL
        OR trim(d."sender") = ''
        OR NOT EXISTS (
          SELECT 1
          FROM "DocumentTag" dt
          WHERE dt."documentId" = d.id
        )
      )
      ORDER BY d."updatedAt" DESC, d.id ASC
      LIMIT ${take}
    `);

    return this.prisma.document.findMany({
      where: { id: { in: rows.map((row) => row.id) } },
      include: { tenant: true },
    });
  }

  private async recentCompleted(
    tenantIds: readonly string[],
    recentStart: Date,
  ): Promise<NonNullable<DashboardSummaryDto['recentCompleted']>> {
    const [payments, events] = await Promise.all([
      this.prisma.documentPayment.findMany({
        where: {
          status: 'PAID',
          paidAt: { gte: recentStart },
          document: this.activeDocumentRelationWhere(tenantIds),
        },
        include: {
          paidBy: {
            select: { id: true, username: true, displayName: true },
          },
          document: {
            select: {
              id: true,
              title: true,
              originalFileName: true,
              tenant: true,
            },
          },
        },
        orderBy: [{ paidAt: 'desc' }, { updatedAt: 'desc' }],
        take: RECENT_COMPLETED_LIMIT,
      }),
      this.prisma.documentCalendarEvent.findMany({
        where: {
          kind: { in: [...DEADLINE_KINDS] },
          paymentId: null,
          completedAt: { gte: recentStart },
          document: this.activeDocumentRelationWhere(tenantIds),
        },
        include: {
          completedBy: {
            select: { id: true, username: true, displayName: true },
          },
          document: {
            select: {
              id: true,
              title: true,
              originalFileName: true,
              tenant: true,
            },
          },
        },
        orderBy: [{ completedAt: 'desc' }, { updatedAt: 'desc' }],
        take: RECENT_COMPLETED_LIMIT,
      }),
    ]);

    return [
      ...payments.map((payment) => ({
        id: `payment-${payment.id}`,
        type: 'PAYMENT' as const,
        tenant: toTenantSummaryDto(payment.document.tenant),
        documentId: payment.document.id,
        title: documentDisplayTitle(payment.document),
        subtitle: payment.recipient ?? payment.purpose,
        completedAt:
          toIsoDateTime(payment.paidAt) ?? toIsoDateTime(payment.updatedAt),
        amount: payment.amount === null ? null : Number(payment.amount),
        currency: payment.currency,
        completedBy: payment.paidBy ? toUserAssigneeDto(payment.paidBy) : null,
      })),
      ...events.map((event) => ({
        id: `event-${event.id}`,
        type: 'CALENDAR_EVENT' as const,
        tenant: toTenantSummaryDto(event.document.tenant),
        documentId: event.document.id,
        title: event.title,
        subtitle: documentDisplayTitle(event.document),
        completedAt:
          toIsoDateTime(event.completedAt) ?? toIsoDateTime(event.updatedAt),
        amount: null,
        currency: null,
        completedBy: event.completedBy
          ? toUserAssigneeDto(event.completedBy)
          : null,
      })),
    ]
      .sort((left, right) => right.completedAt.localeCompare(left.completedAt))
      .slice(0, RECENT_COMPLETED_LIMIT);
  }

  private async recentDocuments(
    tenantIds: readonly string[],
    recentStart: Date,
  ): Promise<DashboardRecentDocumentDto[]> {
    const documents = await this.prisma.document.findMany({
      where: this.documentWhere(tenantIds, {
        createdAt: { gte: recentStart },
        status: { not: 'ARCHIVED' },
      }),
      include: { tenant: true },
      orderBy: [{ createdAt: 'desc' }],
      take: RECENT_DOCUMENT_LIMIT,
    });

    return documents.map((document) => ({
      id: document.id,
      tenant: toTenantSummaryDto(document.tenant),
      title: documentDisplayTitle(document),
      source: document.source,
      status: document.status,
      createdAt: toIsoDateTime(document.createdAt),
      acceptedAt: toIsoDateTime(document.acceptedAt),
      documentDate: toIsoDateTime(document.documentDate),
    }));
  }

  private async aiWorkers(): Promise<DashboardAiWorkersDto> {
    const providers = await this.prisma.aiProvider.findMany({
      where: { isActive: true },
      select: { status: true },
    });

    return {
      connected: providers.filter((provider) => provider.status === 'AVAILABLE')
        .length,
      total: providers.length,
    };
  }

  private async processingHealth(
    tenantIds: readonly string[],
    includeTenantBreakdown: boolean,
  ): Promise<DashboardProcessingHealthDto> {
    const [
      waitingJobs,
      activeJobs,
      failedJobs,
      failedOcrJobs,
      providers,
      emailSyncErrors,
      tenantBreakdown,
    ] = await Promise.all([
      this.processingJobCount(tenantIds, 'WAITING'),
      this.processingJobCount(tenantIds, 'ACTIVE'),
      this.processingJobCount(tenantIds, 'FAILED'),
      this.processingJobCount(tenantIds, 'FAILED', 'OCR_DOCUMENT'),
      this.prisma.aiProvider.findMany({
        where: { isActive: true },
        select: {
          status: true,
          selectedModel: true,
        },
      }),
      this.emailSyncErrors(tenantIds),
      includeTenantBreakdown
        ? this.tenantBreakdown(tenantIds)
        : Promise.resolve([]),
    ]);

    return {
      waitingJobs,
      activeJobs,
      failedJobs,
      failedOcrJobs,
      aiProvidersTotal: providers.length,
      aiProvidersAvailable: providers.filter(
        (provider) =>
          provider.status === 'AVAILABLE' && provider.selectedModel !== null,
      ).length,
      emailSyncErrors,
      tenantBreakdown,
    };
  }

  private processingJobCount(
    tenantIds: readonly string[],
    status: 'WAITING' | 'ACTIVE' | 'FAILED',
    jobType?: 'OCR_DOCUMENT',
  ): Promise<number> {
    return this.prisma.processingJob.count({
      where: {
        status,
        jobType,
        document: { tenantId: { in: [...tenantIds] } },
      },
    });
  }

  private async emailSyncErrors(tenantIds: readonly string[]) {
    const mailboxes = await this.prisma.emailMailbox.findMany({
      where: {
        tenantId: { in: [...tenantIds] },
        isActive: true,
        lastSyncError: { not: null },
      },
      include: { tenant: true },
      orderBy: [{ updatedAt: 'desc' }],
      take: 5,
    });

    return mailboxes.flatMap((mailbox) =>
      mailbox.lastSyncError
        ? [
            {
              mailboxId: mailbox.id,
              tenant: toTenantSummaryDto(mailbox.tenant),
              mailboxName: mailbox.name,
              lastSyncAt: toIsoDateTime(mailbox.lastSyncAt),
              lastSyncError: mailbox.lastSyncError,
            },
          ]
        : [],
    );
  }

  private async tenantBreakdown(
    tenantIds: readonly string[],
  ): Promise<DashboardTenantBreakdownDto[]> {
    const tenants = await this.prisma.tenant.findMany({
      where: { id: { in: [...tenantIds] } },
      orderBy: [{ name: 'asc' }],
    });
    const ranges = dashboardRanges(startOfLocalDay(new Date()));
    const rows = await this.prisma.$queryRaw<TenantBreakdownRow[]>(Prisma.sql`
      SELECT
        t.id::text AS "tenantId",
        COUNT(DISTINCT d.id) FILTER (
          WHERE d."acceptedAt" IS NULL AND d."status" <> ${documentStatusSql('ARCHIVED')}
        )::int AS "inboxTotal",
        COUNT(DISTINCT d.id) FILTER (
          WHERE d."status" = ${documentStatusSql('FAILED')}
        )::int AS "failedProcessing",
        COUNT(DISTINCT p.id) FILTER (
          WHERE p."status" = ${paymentStatusSql('OPEN')}
          AND d."acceptedAt" IS NOT NULL
          AND d."status" <> ${documentStatusSql('ARCHIVED')}
          AND dt.key IN (${Prisma.join(PAYMENT_DOCUMENT_TYPES)})
        )::int AS "openPaymentCount",
        COUNT(DISTINCT ce.id) FILTER (
          WHERE ce."kind" IN (${calendarEventKindListSql(DEADLINE_KINDS)})
          AND ce.date >= ${ranges.weekStart}
          AND ce.date <= ${ranges.weekEnd}
          AND ce."completedAt" IS NULL
          AND d."acceptedAt" IS NOT NULL
          AND d."status" <> ${documentStatusSql('ARCHIVED')}
        )::int AS "dueThisWeek"
      FROM "Tenant" t
      LEFT JOIN "Document" d ON d."tenantId" = t.id
      LEFT JOIN "DocumentType" dt ON dt.id = d."documentTypeId"
      LEFT JOIN "DocumentPayment" p ON p."documentId" = d.id
      LEFT JOIN "DocumentCalendarEvent" ce ON ce."documentId" = d.id
      WHERE t.id IN (${uuidListSql(tenantIds)})
      GROUP BY t.id
    `);
    const rowsByTenantId = new Map(rows.map((row) => [row.tenantId, row]));

    return tenants.map((tenant) => {
      const row = rowsByTenantId.get(tenant.id);
      return {
        tenant: toTenantSummaryDto(tenant),
        inboxTotal: Number(row?.inboxTotal ?? 0),
        failedProcessing: Number(row?.failedProcessing ?? 0),
        openPaymentCount: Number(row?.openPaymentCount ?? 0),
        dueThisWeek: Number(row?.dueThisWeek ?? 0),
      };
    });
  }

  private documentActionItem(
    document: {
      id: string;
      title: string | null;
      originalFileName: string;
      status: DocumentStatus;
      createdAt: Date;
      tenant: Parameters<typeof toTenantSummaryDto>[0];
    },
    type: DashboardActionItemDto['type'],
    priority: DashboardActionItemDto['priority'],
  ): DashboardActionItemDto {
    return {
      id: `${type.toLowerCase()}-${document.id}`,
      type,
      priority,
      tenant: toTenantSummaryDto(document.tenant),
      documentId: document.id,
      title: documentDisplayTitle(document),
      subtitle: null,
      dueDate: null,
      amount: null,
      currency: null,
      status: document.status,
      createdAt: toIsoDateTime(document.createdAt),
    };
  }

  private documentWhere(
    tenantIds: readonly string[],
    where: Prisma.DocumentWhereInput,
  ): Prisma.DocumentWhereInput {
    return {
      ...where,
      tenantId: { in: [...tenantIds] },
    };
  }

  private activeDocumentRelationWhere(
    tenantIds: readonly string[],
  ): Prisma.DocumentWhereInput {
    return {
      tenantId: { in: [...tenantIds] },
      acceptedAt: { not: null },
      status: { not: 'ARCHIVED' },
    };
  }

  private openPaymentWhere(
    tenantIds: readonly string[],
  ): Prisma.DocumentPaymentWhereInput {
    return {
      status: 'OPEN',
      document: {
        tenantId: { in: [...tenantIds] },
        acceptedAt: { not: null },
        status: { not: 'ARCHIVED' },
        documentType: { key: { in: [...PAYMENT_DOCUMENT_TYPES] } },
      },
    };
  }
}

function toUserAssigneeDto(user: {
  id: string;
  username: string;
  displayName: string;
}) {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
  };
}

function uuidListSql(ids: readonly string[]): Prisma.Sql {
  return Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`));
}

function documentStatusSql(status: string): Prisma.Sql {
  return Prisma.sql`${status}::"DocumentStatus"`;
}

function paymentStatusSql(status: string): Prisma.Sql {
  return Prisma.sql`${status}::"DocumentPaymentStatus"`;
}

function processingJobStatusSql(status: string): Prisma.Sql {
  return Prisma.sql`${status}::"ProcessingJobStatus"`;
}

function processingJobTypeSql(jobType: string): Prisma.Sql {
  return Prisma.sql`${jobType}::"ProcessingJobType"`;
}

function calendarEventKindListSql(kinds: readonly string[]): Prisma.Sql {
  return Prisma.join(
    kinds.map((kind) => Prisma.sql`${kind}::"CalendarEventKind"`),
  );
}

function documentDisplayTitle(document: {
  readonly title: string | null;
  readonly originalFileName: string;
}): string {
  return document.title?.trim() || document.originalFileName;
}

function dashboardRanges(today: Date) {
  const weekStart = startOfIsoWeek(today);
  const weekEnd = addDays(weekStart, 6);
  const windowEnd = addDays(today, DASHBOARD_WINDOW_DAYS);
  const recentStart = addDays(today, -7);

  return {
    today: parseIsoDate(localIsoDate(today)),
    weekStart: parseIsoDate(localIsoDate(weekStart)),
    weekEnd: parseIsoDate(localIsoDate(weekEnd)),
    windowEnd: parseIsoDate(localIsoDate(windowEnd)),
    recentStart,
  };
}

function startOfLocalDay(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function startOfIsoWeek(value: Date): Date {
  const day = value.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  return addDays(startOfLocalDay(value), mondayOffset);
}

function addDays(value: Date, days: number): Date {
  const result = new Date(value);
  result.setDate(result.getDate() + days);
  return result;
}

function localIsoDate(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function bucketByOverdue<T extends { readonly isOverdue: boolean }>(
  items: readonly T[],
): { overdue: T[]; upcoming: T[] } {
  return {
    overdue: items.filter((item) => item.isOverdue),
    upcoming: items.filter((item) => !item.isOverdue),
  };
}

function getOrCreateCombinedEntry(
  groups: Map<string, DashboardCombinedEntryDto>,
  item: {
    readonly date: string;
    readonly documentId: string;
    readonly documentSender: string | null;
    readonly documentTitle: string;
    readonly isOverdue: boolean;
    readonly tenant: DashboardCombinedEntryDto['tenant'];
  },
): DashboardCombinedEntryDto {
  const key = `${item.documentId}|${item.date}`;
  const existing = groups.get(key);
  if (existing) {
    return existing;
  }

  const group: DashboardCombinedEntryDto = {
    id: `combined-${item.documentId}-${item.date}`,
    tenant: item.tenant,
    documentId: item.documentId,
    documentTitle: item.documentTitle,
    documentSender: item.documentSender,
    date: item.date,
    isOverdue: item.isOverdue,
    dateEntries: [],
    payments: [],
  };
  groups.set(key, group);
  return group;
}

function compareStrings(left: string, right: string): number {
  return left.localeCompare(right);
}

function countFromRows(rows: CountRow[]): number {
  return Number(rows[0]?.count ?? 0);
}
