import { toDocumentCalendarEventDto } from './calendar.mapper';

describe('toDocumentCalendarEventDto', () => {
  it('maps a document calendar event to the shared DTO shape', () => {
    const event = {
      id: '018f1a44-9093-7f55-a515-278f4d9bd99f',
      documentId: '018f1a44-9093-7f55-a515-278f4d9bd990',
      kind: 'DEADLINE',
      title: 'Widerspruchsfrist',
      description: null,
      date: new Date('2026-06-30T00:00:00.000Z'),
      time: null,
      endDate: null,
      endTime: null,
      assignedToId: undefined,
      assignedTo: null,
      assignedAt: null,
      completedAt: null,
      completedById: undefined,
      source: 'AI_EXTRACTED',
      sourceText: 'Widerspruch bis zum 30.06.2026',
      createdAt: new Date('2026-05-06T18:00:00.000Z'),
      updatedAt: new Date('2026-05-06T18:00:00.000Z'),
      document: {
        sender: 'Sender GmbH',
        tenant: {
          id: '018f1a44-9093-7f55-a515-278f4d9bd900',
          key: 'default',
          name: 'Default',
          isActive: true,
        },
      },
    };

    expect(toDocumentCalendarEventDto(event as never)).toEqual({
      id: '018f1a44-9093-7f55-a515-278f4d9bd99f',
      documentId: '018f1a44-9093-7f55-a515-278f4d9bd990',
      documentSender: 'Sender GmbH',
      tenant: {
        id: '018f1a44-9093-7f55-a515-278f4d9bd900',
        key: 'default',
        name: 'Default',
        isActive: true,
      },
      kind: 'DEADLINE',
      title: 'Widerspruchsfrist',
      description: null,
      date: '2026-06-30',
      time: null,
      endDate: null,
      endTime: null,
      assignedToId: undefined,
      assignedTo: null,
      assignedAt: null,
      completedAt: null,
      completedById: undefined,
      source: 'AI_EXTRACTED',
      sourceText: 'Widerspruch bis zum 30.06.2026',
      createdAt: '2026-05-06T18:00:00.000Z',
      updatedAt: '2026-05-06T18:00:00.000Z',
    });
  });
});
