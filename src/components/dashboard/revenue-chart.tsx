'use client';

import * as React from 'react';

import { formatCurrencyBRL } from '@/lib/serialize';
import type { DailyRevenue } from '@/server/data/dashboard';

const CHART_HEIGHT = 180;
const BAR_MAX_WIDTH = 24;

function niceMax(value: number): number {
  if (value <= 0) return 100;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude;
  const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return step * magnitude;
}

export function RevenueChart({ data }: { data: DailyRevenue[] }) {
  const [hoverIndex, setHoverIndex] = React.useState<number | null>(null);

  const maxRevenue = niceMax(Math.max(...data.map((d) => d.revenue), 1));
  const gridSteps = [0, 0.25, 0.5, 0.75, 1];

  const barSlotWidth = 100 / data.length;

  return (
    <div className="relative">
      <div className="flex" style={{ height: CHART_HEIGHT }}>
        <div className="text-muted-foreground flex w-14 shrink-0 flex-col justify-between pr-2 text-right text-xs">
          {[...gridSteps].reverse().map((step) => (
            <span key={step}>
              {step === 0 ? 'R$ 0' : formatCurrencyBRL(maxRevenue * step).replace(',00', '')}
            </span>
          ))}
        </div>

        <div className="relative flex-1">
          {gridSteps.map((step) => (
            <div
              key={step}
              className="border-border/60 absolute right-0 left-0 border-t"
              style={{ top: `${(1 - step) * 100}%` }}
            />
          ))}

          <div className="absolute inset-0 flex items-end">
            {data.map((day, i) => {
              const heightPct = maxRevenue > 0 ? (day.revenue / maxRevenue) * 100 : 0;
              const isHovered = hoverIndex === i;
              return (
                <div
                  key={`${day.date.year}-${day.date.month}-${day.date.day}`}
                  className="relative flex h-full flex-1 items-end justify-center"
                  onMouseEnter={() => setHoverIndex(i)}
                  onMouseLeave={() => setHoverIndex((cur) => (cur === i ? null : cur))}
                >
                  {isHovered && (
                    <div className="bg-popover text-popover-foreground ring-border/60 pointer-events-none absolute bottom-full z-10 mb-2 min-w-max -translate-x-1/2 rounded-md px-2 py-1 text-xs shadow-md ring-1">
                      <div className="font-medium">{day.label}</div>
                      <div className="text-muted-foreground">{formatCurrencyBRL(day.revenue)}</div>
                    </div>
                  )}
                  <div
                    className="bg-chart-1 rounded-t-[4px] transition-opacity"
                    style={{
                      width: Math.min(BAR_MAX_WIDTH, barSlotWidth * 3),
                      height: `${Math.max(heightPct, day.revenue > 0 ? 2 : 0)}%`,
                      opacity: hoverIndex === null || isHovered ? 1 : 0.55,
                    }}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="text-muted-foreground ml-14 flex text-xs">
        {data.map((day, i) => (
          <div
            key={`${day.date.year}-${day.date.month}-${day.date.day}`}
            className="flex-1 truncate text-center"
          >
            {i % 2 === 0 ? day.label : ''}
          </div>
        ))}
      </div>
    </div>
  );
}
