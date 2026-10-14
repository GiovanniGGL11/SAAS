import { calendarDateToUtc, utcToCalendarDate } from '@/lib/time';

/** Mês no formato "2026-10". */
export type MonthKey = string;

export function monthKey(year: number, month: number): MonthKey {
  return `${year}-${String(month).padStart(2, '0')}`;
}

export function parseMonthKey(key: MonthKey): { year: number; month: number } {
  const [year, month] = key.split('-').map(Number);
  return { year, month };
}

export function shiftMonth(key: MonthKey, delta: number): MonthKey {
  const { year, month } = parseMonthKey(key);
  const index = year * 12 + (month - 1) + delta;
  return monthKey(Math.floor(index / 12), (index % 12) + 1);
}

export function currentMonthKey(timeZone: string, at: Date = new Date()): MonthKey {
  const today = utcToCalendarDate(at, timeZone);
  return monthKey(today.year, today.month);
}

export function daysInMonth(key: MonthKey): number {
  const { year, month } = parseMonthKey(key);
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Do primeiro instante do mês ao primeiro instante do mês seguinte, no fuso da empresa. */
export function monthRange(key: MonthKey, timeZone: string): { startAt: Date; endAt: Date } {
  const { year, month } = parseMonthKey(key);
  const next = parseMonthKey(shiftMonth(key, 1));
  return {
    startAt: calendarDateToUtc({ year, month, day: 1 }, 0, timeZone),
    endAt: calendarDateToUtc({ year: next.year, month: next.month, day: 1 }, 0, timeZone),
  };
}

export function monthLabel(key: MonthKey): string {
  const { year, month } = parseMonthKey(key);
  const label = new Intl.DateTimeFormat('pt-BR', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, 15)));
  return label.charAt(0).toUpperCase() + label.slice(1);
}
