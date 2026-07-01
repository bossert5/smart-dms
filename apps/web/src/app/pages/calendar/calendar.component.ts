import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  OnInit,
  signal,
  untracked,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import type { DocumentCalendarEventDto } from '@smart-dms/shared-dto';
import { TranslatePipe } from '@ngx-translate/core';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzCalendarModule } from 'ng-zorro-antd/calendar';
import type { NzCalendarMode } from 'ng-zorro-antd/calendar';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzRadioModule } from 'ng-zorro-antd/radio';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { CalendarApiService } from '../../core/api/calendar-api.service';
import { LanguageService } from '../../core/i18n/language.service';
import { RealtimeClientService } from '../../core/services/realtime-client.service';
import { TenantContextService } from '../../core/services/tenant-context.service';
import { CalendarEventCardComponent } from '../../shared/calendar-event-card/calendar-event-card.component';
import { toIsoDate } from '../../shared/formatters/date.formatter';

const CALENDAR_CELL_EVENT_LIMIT = 3;
const YEAR_OPTION_RADIUS = 10;

interface CalendarMonthOption {
  readonly value: number;
  readonly labelKey: string;
}

interface CalendarDateRange {
  readonly from: Date;
  readonly to: Date;
}

const MONTH_OPTIONS: readonly CalendarMonthOption[] = [
  { value: 0, labelKey: 'calendar.months.january' },
  { value: 1, labelKey: 'calendar.months.february' },
  { value: 2, labelKey: 'calendar.months.march' },
  { value: 3, labelKey: 'calendar.months.april' },
  { value: 4, labelKey: 'calendar.months.may' },
  { value: 5, labelKey: 'calendar.months.june' },
  { value: 6, labelKey: 'calendar.months.july' },
  { value: 7, labelKey: 'calendar.months.august' },
  { value: 8, labelKey: 'calendar.months.september' },
  { value: 9, labelKey: 'calendar.months.october' },
  { value: 10, labelKey: 'calendar.months.november' },
  { value: 11, labelKey: 'calendar.months.december' },
];

@Component({
  selector: 'app-calendar',
  imports: [
    FormsModule,
    RouterLink,
    TranslatePipe,
    NzButtonModule,
    NzCalendarModule,
    NzIconModule,
    NzRadioModule,
    NzSelectModule,
    CalendarEventCardComponent,
  ],
  templateUrl: './calendar.component.html',
  styleUrl: './calendar.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CalendarComponent implements OnInit {
  private readonly calendarApi = inject(CalendarApiService);
  private readonly language = inject(LanguageService);
  private readonly realtime = inject(RealtimeClientService);
  private readonly tenantContext = inject(TenantContextService);
  private lastAiMetadataChangeKey = this.documentChangeKey(this.realtime.latestDocumentChange());
  private lastTenantScope = this.tenantContext.activeScope();

  readonly selectedDate = signal(new Date());
  readonly calendarMode = signal<NzCalendarMode>('month');
  readonly events = signal<DocumentCalendarEventDto[]>([]);
  readonly monthOptions = MONTH_OPTIONS;
  readonly calendarCellEventLimit = CALENDAR_CELL_EVENT_LIMIT;
  readonly selectedMonthIndex = computed(() => this.selectedDate().getMonth());
  readonly selectedYear = computed(() => this.selectedDate().getFullYear());
  readonly yearOptions = computed(() => {
    const selectedYear = this.selectedYear();
    const startYear = selectedYear - YEAR_OPTION_RADIUS;

    return Array.from({ length: YEAR_OPTION_RADIUS * 2 + 1 }, (_, index) => startYear + index);
  });
  readonly previousNavigationLabelKey = computed(() =>
    this.calendarMode() === 'year'
      ? 'calendar.navigation.previousYear'
      : 'calendar.navigation.previousMonth',
  );
  readonly nextNavigationLabelKey = computed(() =>
    this.calendarMode() === 'year'
      ? 'calendar.navigation.nextYear'
      : 'calendar.navigation.nextMonth',
  );
  readonly selectedDateIso = computed(() => toIsoDate(this.selectedDate()));
  readonly selectedMonthIso = computed(() => toIsoMonth(this.selectedDate()));
  readonly eventsByDate = computed(() => {
    const eventsByDate = new Map<string, DocumentCalendarEventDto[]>();

    for (const event of this.events()) {
      const dayEvents = eventsByDate.get(event.date) ?? [];
      dayEvents.push(event);
      eventsByDate.set(event.date, dayEvents);
    }

    return eventsByDate;
  });
  readonly eventsByMonth = computed(() => {
    const eventsByMonth = new Map<string, DocumentCalendarEventDto[]>();

    for (const event of this.events()) {
      const monthEvents = eventsByMonth.get(event.date.slice(0, 7)) ?? [];
      monthEvents.push(event);
      eventsByMonth.set(event.date.slice(0, 7), monthEvents);
    }

    return eventsByMonth;
  });
  readonly selectedDayEvents = computed(() => {
    const selected = this.selectedDateIso();
    return this.eventsByDate().get(selected) ?? [];
  });
  readonly selectedMonthEvents = computed(() => {
    const selected = this.selectedMonthIso();
    return this.eventsByMonth().get(selected) ?? [];
  });
  readonly sidePaneEvents = computed(() =>
    this.calendarMode() === 'year' ? this.selectedMonthEvents() : this.selectedDayEvents(),
  );
  readonly sidePaneTitle = computed(() =>
    this.calendarMode() === 'year'
      ? formatMonthYear(this.selectedDate(), this.language.currentLocale())
      : formatFullDate(this.selectedDate(), this.language.currentLocale()),
  );
  readonly sidePaneEmptyLabelKey = computed(() =>
    this.calendarMode() === 'year' ? 'calendar.emptyMonth' : 'calendar.emptyDay',
  );

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
      if (
        !event ||
        event.reason !== 'AI_METADATA_EXTRACTED' ||
        eventKey === this.lastAiMetadataChangeKey
      ) {
        return;
      }

      this.lastAiMetadataChangeKey = eventKey;
      untracked(() => this.load());
    });
  }

  ngOnInit(): void {
    this.load();
  }

  selectDate(date: Date): void {
    this.selectedDate.set(date);
    this.load();
  }

  changeMode(mode: NzCalendarMode): void {
    if (this.calendarMode() === mode) {
      return;
    }

    this.calendarMode.set(mode);
    this.load();
  }

  navigatePrevious(): void {
    if (this.calendarMode() === 'year') {
      this.navigateYear(-1);
      return;
    }

    this.navigateMonth(-1);
  }

  navigateNext(): void {
    if (this.calendarMode() === 'year') {
      this.navigateYear(1);
      return;
    }

    this.navigateMonth(1);
  }

  selectMonth(month: number): void {
    const date = this.selectedDate();
    this.selectDateAt(date.getFullYear(), month, date.getDate());
  }

  selectYear(year: number): void {
    const date = this.selectedDate();
    this.selectDateAt(year, date.getMonth(), date.getDate());
  }

  load(): void {
    if (this.tenantContext.hasNoActiveTenants()) {
      this.events.set([]);
      return;
    }

    const date = this.selectedDate();
    const range = this.visibleRange(date);

    this.calendarApi
      .events({
        from: toIsoDate(range.from),
        to: toIsoDate(range.to),
      })
      .subscribe({
        next: (response) => this.events.set(response.items),
        error: () => this.events.set([]),
      });
  }

  eventsForDate(date: Date): readonly DocumentCalendarEventDto[] {
    return this.eventsByDate().get(toIsoDate(date)) ?? [];
  }

  eventsForMonth(date: Date): readonly DocumentCalendarEventDto[] {
    return this.eventsByMonth().get(toIsoMonth(date)) ?? [];
  }

  visibleEventsForDate(date: Date): readonly DocumentCalendarEventDto[] {
    return this.eventsForDate(date).slice(0, this.calendarCellEventLimit);
  }

  monthCellEventPrefix(event: DocumentCalendarEventDto): string {
    const day = formatEventDayMonth(event.date, this.language.currentLocale());

    return day ?? event.date;
  }

  hiddenEventCount(date: Date): number {
    return Math.max(this.eventsForDate(date).length - this.calendarCellEventLimit, 0);
  }

  selectOverflowDate(date: Date, event: Event): void {
    event.stopPropagation();
    this.selectDate(date);
  }

  stopCellEventPropagation(event: Event): void {
    event.stopPropagation();
  }

  private navigateMonth(delta: number): void {
    const date = this.selectedDate();
    this.selectDateAt(date.getFullYear(), date.getMonth() + delta, date.getDate());
  }

  private navigateYear(delta: number): void {
    const date = this.selectedDate();
    this.selectDateAt(date.getFullYear() + delta, date.getMonth(), date.getDate());
  }

  private selectDateAt(year: number, month: number, day: number): void {
    const clampedDay = Math.min(day, daysInMonth(year, month));
    this.selectDate(new Date(year, month, clampedDay));
  }

  private visibleRange(date: Date): CalendarDateRange {
    if (this.calendarMode() === 'year') {
      return {
        from: new Date(date.getFullYear(), 0, 1),
        to: new Date(date.getFullYear(), 11, 31),
      };
    }

    return {
      from: new Date(date.getFullYear(), date.getMonth(), 1),
      to: new Date(date.getFullYear(), date.getMonth() + 1, 0),
    };
  }

  private documentChangeKey(
    event: ReturnType<RealtimeClientService['latestDocumentChange']>,
  ): string | null {
    return event
      ? [event.documentId, event.reason, event.jobId ?? '', event.changedAt].join('|')
      : null;
  }
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function formatFullDate(date: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

function formatMonthYear(date: Date, locale: string): string {
  const month = new Intl.DateTimeFormat(locale, { month: 'long' }).format(date);

  return `${month} '${String(date.getFullYear()).slice(-2)}`;
}

function formatEventDayMonth(date: string, locale: string): string | null {
  const parsedDate = parseIsoDate(date);

  if (!parsedDate) {
    return null;
  }

  const day = new Intl.NumberFormat(locale, { useGrouping: false }).format(
    parsedDate.getDate(),
  );
  const month = new Intl.DateTimeFormat(locale, { month: 'long' }).format(parsedDate);

  return `${day} ${month}`;
}

function parseIsoDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (!match) {
    return null;
  }

  const [, year, month, day] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day));

  return Number.isNaN(date.getTime()) ? null : date;
}

function toIsoMonth(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');

  return `${year}-${month}`;
}
