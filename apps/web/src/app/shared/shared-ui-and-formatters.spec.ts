import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideRouter } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import {
  PlusOutline,
  SaveOutline,
  UndoOutline,
  UserOutline,
} from '@ant-design/icons-angular/icons';
import type { DocumentCalendarEventDto } from '@smart-dms/shared-dto';
import { provideNzIcons } from 'ng-zorro-antd/icon';
import { LanguageSelectorComponent } from '../core/i18n/language-selector.component';
import { LanguageService } from '../core/i18n/language.service';
import { provideI18nTesting } from '../testing/i18n-testing';
import {
  shortIsoDate,
  dateInputValue,
  localizedLongDate,
  nullableIsoDateTime,
  toIsoDate,
} from './formatters/date.formatter';
import { formatFileSize } from './formatters/file-size.formatter';
import { CalendarEventCardComponent } from './calendar-event-card/calendar-event-card.component';
import {
  CALENDAR_EVENT_KINDS,
  calendarEventColor,
  calendarEventIcon,
  calendarEventKindLabelKey,
} from './presentation/calendar-presentation';
import { USER_ROLES, userRoleLabelKey } from './presentation/user-presentation';
import { TableActionsComponent } from './table/table-actions.component';

describe('shared UI and formatters', () => {
  it('formats dates and file sizes for nullable UI values', () => {
    expect(shortIsoDate(null)).toBe('—');
    expect(shortIsoDate('2026-05-07T18:00:00.000Z')).toBe('2026-05-07');
    expect(localizedLongDate('2026-06-30T18:00:00.000Z', 'en-US')).toBe('June 30, 2026');
    expect(localizedLongDate('2026-06-30T18:00:00.000Z', 'de-DE')).toBe('30. Juni 2026');
    expect(localizedLongDate(null, 'de-DE')).toBe('—');
    expect(dateInputValue(null)).toBe('');
    expect(dateInputValue('2026-05-07T18:00:00.000Z')).toBe('2026-05-07');
    expect(nullableIsoDateTime('')).toBeNull();
    expect(nullableIsoDateTime('2026-05-07')).toBe('2026-05-07T00:00:00.000Z');
    expect(toIsoDate(new Date(2026, 4, 7))).toBe('2026-05-07');
    expect(formatFileSize(null)).toBe('—');
    expect(formatFileSize(2 * 1024 * 1024)).toBe('2.0 MB');
  });

  it('maps calendar and user presentation constants', () => {
    expect(CALENDAR_EVENT_KINDS).toEqual(['DUE_DATE', 'DEADLINE', 'APPOINTMENT']);
    expect(calendarEventColor('DUE_DATE')).toBe('green');
    expect(calendarEventIcon('DEADLINE')).toBe('fire');
    expect(calendarEventKindLabelKey('APPOINTMENT')).toBe('enums.calendarEventKind.APPOINTMENT');
    expect(USER_ROLES).toEqual(['Admin', 'User']);
    expect(userRoleLabelKey('Admin')).toBe('enums.userRole.Admin');
  });

  it('renders the language selector and delegates language changes', async () => {
    const language = {
      currentLanguage: signal('en'),
      options: [
        { code: 'en', labelKey: 'language.options.en' },
        { code: 'de', labelKey: 'language.options.de' },
      ],
      use: vi.fn(),
    };
    await configureTestingModule([
      provideI18nTesting(),
      { provide: LanguageService, useValue: language },
    ]);
    const fixture = TestBed.createComponent(LanguageSelectorComponent);
    fixture.detectChanges();

    const selector = fixture.nativeElement.querySelector('[data-testid="language-selector"]');
    expect(selector).not.toBeNull();
    expect(TestBed.inject(TranslateService).instant('language.options.en')).toBe('English');
    expect(TestBed.inject(TranslateService).instant('language.options.de')).toBe('Deutsch');
    fixture.componentInstance.language.use('de');

    expect(language.use).toHaveBeenCalledWith('de');
  });

  it('renders calendar event sender, kind, date, and document link', async () => {
    await configureTestingModule([
      provideRouter([]),
      provideAnimationsAsync(),
      provideI18nTesting(),
      provideNzIcons([UserOutline]),
      {
        provide: LanguageService,
        useValue: { currentLocale: signal('en-US') },
      },
    ]);
    const fixture = TestBed.createComponent(CalendarEventCardComponent);
    fixture.componentRef.setInput('event', calendarEvent());
    fixture.componentRef.setInput('showSender', true);
    fixture.componentRef.setInput('linkToDocument', true);
    fixture.detectChanges();
    await fixture.whenStable();

    const root: HTMLElement = fixture.nativeElement;
    expect(root.querySelector('a')?.getAttribute('href')).toBe(
      '/documents/018f1a44-9093-7f55-a515-278f4d9bd99f',
    );
    expect(root.querySelector('[data-testid="calendar-event-card-title"]')?.textContent).toContain(
      'Payment due',
    );
    expect(root.querySelector('[data-testid="calendar-event-card-sender"]')?.textContent).toContain(
      'Sender GmbH',
    );
    expect(root.textContent).toContain('all day');
    expect(fixture.componentInstance.visibleSender()).toBe('Sender GmbH');
    expect(fixture.componentInstance.eventColor()).toBe('green');
  });

  it('shows create action when no table changes are pending', async () => {
    await configureTestingModule([
      provideAnimationsAsync(),
      provideNzIcons([UndoOutline, SaveOutline, PlusOutline]),
    ]);
    const fixture = TestBed.createComponent(TableActionsComponent);
    fixture.componentRef.setInput('revertLabel', 'Revert changes');
    fixture.componentRef.setInput('saveLabel', 'Save changes');
    fixture.componentRef.setInput('createLabel', 'Create user');
    fixture.detectChanges();

    const emitted: string[] = [];
    fixture.componentInstance.create.subscribe(() => emitted.push('create'));

    const root = fixture.nativeElement as HTMLElement;
    const button = root.querySelector<HTMLButtonElement>('button');

    button?.click();

    expect(fixture.nativeElement.textContent).not.toContain('Revert changes');
    expect(fixture.nativeElement.textContent).not.toContain('Save changes');
    expect(fixture.nativeElement.textContent).toContain('Create user');
    expect(emitted).toEqual(['create']);
  });

  it('shows save and revert actions when table changes are pending', async () => {
    await configureTestingModule([
      provideAnimationsAsync(),
      provideNzIcons([UndoOutline, SaveOutline, PlusOutline]),
    ]);
    const fixture = TestBed.createComponent(TableActionsComponent);
    fixture.componentRef.setInput('revertLabel', 'Revert changes');
    fixture.componentRef.setInput('saveLabel', 'Save changes');
    fixture.componentRef.setInput('createLabel', 'Create user');
    fixture.componentRef.setInput('hasChanges', true);
    fixture.detectChanges();

    const emitted: string[] = [];
    fixture.componentInstance.revert.subscribe(() => emitted.push('revert'));
    fixture.componentInstance.save.subscribe(() => emitted.push('save'));

    const root = fixture.nativeElement as HTMLElement;
    const buttons = Array.from(root.querySelectorAll('button'));
    buttons.forEach((button) => button.click());

    expect(fixture.nativeElement.textContent).toContain('Revert changes');
    expect(fixture.nativeElement.textContent).toContain('Save changes');
    expect(fixture.nativeElement.textContent).not.toContain('Create user');
    expect(emitted).toEqual(['revert', 'save']);
  });
});

async function configureTestingModule(providers: unknown[]): Promise<void> {
  TestBed.resetTestingModule();
  await TestBed.configureTestingModule({
    imports: [LanguageSelectorComponent, CalendarEventCardComponent, TableActionsComponent],
    providers,
  }).compileComponents();
}

function calendarEvent(): DocumentCalendarEventDto {
  return {
    id: '018f1a44-9093-7f55-a515-278f4d9bd990',
    documentId: '018f1a44-9093-7f55-a515-278f4d9bd99f',
    tenant: {
      id: '018f1a44-9093-7f55-a515-278f4d9bd900',
      key: 'default',
      name: 'Default',
      isActive: true,
    },
    documentSender: 'Sender GmbH',
    kind: 'DUE_DATE',
    title: 'Payment due',
    description: null,
    date: '2026-05-07',
    time: null,
    endDate: null,
    endTime: null,
    source: 'AI_EXTRACTED',
    sourceText: null,
    assignedToId: null,
    assignedTo: null,
    assignedAt: null,
    completedAt: null,
    completedById: null,
    createdAt: '2026-05-07T18:00:00.000Z',
    updatedAt: '2026-05-07T18:00:00.000Z',
  };
}
