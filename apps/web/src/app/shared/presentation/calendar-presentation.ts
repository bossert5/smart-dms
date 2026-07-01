import type { CalendarEventKind } from '@smart-dms/shared-dto';

export const CALENDAR_EVENT_KINDS = [
  'DUE_DATE',
  'DEADLINE',
  'APPOINTMENT',
] as const satisfies readonly CalendarEventKind[];

const EVENT_COLORS: Record<CalendarEventKind, string> = {
  DUE_DATE: 'green',
  DEADLINE: 'red',
  APPOINTMENT: 'blue',
};

const EVENT_ICONS: Record<CalendarEventKind, string> = {
  DUE_DATE: 'dollar',
  DEADLINE: 'fire',
  APPOINTMENT: 'calendar',
};

export function calendarEventColor(kind: CalendarEventKind): string {
  return EVENT_COLORS[kind];
}

export function calendarEventIcon(kind: CalendarEventKind): string {
  return EVENT_ICONS[kind];
}

export function calendarEventKindLabelKey(kind: CalendarEventKind): string {
  return `enums.calendarEventKind.${kind}`;
}
