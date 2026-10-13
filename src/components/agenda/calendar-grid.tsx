'use client';

import * as React from 'react';
import {
  DndContext,
  MouseSensor,
  TouchSensor,
  useDraggable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { LockIcon, StickyNoteIcon, SparklesIcon } from 'lucide-react';

import { cn } from '@/lib/utils';
import type { SerializedAppointment } from '@/lib/serialize';
import {
  type CalendarDate,
  calendarDateToUtc,
  formatTimeInTz,
  isSameCalendarDate,
  utcToCalendarDate,
  utcToMinutesSinceMidnight,
} from '@/lib/time';
import { STATUS_COLORS, STATUS_LABELS } from '@/components/agenda/status';
import { formatCurrencyBRL } from '@/lib/serialize';

export type GridColumn = {
  id: string;
  label: string;
  sublabel?: string;
  date: CalendarDate;
  accentColor?: string;
};

export type GridAppointment = SerializedAppointment & { isFirstVisit?: boolean };

/** Faixa em minutos desde a meia-noite, no fuso da empresa. */
export type MinuteRange = { startMinutes: number; endMinutes: number };

export type GridBlock = {
  id: string;
  startAt: Date;
  endAt: Date;
  reason: string | null;
  /** Na visão Semana a coluna é o dia: o nome diz de quem é o bloqueio. */
  professionalName?: string;
};

export type ScreenPoint = { x: number; y: number };

const PIXELS_PER_HOUR = 64;
const SLOT_MINUTES = 15;

type GridHours = { startHour: number; endHour: number };

function totalMinutes(hours: GridHours) {
  return (hours.endHour - hours.startHour) * 60;
}

function minutesToTop(minutesSinceGridStart: number): number {
  return (minutesSinceGridStart / 60) * PIXELS_PER_HOUR;
}

/** Posição vertical de um instante na grade, presa aos limites visíveis. */
function clampToGrid(minutesSinceMidnight: number, hours: GridHours): number {
  return Math.min(Math.max(0, minutesSinceMidnight - hours.startHour * 60), totalMinutes(hours));
}

type LayoutItem = {
  appointment: GridAppointment;
  top: number;
  height: number;
  lane: number;
  totalLanes: number;
};

function layoutColumn(
  appointments: GridAppointment[],
  timezone: string,
  hours: GridHours,
): LayoutItem[] {
  const sorted = [...appointments].sort((a, b) => a.startAt.getTime() - b.startAt.getTime());

  type Lane = { endAt: Date };
  const lanes: Lane[] = [];
  const withLane = sorted.map((appointment) => {
    let laneIndex = lanes.findIndex(
      (lane) => lane.endAt.getTime() <= appointment.startAt.getTime(),
    );
    if (laneIndex === -1) {
      laneIndex = lanes.length;
      lanes.push({ endAt: appointment.endAt });
    } else {
      lanes[laneIndex] = { endAt: appointment.endAt };
    }
    return { appointment, lane: laneIndex };
  });

  const totalLanes = Math.max(1, lanes.length);

  return withLane.map(({ appointment, lane }) => {
    const start = clampToGrid(utcToMinutesSinceMidnight(appointment.startAt, timezone), hours);
    const end = clampToGrid(utcToMinutesSinceMidnight(appointment.endAt, timezone), hours);
    return {
      appointment,
      top: minutesToTop(start),
      height: Math.max(20, minutesToTop(end) - minutesToTop(start)),
      lane,
      totalLanes,
    };
  });
}

/** O complemento do expediente dentro da grade: é o que fica em cinza. */
function closedRanges(open: MinuteRange[], hours: GridHours): MinuteRange[] {
  const gridStart = hours.startHour * 60;
  const gridEnd = hours.endHour * 60;
  const sorted = [...open].sort((a, b) => a.startMinutes - b.startMinutes);
  const closed: MinuteRange[] = [];
  let cursor = gridStart;
  for (const range of sorted) {
    if (range.startMinutes > cursor)
      closed.push({ startMinutes: cursor, endMinutes: Math.min(range.startMinutes, gridEnd) });
    cursor = Math.max(cursor, range.endMinutes);
  }
  if (cursor < gridEnd) closed.push({ startMinutes: cursor, endMinutes: gridEnd });
  return closed.filter((r) => r.endMinutes > r.startMinutes);
}

/** Resumo do card ao passar o mouse — o detalhe que não cabe num card baixo. */
function appointmentTooltip(appointment: GridAppointment, timezone: string): string {
  return [
    appointment.client.name + (appointment.isFirstVisit ? ' — cliente novo' : ''),
    `${formatTimeInTz(appointment.startAt, timezone)}–${formatTimeInTz(appointment.endAt, timezone)} · ${appointment.serviceNameSnapshot}`,
    `${appointment.professional.name} · ${STATUS_LABELS[appointment.status]} · ${formatCurrencyBRL(appointment.priceSnapshot)}`,
    appointment.client.phone ? `Tel.: ${appointment.client.phone}` : null,
    appointment.notes ? `Obs.: ${appointment.notes}` : null,
    'Botão direito: ações rápidas',
  ]
    .filter(Boolean)
    .join('\n');
}

function DraggableAppointment({
  item,
  timezone,
  colorFor,
  colorMode,
  onClick,
  onContextMenu,
}: {
  item: LayoutItem;
  timezone: string;
  colorFor: (appointment: GridAppointment) => string;
  colorMode: 'professional' | 'status';
  onClick: (appointment: GridAppointment, point: ScreenPoint) => void;
  onContextMenu: (appointment: GridAppointment, point: ScreenPoint) => void;
}) {
  const { appointment } = item;
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: appointment.id,
  });

  const isInactive = appointment.status === 'CANCELED' || appointment.status === 'NO_SHOW';
  const color = colorFor(appointment);

  return (
    <button
      ref={setNodeRef}
      type="button"
      {...listeners}
      {...attributes}
      title={appointmentTooltip(appointment, timezone)}
      onClick={(event) => onClick(appointment, { x: event.clientX, y: event.clientY })}
      onContextMenu={(event) => {
        event.preventDefault();
        onContextMenu(appointment, { x: event.clientX, y: event.clientY });
      }}
      className={cn(
        'absolute overflow-hidden rounded-lg border-l-[3px] py-1 pr-2 pl-2 text-left text-xs transition-[box-shadow,transform] duration-200 select-none [-webkit-touch-callout:none] hover:z-30 hover:shadow-lg',
        isDragging && 'z-50 scale-[1.02] opacity-90 shadow-xl',
        isInactive && 'opacity-60',
        appointment.status === 'NO_SHOW' && 'line-through decoration-1',
      )}
      style={{
        top: item.top,
        height: item.height,
        left: `calc(${(item.lane / item.totalLanes) * 100}% + 2px)`,
        width: `calc(${100 / item.totalLanes}% - 4px)`,
        backgroundColor: `color-mix(in oklch, ${color} 16%, var(--background))`,
        borderLeftColor: color,
        transform: CSS.Translate.toString(transform),
      }}
    >
      <div className="flex items-center gap-1">
        {/* Colorindo por profissional, o status vira a bolinha; colorindo por status, vice-versa. */}
        <span
          className="size-2 shrink-0 rounded-full"
          style={{
            backgroundColor:
              colorMode === 'professional'
                ? STATUS_COLORS[appointment.status]
                : appointment.professional.color,
          }}
          aria-hidden
        />
        <span className="truncate font-semibold">{appointment.client.name}</span>
        {appointment.isFirstVisit && (
          <SparklesIcon className="text-system-indigo size-3 shrink-0" aria-label="Cliente novo" />
        )}
        {appointment.notes && (
          <StickyNoteIcon
            className="text-muted-foreground size-3 shrink-0"
            aria-label="Tem observação"
          />
        )}
      </div>
      <div className="text-muted-foreground truncate">
        {formatTimeInTz(appointment.startAt, timezone)} · {appointment.serviceNameSnapshot}
      </div>
      {item.height > 44 && (
        <div className="text-label-secondary truncate font-medium">
          {STATUS_LABELS[appointment.status]}
          <span className="text-muted-foreground font-normal">
            {' '}
            · {formatCurrencyBRL(appointment.priceSnapshot)}
          </span>
        </div>
      )}
    </button>
  );
}

/** Minutos desde a meia-noite do horário sob o ponteiro, arredondado para baixo no slot. */
function minutesAtPointer(event: React.MouseEvent<HTMLElement>, hours: GridHours): number {
  const offsetY = event.clientY - event.currentTarget.getBoundingClientRect().top;
  const slot = Math.floor(offsetY / (PIXELS_PER_HOUR / 60) / SLOT_MINUTES) * SLOT_MINUTES;
  return hours.startHour * 60 + Math.min(Math.max(0, slot), totalMinutes(hours) - SLOT_MINUTES);
}

function formatMinutes(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

export function CalendarGrid({
  columns,
  appointments,
  timezone,
  startHour,
  endHour,
  openRangesByColumn,
  blocksByColumn,
  colorFor,
  colorMode,
  getColumnIdForAppointment,
  onAppointmentClick,
  onAppointmentContextMenu,
  onAppointmentMove,
  onSlotClick,
  onBlockClick,
}: {
  columns: GridColumn[];
  appointments: GridAppointment[];
  timezone: string;
  startHour: number;
  endHour: number;
  /** Expediente de cada coluna. Ausente = sem expediente cadastrado, nada fica cinza. */
  openRangesByColumn: Map<string, MinuteRange[]>;
  blocksByColumn: Map<string, GridBlock[]>;
  /** Cor do card: a do profissional (como as agendas do Google) ou a do status. */
  colorFor: (appointment: GridAppointment) => string;
  colorMode: 'professional' | 'status';
  getColumnIdForAppointment: (appointment: GridAppointment) => string;
  onAppointmentClick: (appointment: GridAppointment, point: ScreenPoint) => void;
  onAppointmentContextMenu: (appointment: GridAppointment, point: ScreenPoint) => void;
  /** `targetColumn` é a coluna onde o card foi solto: outro dia na semana, outro profissional no dia. */
  onAppointmentMove: (appointmentId: string, newStartAt: Date, targetColumn: GridColumn) => void;
  /** Clique num horário vazio: abre o menu "Agendar / Bloquear horário" ali. */
  onSlotClick: (column: GridColumn, startAt: Date, point: ScreenPoint) => void;
  onBlockClick: (block: GridBlock, point: ScreenPoint) => void;
}) {
  const hours = React.useMemo(() => ({ startHour, endHour }), [startHour, endHour]);
  const gridHeight = minutesToTop(totalMinutes(hours));
  const columnWidthRef = React.useRef(0);
  const today = React.useMemo(() => utcToCalendarDate(new Date(), timezone), [timezone]);

  // Re-render every minute so the "now" line keeps moving down the grid.
  const [now, setNow] = React.useState(() => new Date());
  React.useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  // Mouse: a 5px move starts a drag, so a click's tiny jitter still counts as a
  // click and opens the appointment. Touch: a finger landing on an appointment
  // is far more often the start of a scroll, so dragging needs a long-press
  // (250ms held within 8px) — otherwise the grid couldn't be scrolled over cards.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
  );

  // Prévia "+ 09:30" do horário sob o mouse, para o clique no vazio ser descoberto sem explicação.
  const [hoverSlot, setHoverSlot] = React.useState<{ columnId: string; minutes: number } | null>(
    null,
  );

  const appointmentsByColumn = React.useMemo(() => {
    const map = new Map<string, GridAppointment[]>();
    for (const column of columns) map.set(column.id, []);
    for (const appointment of appointments) {
      const columnId = getColumnIdForAppointment(appointment);
      map.get(columnId)?.push(appointment);
    }
    return map;
  }, [appointments, columns, getColumnIdForAppointment]);

  function handleDragEnd(event: DragEndEvent) {
    const appointment = appointments.find((a) => a.id === event.active.id);
    if (!appointment) return;

    const minutesDelta =
      Math.round(event.delta.y / (PIXELS_PER_HOUR / 60) / SLOT_MINUTES) * SLOT_MINUTES;

    let targetColumnIndex = columns.findIndex(
      (c) => c.id === getColumnIdForAppointment(appointment),
    );
    if (columnWidthRef.current > 0) {
      const columnDelta = Math.round(event.delta.x / columnWidthRef.current);
      targetColumnIndex = Math.min(
        columns.length - 1,
        Math.max(0, targetColumnIndex + columnDelta),
      );
    }
    const targetColumn = columns[targetColumnIndex];
    if (!targetColumn) return;

    const originalMinutes = utcToMinutesSinceMidnight(appointment.startAt, timezone);
    const newMinutes = originalMinutes + minutesDelta;
    const newStartAt = calendarDateToUtc(targetColumn.date, newMinutes, timezone);

    const sameColumn = targetColumn.id === getColumnIdForAppointment(appointment);
    if (sameColumn && newStartAt.getTime() === appointment.startAt.getTime()) return;
    onAppointmentMove(appointment.id, newStartAt, targetColumn);
  }

  const hourMarks = Array.from({ length: endHour - startHour + 1 }, (_, i) => startHour + i);

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="bg-background ring-foreground/[0.08] [&_.border-b]:border-foreground/[0.06] [&_.border-r]:border-foreground/[0.06] flex max-h-[calc(100svh-17rem)] min-h-[420px] overflow-auto overscroll-contain rounded-[22px] ring-1 md:max-h-[calc(100svh-15rem)]">
        <div className="bg-background sticky left-0 z-20 w-12 shrink-0 border-r sm:w-14">
          <div className="bg-background sticky top-0 z-10 h-16 border-b" />
          {hourMarks.map((hour) => (
            <div
              key={hour}
              className="text-muted-foreground relative border-b text-right text-xs"
              style={{ height: PIXELS_PER_HOUR }}
            >
              <span className="absolute -top-2 right-1">{`${String(hour).padStart(2, '0')}:00`}</span>
            </div>
          ))}
        </div>

        {columns.map((column) => {
          const layout = layoutColumn(appointmentsByColumn.get(column.id) ?? [], timezone, hours);
          const openRanges = openRangesByColumn.get(column.id);
          const closed = openRanges ? closedRanges(openRanges, hours) : [];
          const blocks = blocksByColumn.get(column.id) ?? [];
          const isToday = isSameCalendarDate(column.date, today);
          const nowMinutes = isToday
            ? utcToMinutesSinceMidnight(now, timezone) - startHour * 60
            : null;

          return (
            <div
              key={column.id}
              ref={(el) => {
                if (el) columnWidthRef.current = el.offsetWidth;
              }}
              className="relative min-w-32 flex-1 border-r last:border-r-0 sm:min-w-40"
            >
              {/* Cabeçalho como o do Google Agenda: dia da semana pequeno, número grande num círculo
                  (cheio quando é hoje). Na visão Dia, a coluna é o profissional. */}
              <div className="bg-background/85 sticky top-0 z-10 flex h-16 flex-col items-center justify-center gap-0.5 border-b backdrop-blur-md">
                <span
                  className={cn(
                    'flex items-center gap-1.5 text-[11px] font-semibold tracking-wide uppercase',
                    column.sublabel && isToday ? 'text-system-blue' : 'text-label-secondary',
                  )}
                >
                  {column.accentColor && (
                    <span
                      className="size-2 rounded-full"
                      style={{ backgroundColor: column.accentColor }}
                      aria-hidden
                    />
                  )}
                  {column.label}
                </span>
                {column.sublabel && (
                  <span
                    className={cn(
                      'flex size-8 items-center justify-center rounded-full text-[19px] font-semibold tabular-nums',
                      isToday ? 'bg-system-blue text-white' : 'text-foreground',
                    )}
                  >
                    {column.sublabel}
                  </span>
                )}
              </div>
              <div
                className="relative cursor-pointer"
                style={{ height: gridHeight }}
                onClick={(event) => {
                  // Clique em cima de um agendamento ou bloqueio é dele, não do horário vazio.
                  if ((event.target as HTMLElement).closest('button')) return;
                  onSlotClick(
                    column,
                    calendarDateToUtc(column.date, minutesAtPointer(event, hours), timezone),
                    { x: event.clientX, y: event.clientY },
                  );
                }}
                onMouseMove={(event) => {
                  if ((event.target as HTMLElement).closest('button')) {
                    if (hoverSlot) setHoverSlot(null);
                    return;
                  }
                  const minutes = minutesAtPointer(event, hours);
                  if (hoverSlot?.columnId !== column.id || hoverSlot.minutes !== minutes) {
                    setHoverSlot({ columnId: column.id, minutes });
                  }
                }}
                onMouseLeave={() => setHoverSlot(null)}
              >
                {hourMarks.slice(0, -1).map((hour) => (
                  <div key={hour} className="relative border-b" style={{ height: PIXELS_PER_HOUR }}>
                    {/* Meia hora em linha pontilhada, como no Google Agenda. */}
                    <div className="border-foreground/[0.04] absolute top-1/2 right-0 left-0 border-t border-dashed" />
                  </div>
                ))}
                {/* Fora do expediente: cinza, como nas agendas do mercado. Continua clicável — encaixe
                    fora do horário é decisão da recepção, não do sistema. */}
                {closed.map((range) => (
                  <div
                    key={`closed-${range.startMinutes}`}
                    className="bg-foreground/[0.045] pointer-events-none absolute right-0 left-0"
                    style={{
                      top: minutesToTop(range.startMinutes - startHour * 60),
                      height: minutesToTop(range.endMinutes - range.startMinutes),
                    }}
                  />
                ))}
                {blocks.map((block) => {
                  const top = minutesToTop(
                    clampToGrid(utcToMinutesSinceMidnight(block.startAt, timezone), hours),
                  );
                  const bottom = minutesToTop(
                    clampToGrid(utcToMinutesSinceMidnight(block.endAt, timezone), hours),
                  );
                  return (
                    <button
                      key={block.id}
                      type="button"
                      title={`Horário bloqueado${block.reason ? `: ${block.reason}` : ''}\nClique para remover`}
                      onClick={(event) =>
                        onBlockClick(block, { x: event.clientX, y: event.clientY })
                      }
                      className="text-muted-foreground border-foreground/10 absolute right-1 left-1 z-[5] flex items-start gap-1 overflow-hidden rounded-md border px-2 py-1 text-left text-[11px]"
                      style={{
                        top,
                        height: Math.max(18, bottom - top),
                        backgroundImage:
                          'repeating-linear-gradient(135deg, color-mix(in oklch, var(--foreground) 7%, transparent) 0 6px, transparent 6px 12px)',
                      }}
                    >
                      <LockIcon className="mt-px size-3 shrink-0" />
                      <span className="truncate">
                        {[block.professionalName, block.reason || 'Bloqueado']
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    </button>
                  );
                })}
                {hoverSlot?.columnId === column.id && (
                  <div
                    className="border-system-blue/40 bg-system-blue/[0.06] text-system-blue pointer-events-none absolute right-1 left-1 z-10 flex items-center rounded-md border border-dashed px-2 text-[11px] font-medium"
                    style={{
                      top: minutesToTop(hoverSlot.minutes - startHour * 60),
                      height: minutesToTop(SLOT_MINUTES * 2),
                    }}
                  >
                    + {formatMinutes(hoverSlot.minutes)}
                  </div>
                )}
                {nowMinutes !== null && nowMinutes >= 0 && nowMinutes <= totalMinutes(hours) && (
                  <div
                    className="bg-system-red pointer-events-none absolute right-0 left-0 z-20 h-[2px]"
                    style={{ top: minutesToTop(nowMinutes) }}
                  >
                    <span className="bg-system-red absolute top-1/2 -left-1 size-2.5 -translate-y-1/2 rounded-full" />
                  </div>
                )}
                {layout.map((item) => (
                  <DraggableAppointment
                    key={item.appointment.id}
                    item={item}
                    timezone={timezone}
                    colorFor={colorFor}
                    colorMode={colorMode}
                    onClick={onAppointmentClick}
                    onContextMenu={onAppointmentContextMenu}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </DndContext>
  );
}
