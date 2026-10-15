'use client';

import * as React from 'react';
import { CalendarDaysIcon, ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import { ptBR } from 'react-day-picker/locale';

import { cn } from '@/lib/utils';
import { addDays, type CalendarDate } from '@/lib/time';
import { MONTH_LONG, WEEKDAY_SHORT, dateKey, weekdayOf } from '@/lib/booking';
import { Calendar } from '@/components/ui/calendar';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

function sameDay(a: CalendarDate, b: CalendarDate) {
  return a.year === b.year && a.month === b.month && a.day === b.day;
}

function monthTitle(days: CalendarDate[]) {
  const first = days[0];
  const last = days[days.length - 1];
  if (first.month === last.month) return `${MONTH_LONG[first.month - 1]} de ${first.year}`;
  const short = (m: number) => MONTH_LONG[m - 1].slice(0, 3);
  return first.year === last.year
    ? `${short(first.month)} – ${short(last.month)} de ${last.year}`
    : `${short(first.month)} de ${first.year} – ${short(last.month)} de ${last.year}`;
}

/**
 * Uma semana por vez, só dias dentro da janela de agendamento (nada no passado). Setas e deslizar
 * trocam de semana; "Abrir calendário" pula para qualquer dia da janela.
 */
export function DayStrip({
  today,
  bookingDays,
  weekStart,
  onWeekChange,
  selected,
  onSelect,
  slotCounts,
}: {
  today: CalendarDate;
  /** Quantos dias, a partir de hoje, aceitam reserva. */
  bookingDays: number;
  /** Deslocamento (em dias) do primeiro dia da semana mostrada, múltiplo de 7. */
  weekStart: number;
  onWeekChange: (weekStart: number) => void;
  selected: CalendarDate | null;
  onSelect: (date: CalendarDate) => void;
  /** Horários livres por dia (AAAA-MM-DD); ausente enquanto carrega. */
  slotCounts: Record<string, number> | undefined;
}) {
  const [calendarOpen, setCalendarOpen] = React.useState(false);
  const days = Array.from({ length: 7 }, (_, i) => weekStart + i)
    .filter((offset) => offset < bookingDays)
    .map((offset) => addDays(today, offset));
  const canGoBack = weekStart > 0;
  const canGoForward = weekStart + 7 < bookingDays;
  const lastDay = addDays(today, bookingDays - 1);

  // Deslizar o dedo na faixa troca de semana (no celular, sem barra de rolagem).
  const touchStart = React.useRef<number | null>(null);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[15px] font-semibold first-letter:uppercase" aria-live="polite">
          {monthTitle(days)}
        </h3>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setCalendarOpen(true)}
            className="text-system-blue hover:bg-system-blue/[0.08] flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-medium"
          >
            <CalendarDaysIcon className="size-4" />
            <span className="hidden sm:inline">Abrir calendário</span>
            <span className="sm:hidden">Calendário</span>
          </button>
          <button
            type="button"
            onClick={() => onWeekChange(weekStart - 7)}
            disabled={!canGoBack}
            aria-label="Semana anterior"
            className="hover:bg-foreground/[0.06] flex size-9 items-center justify-center rounded-lg disabled:opacity-30"
          >
            <ChevronLeftIcon className="size-5" />
          </button>
          <button
            type="button"
            onClick={() => onWeekChange(weekStart + 7)}
            disabled={!canGoForward}
            aria-label="Próxima semana"
            className="hover:bg-foreground/[0.06] flex size-9 items-center justify-center rounded-lg disabled:opacity-30"
          >
            <ChevronRightIcon className="size-5" />
          </button>
        </div>
      </div>

      <div
        role="radiogroup"
        aria-label="Dia"
        className="grid touch-pan-y grid-cols-7 gap-1.5 sm:gap-2"
        onTouchStart={(e) => {
          touchStart.current = e.touches[0]?.clientX ?? null;
        }}
        onTouchEnd={(e) => {
          const start = touchStart.current;
          const end = e.changedTouches[0]?.clientX;
          touchStart.current = null;
          if (start === null || end === undefined) return;
          if (start - end > 50 && canGoForward) onWeekChange(weekStart + 7);
          if (end - start > 50 && canGoBack) onWeekChange(weekStart - 7);
        }}
      >
        {days.map((d) => {
          const key = dateKey(d);
          const count = slotCounts?.[key];
          const empty = count === 0;
          const isSelected = selected ? sameDay(selected, d) : false;
          const isToday = sameDay(d, today);
          return (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={isSelected}
              aria-label={`${WEEKDAY_SHORT[weekdayOf(d)]}, ${d.day} de ${MONTH_LONG[d.month - 1]}${isToday ? ', hoje' : ''}${empty ? ', sem horários livres' : ''}`}
              onClick={() => onSelect(d)}
              className={cn(
                'relative flex min-h-[68px] flex-col items-center justify-center gap-0.5 rounded-xl border text-[12px] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2',
                isSelected
                  ? 'bg-system-blue border-system-blue text-white'
                  : empty
                    ? 'border-foreground/[0.06] text-label-secondary bg-transparent'
                    : 'bg-background border-foreground/[0.1] hover:border-system-blue/50',
              )}
            >
              <span className={isSelected ? 'text-white/85' : 'text-label-secondary'}>
                {isToday ? 'Hoje' : WEEKDAY_SHORT[weekdayOf(d)]}
              </span>
              <span
                className={cn(
                  'text-[17px] leading-none font-semibold tabular-nums',
                  empty && !isSelected && 'line-through decoration-1 opacity-60',
                )}
              >
                {d.day}
              </span>
              <span
                aria-hidden
                className={cn(
                  'size-1 rounded-full',
                  count === undefined || empty
                    ? 'bg-transparent'
                    : isSelected
                      ? 'bg-white'
                      : 'bg-system-green',
                )}
              />
            </button>
          );
        })}
      </div>

      <Dialog open={calendarOpen} onOpenChange={setCalendarOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Escolha uma data</DialogTitle>
            <DialogDescription>
              Agendamentos de hoje até {lastDay.day} de {MONTH_LONG[lastDay.month - 1]}.
            </DialogDescription>
          </DialogHeader>
          <Calendar
            mode="single"
            locale={ptBR}
            className="mx-auto [--cell-size:--spacing(10)]"
            selected={
              selected ? new Date(selected.year, selected.month - 1, selected.day) : undefined
            }
            defaultMonth={new Date((selected ?? today).year, (selected ?? today).month - 1, 1)}
            startMonth={new Date(today.year, today.month - 1, 1)}
            endMonth={new Date(lastDay.year, lastDay.month - 1, 1)}
            disabled={[
              { before: new Date(today.year, today.month - 1, today.day) },
              { after: new Date(lastDay.year, lastDay.month - 1, lastDay.day) },
            ]}
            onSelect={(date) => {
              if (!date) return;
              onSelect({
                year: date.getFullYear(),
                month: date.getMonth() + 1,
                day: date.getDate(),
              });
              setCalendarOpen(false);
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
