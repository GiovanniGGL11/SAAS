'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { CalendarGrid, type GridColumn } from '@/components/agenda/calendar-grid';
import { AgendaToolbar } from '@/components/agenda/agenda-toolbar';
import { CreateAppointmentDrawer } from '@/components/agenda/create-appointment-drawer';
import { AppointmentDetailDrawer } from '@/components/agenda/appointment-detail-drawer';
import { Skeleton } from '@/components/ui/skeleton';
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
import type { SerializedAppointment, SerializedService } from '@/lib/serialize';
import type { Client, Professional } from '@/generated/prisma/client';

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
  professionals: Professional[];
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
          sublabel: new Intl.DateTimeFormat('pt-BR', {
            timeZone: timezone,
            day: '2-digit',
            month: '2-digit',
          }).format(startOfCalendarDateUtc(date, timezone)),
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

      {query.isLoading ? (
        <Skeleton className="h-[600px] w-full rounded-lg" />
      ) : columns.length === 0 ? (
        <div className="text-muted-foreground flex h-40 items-center justify-center rounded-lg border text-sm">
          Nenhum profissional cadastrado.
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
