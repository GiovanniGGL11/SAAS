'use client';

import { cn } from '@/lib/utils';
import type { GridAppointment, ScreenPoint } from '@/components/agenda/calendar-grid';
import {
  addDays,
  formatTimeInTz,
  isSameCalendarDate,
  startOfWeek,
  utcToCalendarDate,
  type CalendarDate,
} from '@/lib/time';

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MAX_CHIPS = 3;

function dateKey(date: CalendarDate): string {
  return `${date.year}-${date.month}-${date.day}`;
}

/** As 6 semanas que a visão Mês mostra: começa no domingo da semana do dia 1. */
export function monthGridRange(anchor: CalendarDate): {
  start: CalendarDate;
  days: CalendarDate[];
} {
  const start = startOfWeek({ year: anchor.year, month: anchor.month, day: 1 });
  return { start, days: Array.from({ length: 42 }, (_, i) => addDays(start, i)) };
}

/**
 * A visão Mês do Google Agenda: cada dia com os primeiros agendamentos em linha ("09:00 Carla")
 * e "+N mais". Clicar no número ou no "+N" abre o dia; clicar no agendamento abre o cartão.
 */
export function MonthView({
  anchorDate,
  today,
  appointments,
  timezone,
  colorFor,
  onDayClick,
  onAppointmentClick,
}: {
  anchorDate: CalendarDate;
  today: CalendarDate;
  appointments: GridAppointment[];
  timezone: string;
  colorFor: (appointment: GridAppointment) => string;
  onDayClick: (date: CalendarDate) => void;
  onAppointmentClick: (appointment: GridAppointment, point: ScreenPoint) => void;
}) {
  const { days } = monthGridRange(anchorDate);
  const byDay = new Map<string, GridAppointment[]>();
  for (const appointment of appointments) {
    const key = dateKey(utcToCalendarDate(appointment.startAt, timezone));
    const list = byDay.get(key) ?? [];
    list.push(appointment);
    byDay.set(key, list);
  }

  return (
    <div className="bg-background ring-foreground/[0.08] overflow-hidden rounded-[22px] ring-1">
      <div className="border-foreground/[0.06] grid grid-cols-7 border-b">
        {WEEKDAYS.map((weekday) => (
          <div
            key={weekday}
            className="text-label-secondary py-2 text-center text-[11px] font-semibold uppercase"
          >
            {weekday}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 grid-rows-6">
        {days.map((day) => {
          const list = (byDay.get(dateKey(day)) ?? []).sort(
            (a, b) => a.startAt.getTime() - b.startAt.getTime(),
          );
          const outside = day.month !== anchorDate.month;
          const isToday = isSameCalendarDate(day, today);
          return (
            <div
              key={dateKey(day)}
              className={cn(
                'border-foreground/[0.06] flex min-h-28 flex-col gap-0.5 border-r border-b p-1 [&:nth-child(7n)]:border-r-0',
                outside && 'bg-foreground/[0.02]',
              )}
            >
              <button
                type="button"
                onClick={() => onDayClick(day)}
                className={cn(
                  'hover:bg-foreground/[0.08] mx-auto flex size-7 items-center justify-center rounded-full text-[13px] font-semibold tabular-nums',
                  isToday && 'bg-system-blue hover:bg-system-blue text-white',
                  outside && !isToday && 'text-label-secondary',
                )}
                aria-label={`Abrir o dia ${day.day}`}
              >
                {day.day}
              </button>
              {list.slice(0, MAX_CHIPS).map((appointment) => (
                <button
                  key={appointment.id}
                  type="button"
                  onClick={(event) =>
                    onAppointmentClick(appointment, { x: event.clientX, y: event.clientY })
                  }
                  className={cn(
                    'hover:bg-foreground/[0.06] flex items-center gap-1.5 truncate rounded-md px-1.5 py-0.5 text-left text-[12px]',
                    (appointment.status === 'CANCELED' || appointment.status === 'NO_SHOW') &&
                      'opacity-50',
                  )}
                  title={`${formatTimeInTz(appointment.startAt, timezone)} ${appointment.client.name} · ${appointment.serviceNameSnapshot}`}
                >
                  <span
                    className="size-2 shrink-0 rounded-full"
                    style={{ backgroundColor: colorFor(appointment) }}
                  />
                  <span className="text-label-secondary tabular-nums">
                    {formatTimeInTz(appointment.startAt, timezone)}
                  </span>
                  <span className="truncate font-medium">{appointment.client.name}</span>
                </button>
              ))}
              {list.length > MAX_CHIPS && (
                <button
                  type="button"
                  onClick={() => onDayClick(day)}
                  className="text-label-secondary hover:text-foreground px-1.5 text-left text-[12px] font-medium"
                >
                  +{list.length - MAX_CHIPS} mais
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
