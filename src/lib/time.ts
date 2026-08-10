/**
 * Timezone-aware date helpers built on Intl only (no date-fns-tz dependency).
 *
 * Appointments are always stored in UTC. The Agenda grid is built and
 * displayed in the company's timezone (Company.timezone, e.g.
 * "America/Sao_Paulo"). A `CalendarDate` (plain {year, month, day}) is used
 * to represent "which calendar day" independently of the browser's local
 * timezone, which may differ from the company's — this avoids the classic
 * bug where `new Date(y, m, d)` silently means something else on a client
 * in a different timezone than the server/company.
 */

export type CalendarDate = { year: number; month: number; day: number };

/** Offset (in minutes) of `timeZone` from UTC at the given instant. Positive east of UTC. */
export function getTimezoneOffsetMinutes(timeZone: string, at: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(at);
  const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  const asUtc = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    Number(map.hour),
    Number(map.minute),
    Number(map.second),
  );
  return (asUtc - at.getTime()) / 60_000;
}

export function getTodayInTz(timeZone: string): CalendarDate {
  return utcToCalendarDate(new Date(), timeZone);
}

export function utcToCalendarDate(instant: Date, timeZone: string): CalendarDate {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);
  const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return { year: Number(map.year), month: Number(map.month), day: Number(map.day) };
}

/** Minutes since local midnight (in `timeZone`) for the given instant. */
export function utcToMinutesSinceMidnight(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(instant);
  const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return Number(map.hour) * 60 + Number(map.minute);
}

export function addDays(date: CalendarDate, delta: number): CalendarDate {
  const next = new Date(Date.UTC(date.year, date.month - 1, date.day) + delta * 86_400_000);
  return { year: next.getUTCFullYear(), month: next.getUTCMonth() + 1, day: next.getUTCDate() };
}

/** Sunday-start week. */
export function startOfWeek(date: CalendarDate): CalendarDate {
  const weekday = new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay();
  return addDays(date, -weekday);
}

export function isSameCalendarDate(a: CalendarDate, b: CalendarDate): boolean {
  return a.year === b.year && a.month === b.month && a.day === b.day;
}

/** Converts a calendar day + minutes-since-midnight in `timeZone` to the equivalent UTC instant. */
export function calendarDateToUtc(
  date: CalendarDate,
  minutesFromMidnight: number,
  timeZone: string,
): Date {
  const utcGuess = new Date(Date.UTC(date.year, date.month - 1, date.day, 0, minutesFromMidnight));
  const offsetMinutes = getTimezoneOffsetMinutes(timeZone, utcGuess);
  return new Date(utcGuess.getTime() - offsetMinutes * 60_000);
}

export function startOfCalendarDateUtc(date: CalendarDate, timeZone: string): Date {
  return calendarDateToUtc(date, 0, timeZone);
}

export function formatTimeInTz(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(instant);
}

export function formatWeekdayShortInTz(date: CalendarDate, timeZone: string): string {
  const instant = startOfCalendarDateUtc(date, timeZone);
  return new Intl.DateTimeFormat('pt-BR', { timeZone, weekday: 'short' }).format(instant);
}

export function formatDayMonthInTz(date: CalendarDate, timeZone: string): string {
  const instant = startOfCalendarDateUtc(date, timeZone);
  return new Intl.DateTimeFormat('pt-BR', { timeZone, day: '2-digit', month: '2-digit' }).format(
    instant,
  );
}
