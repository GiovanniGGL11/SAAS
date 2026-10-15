'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarOffIcon, RepeatIcon, XIcon } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { unwrapResult } from '@/lib/action-result';
import { cn } from '@/lib/utils';
import {
  createAbsenceAction,
  createWeeklyBlockAction,
  deleteBlockAction,
  listUpcomingBlocksAction,
} from '@/server/actions/schedule-actions';

const WEEKDAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

/** Férias, folgas e bloqueios semanais do profissional: a agenda e o link online respeitam. */
export function AbsencesEditor({ professionalId }: { professionalId: string }) {
  const queryClient = useQueryClient();
  const [mode, setMode] = React.useState<'absence' | 'weekly' | null>(null);
  const [from, setFrom] = React.useState('');
  const [to, setTo] = React.useState('');
  const [reason, setReason] = React.useState('');
  const [weekday, setWeekday] = React.useState(1);
  const [startTime, setStartTime] = React.useState('12:00');
  const [endTime, setEndTime] = React.useState('13:00');
  const [weeks, setWeeks] = React.useState('8');
  const { data } = useQuery({
    queryKey: ['upcoming-blocks', professionalId],
    queryFn: () => listUpcomingBlocksAction(professionalId),
  });
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['upcoming-blocks', professionalId] });
    queryClient.invalidateQueries({ queryKey: ['appointments'] });
  };
  const reset = () => {
    setMode(null);
    setReason('');
  };

  const save = useMutation({
    mutationFn: async () => {
      if (mode === 'absence') {
        await createAbsenceAction({
          professionalId,
          from,
          to: to || from,
          reason: reason || undefined,
        }).then(unwrapResult);
        return 'Ausência registrada.';
      }
      const r = await createWeeklyBlockAction({
        professionalId,
        weekday,
        startTime,
        endTime,
        weeks: Number(weeks) || 1,
        reason: reason || undefined,
      }).then(unwrapResult);
      return r.skipped.length
        ? `${r.created} bloqueios criados. Pulados por ter cliente marcado: ${r.skipped.join(', ')}.`
        : `${r.created} bloqueios criados.`;
    },
    onSuccess: (message) => {
      toast.success(message);
      reset();
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: (input: { id: string; seriesId: string | null }) =>
      deleteBlockAction(input).then(unwrapResult),
    onSuccess: refresh,
    onError: (e: Error) => toast.error(e.message),
  });

  const dateFmt = (d: Date) =>
    new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' }).format(new Date(d));
  const timeFmt = (d: Date) =>
    new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(new Date(d));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">Ausências e bloqueios</span>
        <div className="flex gap-1.5">
          <Button
            type="button"
            size="sm"
            variant={mode === 'absence' ? 'default' : 'outline'}
            onClick={() => setMode(mode === 'absence' ? null : 'absence')}
          >
            <CalendarOffIcon className="size-3.5" />
            Férias/folga
          </Button>
          <Button
            type="button"
            size="sm"
            variant={mode === 'weekly' ? 'default' : 'outline'}
            onClick={() => setMode(mode === 'weekly' ? null : 'weekly')}
          >
            <RepeatIcon className="size-3.5" />
            Toda semana
          </Button>
        </div>
      </div>

      {mode && (
        <div className="bg-foreground/[0.03] ring-foreground/[0.06] flex flex-col gap-2 rounded-xl p-3 text-sm ring-1">
          {mode === 'absence' ? (
            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1 text-[12px]">
                De
                <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
              </label>
              <label className="flex flex-col gap-1 text-[12px]">
                Até
                <Input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
              </label>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <label className="flex flex-col gap-1 text-[12px]">
                Dia
                <select
                  value={weekday}
                  onChange={(e) => setWeekday(Number(e.target.value))}
                  className="bg-background ring-foreground/[0.08] h-9 rounded-lg px-2 ring-1"
                >
                  {WEEKDAYS.map((w, i) => (
                    <option key={w} value={i}>
                      {w}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-[12px]">
                Das
                <Input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                />
              </label>
              <label className="flex flex-col gap-1 text-[12px]">
                Às
                <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
              </label>
              <label className="flex flex-col gap-1 text-[12px]">
                Semanas
                <Input
                  type="number"
                  min={1}
                  max={26}
                  value={weeks}
                  onChange={(e) => setWeeks(e.target.value)}
                />
              </label>
            </div>
          )}
          <Input
            placeholder={
              mode === 'absence' ? 'Motivo (ex.: férias, atestado)' : 'Motivo (ex.: curso, almoço)'
            }
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={120}
          />
          <div className="flex justify-end gap-2">
            <Button type="button" size="sm" variant="ghost" onClick={reset}>
              Voltar
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={save.isPending || (mode === 'absence' && !from)}
              onClick={() => save.mutate()}
            >
              Salvar
            </Button>
          </div>
        </div>
      )}

      {data && data.length > 0 ? (
        <ul className="flex flex-col gap-1.5">
          {data.map((b) => (
            <li
              key={b.id}
              className="bg-foreground/[0.04] flex items-center gap-2 rounded-lg px-3 py-2 text-[13px]"
            >
              <span className={cn('min-w-0 flex-1', 'truncate')}>
                <span className="font-medium">{b.reason}</span>
                <span className="text-label-secondary">
                  {' · '}
                  {b.seriesId
                    ? `${WEEKDAYS[new Date(b.startAt).getDay()]}s, ${timeFmt(b.startAt)}–${timeFmt(b.endAt)} · ${b.occurrences} ${b.occurrences === 1 ? 'vez' : 'vezes'}`
                    : b.allDay
                      ? `${dateFmt(b.startAt)} a ${dateFmt(new Date(new Date(b.endAt).getTime() - 1))}`
                      : `${dateFmt(b.startAt)}, ${timeFmt(b.startAt)}–${timeFmt(b.endAt)}`}
                </span>
              </span>
              <button
                type="button"
                aria-label="Remover"
                disabled={remove.isPending}
                onClick={() => remove.mutate({ id: b.id, seriesId: b.seriesId })}
                className="text-label-secondary hover:text-foreground rounded-full p-0.5"
              >
                <XIcon className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-label-secondary text-xs">Nenhuma ausência ou bloqueio pela frente.</p>
      )}
    </div>
  );
}
