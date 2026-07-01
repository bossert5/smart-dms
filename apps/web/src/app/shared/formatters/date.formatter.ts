export function shortIsoDate(value: string | null): string {
  return value ? value.slice(0, 10) : '—';
}

export function localizedLongDate(
  value: string | null | undefined,
  locale: string,
  emptyValue = '—',
): string {
  if (!value) {
    return emptyValue;
  }

  const trimmedValue = value.trim();
  if (!trimmedValue) {
    return emptyValue;
  }

  const date = parseIsoDatePrefix(trimmedValue);
  if (!date) {
    return trimmedValue;
  }

  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

export function shortIsoDateTime(value: string | null): string {
  if (!value) {
    return '—';
  }

  return new Date(value).toLocaleString(undefined, {
    dateStyle: 'short',
    timeStyle: 'short',
  });
}

export function dateInputValue(value: string | null): string {
  return value?.slice(0, 10) ?? '';
}

export function nullableIsoDateTime(value: string): string | null {
  const trimmedValue = value.trim();
  return trimmedValue ? `${trimmedValue}T00:00:00.000Z` : null;
}

export function toIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function parseIsoDatePrefix(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);

  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
    ? date
    : null;
}
