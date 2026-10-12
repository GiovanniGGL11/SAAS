'use client';

import * as React from 'react';
import { ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon, PlusIcon } from 'lucide-react';
import { ptBR } from 'react-day-picker/locale';

import { Button } from '@/components/ui/button';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { STATUS_LABELS, ACTIVE_STATUS_OPTIONS } from '@/components/agenda/status';
import { type CalendarDate, formatDayMonthYearInTz } from '@/lib/time';
import type { SerializedProfessional, SerializedService } from '@/lib/serialize';

const ALL = '__all__';

export function AgendaToolbar({
  view,
  onViewChange,
  anchorDate,
  weekStartDate,
  weekEndDate,
  timezone,
  onPrev,
  onNext,
  onToday,
  professionals,
  professionalFilter,
  onProfessionalFilterChange,
  services,
  serviceFilter,
  onServiceFilterChange,
  statusFilter,
  onStatusFilterChange,
  onDateSelect,
  onNewAppointment,
}: {
  view: 'day' | 'week';
  onViewChange: (view: 'day' | 'week') => void;
  anchorDate: CalendarDate;
  weekStartDate: CalendarDate;
  weekEndDate: CalendarDate;
  timezone: string;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  professionals: SerializedProfessional[];
  professionalFilter: string | undefined;
  onProfessionalFilterChange: (value: string | undefined) => void;
  services: SerializedService[];
  serviceFilter: string | undefined;
  onServiceFilterChange: (value: string | undefined) => void;
  statusFilter: string | undefined;
  onStatusFilterChange: (value: string | undefined) => void;
  /** Pular direto para um dia, sem clicar ‹ › semana a semana. */
  onDateSelect: (date: CalendarDate) => void;
  onNewAppointment: () => void;
}) {
  const rangeLabel =
    view === 'day'
      ? formatDayMonthYearInTz(anchorDate, timezone)
      : `${formatDayMonthYearInTz(weekStartDate, timezone)} – ${formatDayMonthYearInTz(weekEndDate, timezone)}`;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <div className="bg-foreground/[0.06] flex items-center rounded-full p-0.5">
          <Button variant="ghost" size="icon-sm" onClick={onPrev} aria-label="Período anterior">
            <ChevronLeftIcon className="size-4" />
          </Button>
          <Button variant="ghost" size="sm" className="px-3" onClick={onToday}>
            Hoje
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={onNext} aria-label="Próximo período">
            <ChevronRightIcon className="size-4" />
          </Button>
        </div>
        <DateJumpPicker anchorDate={anchorDate} label={rangeLabel} onSelect={onDateSelect} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <SegmentedControl
          value={view}
          onValueChange={onViewChange}
          options={[
            { value: 'day', label: 'Dia' },
            { value: 'week', label: 'Semana' },
          ]}
        />

        <Select
          value={professionalFilter ?? ALL}
          onValueChange={(v: string) => onProfessionalFilterChange(v === ALL ? undefined : v)}
        >
          <SelectTrigger size="sm" className="w-44 text-xs">
            <SelectValue placeholder="Profissional" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos profissionais</SelectItem>
            {professionals.map((professional) => (
              <SelectItem key={professional.id} value={professional.id}>
                {professional.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={serviceFilter ?? ALL}
          onValueChange={(v: string) => onServiceFilterChange(v === ALL ? undefined : v)}
        >
          <SelectTrigger size="sm" className="w-44 text-xs">
            <SelectValue placeholder="Serviço" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos serviços</SelectItem>
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
          <SelectTrigger size="sm" className="w-36 text-xs">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos status</SelectItem>
            {ACTIVE_STATUS_OPTIONS.map((status) => (
              <SelectItem key={status} value={status}>
                {STATUS_LABELS[status]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button onClick={onNewAppointment}>
          <PlusIcon className="size-4" />
          Novo agendamento
        </Button>
      </div>
    </div>
  );
}

function DateJumpPicker({
  anchorDate,
  label,
  onSelect,
}: {
  anchorDate: CalendarDate;
  label: string;
  onSelect: (date: CalendarDate) => void;
}) {
  const [open, setOpen] = React.useState(false);
  // O calendário trabalha com Date local; só dia/mês/ano atravessam — o fuso da empresa é aplicado
  // por quem consome a CalendarDate.
  const selected = new Date(anchorDate.year, anchorDate.month - 1, anchorDate.day);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          className="ml-1 gap-1 px-2 text-[17px] font-semibold tracking-[-0.01em] tabular-nums"
        >
          {label}
          <ChevronDownIcon className="text-label-secondary size-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="bg-background w-auto p-0" align="start">
        <Calendar
          mode="single"
          locale={ptBR}
          selected={selected}
          defaultMonth={selected}
          onSelect={(date) => {
            if (!date) return;
            onSelect({ year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate() });
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
