'use client';

import * as React from 'react';
import { CheckIcon } from 'lucide-react';

import { cn } from '@/lib/utils';
import { PERIOD_LABEL, groupSlotsByPeriod, type DayPeriod } from '@/lib/booking';

export type Slot = { startAt: string; professionalId: string; label: string };

/** Três linhas no computador (5 colunas) e quatro no celular (3 colunas) antes do "mostrar mais". */
const INITIAL_VISIBLE = 15;

/**
 * Horários do dia separados por período (manhã, tarde, noite — e madrugada só se o expediente cair
 * nela). Abre no primeiro período com horário. Escolher um horário só seleciona; quem confirma é o
 * botão da etapa seguinte.
 */
export function TimeSlots({
  dayKey,
  slots,
  selectedStartAt,
  onSelect,
}: {
  /** Muda ao trocar de dia: volta ao primeiro período e à lista curta. */
  dayKey: string;
  slots: Slot[];
  selectedStartAt: string | null;
  onSelect: (slot: Slot) => void;
}) {
  const groups = groupSlotsByPeriod(slots);
  // O período escolhido vale para o dia em que foi escolhido; noutro dia, abre no primeiro.
  const [choice, setChoice] = React.useState<{ day: string; period: DayPeriod } | null>(null);
  const [expanded, setExpanded] = React.useState<string | null>(null);
  const selectedPeriod = groups.find((g) =>
    g.slots.some((s) => s.startAt === selectedStartAt),
  )?.period;
  const active =
    groups.find((g) => choice?.day === dayKey && g.period === choice.period) ??
    groups.find((g) => g.period === selectedPeriod) ??
    groups[0];
  if (!active) return null;

  const expandKey = `${dayKey}:${active.period}`;
  const visible = expanded === expandKey ? active.slots : active.slots.slice(0, INITIAL_VISIBLE);
  const hidden = active.slots.length - visible.length;
  const tabId = (period: DayPeriod) => `periodo-${period}`;

  return (
    <div className="flex flex-col gap-3">
      {groups.length > 1 && (
        <div
          role="tablist"
          aria-label="Período do dia"
          className="bg-foreground/[0.05] grid gap-1 rounded-xl p-1"
          style={{ gridTemplateColumns: `repeat(${groups.length}, minmax(0, 1fr))` }}
        >
          {groups.map((group) => {
            const isActive = group.period === active.period;
            return (
              <button
                key={group.period}
                id={tabId(group.period)}
                type="button"
                role="tab"
                aria-selected={isActive}
                aria-controls="horarios-do-periodo"
                onClick={() => setChoice({ day: dayKey, period: group.period })}
                className={cn(
                  'flex min-h-10 flex-col items-center justify-center rounded-lg px-1 py-1 text-[13px] font-medium transition-colors sm:flex-row sm:gap-1.5',
                  isActive
                    ? 'bg-background text-foreground shadow-[0_1px_2px_rgb(0_0_0/0.08)]'
                    : 'text-label-secondary hover:text-foreground',
                )}
              >
                {PERIOD_LABEL[group.period]}
                <span className="text-label-secondary text-[12px] font-normal tabular-nums">
                  {group.slots.length}
                </span>
              </button>
            );
          })}
        </div>
      )}

      <div
        id="horarios-do-periodo"
        role={groups.length > 1 ? 'tabpanel' : undefined}
        aria-labelledby={groups.length > 1 ? tabId(active.period) : undefined}
        className="flex flex-col gap-3"
      >
        {groups.length === 1 && (
          <p className="text-label-secondary text-[13px] font-medium">
            {PERIOD_LABEL[active.period]} · {active.slots.length}{' '}
            {active.slots.length === 1 ? 'horário' : 'horários'}
          </p>
        )}
        <div className="grid grid-cols-3 gap-2 min-[400px]:grid-cols-4 sm:grid-cols-5">
          {visible.map((slot) => {
            const isSelected = slot.startAt === selectedStartAt;
            return (
              <button
                key={slot.startAt}
                type="button"
                aria-pressed={isSelected}
                aria-label={`${slot.label}${isSelected ? ', selecionado' : ''}`}
                onClick={() => onSelect(slot)}
                className={cn(
                  'flex h-11 items-center justify-center gap-1 rounded-lg border text-[15px] font-medium tabular-nums transition-colors focus-visible:outline-2 focus-visible:outline-offset-2',
                  isSelected
                    ? 'bg-system-blue border-system-blue text-white'
                    : 'bg-background border-foreground/[0.12] hover:border-system-blue hover:text-system-blue',
                )}
              >
                {isSelected && <CheckIcon className="size-4" strokeWidth={2.5} aria-hidden />}
                {slot.label}
              </button>
            );
          })}
        </div>
        {hidden > 0 && (
          <button
            type="button"
            onClick={() => setExpanded(expandKey)}
            className="text-system-blue hover:bg-system-blue/[0.06] self-start rounded-lg px-2 py-2 text-[14px] font-medium"
          >
            Mostrar mais {hidden} {hidden === 1 ? 'horário' : 'horários'}
          </button>
        )}
      </div>
    </div>
  );
}
