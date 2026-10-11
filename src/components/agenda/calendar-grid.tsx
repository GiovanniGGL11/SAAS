'use client';

import * as React from 'react';
import {
  DndContext,
  PointerSensor,
  useDraggable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';

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
import { STATUS_LABELS } from '@/components/agenda/status';
import { formatCurrencyBRL } from '@/lib/serialize';

export type GridColumn = {
  id: string;
  label: string;
  sublabel?: string;
  date: CalendarDate;
  accentColor?: string;
};

const DAY_START_HOUR = 7;
const DAY_END_HOUR = 21;
const PIXELS_PER_HOUR = 64;
const SLOT_MINUTES = 15;
const TOTAL_MINUTES = (DAY_END_HOUR - DAY_START_HOUR) * 60;
const GRID_HEIGHT = (TOTAL_MINUTES / 60) * PIXELS_PER_HOUR;

function minutesToTop(minutesSinceDayStart: number): number {
  return (minutesSinceDayStart / 60) * PIXELS_PER_HOUR;
}

type LayoutItem = {
  appointment: SerializedAppointment;
  top: number;
  height: number;
  lane: number;
  totalLanes: number;
};

function layoutColumn(appointments: SerializedAppointment[], timezone: string): LayoutItem[] {
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
    const startMinutes = Math.max(
      0,
      utcToMinutesSinceMidnight(appointment.startAt, timezone) - DAY_START_HOUR * 60,
    );
    const endMinutes = Math.min(
      TOTAL_MINUTES,
      utcToMinutesSinceMidnight(appointment.endAt, timezone) - DAY_START_HOUR * 60,
    );
    return {
      appointment,
      top: minutesToTop(startMinutes),
      height: Math.max(20, minutesToTop(endMinutes) - minutesToTop(startMinutes)),
      lane,
      totalLanes,
    };
  });
}

function DraggableAppointment({
  item,
  timezone,
  onClick,
}: {
  item: LayoutItem;
  timezone: string;
  onClick: (appointment: SerializedAppointment) => void;
}) {
  const { appointment } = item;
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: appointment.id,
  });

  const isCanceled = appointment.status === 'CANCELED' || appointment.status === 'NO_SHOW';

  return (
    <button
      ref={setNodeRef}
      type="button"
      {...listeners}
      {...attributes}
      onClick={() => onClick(appointment)}
      className={cn(
        'absolute overflow-hidden rounded-lg border-l-[3px] py-1 pr-2 pl-2 text-left text-xs transition-[box-shadow,transform] duration-200 hover:z-30 hover:shadow-lg',
        isDragging && 'z-50 scale-[1.02] opacity-90 shadow-xl',
        isCanceled && 'opacity-50',
      )}
      style={{
        top: item.top,
        height: item.height,
        left: `calc(${(item.lane / item.totalLanes) * 100}% + 2px)`,
        width: `calc(${100 / item.totalLanes}% - 4px)`,
        backgroundColor: `color-mix(in oklch, ${appointment.professional.color} 18%, var(--background))`,
        borderLeftColor: appointment.professional.color,
        transform: CSS.Translate.toString(transform),
      }}
    >
      <div className="truncate font-semibold">{appointment.client.name}</div>
      <div className="text-muted-foreground truncate">
        {formatTimeInTz(appointment.startAt, timezone)} · {appointment.serviceNameSnapshot}
      </div>
      {item.height > 44 && (
        <div className="text-muted-foreground truncate">
          {STATUS_LABELS[appointment.status]} · {formatCurrencyBRL(appointment.priceSnapshot)}
        </div>
      )}
    </button>
  );
}

export function CalendarGrid({
  columns,
  appointments,
  timezone,
  allowColumnChange,
  getColumnIdForAppointment,
  onAppointmentClick,
  onAppointmentMove,
}: {
  columns: GridColumn[];
  appointments: SerializedAppointment[];
  timezone: string;
  allowColumnChange: boolean;
  getColumnIdForAppointment: (appointment: SerializedAppointment) => string;
  onAppointmentClick: (appointment: SerializedAppointment) => void;
  onAppointmentMove: (appointmentId: string, newStartAt: Date) => void;
}) {
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
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const appointmentsByColumn = React.useMemo(() => {
    const map = new Map<string, SerializedAppointment[]>();
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
    if (allowColumnChange && columnWidthRef.current > 0) {
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

    if (newStartAt.getTime() === appointment.startAt.getTime()) return;
    onAppointmentMove(appointment.id, newStartAt);
  }

  const hourMarks = Array.from(
    { length: DAY_END_HOUR - DAY_START_HOUR + 1 },
    (_, i) => DAY_START_HOUR + i,
  );

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="bg-background ring-foreground/[0.08] [&_.border-b]:border-foreground/[0.06] [&_.border-r]:border-foreground/[0.06] flex max-h-[calc(100svh-15rem)] min-h-[420px] overflow-auto rounded-[22px] ring-1">
        <div className="bg-background sticky left-0 z-20 w-14 shrink-0 border-r">
          <div className="bg-background sticky top-0 z-10 h-14 border-b" />
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
          const layout = layoutColumn(appointmentsByColumn.get(column.id) ?? [], timezone);
          const isToday = isSameCalendarDate(column.date, today);
          const nowMinutes = isToday
            ? utcToMinutesSinceMidnight(now, timezone) - DAY_START_HOUR * 60
            : null;

          return (
            <div
              key={column.id}
              ref={(el) => {
                if (el) columnWidthRef.current = el.offsetWidth;
              }}
              className="relative min-w-40 flex-1 border-r last:border-r-0"
            >
              <div className="bg-background/85 sticky top-0 z-10 flex h-14 flex-col items-center justify-center gap-0.5 border-b backdrop-blur-md">
                <span
                  className={cn(
                    'text-[11px] font-semibold uppercase',
                    isToday ? 'text-system-red' : 'text-label-secondary',
                  )}
                >
                  {column.label}
                </span>
                {column.sublabel && (
                  <span
                    className={cn(
                      'rounded-full px-2 text-[13px] font-semibold tabular-nums',
                      isToday && 'bg-system-red text-white',
                    )}
                  >
                    {column.sublabel}
                  </span>
                )}
              </div>
              <div className="relative" style={{ height: GRID_HEIGHT }}>
                {hourMarks.slice(0, -1).map((hour) => (
                  <div key={hour} className="border-b" style={{ height: PIXELS_PER_HOUR }} />
                ))}
                {nowMinutes !== null && nowMinutes >= 0 && nowMinutes <= TOTAL_MINUTES && (
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
                    onClick={onAppointmentClick}
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
