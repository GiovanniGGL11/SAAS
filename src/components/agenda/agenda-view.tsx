'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { UserRoundIcon } from 'lucide-react';

import { CalendarGrid, type GridColumn } from '@/components/agenda/calendar-grid';
import { AgendaToolbar } from '@/components/agenda/agenda-toolbar';
import { CreateAppointmentDrawer } from '@/components/agenda/create-appointment-drawer';
import { AppointmentDetailDrawer } from '@/components/agenda/appointment-detail-drawer';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import {
  getAppointmentsForRangeAction,
  moveAppointmentAction,
} from '@/server/actions/agenda-actions';
import {
  addDays,
  getTodayInTz,
  startOfCalendarDateUtc,
  startOfWeek,
  utcToCalendarDate,
  type CalendarDate,
} from '@/lib/time';
import type {
  SerializedAppointment,
  SerializedProfessional,
  SerializedService,
} from '@/lib/serialize';
import { formatCurrencyBRL } from '@/lib/serialize';
import type { Client } from '@/generated/prisma/client';

function dateKey(date: CalendarDate): string {
  return `${date.year}-${date.month}-${date.day}`;
}

export function AgendaView({
  timezone,
  professionals,
  services,
  clients,
}: {
  timezone: string;
  professionals: SerializedProfessional[];
  services: SerializedService[];
  clients: Client[];
}) {
  const queryClient = useQueryClient();
  const today = React.useMemo(() => getTodayInTz(timezone), [timezone]);

  const [view, setView] = React.useState<'day' | 'week'>('week');
  const [anchorDate, setAnchorDate] = React.useState<CalendarDate>(today);
  const [professionalFilter, setProfessionalFilter] = React.useState<string | undefined>();
  const [serviceFilter, setServiceFilter] = React.useState<string | undefined>();
  const [statusFilter, setStatusFilter] = React.useState<string | undefined>();

  const [createOpen, setCreateOpen] = React.useState(false);
  const [selectedAppointment, setSelectedAppointment] =
    React.useState<SerializedAppointment | null>(null);

  const weekStart = React.useMemo(() => startOfWeek(anchorDate), [anchorDate]);
  const rangeStart = view === 'day' ? anchorDate : weekStart;
  const rangeEndDate = view === 'day' ? addDays(anchorDate, 1) : addDays(weekStart, 7);

  const rangeStartAt = React.useMemo(
    () => startOfCalendarDateUtc(rangeStart, timezone),
    [rangeStart, timezone],
  );
  const rangeEndAt = React.useMemo(
    () => startOfCalendarDateUtc(rangeEndDate, timezone),
    [rangeEndDate, timezone],
  );

  const query = useQuery({
    queryKey: [
      'appointments',
      rangeStartAt.toISOString(),
      rangeEndAt.toISOString(),
      professionalFilter,
      serviceFilter,
      statusFilter,
    ],
    queryFn: () =>
      getAppointmentsForRangeAction({
        startAt: rangeStartAt,
        endAt: rangeEndAt,
        professionalId: professionalFilter,
        serviceId: serviceFilter,
        status: statusFilter,
      }),
  });

  const moveMutation = useMutation({
    mutationFn: (input: { id: string; startAt: Date }) => moveAppointmentAction(input),
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: ['appointments'] });
      const previous = query.data;
      queryClient.setQueryData<SerializedAppointment[]>(
        [
          'appointments',
          rangeStartAt.toISOString(),
          rangeEndAt.toISOString(),
          professionalFilter,
          serviceFilter,
          statusFilter,
        ],
        (current) =>
          current?.map((appointment) => {
            if (appointment.id !== input.id) return appointment;
            const durationMs = appointment.endAt.getTime() - appointment.startAt.getTime();
            return {
              ...appointment,
              startAt: input.startAt,
              endAt: new Date(input.startAt.getTime() + durationMs),
            };
          }),
      );
      return { previous };
    },
    onError: (error: Error, _input, context) => {
      toast.error(error.message || 'Não foi possível mover o agendamento.');
      if (context?.previous) {
        queryClient.setQueryData(
          [
            'appointments',
            rangeStartAt.toISOString(),
            rangeEndAt.toISOString(),
            professionalFilter,
            serviceFilter,
            statusFilter,
          ],
          context.previous,
        );
      }
    },
    onSuccess: () => {
      toast.success('Agendamento movido.');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
    },
  });

  const visibleProfessionals = professionalFilter
    ? professionals.filter((p) => p.id === professionalFilter)
    : professionals;

  const columns: GridColumn[] =
    view === 'day'
      ? visibleProfessionals.map((professional) => ({
          id: professional.id,
          label: professional.name,
          date: anchorDate,
          accentColor: professional.color,
        }))
      : Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)).map((date) => ({
          id: dateKey(date),
          label: new Intl.DateTimeFormat('pt-BR', { timeZone: timezone, weekday: 'short' }).format(
            startOfCalendarDateUtc(date, timezone),
          ),
          sublabel: String(date.day),
          date,
        }));

  function getColumnIdForAppointment(appointment: SerializedAppointment): string {
    if (view === 'day') return appointment.professionalId;
    return dateKey(utcToCalendarDate(appointment.startAt, timezone));
  }

  return (
    <div className="flex flex-col gap-4">
      <AgendaToolbar
        view={view}
        onViewChange={setView}
        anchorDate={anchorDate}
        weekStartDate={weekStart}
        weekEndDate={addDays(weekStart, 6)}
        timezone={timezone}
        onPrev={() => setAnchorDate((d) => addDays(d, view === 'day' ? -1 : -7))}
        onNext={() => setAnchorDate((d) => addDays(d, view === 'day' ? 1 : 7))}
        onToday={() => setAnchorDate(today)}
        professionals={professionals}
        professionalFilter={professionalFilter}
        onProfessionalFilterChange={setProfessionalFilter}
        services={services}
        serviceFilter={serviceFilter}
        onServiceFilterChange={setServiceFilter}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        onNewAppointment={() => setCreateOpen(true)}
      />

      {query.data && query.data.length > 0 && <AgendaSummary appointments={query.data} />}

      {query.isLoading ? (
        <Skeleton className="h-[600px] w-full rounded-[22px]" />
      ) : columns.length === 0 ? (
        <div className="bg-tile flex h-56 items-center justify-center rounded-[22px]">
          <EmptyState
            icon={UserRoundIcon}
            title="Nenhum profissional cadastrado"
            description="Cadastre um profissional pra começar a montar a agenda."
            className="py-0"
          />
        </div>
      ) : (
        <CalendarGrid
          columns={columns}
          appointments={query.data ?? []}
          timezone={timezone}
          allowColumnChange={view === 'week'}
          getColumnIdForAppointment={getColumnIdForAppointment}
          onAppointmentClick={setSelectedAppointment}
          onAppointmentMove={(id, startAt) => moveMutation.mutate({ id, startAt })}
        />
      )}

      <CreateAppointmentDrawer
        open={createOpen}
        onOpenChange={setCreateOpen}
        defaultStartAt={rangeStartAt}
        defaultProfessionalId={professionalFilter}
        clients={clients}
        professionals={professionals}
        services={services}
        timezone={timezone}
      />

      <AppointmentDetailDrawer
        appointment={selectedAppointment}
        open={selectedAppointment !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedAppointment(null);
        }}
        timezone={timezone}
      />
    </div>
  );
}

/** At-a-glance counts for the visible range (canceled and no-shows excluded from revenue). */
function AgendaSummary({ appointments }: { appointments: SerializedAppointment[] }) {
  const active = appointments.filter((a) => a.status !== 'CANCELED' && a.status !== 'NO_SHOW');
  const done = appointments.filter((a) => a.status === 'DONE').length;
  const expected = active.reduce((sum, a) => sum + a.priceSnapshot, 0);

  const items = [
    { label: 'Agendamentos', value: String(active.length) },
    { label: 'Concluídos', value: String(done) },
    { label: 'Previsto no período', value: formatCurrencyBRL(expected) },
  ];

  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => (
        <div
          key={item.label}
          className="bg-tile flex items-baseline gap-2 rounded-full px-4 py-1.5 text-[13px]"
        >
          <span className="text-label-secondary">{item.label}</span>
          <span className="font-semibold tabular-nums">{item.value}</span>
        </div>
      ))}
    </div>
  );
}
