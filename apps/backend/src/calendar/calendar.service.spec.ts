import { expectObjectContaining, mockArg } from '../testing/expect-matchers';
import { CalendarService } from './calendar.service';

interface CalendarCreateManyInput {
  data: Array<Record<string, unknown>>;
}

const tenant = {
  id: '018f1a44-9093-7f55-a515-278f4d9bd900',
  key: 'default',
  name: 'Default',
  isActive: true,
};

describe('CalendarService', () => {
  it('queries events by range and excludes archived documents by default', async () => {
    const prisma = {
      documentCalendarEvent: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: '018f1a44-9093-7f55-a515-278f4d9bd99f',
            documentId: '018f1a44-9093-7f55-a515-278f4d9bd990',
            kind: 'DUE_DATE',
            title: 'Installment due',
            description: null,
            date: new Date('2026-06-30T00:00:00.000Z'),
            time: null,
            endDate: null,
            endTime: null,
            source: 'AI_EXTRACTED',
            sourceText: null,
            createdAt: new Date('2026-05-06T18:00:00.000Z'),
            updatedAt: new Date('2026-05-06T18:00:00.000Z'),
            document: { sender: 'Sender GmbH', tenant },
          },
        ]),
      },
    };
    const service = new CalendarService(prisma as never);

    const response = await service.listEvents(
      {
        from: '2026-06-01',
        to: '2026-06-30',
        kinds: ['DUE_DATE'],
        includeArchived: false,
      },
      [tenant.id],
    );

    expect(prisma.documentCalendarEvent.findMany).toHaveBeenCalledWith({
      where: {
        date: {
          gte: new Date('2026-06-01T00:00:00.000Z'),
          lte: new Date('2026-06-30T00:00:00.000Z'),
        },
        kind: { in: ['DUE_DATE'] },
        documentId: undefined,
        document: {
          tenantId: { in: [tenant.id] },
          acceptedAt: { not: null },
          status: { not: 'ARCHIVED' },
        },
      },
      include: {
        assignedTo: {
          select: { id: true, username: true, displayName: true },
        },
        document: {
          select: {
            sender: true,
            tenant: {
              select: { id: true, key: true, name: true, isActive: true },
            },
          },
        },
      },
      orderBy: [{ date: 'asc' }, { time: 'asc' }, { title: 'asc' }],
    });
    expect(response.items).toHaveLength(1);
    expect(response.items[0].date).toBe('2026-06-30');
    expect(response.items[0].documentSender).toBe('Sender GmbH');
  });

  it('includes archived documents when requested but still excludes inbox documents', async () => {
    const prisma = {
      documentCalendarEvent: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const service = new CalendarService(prisma as never);

    await service.listEvents(
      {
        from: '2026-06-01',
        to: '2026-06-30',
        includeArchived: true,
      },
      [tenant.id],
    );

    expect(prisma.documentCalendarEvent.findMany).toHaveBeenCalledWith(
      expectObjectContaining({
        where: expectObjectContaining({
          document: {
            tenantId: { in: [tenant.id] },
            acceptedAt: { not: null },
          },
        }),
      }),
    );
  });

  it('replaces only AI extracted events and keeps multiple events of the same kind', async () => {
    const tx = {
      documentPayment: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      documentCalendarEvent: {
        deleteMany: jest.fn().mockResolvedValue({ count: 2 }),
        createMany: jest.fn().mockResolvedValue({ count: 3 }),
      },
    };
    const prisma = {
      $transaction: jest.fn(
        <TResult>(callback: (transaction: typeof tx) => TResult) =>
          callback(tx),
      ),
    };
    const service = new CalendarService(prisma as never);

    await service.replaceAiExtractedEvents(
      '018f1a44-9093-7f55-a515-278f4d9bd990',
      [
        {
          kind: 'APPOINTMENT',
          title: 'First event',
          date: '2026-06-10',
          time: '09:00',
        },
        {
          kind: 'APPOINTMENT',
          title: 'First event',
          date: '2026-06-10',
          time: '09:00',
        },
        {
          kind: 'APPOINTMENT',
          title: 'Second event',
          date: '2026-06-17',
          time: '09:00',
        },
        {
          kind: 'DUE_DATE',
          title: 'Installment due',
          date: '2026-06-30',
        },
      ],
    );

    expect(tx.documentCalendarEvent.deleteMany).toHaveBeenCalledWith({
      where: {
        documentId: '018f1a44-9093-7f55-a515-278f4d9bd990',
        source: 'AI_EXTRACTED',
        paymentId: null,
      },
    });
    expect(tx.documentCalendarEvent.createMany).toHaveBeenCalledWith({
      data: [
        {
          documentId: '018f1a44-9093-7f55-a515-278f4d9bd990',
          kind: 'APPOINTMENT',
          title: 'First event',
          description: null,
          date: new Date('2026-06-10T00:00:00.000Z'),
          time: '09:00',
          endDate: null,
          endTime: null,
          source: 'AI_EXTRACTED',
          sourceText: null,
        },
        {
          documentId: '018f1a44-9093-7f55-a515-278f4d9bd990',
          kind: 'APPOINTMENT',
          title: 'Second event',
          description: null,
          date: new Date('2026-06-17T00:00:00.000Z'),
          time: '09:00',
          endDate: null,
          endTime: null,
          source: 'AI_EXTRACTED',
          sourceText: null,
        },
        {
          documentId: '018f1a44-9093-7f55-a515-278f4d9bd990',
          kind: 'DUE_DATE',
          title: 'Installment due',
          description: null,
          date: new Date('2026-06-30T00:00:00.000Z'),
          time: null,
          endDate: null,
          endTime: null,
          source: 'AI_EXTRACTED',
          sourceText: null,
        },
      ],
    });
  });

  it('links one AI due-date event to one open payment when the payment has no due-date event yet', async () => {
    const tx = {
      documentPayment: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: '018f1a44-9093-7f55-a515-278f4d9bd901',
            calendarEvents: [],
          },
        ]),
      },
      documentCalendarEvent: {
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const prisma = {
      $transaction: jest.fn(
        <TResult>(callback: (transaction: typeof tx) => TResult) =>
          callback(tx),
      ),
    };
    const service = new CalendarService(prisma as never);

    await service.replaceAiExtractedEvents(
      '018f1a44-9093-7f55-a515-278f4d9bd990',
      [
        {
          kind: 'DUE_DATE',
          title: 'Payment due',
          date: '2026-06-30',
        },
      ],
    );

    expect(tx.documentPayment.findMany).toHaveBeenCalledWith({
      where: {
        documentId: '018f1a44-9093-7f55-a515-278f4d9bd990',
        status: 'OPEN',
      },
      select: {
        id: true,
        calendarEvents: {
          where: { kind: 'DUE_DATE' },
          select: { date: true, sourceText: true },
        },
      },
    });
    expect(tx.documentCalendarEvent.createMany).toHaveBeenCalledWith({
      data: [
        expectObjectContaining({
          documentId: '018f1a44-9093-7f55-a515-278f4d9bd990',
          paymentId: '018f1a44-9093-7f55-a515-278f4d9bd901',
          kind: 'DUE_DATE',
          date: new Date('2026-06-30T00:00:00.000Z'),
        }),
      ],
    });
  });

  it('does not link AI due-date events when multiple open payments are possible', async () => {
    const tx = {
      documentPayment: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: '018f1a44-9093-7f55-a515-278f4d9bd901',
            calendarEvents: [],
          },
          {
            id: '018f1a44-9093-7f55-a515-278f4d9bd902',
            calendarEvents: [],
          },
        ]),
      },
      documentCalendarEvent: {
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const prisma = {
      $transaction: jest.fn(
        <TResult>(callback: (transaction: typeof tx) => TResult) =>
          callback(tx),
      ),
    };
    const service = new CalendarService(prisma as never);

    await service.replaceAiExtractedEvents(
      '018f1a44-9093-7f55-a515-278f4d9bd990',
      [
        {
          kind: 'DUE_DATE',
          title: 'Payment due',
          date: '2026-06-30',
        },
      ],
    );

    const [createdEvent] = mockArg<CalendarCreateManyInput>(
      tx.documentCalendarEvent.createMany,
    ).data;
    expect(createdEvent).not.toHaveProperty('paymentId');
  });

  it('does not duplicate an existing linked payment due-date event on the same date', async () => {
    const tx = {
      documentPayment: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: '018f1a44-9093-7f55-a515-278f4d9bd901',
            calendarEvents: [
              {
                date: new Date('2026-06-30T00:00:00.000Z'),
                sourceText: 'payable by 30 June 2026',
              },
            ],
          },
          {
            id: '018f1a44-9093-7f55-a515-278f4d9bd902',
            calendarEvents: [
              {
                date: new Date('2026-07-15T00:00:00.000Z'),
                sourceText: 'payable by 15 July 2026',
              },
            ],
          },
        ]),
      },
      documentCalendarEvent: {
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const prisma = {
      $transaction: jest.fn(
        <TResult>(callback: (transaction: typeof tx) => TResult) =>
          callback(tx),
      ),
    };
    const service = new CalendarService(prisma as never);

    await service.replaceAiExtractedEvents(
      '018f1a44-9093-7f55-a515-278f4d9bd990',
      [
        {
          kind: 'DUE_DATE',
          title: 'Fee payment',
          date: '2026-06-30',
          sourceText: 'Pay the fees by 30 June 2026',
        },
      ],
    );

    expect(tx.documentCalendarEvent.createMany).not.toHaveBeenCalled();
  });

  it('drops AI due-date events already covered by preferred payment due dates', async () => {
    const tx = {
      documentPayment: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      documentCalendarEvent: {
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const prisma = {
      $transaction: jest.fn(
        <TResult>(callback: (transaction: typeof tx) => TResult) =>
          callback(tx),
      ),
    };
    const service = new CalendarService(prisma as never);

    await service.replaceAiExtractedEvents(
      '018f1a44-9093-7f55-a515-278f4d9bd990',
      [
        {
          kind: 'DUE_DATE',
          title: 'Fee payment',
          date: '2026-01-02',
          sourceText: 'Pay the fees by 2 January 2026',
        },
      ],
      [{ date: '2026-01-02', sourceText: 'by 2 January 2026' }],
    );

    expect(tx.documentPayment.findMany).not.toHaveBeenCalled();
    expect(tx.documentCalendarEvent.createMany).not.toHaveBeenCalled();
  });

  it('does not link due-date events when one payment has multiple possible due dates', async () => {
    const tx = {
      documentPayment: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: '018f1a44-9093-7f55-a515-278f4d9bd901',
            calendarEvents: [],
          },
        ]),
      },
      documentCalendarEvent: {
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
        createMany: jest.fn().mockResolvedValue({ count: 2 }),
      },
    };
    const prisma = {
      $transaction: jest.fn(
        <TResult>(callback: (transaction: typeof tx) => TResult) =>
          callback(tx),
      ),
    };
    const service = new CalendarService(prisma as never);

    await service.replaceAiExtractedEvents(
      '018f1a44-9093-7f55-a515-278f4d9bd990',
      [
        {
          kind: 'DUE_DATE',
          title: 'First payment date',
          date: '2026-06-30',
        },
        {
          kind: 'DUE_DATE',
          title: 'Second payment date',
          date: '2026-07-15',
        },
      ],
    );

    const createdEvents = mockArg<CalendarCreateManyInput>(
      tx.documentCalendarEvent.createMany,
    ).data;
    expect(createdEvents).toHaveLength(2);
    expect(createdEvents[0]).not.toHaveProperty('paymentId');
    expect(createdEvents[1]).not.toHaveProperty('paymentId');
  });

  it('does not link appointments or deadlines to open payments', async () => {
    const tx = {
      documentPayment: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: '018f1a44-9093-7f55-a515-278f4d9bd901',
            calendarEvents: [],
          },
        ]),
      },
      documentCalendarEvent: {
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const prisma = {
      $transaction: jest.fn(
        <TResult>(callback: (transaction: typeof tx) => TResult) =>
          callback(tx),
      ),
    };
    const service = new CalendarService(prisma as never);

    await service.replaceAiExtractedEvents(
      '018f1a44-9093-7f55-a515-278f4d9bd990',
      [
        {
          kind: 'DEADLINE',
          title: 'Send documents',
          date: '2026-06-30',
        },
      ],
    );

    const [createdEvent] = mockArg<CalendarCreateManyInput>(
      tx.documentCalendarEvent.createMany,
    ).data;
    expect(createdEvent).not.toHaveProperty('paymentId');
  });

  it('deletes previous AI extracted events when replacement list is empty', async () => {
    const tx = {
      documentCalendarEvent: {
        deleteMany: jest.fn().mockResolvedValue({ count: 2 }),
        createMany: jest.fn(),
      },
    };
    const prisma = {
      $transaction: jest.fn(
        <TResult>(callback: (transaction: typeof tx) => TResult) =>
          callback(tx),
      ),
    };
    const service = new CalendarService(prisma as never);

    await service.replaceAiExtractedEvents(
      '018f1a44-9093-7f55-a515-278f4d9bd990',
      [],
    );

    expect(tx.documentCalendarEvent.deleteMany).toHaveBeenCalledWith({
      where: {
        documentId: '018f1a44-9093-7f55-a515-278f4d9bd990',
        source: 'AI_EXTRACTED',
        paymentId: null,
      },
    });
    expect(tx.documentCalendarEvent.createMany).not.toHaveBeenCalled();
  });
});
