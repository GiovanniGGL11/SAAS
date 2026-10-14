import { prisma } from '@/lib/db';
import { utcToMinutesSinceMidnight, type CalendarDate } from '@/lib/time';

const ROLLING_WINDOW_DAYS = 30;

function percentDelta(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return ((current - previous) / previous) * 100;
}

export { percentDelta };

export type DailyRevenue = { date: CalendarDate; label: string; revenue: number };

export type HourBucket = { hour: number; count: number };

export async function getBusiestHours(companyId: string, timezone: string): Promise<HourBucket[]> {
  const now = new Date();
  const periodStart = new Date(now.getTime() - ROLLING_WINDOW_DAYS * 86_400_000);

  const appointments = await prisma.appointment.findMany({
    where: {
      companyId,
      status: { in: ['DONE', 'CONFIRMED', 'SCHEDULED', 'IN_PROGRESS'] },
      startAt: { gte: periodStart, lte: now },
    },
    select: { startAt: true },
  });

  const counts = new Array(24).fill(0) as number[];
  for (const appointment of appointments) {
    const minutes = utcToMinutesSinceMidnight(appointment.startAt, timezone);
    const hour = Math.floor(minutes / 60) % 24;
    counts[hour] += 1;
  }

  return counts.map((count, hour) => ({ hour, count }));
}
