import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  DollarOutline,
  LeftOutline,
  RightOutline,
  UserOutline,
} from '@ant-design/icons-angular/icons';
import { provideRouter } from '@angular/router';
import type { DocumentCalendarEventDto } from '@smart-dms/shared-dto';
import { provideNzIcons } from 'ng-zorro-antd/icon';
import { of } from 'rxjs';
import { CalendarApiService } from '../../core/api/calendar-api.service';
import { LanguageService } from '../../core/i18n/language.service';
import { RealtimeClientService } from '../../core/services/realtime-client.service';
import { provideI18nTesting } from '../../testing/i18n-testing';
import { CalendarComponent } from './calendar.component';

const tenant = {
  id: '00000000-0000-4000-8000-000000000010',
  key: 'default',
  name: 'Default',
  isActive: true,
};
const selectedDate = new Date(2026, 4, 9);

function calendarEvent(
  index: number,
  overrides: Partial<DocumentCalendarEventDto> = {},
): DocumentCalendarEventDto {
  const suffix = String(index).padStart(12, '0');

  return {
    id: `00000000-0000-4000-8000-${suffix}`,
    documentId: `00000000-0000-4000-9000-${suffix}`,
    tenant,
    documentSender: null,
    kind: 'APPOINTMENT',
    title: `Event ${index}`,
    description: null,
    date: '2026-05-09',
    time: '09:00',
    endDate: null,
    endTime: null,
    source: 'AI_EXTRACTED',
    sourceText: null,
    createdAt: '2026-05-09T08:00:00.000Z',
    updatedAt: '2026-05-09T08:00:00.000Z',
    ...overrides,
  };
}

async function setup(items: DocumentCalendarEventDto[] = [], locale = 'en-US') {
  const calendarApi = {
    events: vi.fn().mockReturnValue(of({ items })),
  };
  const language = {
    currentLocale: signal(locale),
  };

  await TestBed.configureTestingModule({
    imports: [CalendarComponent],
    providers: [
      provideRouter([]),
      provideI18nTesting(),
      provideNzIcons([DollarOutline, LeftOutline, RightOutline, UserOutline]),
      { provide: CalendarApiService, useValue: calendarApi },
      { provide: LanguageService, useValue: language },
      {
        provide: RealtimeClientService,
        useValue: { latestDocumentChange: signal(null) },
      },
    ],
  }).compileComponents();

  const fixture = TestBed.createComponent(CalendarComponent);
  fixture.componentInstance.selectedDate.set(selectedDate);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();

  return {
    calendarApi,
    component: fixture.componentInstance,
    fixture,
  };
}

describe('CalendarComponent', () => {
  it('groups events by day and limits visible calendar cell items', async () => {
    const events = [
      calendarEvent(1, { title: 'First appointment', time: '08:00' }),
      calendarEvent(2, { kind: 'DEADLINE', title: 'Second deadline', time: '10:30' }),
      calendarEvent(3, { kind: 'DUE_DATE', title: 'Third due date', time: null }),
      calendarEvent(4, { title: 'Fourth hidden appointment', time: '15:00' }),
      calendarEvent(5, {
        date: '2026-05-10',
        title: 'Other day appointment',
      }),
    ];

    const { component, fixture } = await setup(events);
    const calendar = fixture.nativeElement.querySelector('nz-calendar') as HTMLElement;

    expect(component.eventsForDate(selectedDate).map((event) => event.title)).toEqual([
      'First appointment',
      'Second deadline',
      'Third due date',
      'Fourth hidden appointment',
    ]);
    expect(component.visibleEventsForDate(selectedDate).map((event) => event.title)).toEqual([
      'First appointment',
      'Second deadline',
      'Third due date',
    ]);
    expect(component.hiddenEventCount(selectedDate)).toBe(1);
    expect(component.eventsForDate(new Date(2026, 4, 10)).map((event) => event.title)).toEqual([
      'Other day appointment',
    ]);

    expect(calendar.textContent).toContain('First appointment');
    expect(calendar.textContent).toContain('Second deadline');
    expect(calendar.textContent).toContain('Third due date');
    expect(calendar.textContent).not.toContain('all day');
    expect(calendar.textContent).not.toContain('Fourth hidden appointment');
    expect(calendar.textContent).toContain('+1');
    expect(hasDocumentLink(calendar, events[0].documentId)).toBe(true);
  });

  it('selects the overflow day from the calendar cell counter', async () => {
    const overflowDate = new Date(2026, 4, 10);
    const events = [
      calendarEvent(1, { date: '2026-05-10', title: 'Overflow one' }),
      calendarEvent(2, { date: '2026-05-10', title: 'Overflow two' }),
      calendarEvent(3, { date: '2026-05-10', title: 'Overflow three' }),
      calendarEvent(4, { date: '2026-05-10', title: 'Overflow four' }),
    ];

    const { component, fixture } = await setup(events);
    const moreButton = fixture.nativeElement.querySelector(
      '[data-testid="calendar-cell-more"]',
    ) as HTMLButtonElement;

    moreButton.click();

    expect(component.selectedDateIso()).toBe('2026-05-10');
    expect(component.eventsForDate(overflowDate)).toHaveLength(4);
  });

  it('renders selected day cards with sender, date, time, and kind badge', async () => {
    const { fixture } = await setup([
      calendarEvent(1, {
        kind: 'DEADLINE',
        title: 'Contract deadline',
        documentSender: 'Sender GmbH',
        time: '09:00',
        endTime: '10:30',
      }),
    ]);
    const card = fixture.nativeElement.querySelector(
      '[data-testid="calendar-side-pane-event"]',
    ) as HTMLElement;

    expect(card.textContent).toContain('Deadline');
    expect(
      card.querySelector('[data-testid="calendar-event-card-sender"]')?.textContent?.trim(),
    ).toBe('Sender GmbH');
    expect(
      card.querySelector('[data-testid="calendar-event-card-sender"] .anticon'),
    ).not.toBeNull();
    expect(
      card.querySelector('[data-testid="calendar-event-card-title"]')?.textContent,
    ).toContain('Contract deadline');
    expect(card.querySelector('.calendar-event-card__header .ant-tag')).not.toBeNull();
    expect(card.querySelector('.calendar-event-card__title-row .ant-tag')).toBeNull();
    expect(card.textContent).not.toContain('Default');
    expect(
      card.querySelector('[data-testid="calendar-event-card-date"]')?.textContent?.trim(),
    ).toBe('May 9, 2026');
    expect(
      card.querySelector('[data-testid="calendar-event-card-time"]')?.textContent?.trim(),
    ).toBe('09:00');
  });

  it('omits the side pane sender when the document sender is missing', async () => {
    const { fixture } = await setup([
      calendarEvent(1, {
        title: 'Appointment without sender',
        documentSender: null,
      }),
    ]);

    expect(
      fixture.nativeElement.querySelector('[data-testid="calendar-event-card-sender"]'),
    ).toBeNull();
  });

  it('renders year side pane cards with localized date and optional time', async () => {
    const { component, fixture } = await setup(
      [
        calendarEvent(1, {
          title: 'May appointment',
          date: '2026-05-19',
          time: '14:45',
        }),
      ],
      'de-DE',
    );

    component.changeMode('year');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const card = fixture.nativeElement.querySelector(
      '[data-testid="calendar-side-pane-event"]',
    ) as HTMLElement;

    expect(
      card.querySelector('[data-testid="calendar-event-card-date"]')?.textContent?.trim(),
    ).toBe('19. Mai 2026');
    expect(
      card.querySelector('[data-testid="calendar-event-card-time"]')?.textContent?.trim(),
    ).toBe('14:45');
    expect(
      card.querySelector('[data-testid="calendar-event-card-title"]')?.textContent,
    ).toContain('May appointment');
  });

  it('renders all-day fallback in the card time slot', async () => {
    const { fixture } = await setup([
      calendarEvent(1, {
        title: 'All-day appointment',
        time: null,
      }),
    ]);
    const time = fixture.nativeElement.querySelector(
      '[data-testid="calendar-event-card-time"]',
    ) as HTMLElement;

    expect(time.textContent?.trim()).toBe('all day');
  });

  it('formats the selected day side pane title with the current locale', async () => {
    const { component } = await setup([], 'de-DE');

    expect(component.sidePaneTitle()).toBe('9. Mai 2026');
  });

  it('navigates to the previous and next month from the custom header', async () => {
    const { calendarApi, component, fixture } = await setup();
    const nextButton = fixture.nativeElement.querySelector(
      '[data-testid="calendar-next"]',
    ) as HTMLButtonElement;
    const previousButton = fixture.nativeElement.querySelector(
      '[data-testid="calendar-previous"]',
    ) as HTMLButtonElement;

    nextButton.click();
    fixture.detectChanges();

    expect(component.selectedMonthIso()).toBe('2026-06');
    expect(calendarApi.events).toHaveBeenLastCalledWith({
      from: '2026-06-01',
      to: '2026-06-30',
    });

    previousButton.click();
    fixture.detectChanges();

    expect(component.selectedMonthIso()).toBe('2026-05');
    expect(calendarApi.events).toHaveBeenLastCalledWith({
      from: '2026-05-01',
      to: '2026-05-31',
    });
  });

  it('renders month events and switches the side pane to month scope in year mode', async () => {
    const events = [
      calendarEvent(1, { title: 'May appointment', date: '2026-05-01' }),
      calendarEvent(2, { title: 'May deadline', date: '2026-05-09', kind: 'DEADLINE' }),
      calendarEvent(3, { title: 'May due date', date: '2026-05-19', kind: 'DUE_DATE' }),
      calendarEvent(4, { title: 'May visible fourth', date: '2026-05-29' }),
      calendarEvent(5, { title: 'June appointment', date: '2026-06-02' }),
    ];

    const { calendarApi, component, fixture } = await setup(events, 'de-DE');

    component.changeMode('year');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const calendar = fixture.nativeElement.querySelector('nz-calendar') as HTMLElement;

    expect(calendarApi.events).toHaveBeenLastCalledWith({
      from: '2026-01-01',
      to: '2026-12-31',
    });
    expect(component.eventsForMonth(selectedDate).map((event) => event.title)).toEqual([
      'May appointment',
      'May deadline',
      'May due date',
      'May visible fourth',
    ]);
    expect(component.sidePaneTitle()).toBe("Mai '26");
    expect(component.sidePaneEvents().map((event) => event.title)).toEqual([
      'May appointment',
      'May deadline',
      'May due date',
      'May visible fourth',
    ]);
    expect(calendar.textContent).toContain('29 Mai');
    expect(calendar.textContent).not.toContain('29 Mai 09:00');
    expect(calendar.textContent).toContain('May visible fourth');
    expect(hasDocumentLink(calendar, events[3].documentId)).toBe(true);
  });

  it('navigates years from the custom header in year mode', async () => {
    const { calendarApi, component, fixture } = await setup();

    component.changeMode('year');
    fixture.detectChanges();

    const nextButton = fixture.nativeElement.querySelector(
      '[data-testid="calendar-next"]',
    ) as HTMLButtonElement;
    nextButton.click();
    fixture.detectChanges();

    expect(component.selectedYear()).toBe(2027);
    expect(calendarApi.events).toHaveBeenLastCalledWith({
      from: '2027-01-01',
      to: '2027-12-31',
    });
  });

  it('selects the visible month and year from header dropdown values', async () => {
    const { calendarApi, component } = await setup();

    component.selectMonth(6);

    expect(component.selectedMonthIso()).toBe('2026-07');
    expect(calendarApi.events).toHaveBeenLastCalledWith({
      from: '2026-07-01',
      to: '2026-07-31',
    });

    component.changeMode('year');
    component.selectYear(2028);

    expect(component.selectedYear()).toBe(2028);
    expect(calendarApi.events).toHaveBeenLastCalledWith({
      from: '2028-01-01',
      to: '2028-12-31',
    });
  });

  it('loads calendar events without event kind filters', async () => {
    const { calendarApi, fixture } = await setup();

    expect(calendarApi.events).toHaveBeenCalledWith({
      from: '2026-05-01',
      to: '2026-05-31',
    });
    expect(fixture.nativeElement.querySelector('.event-kind-filter')).toBeNull();
  });
});

function hasDocumentLink(container: HTMLElement, documentId: string): boolean {
  return Array.from(container.querySelectorAll<HTMLAnchorElement>('.calendar-cell-event')).some(
    (link) => link.getAttribute('href') === `/documents/${documentId}`,
  );
}
