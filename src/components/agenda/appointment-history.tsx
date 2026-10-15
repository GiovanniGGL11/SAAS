'use client';

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDownIcon, Loader2Icon } from 'lucide-react';

import { cn } from '@/lib/utils';
import { getAppointmentHistoryAction } from '@/server/actions/history-actions';

/** "Quem mexeu neste horário?": abre sob demanda, para não pesar o painel do agendamento. */
export function AppointmentHistory({
  appointmentId,
  timezone,
}: {
  appointmentId: string;
  timezone: string;
}) {
  const [open, setOpen] = React.useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ['appointment-history', appointmentId],
    queryFn: () => getAppointmentHistoryAction(appointmentId),
    enabled: open,
  });
  const when = new Intl.DateTimeFormat('pt-BR', {
    timeZone: timezone,
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="text-muted-foreground hover:text-foreground flex items-center gap-1 self-start text-xs"
      >
        Histórico deste agendamento
        <ChevronDownIcon className={cn('size-3.5 transition-transform', open && 'rotate-180')} />
      </button>
      {open &&
        (isLoading ? (
          <div className="text-muted-foreground flex items-center gap-2 text-xs">
            <Loader2Icon className="size-3.5 animate-spin" /> Carregando…
          </div>
        ) : !data?.length ? (
          <p className="text-muted-foreground text-xs">Nenhuma alteração registrada.</p>
        ) : (
          <ol className="border-foreground/[0.08] flex flex-col gap-2.5 border-l pl-3">
            {data.map((entry) => (
              <li key={entry.id} className="text-[13px]">
                <div className="font-medium">{entry.title}</div>
                {entry.detail && <div className="text-muted-foreground">{entry.detail}</div>}
                <div className="text-muted-foreground text-[12px]">
                  {when.format(new Date(entry.createdAt))} · {entry.actor}
                </div>
              </li>
            ))}
          </ol>
        ))}
    </div>
  );
}
