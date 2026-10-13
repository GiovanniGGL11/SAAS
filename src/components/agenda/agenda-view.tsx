'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { EyeIcon, Trash2Icon, UserRoundIcon } from 'lucide-react';

import {
  CalendarGrid,
  type GridAppointment,
  type GridBlock,
  type GridColumn,
  type MinuteRange,
  type ScreenPoint,
} from '@/components/agenda/calendar-grid';
import { AgendaToolbar, type AgendaViewMode } from '@/components/agenda/agenda-toolbar';
import { AgendaSidebar, type ColorMode } from '@/components/agenda/agenda-sidebar';
import { MonthView, monthGridRange } from '@/components/agenda/month-view';
import { AppointmentCard } from '@/components/agenda/appointment-card';
import { QuickCreateCard, type QuickCreateDefaults } from '@/components/agenda/quick-create-card';
import { CreateAppointmentDrawer } from '@/components/agenda/create-appointment-drawer';
import { AppointmentDetailDrawer } from '@/components/agenda/appointment-detail-drawer';
import {
  FloatingMenu,
  FloatingPanel,
  type FloatingMenuItem,
} from '@/components/agenda/floating-menu';
import { STATUS_COLORS, STATUS_LABELS, quickStatusActions } from '@/components/agenda/status';
import { Skeleton } from '@/components/ui/skeleton';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { EmptyState } from '@/components/ui/empty-state';
import { unwrapResult } from '@/lib/action-result';
import {
  deleteScheduleBlockAction,
  getAppointmentsForRangeAction,
  getScheduleContextAction,
  moveAppointmentAction,
  updateAppointmentStatusAction,
} from '@/server/actions/agenda-actions';
import {
  addDays,
  calendarDateToUtc,
  getTodayInTz,
  startOfCalendarDateUtc,
  startOfWeek,
  utcToCalendarDate,
  utcToMinutesSinceMidnight,
  type CalendarDate,
} from '@/lib/time';
import type { SerializedProfessional, SerializedService } from '@/lib/serialize';
import { formatCurrencyBRL } from '@/lib/serialize';
import type { AppointmentStatus, Client } from '@/generated/prisma/client';

function dateKey(date: CalendarDate): string {
  return `${date.year}-${date.month}-${date.day}`;
}

function weekdayOf(date: CalendarDate): number {
  return new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay();
}

function timeToMinutes(value: string): number {
  const [h, m] = value.split(':').map(Number);
  return h * 60 + (m || 0);
}

// ---- Preferências lembradas no navegador ---------------------------------------------------------
// Lidas com useSyncExternalStore: no servidor (e na hidratação) vale o padrão, sem divergir do HTML.

const PREFS_EVENT = 'agenda:prefs-change';
// Quando o navegador bloqueia o localStorage, a preferência vale ao menos durante a visita.
const prefsWithoutStorage = new Map<string, string>();

function readPref(key: string): string | null {
  if (prefsWithoutStorage.has(key)) return prefsWithoutStorage.get(key)!;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writePref(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    prefsWithoutStorage.set(key, value);
  }
  window.dispatchEvent(new Event(PREFS_EVENT));
}

function subscribePrefs(onChange: () => void) {
  window.addEventListener(PREFS_EVENT, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(PREFS_EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
}

function usePref(key: string, fallback: string): string {
  return React.useSyncExternalStore(
    subscribePrefs,
    () => readPref(key) ?? fallback,
    () => fallback,
  );
}

const VIEW_KEY = 'agenda:view';
const COLOR_KEY = 'agenda:color-mode';
const HIDDEN_KEY = 'agenda:hidden-professionals';

const SLOT_MINUTES = 15;
const OPENING_MINUTES = 9 * 60;
const CLOSING_MINUTES = 21 * 60;
/** Grade padrão de quem ainda não cadastrou expediente. */
const DEFAULT_START_HOUR = 7;
const DEFAULT_END_HOUR = 21;

type Panel =
  | { kind: 'quick-create'; point: ScreenPoint; defaults: QuickCreateDefaults }
  | { kind: 'appointment'; point: ScreenPoint; appointmentId: string }
  | { kind: 'appointment-menu'; point: ScreenPoint; appointment: GridAppointment }
  | { kind: 'block-menu'; point: ScreenPoint; block: GridBlock };

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

  // Dia, com uma coluna por profissional, é como salão e barbearia olham a agenda no balcão.
  const savedView = usePref(VIEW_KEY, 'day');
  const view: AgendaViewMode = savedView === 'week' || savedView === 'month' ? savedView : 'day';
  const setView = React.useCallback((next: AgendaViewMode) => writePref(VIEW_KEY, next), []);

  const colorMode: ColorMode =
    usePref(COLOR_KEY, 'professional') === 'status' ? 'status' : 'professional';
  const setColorMode = React.useCallback((next: ColorMode) => writePref(COLOR_KEY, next), []);

  const hiddenRaw = usePref(HIDDEN_KEY, '');
  const hiddenProfessionalIds = React.useMemo(
    () => new Set(hiddenRaw.split(',').filter(Boolean)),
    [hiddenRaw],
  );
  const setHidden = (ids: Set<string>) => writePref(HIDDEN_KEY, [...ids].join(','));

  const [anchorDate, setAnchorDate] = React.useState<CalendarDate>(today);
  const [serviceFilter, setServiceFilter] = React.useState<string | undefined>();
  const [statusFilter, setStatusFilter] = React.useState<string | undefined>();

  const [panel, setPanel] = React.useState<Panel | null>(null);
  const [filtersOpen, setFiltersOpen] = React.useState(false);
  const closePanel = React.useCallback(() => setPanel(null), []);
  const [createDefaults, setCreateDefaults] = React.useState<QuickCreateDefaults | null>(null);
  // Guarda o id, não o objeto: depois de "Confirmar" o painel mostra o status novo, não uma cópia velha.
  const [detailId, setDetailId] = React.useState<string | null>(null);

  const weekStart = React.useMemo(() => startOfWeek(anchorDate), [anchorDate]);
  const monthGrid = React.useMemo(() => monthGridRange(anchorDate), [anchorDate]);
  const rangeStart = view === 'day' ? anchorDate : view === 'week' ? weekStart : monthGrid.start;
  const rangeEndDate =
    view === 'day'
      ? addDays(anchorDate, 1)
      : view === 'week'
        ? addDays(weekStart, 7)
        : addDays(monthGrid.start, 42);

  const rangeStartAt = React.useMemo(
    () => startOfCalendarDateUtc(rangeStart, timezone),
    [rangeStart, timezone],
  );
  const rangeEndAt = React.useMemo(
    () => startOfCalendarDateUtc(rangeEndDate, timezone),
    [rangeEndDate, timezone],
  );

  const appointmentsKey = [
    'appointments',
    rangeStartAt.toISOString(),
    rangeEndAt.toISOString(),
    serviceFilter,
    statusFilter,
  ];

  const query = useQuery({
    queryKey: appointmentsKey,
    queryFn: () =>
      getAppointmentsForRangeAction({
        startAt: rangeStartAt,
        endAt: rangeEndAt,
        serviceId: serviceFilter,
        status: statusFilter,
      }),
  });

  const contextQuery = useQuery({
    queryKey: ['schedule-context', rangeStartAt.toISOString(), rangeEndAt.toISOString()],
    queryFn: () => getScheduleContextAction({ startAt: rangeStartAt, endAt: rangeEndAt }),
  });

  const visibleProfessionals = professionals.filter((p) => !hiddenProfessionalIds.has(p.id));
  const visibleIds = new Set(visibleProfessionals.map((p) => p.id));
  const appointments = (query.data ?? []).filter((a) => visibleIds.has(a.professionalId));

  const colorFor = React.useCallback(
    (appointment: GridAppointment) =>
      colorMode === 'status' ? STATUS_COLORS[appointment.status] : appointment.professional.color,
    [colorMode],
  );

  const moveMutation = useMutation({
    mutationFn: (input: { id: string; startAt: Date; professionalId?: string }) =>
      moveAppointmentAction(input).then(unwrapResult),
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: ['appointments'] });
      const previous = query.data;
      queryClient.setQueryData<GridAppointment[]>(appointmentsKey, (current) =>
        current?.map((appointment) => {
          if (appointment.id !== input.id) return appointment;
          const durationMs = appointment.endAt.getTime() - appointment.startAt.getTime();
          const target = input.professionalId
            ? professionals.find((p) => p.id === input.professionalId)
            : undefined;
          return {
            ...appointment,
            startAt: input.startAt,
            endAt: new Date(input.startAt.getTime() + durationMs),
            ...(target
              ? {
                  professionalId: target.id,
                  professional: { id: target.id, name: target.name, color: target.color },
                }
              : {}),
          };
        }),
      );
      return { previous };
    },
    onError: (error: Error, _input, context) => {
      toast.error(error.message || 'Não foi possível mover o agendamento.');
      if (context?.previous) queryClient.setQueryData(appointmentsKey, context.previous);
    },
    onSuccess: () => toast.success('Agendamento movido.'),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['appointments'] }),
  });

  const statusMutation = useMutation({
    mutationFn: (input: { id: string; status: Exclude<AppointmentStatus, 'CANCELED'> }) =>
      updateAppointmentStatusAction(input).then(unwrapResult),
    onSuccess: (_data, input) => {
      toast.success(`Status: ${STATUS_LABELS[input.status]}.`);
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
    },
    onError: (error: Error) => toast.error(error.message || 'Não foi possível atualizar o status.'),
  });

  const deleteBlockMutation = useMutation({
    mutationFn: (id: string) => deleteScheduleBlockAction({ id }).then(unwrapResult),
    onSuccess: () => {
      toast.success('Bloqueio removido.');
      queryClient.invalidateQueries({ queryKey: ['schedule-context'] });
    },
    onError: (error: Error) => toast.error(error.message || 'Não foi possível remover o bloqueio.'),
  });

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
          label: new Intl.DateTimeFormat('pt-BR', { timeZone: timezone, weekday: 'short' })
            .format(startOfCalendarDateUtc(date, timezone))
            .replace('.', ''),
          sublabel: String(date.day),
          date,
        }));

  // ---- Expediente em cinza ------------------------------------------------------------------
  const availabilityByProfessional = new Map<string, { weekday: number; range: MinuteRange }[]>();
  for (const a of contextQuery.data?.availabilities ?? []) {
    const list = availabilityByProfessional.get(a.professionalId) ?? [];
    list.push({
      weekday: a.weekday,
      range: { startMinutes: timeToMinutes(a.startTime), endMinutes: timeToMinutes(a.endTime) },
    });
    availabilityByProfessional.set(a.professionalId, list);
  }

  const openRangesByColumn = new Map<string, MinuteRange[]>();
  for (const column of columns) {
    const weekday = weekdayOf(column.date);
    // Na visão Dia a coluna é um profissional; na Semana, vale quem estiver visível.
    const owners = view === 'day' ? [column.id] : visibleProfessionals.map((p) => p.id);
    const withSchedule = owners.filter((id) => availabilityByProfessional.has(id));
    // Ninguém com expediente cadastrado: nada fica cinza (o salão ainda não configurou).
    if (withSchedule.length === 0) continue;
    openRangesByColumn.set(
      column.id,
      withSchedule.flatMap((id) =>
        (availabilityByProfessional.get(id) ?? [])
          .filter((a) => a.weekday === weekday)
          .map((a) => a.range),
      ),
    );
  }

  // ---- Bloqueios, recortados ao dia de cada coluna --------------------------------------------
  const blocksByColumn = new Map<string, GridBlock[]>();
  for (const block of contextQuery.data?.blocks ?? []) {
    if (!visibleIds.has(block.professionalId)) continue;
    const professional = professionals.find((p) => p.id === block.professionalId);
    for (const column of columns) {
      if (view === 'day' && column.id !== block.professionalId) continue;
      const dayStart = startOfCalendarDateUtc(column.date, timezone);
      const dayEnd = startOfCalendarDateUtc(addDays(column.date, 1), timezone);
      if (block.startAt >= dayEnd || block.endAt <= dayStart) continue;
      const list = blocksByColumn.get(column.id) ?? [];
      list.push({
        id: block.id,
        reason: block.reason,
        startAt: block.startAt < dayStart ? dayStart : block.startAt,
        endAt: block.endAt > dayEnd ? dayEnd : block.endAt,
        professionalName: view === 'week' ? professional?.name : undefined,
      });
      blocksByColumn.set(column.id, list);
    }
  }

  // ---- Faixa de horas: do primeiro início ao último fim de expediente, sem esconder agendamento --
  const openRanges = [...openRangesByColumn.values()].flat();
  let startHour = openRanges.length
    ? Math.floor(Math.min(...openRanges.map((r) => r.startMinutes)) / 60)
    : DEFAULT_START_HOUR;
  let endHour = openRanges.length
    ? Math.ceil(Math.max(...openRanges.map((r) => r.endMinutes)) / 60)
    : DEFAULT_END_HOUR;
  for (const appointment of appointments) {
    startHour = Math.min(
      startHour,
      Math.floor(utcToMinutesSinceMidnight(appointment.startAt, timezone) / 60),
    );
    const endMinutes = utcToMinutesSinceMidnight(appointment.endAt, timezone);
    endHour = Math.max(endHour, endMinutes === 0 ? 24 : Math.ceil(endMinutes / 60));
  }
  startHour = Math.max(0, startHour);
  endHour = Math.min(24, Math.max(endHour, startHour + 1));

  function getColumnIdForAppointment(appointment: GridAppointment): string {
    if (view === 'day') return appointment.professionalId;
    return dateKey(utcToCalendarDate(appointment.startAt, timezone));
  }

  /**
   * Horário sugerido pelo "Criar": o próximo slot de hoje quando o período visível é hoje; senão
   * 09:00 do dia visível.
   */
  function suggestedStartAt(): Date {
    const showingToday = view === 'day' ? dateKey(anchorDate) === dateKey(today) : true;
    if (showingToday) {
      const nowMinutes = utcToMinutesSinceMidnight(new Date(), timezone);
      const next = Math.ceil(nowMinutes / SLOT_MINUTES) * SLOT_MINUTES;
      if (next >= OPENING_MINUTES && next < CLOSING_MINUTES)
        return calendarDateToUtc(today, next, timezone);
    }
    return calendarDateToUtc(view === 'day' ? anchorDate : today, OPENING_MINUTES, timezone);
  }

  function openFullCreate(defaults: QuickCreateDefaults) {
    setPanel(null);
    setCreateDefaults(defaults);
  }

  function navigate(direction: -1 | 1) {
    setPanel(null);
    setAnchorDate((d) => {
      if (view === 'day') return addDays(d, direction);
      if (view === 'week') return addDays(d, 7 * direction);
      const month = d.month + direction;
      return {
        year: d.year + Math.floor((month - 1) / 12),
        month: ((month - 1 + 12) % 12) + 1,
        day: 1,
      };
    });
  }

  // Atalhos do Google Agenda: T hoje, D/W/M visão, ←/→ (ou J/K) navegam, C cria.
  const shortcuts = React.useRef<(event: KeyboardEvent) => void>(() => {});
  React.useEffect(() => {
    shortcuts.current = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement;
      if (
        target.closest(
          'input, textarea, select, [contenteditable="true"], [role="dialog"], [role="listbox"]',
        )
      )
        return;
      const key = event.key?.toLowerCase();
      if (key === 't') setAnchorDate(today);
      else if (key === 'd') setView('day');
      else if (key === 'w' || key === 's') setView('week');
      else if (key === 'm') setView('month');
      else if (key === 'arrowleft' || key === 'k') navigate(-1);
      else if (key === 'arrowright' || key === 'j') navigate(1);
      else if (key === 'c') openFullCreate({ startAt: suggestedStartAt() });
      else return;
      event.preventDefault();
    };
  });
  React.useEffect(() => {
    const handler = (event: KeyboardEvent) => shortcuts.current(event);
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const panelAppointment =
    panel?.kind === 'appointment'
      ? (query.data?.find((a) => a.id === panel.appointmentId) ?? null)
      : null;
  const detailAppointment = detailId ? (query.data?.find((a) => a.id === detailId) ?? null) : null;

  const appointmentMenuItems: FloatingMenuItem[] =
    panel?.kind === 'appointment-menu'
      ? [
          ...quickStatusActions(panel.appointment.status).map((action) => ({
            label: action.label,
            icon: (
              <span
                className="size-2.5 rounded-full"
                style={{ backgroundColor: STATUS_COLORS[action.status] }}
                aria-hidden
              />
            ),
            onSelect: () =>
              statusMutation.mutate({ id: panel.appointment.id, status: action.status }),
          })),
          {
            label: 'Mais detalhes',
            icon: <EyeIcon className="size-4" />,
            onSelect: () => setDetailId(panel.appointment.id),
          },
        ]
      : [];

  const blockMenuItems: FloatingMenuItem[] =
    panel?.kind === 'block-menu'
      ? [
          {
            label: 'Remover bloqueio',
            icon: <Trash2Icon className="size-4" />,
            destructive: true,
            onSelect: () => deleteBlockMutation.mutate(panel.block.id),
          },
        ]
      : [];

  const openAppointmentCard = (appointment: GridAppointment, point: ScreenPoint) =>
    setPanel({ kind: 'appointment', point, appointmentId: appointment.id });

  const sidebarProps = {
    anchorDate,
    onDateSelect: (date: CalendarDate) => {
      setPanel(null);
      setFiltersOpen(false);
      setAnchorDate(date);
    },
    onCreate: () => openFullCreate({ startAt: suggestedStartAt() }),
    professionals,
    hiddenProfessionalIds,
    onToggleProfessional: (id: string) => {
      const next = new Set(hiddenProfessionalIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      setHidden(next);
    },
    onShowOnlyProfessional: (id: string) =>
      setHidden(new Set(professionals.filter((p) => p.id !== id).map((p) => p.id))),
    colorMode,
    onColorModeChange: setColorMode,
    services,
    serviceFilter,
    onServiceFilterChange: setServiceFilter,
    statusFilter,
    onStatusFilterChange: setStatusFilter,
  };
  const activeFilterCount =
    (serviceFilter ? 1 : 0) + (statusFilter ? 1 : 0) + (hiddenProfessionalIds.size > 0 ? 1 : 0);

  return (
    <div className="flex gap-6">
      <div className="hidden lg:block">
        <AgendaSidebar {...sidebarProps} />
      </div>

      {/* Below lg the sidebar column is hidden; the same calendar and filters open as a sheet. */}
      <Drawer direction="bottom" open={filtersOpen} onOpenChange={setFiltersOpen}>
        <DrawerContent className="font-apple">
          <DrawerHeader className="text-left">
            <DrawerTitle>Calendário e filtros</DrawerTitle>
          </DrawerHeader>
          <div className="overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom)+1.5rem)]">
            <AgendaSidebar {...sidebarProps} showCreate={false} className="w-full" />
          </div>
        </DrawerContent>
      </Drawer>

      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <AgendaToolbar
          view={view}
          onViewChange={(next) => {
            setPanel(null);
            setView(next);
          }}
          anchorDate={anchorDate}
          weekStartDate={weekStart}
          onPrev={() => navigate(-1)}
          onNext={() => navigate(1)}
          onToday={() => {
            setPanel(null);
            setAnchorDate(today);
          }}
          onCreate={() => openFullCreate({ startAt: suggestedStartAt() })}
          onOpenFilters={() => setFiltersOpen(true)}
          activeFilterCount={activeFilterCount}
        />

        {appointments.length > 0 && <AgendaSummary appointments={appointments} />}

        {query.isLoading ? (
          <Skeleton className="h-[600px] w-full rounded-[22px]" />
        ) : view === 'month' ? (
          <MonthView
            anchorDate={anchorDate}
            today={today}
            appointments={appointments}
            timezone={timezone}
            colorFor={colorFor}
            onDayClick={(date) => {
              setAnchorDate(date);
              setView('day');
            }}
            onAppointmentClick={openAppointmentCard}
          />
        ) : columns.length === 0 ? (
          <div className="bg-tile flex h-56 items-center justify-center rounded-[22px]">
            <EmptyState
              icon={UserRoundIcon}
              title={
                professionals.length
                  ? 'Nenhum profissional visível'
                  : 'Nenhum profissional cadastrado'
              }
              description={
                professionals.length
                  ? 'Marque ao menos um profissional na coluna da esquerda.'
                  : 'Cadastre um profissional pra começar a montar a agenda.'
              }
              className="py-0"
            />
          </div>
        ) : (
          <CalendarGrid
            columns={columns}
            appointments={appointments}
            timezone={timezone}
            startHour={startHour}
            endHour={endHour}
            openRangesByColumn={openRangesByColumn}
            blocksByColumn={blocksByColumn}
            colorFor={colorFor}
            colorMode={colorMode}
            getColumnIdForAppointment={getColumnIdForAppointment}
            onAppointmentClick={openAppointmentCard}
            onAppointmentContextMenu={(appointment, point) =>
              setPanel({ kind: 'appointment-menu', point, appointment })
            }
            onAppointmentMove={(id, startAt, targetColumn) =>
              // Na visão Dia cada coluna é um profissional: soltar em outra coluna troca quem atende.
              moveMutation.mutate({
                id,
                startAt,
                professionalId: view === 'day' ? targetColumn.id : undefined,
              })
            }
            onSlotClick={(column, startAt, point) =>
              setPanel({
                kind: 'quick-create',
                point,
                defaults: {
                  startAt,
                  professionalId:
                    view === 'day'
                      ? column.id
                      : visibleProfessionals.length === 1
                        ? visibleProfessionals[0].id
                        : undefined,
                },
              })
            }
            onBlockClick={(block, point) => setPanel({ kind: 'block-menu', point, block })}
          />
        )}
      </div>

      <FloatingPanel
        position={panel?.kind === 'quick-create' ? panel.point : null}
        onClose={closePanel}
        width={360}
      >
        {panel?.kind === 'quick-create' && (
          <QuickCreateCard
            key={panel.defaults.startAt.toISOString() + (panel.defaults.professionalId ?? '')}
            defaults={panel.defaults}
            clients={clients}
            professionals={professionals}
            services={services}
            timezone={timezone}
            onClose={closePanel}
            onMoreOptions={openFullCreate}
          />
        )}
      </FloatingPanel>

      <FloatingPanel
        position={panelAppointment && panel ? panel.point : null}
        onClose={closePanel}
        width={380}
      >
        {panelAppointment && (
          <AppointmentCard
            appointment={panelAppointment}
            timezone={timezone}
            color={colorFor(panelAppointment)}
            onClose={closePanel}
            onOpenDetails={() => {
              setPanel(null);
              setDetailId(panelAppointment.id);
            }}
          />
        )}
      </FloatingPanel>

      <FloatingMenu
        position={panel?.kind === 'appointment-menu' ? panel.point : null}
        title={panel?.kind === 'appointment-menu' ? panel.appointment.client.name : undefined}
        items={appointmentMenuItems}
        onClose={closePanel}
      />
      <FloatingMenu
        position={panel?.kind === 'block-menu' ? panel.point : null}
        items={blockMenuItems}
        onClose={closePanel}
      />

      <CreateAppointmentDrawer
        open={createDefaults !== null}
        onOpenChange={(open) => {
          if (!open) setCreateDefaults(null);
        }}
        defaultStartAt={createDefaults?.startAt ?? rangeStartAt}
        defaultProfessionalId={createDefaults?.professionalId}
        defaultClientId={createDefaults?.clientId}
        defaultServiceId={createDefaults?.serviceId}
        clients={clients}
        professionals={professionals}
        services={services}
        timezone={timezone}
      />

      <AppointmentDetailDrawer
        appointment={detailAppointment}
        open={detailAppointment !== null}
        onOpenChange={(open) => {
          if (!open) setDetailId(null);
        }}
        timezone={timezone}
      />
    </div>
  );
}

/** At-a-glance counts for the visible range (canceled and no-shows excluded from revenue). */
function AgendaSummary({ appointments }: { appointments: GridAppointment[] }) {
  const active = appointments.filter((a) => a.status !== 'CANCELED' && a.status !== 'NO_SHOW');
  const done = appointments.filter((a) => a.status === 'DONE').length;
  const toConfirm = appointments.filter((a) => a.status === 'SCHEDULED').length;
  const expected = active.reduce((sum, a) => sum + a.priceSnapshot, 0);

  const items = [
    { label: 'Agendamentos', value: String(active.length) },
    { label: 'A confirmar', value: String(toConfirm) },
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
