'use client';

import * as React from 'react';

import type { HourBucket } from '@/server/data/dashboard';

const CHART_HEIGHT = 140;
const DAY_START_HOUR = 7;
const DAY_END_HOUR = 21;

export function BusiestHoursChart({ hours }: { hours: HourBucket[] }) {
  const [hoverIndex, setHoverIndex] = React.useState<number | null>(null);

  const visible = hours.filter((h) => h.hour >= DAY_START_HOUR && h.hour < DAY_END_HOUR);
  const maxCount = Math.max(...visible.map((h) => h.count), 1);

  return (
    <div className="flex items-end gap-1" style={{ height: CHART_HEIGHT }}>
      {visible.map((bucket, i) => {
        const heightPct = (bucket.count / maxCount) * 100;
        const isHovered = hoverIndex === i;
        return (
          <div
            key={bucket.hour}
            className="relative flex h-full flex-1 flex-col items-center justify-end gap-1"
            onMouseEnter={() => setHoverIndex(i)}
            onMouseLeave={() => setHoverIndex((cur) => (cur === i ? null : cur))}
          >
            {isHovered && bucket.count > 0 && (
              <div className="bg-popover text-popover-foreground ring-border/60 pointer-events-none absolute bottom-full z-10 mb-1 rounded-md px-2 py-1 text-xs whitespace-nowrap shadow-md ring-1">
                {String(bucket.hour).padStart(2, '0')}h · {bucket.count} agend.
              </div>
            )}
            <div
              className="bg-chart-3 w-full max-w-5 rounded-t-[4px] transition-opacity"
              style={{
                height: `${Math.max(heightPct, bucket.count > 0 ? 4 : 0)}%`,
                opacity: hoverIndex === null || isHovered ? 1 : 0.55,
              }}
            />
            <span className="text-muted-foreground text-[10px]">{bucket.hour}h</span>
          </div>
        );
      })}
    </div>
  );
}
