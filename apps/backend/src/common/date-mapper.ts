export function toIsoDateTime(value: Date): string;
export function toIsoDateTime(value: Date | null | undefined): string | null;
export function toIsoDateTime(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

export function toIsoDate(value: Date): string;
export function toIsoDate(value: Date | null | undefined): string | null;
export function toIsoDate(value: Date | null | undefined): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

export function parseIsoDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}
