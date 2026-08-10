'use client';

import { ChevronLeftIcon, ChevronRightIcon, PlusIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { STATUS_LABELS, ACTIVE_STATUS_OPTIONS } from '@/components/agenda/status';
import { type CalendarDate, formatDayMonthInTz } from '@/lib/time';
import type { Professional } from '@/generated/prisma/client';
import type { SerializedService } from '@/lib/serialize';

const ALL = '__all__';

export function AgendaToolbar({
  view,
  onViewChange,
  anchorDate,
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
  onNewAppointment,
}: {
  view: 'day' | 'week';
  onViewChange: (view: 'day' | 'week') => void;
  anchorDate: CalendarDate;
  weekEndDate: CalendarDate;
  timezone: string;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  professionals: Professional[];
  professionalFilter: string | undefined;
  onProfessionalFilterChange: (value: string | undefined) => void;
  services: SerializedService[];
  serviceFilter: string | undefined;
  onServiceFilterChange: (value: string | undefined) => void;
  statusFilter: string | undefined;
  onStatusFilterChange: (value: string | undefined) => void;
  onNewAppointment: () => void;
}) {
  const rangeLabel =
    view === 'day'
      ? formatDayMonthInTz(anchorDate, timezone)
      : `${formatDayMonthInTz(anchorDate, timezone)} – ${formatDayMonthInTz(weekEndDate, timezone)}`;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <Button variant="outline" size="icon" onClick={onPrev} aria-label="Período anterior">
          <ChevronLeftIcon className="size-4" />
        </Button>
        <Button variant="outline" size="icon" onClick={onNext} aria-label="Próximo período">
          <ChevronRightIcon className="size-4" />
        </Button>
        <Button variant="outline" size="sm" onClick={onToday}>
          Hoje
        </Button>
        <span className="ml-1 text-sm font-medium">{rangeLabel}</span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="bg-muted flex rounded-md p-0.5">
          <Button
            size="sm"
            variant={view === 'day' ? 'default' : 'ghost'}
            className="h-7"
            onClick={() => onViewChange('day')}
          >
            Dia
          </Button>
          <Button
            size="sm"
            variant={view === 'week' ? 'default' : 'ghost'}
            className="h-7"
            onClick={() => onViewChange('week')}
          >
            Semana
          </Button>
        </div>

        <Select
          value={professionalFilter ?? ALL}
          onValueChange={(v: string) => onProfessionalFilterChange(v === ALL ? undefined : v)}
        >
          <SelectTrigger className="h-8 w-40 text-xs">
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
          <SelectTrigger className="h-8 w-40 text-xs">
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
          <SelectTrigger className="h-8 w-36 text-xs">
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

        <Button size="sm" onClick={onNewAppointment}>
          <PlusIcon className="size-4" />
          Novo agendamento
        </Button>
      </div>
    </div>
  );
}
