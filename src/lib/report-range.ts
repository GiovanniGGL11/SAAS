import { addDays, calendarDateToUtc, getTodayInTz } from '@/lib/time';
import type { ReportPreset } from '@/lib/validations/report';

export function resolveReportRange(
  preset: ReportPreset,
  timezone: string,
): { startAt: Date; endAt: Date } {
  const today = getTodayInTz(timezone);
  const endAt = new Date();

  switch (preset) {
    case 'last7':
      return { startAt: calendarDateToUtc(addDays(today, -6), 0, timezone), endAt };
    case 'last30':
      return { startAt: calendarDateToUtc(addDays(today, -29), 0, timezone), endAt };
    case 'last90':
      return { startAt: calendarDateToUtc(addDays(today, -89), 0, timezone), endAt };
    case 'thisMonth': {
      const startOfMonth = { year: today.year, month: today.month, day: 1 };
      return { startAt: calendarDateToUtc(startOfMonth, 0, timezone), endAt };
    }
    case 'lastMonth': {
      const firstOfThisMonth = { year: today.year, month: today.month, day: 1 };
      const lastDayOfPrevMonth = addDays(firstOfThisMonth, -1);
      const firstOfPrevMonth = {
        year: lastDayOfPrevMonth.year,
        month: lastDayOfPrevMonth.month,
        day: 1,
      };
      return {
        startAt: calendarDateToUtc(firstOfPrevMonth, 0, timezone),
        endAt: calendarDateToUtc(firstOfThisMonth, 0, timezone),
      };
    }
  }
}
