import { Injectable } from '@nestjs/common';
import type {
  AiExtractedCalendarEvent,
  CalendarEventsRequest,
  CalendarEventsResponse,
} from '@smart-dms/shared-dto';
import { parseIsoDate, toIsoDate } from '../common/date-mapper';
import { PrismaService } from '../prisma/prisma.service';
import { toDocumentCalendarEventDto } from './calendar.mapper';

type ResolvedAiExtractedCalendarEvent = Omit<
  AiExtractedCalendarEvent,
  'date' | 'relativeDate'
> & {
  date: string;
};

interface OpenPaymentForCalendarLink {
  readonly id: string;
  readonly calendarEvents: readonly {
    readonly date: Date;
    readonly sourceText: string | null;
  }[];
}

@Injectable()
export class CalendarService {
  constructor(private readonly prisma: PrismaService) {}

  async listEvents(
    request: CalendarEventsRequest,
    tenantIds: readonly string[],
  ): Promise<CalendarEventsResponse> {
    const events = await this.prisma.documentCalendarEvent.findMany({
      where: {
        date: {
          gte: parseIsoDate(request.from),
          lte: parseIsoDate(request.to),
        },
        kind: request.kinds?.length ? { in: request.kinds } : undefined,
        documentId: request.documentId,
        document: request.includeArchived
          ? { tenantId: { in: [...tenantIds] }, acceptedAt: { not: null } }
          : {
              tenantId: { in: [...tenantIds] },
              acceptedAt: { not: null },
              status: { not: 'ARCHIVED' },
            },
      },
      include: {
        assignedTo: {
          select: {
            id: true,
            username: true,
            displayName: true,
          },
        },
        document: {
          select: {
            sender: true,
            tenant: {
              select: {
                id: true,
                key: true,
                name: true,
                isActive: true,
              },
            },
          },
        },
      },
      orderBy: [{ date: 'asc' }, { time: 'asc' }, { title: 'asc' }],
    });

    return {
      items: events.map((event) => toDocumentCalendarEventDto(event)),
    };
  }

  async replaceAiExtractedEvents(
    documentId: string,
    events: ResolvedAiExtractedCalendarEvent[],
    preferredPaymentDueDates: readonly {
      readonly date: string;
      readonly sourceText: string | null;
    }[] = [],
  ): Promise<void> {
    const uniqueEvents = dedupeAiExtractedCalendarEvents(
      withoutPaymentDueDateDuplicates(events, preferredPaymentDueDates),
    );

    await this.prisma.$transaction(async (tx) => {
      await tx.documentCalendarEvent.deleteMany({
        where: {
          documentId,
          source: 'AI_EXTRACTED',
          paymentId: null,
        },
      });

      if (uniqueEvents.length === 0) {
        return;
      }

      const openPayments = await tx.documentPayment.findMany({
        where: { documentId, status: 'OPEN' },
        select: {
          id: true,
          calendarEvents: {
            where: { kind: 'DUE_DATE' },
            select: { date: true, sourceText: true },
          },
        },
      });
      const eventsToCreate = withoutExistingPaymentDueDateDuplicates(
        uniqueEvents,
        openPayments,
      );

      if (eventsToCreate.length === 0) {
        return;
      }

      await tx.documentCalendarEvent.createMany({
        data: eventsToCreate.map((event) => {
          const paymentId = paymentIdForCalendarEvent(
            event,
            eventsToCreate,
            openPayments,
          );

          return {
            documentId,
            ...(paymentId ? { paymentId } : {}),
            kind: event.kind,
            title: event.title,
            description: event.description ?? null,
            date: parseIsoDate(event.date),
            time: event.time ?? null,
            endDate: event.endDate ? parseIsoDate(event.endDate) : null,
            endTime: event.endTime ?? null,
            source: 'AI_EXTRACTED',
            sourceText: event.sourceText ?? null,
          };
        }),
      });
    });
  }
}

export function dedupeAiExtractedCalendarEvents(
  events: ResolvedAiExtractedCalendarEvent[],
): ResolvedAiExtractedCalendarEvent[] {
  const seen = new Set<string>();
  const result: ResolvedAiExtractedCalendarEvent[] = [];

  for (const event of events) {
    const key = [
      event.kind,
      event.title,
      event.description ?? '',
      event.date,
      event.time ?? '',
      event.endDate ?? '',
      event.endTime ?? '',
      event.sourceText ?? '',
    ].join('\u001f');

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(event);
  }

  return result;
}

function withoutPaymentDueDateDuplicates(
  events: ResolvedAiExtractedCalendarEvent[],
  preferredPaymentDueDates: readonly {
    readonly date: string;
    readonly sourceText: string | null;
  }[],
): ResolvedAiExtractedCalendarEvent[] {
  if (preferredPaymentDueDates.length === 0) {
    return events;
  }

  const preferredDates = new Set(
    preferredPaymentDueDates.map((event) => event.date),
  );

  return events.filter((event) => {
    if (event.kind !== 'DUE_DATE') {
      return true;
    }
    return !preferredDates.has(event.date);
  });
}

function withoutExistingPaymentDueDateDuplicates(
  events: ResolvedAiExtractedCalendarEvent[],
  openPayments: readonly OpenPaymentForCalendarLink[],
): ResolvedAiExtractedCalendarEvent[] {
  const existingPaymentDueDates = new Set(
    openPayments.flatMap((payment) =>
      payment.calendarEvents.map((event) => toIsoDate(event.date)),
    ),
  );
  if (existingPaymentDueDates.size === 0) {
    return events;
  }

  return events.filter((event) => {
    if (event.kind !== 'DUE_DATE') {
      return true;
    }

    return !existingPaymentDueDates.has(event.date);
  });
}

function paymentIdForCalendarEvent(
  event: ResolvedAiExtractedCalendarEvent,
  events: readonly ResolvedAiExtractedCalendarEvent[],
  openPayments: readonly OpenPaymentForCalendarLink[],
): string | null {
  if (event.kind !== 'DUE_DATE' || openPayments.length === 0) {
    return null;
  }

  const matchingPaymentDueDates = openPayments.filter((payment) =>
    payment.calendarEvents.some(
      (dueDateEvent) =>
        toIsoDate(dueDateEvent.date) === event.date &&
        normalizedText(dueDateEvent.sourceText) ===
          normalizedText(event.sourceText),
    ),
  );
  if (matchingPaymentDueDates.length === 1) {
    return matchingPaymentDueDates[0].id;
  }

  const dueDateEvents = events.filter(
    (candidate) => candidate.kind === 'DUE_DATE',
  );
  const [singlePayment] = openPayments;
  if (
    openPayments.length === 1 &&
    dueDateEvents.length === 1 &&
    singlePayment.calendarEvents.length === 0
  ) {
    return singlePayment.id;
  }

  return null;
}

function normalizedText(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? '';
}
