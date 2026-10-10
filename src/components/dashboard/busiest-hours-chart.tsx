'use client';

import * as React from 'react';
import { motion, useInView, useReducedMotion } from 'motion/react';

import type { HourBucket } from '@/server/data/dashboard';

const CHART_HEIGHT = 160;
const DAY_START_HOUR = 7;
const DAY_END_HOUR = 21;

function visibleHours(hours: HourBucket[]): HourBucket[] {
  return hours.filter((h) => h.hour >= DAY_START_HOUR && h.hour < DAY_END_HOUR);
}

/** Apple Health–style capsule bars that spring up in sequence when scrolled into view. */
export function BusiestHoursChart({ hours }: { hours: HourBucket[] }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-40px' });
  const reduceMotion = useReducedMotion();
  const [hoverIndex, setHoverIndex] = React.useState<number | null>(null);

  const visible = visibleHours(hours);
  const maxCount = Math.max(...visible.map((h) => h.count), 1);
  const peakHour = visible.reduce<HourBucket | null>(
    (best, h) => (h.count > 0 && (!best || h.count > best.count) ? h : best),
    null,
  )?.hour;

  return (
    <div ref={ref} className="flex items-end gap-1.5 sm:gap-2" style={{ height: CHART_HEIGHT }}>
      {visible.map((bucket, i) => {
        const heightPct = Math.max((bucket.count / maxCount) * 100, bucket.count > 0 ? 6 : 0);
        const isHovered = hoverIndex === i;
        const isPeak = bucket.hour === peakHour;
        const emphasized = hoverIndex === null ? isPeak : isHovered;

        return (
          <div
            key={bucket.hour}
            className="relative flex h-full flex-1 flex-col items-center justify-end gap-2"
            onPointerEnter={() => setHoverIndex(i)}
            onPointerLeave={() => setHoverIndex((cur) => (cur === i ? null : cur))}
          >
            {isHovered && (
              <div className="bg-background/80 ring-foreground/10 pointer-events-none absolute bottom-full z-10 mb-1 rounded-xl px-2.5 py-1.5 text-xs whitespace-nowrap shadow-lg ring-1 backdrop-blur-xl">
                <span className="font-semibold">{String(bucket.hour).padStart(2, '0')}h</span>
                <span className="text-label-secondary"> · {bucket.count} agend.</span>
              </div>
            )}
            <div className="bg-foreground/[0.06] relative flex w-full max-w-6 flex-1 items-end overflow-hidden rounded-full">
              <motion.div
                className="bg-system-indigo w-full origin-bottom rounded-full transition-opacity duration-300"
                style={{ height: `${heightPct}%`, opacity: emphasized ? 1 : 0.45 }}
                initial={reduceMotion ? false : { scaleY: 0 }}
                animate={inView || reduceMotion ? { scaleY: 1 } : undefined}
                transition={{ type: 'spring', stiffness: 180, damping: 18, delay: i * 0.04 }}
              />
            </div>
            <span
              className={
                emphasized
                  ? 'text-foreground text-[11px] font-semibold tabular-nums'
                  : 'text-label-secondary text-[11px] tabular-nums'
              }
            >
              {bucket.hour}h
            </span>
          </div>
        );
      })}
    </div>
  );
}
