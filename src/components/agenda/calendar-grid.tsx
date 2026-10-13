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
  /** Linha de apoio no cabeçalho do profissional ("3 atendimentos"). */
  caption?: string;
};

function initials(name: string): string {
  const parts = name
    .replace(/\(.*?\)/g, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return (
    (parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')
  ).toUpperCase();
}

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
  onResize,
}: {
  item: LayoutItem;
  timezone: string;
  colorFor: (appointment: GridAppointment) => string;
  colorMode: 'professional' | 'status';
  onClick: (appointment: GridAppointment, point: ScreenPoint) => void;
  onContextMenu: (appointment: GridAppointment, point: ScreenPoint) => void;
  onResize: (appointment: GridAppointment, newEndAt: Date) => void;
}) {
  const { appointment } = item;
  // Puxar a borda de baixo muda a duração, de 15 em 15 minutos — como no Google Agenda.
  const [resizeDeltaPx, setResizeDeltaPx] = React.useState<number | null>(null);
  const resizedHeight = Math.max(
    minutesToTop(SLOT_MINUTES),
    item.height +
      (resizeDeltaPx === null
        ? 0
        : Math.round(resizeDeltaPx / minutesToTop(SLOT_MINUTES)) * minutesToTop(SLOT_MINUTES)),
  );
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: appointment.id,
  });

  const isInactive = appointment.status === 'CANCELED' || appointment.status === 'NO_SHOW';
  const isDone = appointment.status === 'DONE';
  const color = colorFor(appointment);
  // Cor cheia e texto branco, como os eventos do Google. Falta e cancelado ficam só no contorno;
  // concluído fica esmaecido, como evento que já passou.
  const solid = !isInactive;

  function startResize(event: React.PointerEvent) {
    event.stopPropagation();
    event.preventDefault();
    const startY = event.clientY;
    const target = event.currentTarget as HTMLElement;
    target.setPointerCapture(event.pointerId);
    const move = (e: PointerEvent) => setResizeDeltaPx(e.clientY - startY);
    const up = (e: PointerEvent) => {
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', up);
      const slots = Math.round((e.clientY - startY) / minutesToTop(SLOT_MINUTES));
      setResizeDeltaPx(null);
      if (slots === 0) return;
      const durationMs =
        appointment.endAt.getTime() - appointment.startAt.getTime() + slots * SLOT_MINUTES * 60_000;
      if (durationMs < SLOT_MINUTES * 60_000) return;
      onResize(appointment, new Date(appointment.startAt.getTime() + durationMs));
    };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', up);
  }

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
        'group/card absolute overflow-hidden rounded-[10px] px-2 py-1 text-left text-xs shadow-sm ring-1 ring-black/5 transition-[box-shadow,transform] duration-200 hover:z-30 hover:shadow-lg',
        solid ? 'text-white' : 'bg-background text-foreground border-2 border-dashed',
        isDone && 'opacity-60',
        isDragging && 'z-50 scale-[1.02] opacity-90 shadow-xl',
        resizeDeltaPx !== null && 'z-50 shadow-xl',
        appointment.status === 'NO_SHOW' && 'line-through decoration-1 opacity-70',
      )}
      style={{
        top: item.top,
        height: resizedHeight,
        left: `calc(${(item.lane / item.totalLanes) * 100}% + 2px)`,
        width: `calc(${100 / item.totalLanes}% - 4px)`,
        backgroundColor: solid ? color : undefined,
        borderColor: solid ? undefined : color,
        transform: CSS.Translate.toString(transform),
      }}
    >
      <div className="flex items-center gap-1">
        {/* Colorindo por profissional, o status vira a bolinha; colorindo por status, vice-versa. */}
        <span
          className={cn('size-2 shrink-0 rounded-full', solid && 'ring-1 ring-white/80')}
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
          <SparklesIcon
            className={cn('size-3 shrink-0', solid ? 'text-white' : 'text-system-indigo')}
            aria-label="Cliente novo"
          />
        )}
        {appointment.notes && (
          <StickyNoteIcon
            className={cn('size-3 shrink-0', solid ? 'text-white/85' : 'text-muted-foreground')}
            aria-label="Tem observação"
          />
        )}
      </div>
      <div className={cn('truncate', solid ? 'text-white/85' : 'text-muted-foreground')}>
        {formatTimeInTz(appointment.startAt, timezone)}
        {resizeDeltaPx !== null &&
          ` – ${formatMinutes(utcToMinutesSinceMidnight(appointment.startAt, timezone) + Math.round(resizedHeight / minutesToTop(1)))}`}{' '}
        · {appointment.serviceNameSnapshot}
      </div>
      {resizedHeight > 44 && (
        <div
          className={cn('truncate font-medium', solid ? 'text-white/85' : 'text-label-secondary')}
        >
          {STATUS_LABELS[appointment.status]}
          <span className="font-normal"> · {formatCurrencyBRL(appointment.priceSnapshot)}</span>
        </div>
      )}
      {/* Alça de redimensionar: aparece ao passar o mouse na borda de baixo. */}
      <span
        role="separator"
        aria-label="Puxar para mudar a duração"
        onPointerDown={startResize}
        onClick={(event) => event.stopPropagation()}
        className="absolute right-0 bottom-0 left-0 flex h-2 cursor-ns-resize items-center justify-center opacity-0 group-hover/card:opacity-100"
      >
        <span
          className={cn('h-0.5 w-6 rounded-full', solid ? 'bg-white/80' : 'bg-foreground/40')}
        />
      </span>
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
  onAppointmentResize,
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
  onAppointmentResize: (appointment: GridAppointment, newEndAt: Date) => void;
  /**
   * Clique num horário vazio, ou arrastar sobre vários (com o mouse): abre a criação rápida ali.
   * `endAt` vem quando a pessoa arrastou um intervalo.
   */
  onSlotClick: (column: GridColumn, startAt: Date, point: ScreenPoint, endAt?: Date) => void;
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

  // Without an activation distance, dnd-kit's PointerSensor starts a drag on
  // any pointer movement at all — even the couple of pixels of jitter a
  // normal click has between mousedown/mouseup — which swallows the click
  // and appointment-detail onClick never fires. Require an intentional
  // 5px move before a drag begins; anything less is treated as a plain click.
  // No toque, arrastar um card exige segurar um instante: sem isso, rolar a agenda no celular
  // arrastaria o card que estivesse debaixo do dedo.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
  );

  // Arrastar no vazio com o mouse escolhe um intervalo (como no Google Agenda).
  const [selection, setSelection] = React.useState<{
    columnId: string;
    anchor: number;
    current: number;
  } | null>(null);

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

  // Ao abrir (e ao trocar de dia), rola até uma hora antes de agora quando hoje está na tela —
  // senão até o primeiro agendamento — como o Google faz, em vez de abrir no começo do dia.
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const scrollKey = columns.map((c) => `${c.date.year}-${c.date.month}-${c.date.day}`).join('|');
  React.useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const showsToday = columns.some((c) => isSameCalendarDate(c.date, today));
    const firstAppointment = appointments.reduce<number | null>((min, a) => {
      const m = utcToMinutesSinceMidnight(a.startAt, timezone);
      return min === null || m < min ? m : min;
    }, null);
    const target = showsToday
      ? utcToMinutesSinceMidnight(new Date(), timezone) - 60
      : (firstAppointment ?? startHour * 60) - 30;
    el.scrollTop = Math.max(0, minutesToTop(target - startHour * 60));
    // Só ao trocar o período: rolar de novo a cada atualização da lista atrapalharia quem está usando.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollKey]);

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div
        ref={scrollRef}
        className="bg-background ring-foreground/[0.08] [&_.border-b]:border-foreground/[0.06] [&_.border-r]:border-foreground/[0.06] flex max-h-[calc(100svh-15rem)] min-h-[420px] overflow-auto rounded-[22px] ring-1"
      >
        <div className="bg-background sticky left-0 z-20 w-14 shrink-0 border-r">
          <div className="bg-background sticky top-0 z-10 h-16 border-b" />
          {hourMarks.map((hour, index) => (
            <div
              key={hour}
              className="text-muted-foreground relative border-b text-right text-xs"
              style={{ height: PIXELS_PER_HOUR }}
            >
              {/* As outras horas ficam centradas na linha; a primeira desce para dentro da faixa, senão o
                  cabeçalho fixo (nome do profissional / dia) cobre o rótulo. */}
              <span className={cn('absolute right-1', index === 0 ? 'top-0.5' : '-top-2')}>
                {`${String(hour).padStart(2, '0')}:00`}
              </span>
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
              className="relative min-w-40 flex-1 border-r last:border-r-0"
            >
              {/* Cabeçalho como o do Google Agenda: dia da semana pequeno, número grande num círculo
                  (cheio quando é hoje). Na visão Dia, a coluna é o profissional. */}
              <div className="bg-background/85 sticky top-0 z-10 flex h-16 flex-col items-center justify-center gap-0.5 border-b backdrop-blur-md">
                {!column.sublabel && column.accentColor ? (
                  // Visão Dia, "agenda por pessoas": avatar de iniciais, nome e o total do dia.
                  <div className="flex max-w-full items-center gap-2 px-2">
                    <span
                      className="flex size-8 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold text-white"
                      style={{ backgroundColor: column.accentColor }}
                      aria-hidden
                    >
                      {initials(column.label)}
                    </span>
                    <span className="min-w-0 text-left">
                      <span className="block truncate text-[13px] font-semibold">
                        {column.label}
                      </span>
                      {column.caption && (
                        <span className="text-label-secondary block truncate text-[11px]">
                          {column.caption}
                        </span>
                      )}
                    </span>
                  </div>
                ) : (
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
                )}
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
                onMouseDown={(event) => {
                  // Clique em cima de um agendamento ou bloqueio é dele, não do horário vazio.
                  if (event.button !== 0 || (event.target as HTMLElement).closest('button')) return;
                  const minutes = minutesAtPointer(event, hours);
                  setSelection({ columnId: column.id, anchor: minutes, current: minutes });
                }}
                onMouseUp={(event) => {
                  if (!selection || selection.columnId !== column.id) return;
                  const start = Math.min(selection.anchor, selection.current);
                  const end = Math.max(selection.anchor, selection.current) + SLOT_MINUTES;
                  setSelection(null);
                  onSlotClick(
                    column,
                    calendarDateToUtc(column.date, start, timezone),
                    { x: event.clientX, y: event.clientY },
                    end - start > SLOT_MINUTES
                      ? calendarDateToUtc(column.date, end, timezone)
                      : undefined,
                  );
                }}
                onClick={(event) => {
                  // Toque no celular não gera mousedown confiável: o clique simples também cria.
                  if ((event.target as HTMLElement).closest('button')) return;
                  if (
                    event.detail === 0 ||
                    (event.nativeEvent as PointerEvent).pointerType === 'touch'
                  ) {
                    onSlotClick(
                      column,
                      calendarDateToUtc(column.date, minutesAtPointer(event, hours), timezone),
                      { x: event.clientX, y: event.clientY },
                    );
                  }
                }}
                onMouseMove={(event) => {
                  if (selection?.columnId === column.id) {
                    const minutes = minutesAtPointer(event, hours);
                    if (minutes !== selection.current)
                      setSelection({ ...selection, current: minutes });
                    return;
                  }
                  if ((event.target as HTMLElement).closest('button')) {
                    if (hoverSlot) setHoverSlot(null);
                    return;
                  }
                  const minutes = minutesAtPointer(event, hours);
                  if (hoverSlot?.columnId !== column.id || hoverSlot.minutes !== minutes) {
                    setHoverSlot({ columnId: column.id, minutes });
                  }
                }}
                onMouseLeave={() => {
                  setHoverSlot(null);
                  if (selection?.columnId === column.id) setSelection(null);
                }}
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
                {selection?.columnId === column.id && (
                  <div
                    className="bg-system-blue/85 pointer-events-none absolute right-1 left-1 z-20 rounded-[10px] px-2 py-1 text-[11px] font-medium text-white shadow-lg"
                    style={{
                      top: minutesToTop(
                        Math.min(selection.anchor, selection.current) - startHour * 60,
                      ),
                      height: minutesToTop(
                        Math.abs(selection.current - selection.anchor) + SLOT_MINUTES,
                      ),
                    }}
                  >
                    {formatMinutes(Math.min(selection.anchor, selection.current))} –{' '}
                    {formatMinutes(Math.max(selection.anchor, selection.current) + SLOT_MINUTES)}
                  </div>
                )}
                {hoverSlot?.columnId === column.id && !selection && (
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
                    onResize={onAppointmentResize}
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
