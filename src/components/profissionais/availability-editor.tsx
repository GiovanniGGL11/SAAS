'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { PlusIcon, XIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { unwrapResult } from '@/lib/action-result';
import {
  getProfessionalAvailabilityAction,
  setProfessionalAvailabilityAction,
} from '@/server/actions/agenda-actions';

const WEEKDAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
/** Segunda primeiro, como se lê uma semana de trabalho. */
const ORDER = [1, 2, 3, 4, 5, 6, 0];

type Interval = { startTime: string; endTime: string };
type Week = Record<number, Interval[]>;

function emptyWeek(): Week {
  return { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
}

/**
 * O expediente da semana: é o que pinta de cinza a agenda fora do horário e o que o "Próximo
 * horário livre" respeita. Até dois intervalos por dia, para o almoço caber no meio.
 */
export function AvailabilityEditor({ professionalId }: { professionalId: string }) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['availability', professionalId],
    queryFn: () => getProfessionalAvailabilityAction(professionalId),
  });

  const [week, setWeek] = React.useState<Week | null>(null);
  const loaded = query.data;
  // Inicializa uma vez com o que veio do banco; sem expediente cadastrado, sugere seg–sex 9h–18h.
  if (loaded && week === null) {
    const next = emptyWeek();
    if (loaded.length === 0) {
      for (const d of [1, 2, 3, 4, 5]) next[d] = [{ startTime: '09:00', endTime: '18:00' }];
    } else {
      for (const a of loaded) next[a.weekday].push({ startTime: a.startTime, endTime: a.endTime });
    }
    setWeek(next);
  }

  const save = useMutation({
    mutationFn: async () =>
      unwrapResult(
        await setProfessionalAvailabilityAction({
          professionalId,
          availabilities: Object.entries(week ?? {}).flatMap(([weekday, intervals]) =>
            intervals.map((i) => ({ weekday: Number(weekday), ...i })),
          ),
        }),
      ),
    onSuccess: () => {
      toast.success('Expediente salvo.');
      queryClient.invalidateQueries({ queryKey: ['availability', professionalId] });
      queryClient.invalidateQueries({ queryKey: ['schedule-context'] });
    },
    onError: (error: Error) =>
      toast.error(error.message || 'Não foi possível salvar o expediente.'),
  });

  if (!week) return <Skeleton className="h-64 w-full rounded-2xl" />;

  const update = (weekday: number, intervals: Interval[]) =>
    setWeek({ ...week, [weekday]: intervals });
  const invalid = Object.values(week).some((intervals) =>
    intervals.some((i) => i.endTime <= i.startTime),
  );

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="text-[15px] font-semibold">Expediente</h3>
          <p className="text-label-secondary text-xs">Fora destes horários a agenda fica cinza.</p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            const monday = week[1];
            setWeek({ ...week, 2: [...monday], 3: [...monday], 4: [...monday], 5: [...monday] });
          }}
        >
          Copiar segunda para ter–sex
        </Button>
      </div>

      <div className="ring-foreground/[0.06] divide-foreground/[0.06] flex flex-col divide-y rounded-2xl ring-1">
        {ORDER.map((weekday) => {
          const intervals = week[weekday];
          const works = intervals.length > 0;
          return (
            <div key={weekday} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
              <div className="flex w-32 items-center gap-2.5">
                <Switch
                  checked={works}
                  onCheckedChange={(on: boolean) =>
                    update(weekday, on ? [{ startTime: '09:00', endTime: '18:00' }] : [])
                  }
                  aria-label={`Trabalha ${WEEKDAYS[weekday].toLowerCase()}`}
                />
                <span className="text-[13px] font-medium">{WEEKDAYS[weekday]}</span>
              </div>
              {!works ? (
                <span className="text-label-secondary text-[13px]">Folga</span>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  {intervals.map((interval, index) => (
                    <div key={index} className="flex items-center gap-1.5">
                      {index > 0 && <span className="text-label-secondary text-xs">e</span>}
                      <Input
                        type="time"
                        className="h-8 w-[104px]"
                        value={interval.startTime}
                        onChange={(e) =>
                          update(
                            weekday,
                            intervals.map((i, j) =>
                              j === index ? { ...i, startTime: e.target.value } : i,
                            ),
                          )
                        }
                      />
                      <span className="text-label-secondary text-xs">às</span>
                      <Input
                        type="time"
                        className="h-8 w-[104px]"
                        value={interval.endTime}
                        onChange={(e) =>
                          update(
                            weekday,
                            intervals.map((i, j) =>
                              j === index ? { ...i, endTime: e.target.value } : i,
                            ),
                          )
                        }
                      />
                      {index > 0 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label="Remover intervalo"
                          onClick={() =>
                            update(
                              weekday,
                              intervals.filter((_, j) => j !== index),
                            )
                          }
                        >
                          <XIcon className="size-3.5" />
                        </Button>
                      )}
                    </div>
                  ))}
                  {intervals.length < 2 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 text-xs"
                      // Divide o dia em dois para o almoço: 09–12 e 13–18.
                      onClick={() =>
                        update(weekday, [
                          { startTime: intervals[0].startTime, endTime: '12:00' },
                          { startTime: '13:00', endTime: intervals[0].endTime },
                        ])
                      }
                    >
                      <PlusIcon className="size-3.5" />
                      Intervalo de almoço
                    </Button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {invalid && (
        <p className="text-destructive text-xs">Em algum dia o fim está antes do início.</p>
      )}
      <Button
        type="button"
        variant="outline"
        className="self-start"
        disabled={invalid || save.isPending}
        onClick={() => save.mutate()}
      >
        {save.isPending ? 'Salvando...' : 'Salvar expediente'}
      </Button>
    </section>
  );
}
