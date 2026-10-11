import Link from 'next/link';
import { CalendarDaysIcon, ChevronRightIcon } from 'lucide-react';

import { cn } from '@/lib/utils';
import { formatTimeInTz } from '@/lib/time';
import { STATUS_LABELS } from '@/components/agenda/status';
import type { AppointmentStatus } from '@/generated/prisma/client';

export type TodayAppointment = {
  id: string;
  startAt: Date;
  status: AppointmentStatus;
  clientName: string;
  serviceName: string;
  professionalName: string;
  professionalColor: string;
};

const MAX_ROWS = 6;

/** Today's appointments as an Apple Calendar "Up Next"-style list. */
export function TodayAgendaCard({
  appointments,
  timezone,
}: {
  appointments: TodayAppointment[];
  timezone: string;
}) {
  const now = new Date();
  const upcoming = appointments.filter((a) => a.status !== 'CANCELED' && a.status !== 'NO_SHOW');
  const nextId = upcoming.find((a) => a.startAt >= now && a.status !== 'DONE')?.id;

  return (
    <div className="bg-tile flex h-full flex-col rounded-[22px] p-5 md:p-6">
      <div className="mb-4 flex items-end justify-between gap-2">
        <div>
          <div className="text-label-secondary text-[13px] font-medium">Agenda de hoje</div>
          <div className="mt-1 text-[24px] leading-none font-semibold tracking-[-0.025em] whitespace-nowrap tabular-nums">
            {upcoming.length} {upcoming.length === 1 ? 'atendimento' : 'atendimentos'}
          </div>
        </div>
        <Link
          href="/agenda"
          className="text-system-blue flex shrink-0 items-center gap-0.5 text-[13px] font-medium whitespace-nowrap hover:underline"
        >
          Abrir agenda
          <ChevronRightIcon className="size-3.5" />
        </Link>
      </div>

      {appointments.length === 0 ? (
        <div className="text-label-secondary flex flex-1 flex-col items-center justify-center gap-2 py-6 text-center">
          <span className="bg-system-red/10 text-system-red flex size-11 items-center justify-center rounded-2xl">
            <CalendarDaysIcon className="size-5" />
          </span>
          <p className="text-foreground text-[15px] font-semibold">Dia livre por enquanto</p>
          <p className="text-[13px]">Nenhum agendamento para hoje.</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-1">
          {appointments.slice(0, MAX_ROWS).map((a) => {
            const muted = a.status === 'CANCELED' || a.status === 'NO_SHOW' || a.status === 'DONE';
            return (
              <li
                key={a.id}
                className={cn(
                  'flex items-center gap-3 rounded-xl px-2 py-2',
                  a.id === nextId && 'bg-system-blue/10',
                )}
              >
                <span className="w-11 shrink-0 text-[13px] font-semibold tabular-nums">
                  {formatTimeInTz(a.startAt, timezone)}
                </span>
                <span
                  className="h-8 w-[3px] shrink-0 rounded-full"
                  style={{ backgroundColor: a.professionalColor }}
                />
                <div className={cn('min-w-0 flex-1', muted && 'opacity-55')}>
                  <div className="truncate text-[14px] font-medium">{a.clientName}</div>
                  <div className="text-label-secondary truncate text-[12px]">
                    {a.serviceName} · {a.professionalName}
                  </div>
                </div>
                <span className="text-label-secondary shrink-0 text-[11px] font-medium">
                  {a.id === nextId ? (
                    <span className="text-system-blue">A seguir</span>
                  ) : (
                    STATUS_LABELS[a.status]
                  )}
                </span>
              </li>
            );
          })}
          {appointments.length > MAX_ROWS && (
            <li className="text-label-secondary px-2 pt-1 text-[12px]">
              + {appointments.length - MAX_ROWS} mais na agenda
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
