'use client';

import { CheckIcon, PlusIcon } from 'lucide-react';
import { ptBR } from 'react-day-picker/locale';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { GoogleCalendarCard } from '@/components/agenda/google-calendar-card';
import { WaitlistCard } from '@/components/agenda/waitlist-card';
import { RemindersCard } from '@/components/agenda/reminders-card';
import { SegmentedControl } from '@/components/ui/segmented-control';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  ACTIVE_STATUS_OPTIONS,
  LEGEND_STATUSES,
  STATUS_COLORS,
  STATUS_LABELS,
} from '@/components/agenda/status';
import type { CalendarDate } from '@/lib/time';
import type { SerializedProfessional, SerializedService } from '@/lib/serialize';

const ALL = '__all__';

export type ColorMode = 'professional' | 'status';

/**
 * A coluna esquerda do Google Agenda: criar, minicalendário para pular de mês e dia, e as
 * "agendas" — aqui, os profissionais — com caixinhas na cor de cada um para mostrar ou esconder.
 */
export function AgendaSidebar({
  anchorDate,
  onDateSelect,
  onCreate,
  professionals,
  hiddenProfessionalIds,
  onToggleProfessional,
  onShowOnlyProfessional,
  colorMode,
  onColorModeChange,
  services,
  serviceFilter,
  onServiceFilterChange,
  statusFilter,
  onStatusFilterChange,
  showCreate = true,
  showGoogle = true,
  className,
}: {
  anchorDate: CalendarDate;
  onDateSelect: (date: CalendarDate) => void;
  onCreate: () => void;
  professionals: SerializedProfessional[];
  hiddenProfessionalIds: Set<string>;
  onToggleProfessional: (id: string) => void;
  onShowOnlyProfessional: (id: string) => void;
  colorMode: ColorMode;
  onColorModeChange: (mode: ColorMode) => void;
  services: SerializedService[];
  serviceFilter: string | undefined;
  onServiceFilterChange: (value: string | undefined) => void;
  statusFilter: string | undefined;
  onStatusFilterChange: (value: string | undefined) => void;
  /** The phone toolbar has its own Criar button, so the filters sheet hides this one. */
  showCreate?: boolean;
  /** On phones the Google Agenda pill sits under the toolbar, so the sheet hides the card. */
  showGoogle?: boolean;
  className?: string;
}) {
  const selected = new Date(anchorDate.year, anchorDate.month - 1, anchorDate.day);

  return (
    <aside className={cn('flex w-64 shrink-0 flex-col gap-5', className)}>
      {showCreate && (
        <Button
          onClick={onCreate}
          className="h-11 self-start rounded-2xl px-5 text-[15px] shadow-md"
        >
          <PlusIcon className="size-5" />
          Criar
        </Button>
      )}

      {/* Folhear meses no minicalendário não muda a agenda (como no Google); a key o realinha
          quando a agenda muda de mês por outro caminho. */}
      <Calendar
        key={`${anchorDate.year}-${anchorDate.month}`}
        mode="single"
        locale={ptBR}
        selected={selected}
        defaultMonth={selected}
        onSelect={(date) => {
          if (date)
            onDateSelect({
              year: date.getFullYear(),
              month: date.getMonth() + 1,
              day: date.getDate(),
            });
        }}
        className="-mx-2 bg-transparent p-0"
      />

      <section className="flex flex-col gap-1">
        <h3 className="text-label-secondary px-1 text-[12px] font-semibold uppercase">
          Profissionais
        </h3>
        {professionals.map((professional) => {
          const visible = !hiddenProfessionalIds.has(professional.id);
          return (
            <div key={professional.id} className="group flex items-center gap-1">
              <button
                type="button"
                role="checkbox"
                aria-checked={visible}
                onClick={() => onToggleProfessional(professional.id)}
                className="hover:bg-foreground/[0.05] flex flex-1 items-center gap-2.5 rounded-lg px-1 py-1.5 text-left text-[13px]"
              >
                <span
                  className="flex size-[18px] shrink-0 items-center justify-center rounded-[5px] border-2"
                  style={{
                    borderColor: professional.color,
                    backgroundColor: visible ? professional.color : 'transparent',
                  }}
                >
                  {visible && <CheckIcon className="size-3 text-white" strokeWidth={3} />}
                </span>
                <span className="truncate">{professional.name}</span>
              </button>
              <button
                type="button"
                onClick={() => onShowOnlyProfessional(professional.id)}
                className="text-label-secondary hover:text-foreground hidden shrink-0 rounded-md px-1.5 py-0.5 text-[11px] group-hover:block"
                title="Mostrar só este profissional"
              >
                Só
              </button>
            </div>
          );
        })}
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="text-label-secondary px-1 text-[12px] font-semibold uppercase">
          Colorir por
        </h3>
        <SegmentedControl
          size="sm"
          value={colorMode}
          onValueChange={onColorModeChange}
          options={[
            { value: 'professional', label: 'Profissional' },
            { value: 'status', label: 'Status' },
          ]}
        />
        {colorMode === 'status' && (
          <div className="text-label-secondary flex flex-col gap-1 px-1 pt-1 text-[12px]">
            {LEGEND_STATUSES.map((status) => (
              <span key={status} className="flex items-center gap-2">
                <span
                  className="size-2.5 rounded-full"
                  style={{ backgroundColor: STATUS_COLORS[status] }}
                />
                {STATUS_LABELS[status]}
              </span>
            ))}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="text-label-secondary px-1 text-[12px] font-semibold uppercase">Filtrar</h3>
        <Select
          value={serviceFilter ?? ALL}
          onValueChange={(v: string) => onServiceFilterChange(v === ALL ? undefined : v)}
        >
          <SelectTrigger size="sm" className="w-full text-xs">
            <SelectValue placeholder="Serviço" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos os serviços</SelectItem>
            {services.map((service) => (
              <SelectItem key={service.id} value={service.id}>
                {service.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={statusFilter ?? ALL}
          onValueChange={(v: string) => onStatusFilterChange(v === ALL ? undefined : v)}
        >
          <SelectTrigger size="sm" className="w-full text-xs">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos os status</SelectItem>
            {ACTIVE_STATUS_OPTIONS.map((status) => (
              <SelectItem key={status} value={status}>
                {STATUS_LABELS[status]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </section>

      <WaitlistCard
        anchorDate={anchorDate}
        services={services}
        professionals={professionals}
        onDateSelect={onDateSelect}
      />

      <RemindersCard />

      {showGoogle && <GoogleCalendarCard professionals={professionals} />}
    </aside>
  );
}
