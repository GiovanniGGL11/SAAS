'use client';

import {
  ChevronLeftIcon,
  ChevronRightIcon,
  KeyboardIcon,
  PlusIcon,
  SlidersHorizontalIcon,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { addDays, type CalendarDate } from '@/lib/time';

export type AgendaViewMode = 'day' | 'week' | 'month';

const MONTHS = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
];

const WEEKDAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

/** Título do período como no Google Agenda: "outubro de 2026", ou "out – nov de 2026" na virada. */
function periodTitle(
  view: AgendaViewMode,
  anchorDate: CalendarDate,
  weekStartDate: CalendarDate,
): string {
  if (view === 'day') {
    const weekday =
      WEEKDAYS[
        new Date(Date.UTC(anchorDate.year, anchorDate.month - 1, anchorDate.day)).getUTCDay()
      ];
    return `${weekday}, ${anchorDate.day} de ${MONTHS[anchorDate.month - 1]} de ${anchorDate.year}`;
  }
  if (view === 'month') return `${MONTHS[anchorDate.month - 1]} de ${anchorDate.year}`;
  const end = addDays(weekStartDate, 6);
  if (end.month === weekStartDate.month)
    return `${MONTHS[weekStartDate.month - 1]} de ${weekStartDate.year}`;
  const short = (m: number) => MONTHS[m - 1].slice(0, 3);
  return end.year === weekStartDate.year
    ? `${short(weekStartDate.month)} – ${short(end.month)} de ${end.year}`
    : `${short(weekStartDate.month)} de ${weekStartDate.year} – ${short(end.month)} de ${end.year}`;
}

/** O topo do Google Agenda: Hoje, ‹ ›, o período por extenso e a troca de visão à direita. */
export function AgendaToolbar({
  view,
  onViewChange,
  anchorDate,
  weekStartDate,
  onPrev,
  onNext,
  onToday,
  onCreate,
  onOpenFilters,
  activeFilterCount,
  onShowShortcuts,
}: {
  view: AgendaViewMode;
  onViewChange: (view: AgendaViewMode) => void;
  anchorDate: CalendarDate;
  weekStartDate: CalendarDate;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  /** Só aparece no celular, onde a coluna com o botão "Criar" fica escondida. */
  onCreate: () => void;
  /** Below lg the filters column is hidden; this opens it as a sheet. */
  onOpenFilters: () => void;
  activeFilterCount: number;
  onShowShortcuts: () => void;
}) {
  const label = { day: 'dia', week: 'semana', month: 'mês' }[view];
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          className="rounded-full px-4"
          onClick={onToday}
          title="Hoje (T)"
        >
          Hoje
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onPrev}
          aria-label={`${label} anterior`}
          title="Anterior (←)"
        >
          <ChevronLeftIcon className="size-5" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onNext}
          aria-label={`Próximo ${label}`}
          title="Próximo (→)"
        >
          <ChevronRightIcon className="size-5" />
        </Button>
        <h2 className="ml-1 text-[18px] font-semibold tracking-[-0.02em] first-letter:uppercase sm:text-[22px]">
          {periodTitle(view, anchorDate, weekStartDate)}
        </h2>
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon-sm"
          className="hidden lg:inline-flex"
          onClick={onShowShortcuts}
          aria-label="Atalhos de teclado"
          title="Atalhos de teclado (?)"
        >
          <KeyboardIcon className="size-4" />
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="relative lg:hidden"
          onClick={onOpenFilters}
          aria-label="Calendário e filtros"
        >
          <SlidersHorizontalIcon className="size-4" />
          <span className="hidden sm:inline">Filtros</span>
          {activeFilterCount > 0 && (
            <span className="bg-system-blue absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full text-[10px] font-semibold text-white">
              {activeFilterCount}
            </span>
          )}
        </Button>
        <Button size="sm" className="lg:hidden" onClick={onCreate}>
          <PlusIcon className="size-4" />
          Criar
        </Button>
        <SegmentedControl
          value={view}
          onValueChange={onViewChange}
          options={[
            { value: 'day', label: 'Dia' },
            { value: 'week', label: 'Semana' },
            { value: 'month', label: 'Mês' },
          ]}
        />
      </div>
    </div>
  );
}
