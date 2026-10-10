'use client';

import * as React from 'react';
import { AnimatePresence, motion, useInView, useReducedMotion } from 'motion/react';

import { formatCurrencyBRL } from '@/lib/serialize';
import type { DailyRevenue } from '@/server/data/dashboard';

const CHART_HEIGHT = 260;
// Room above the plot for the hover tooltip, so it never covers the line.
const PAD_TOP = 60;
const PAD_BOTTOM = 8;
const Y_AXIS_WIDTH = 56;

function niceMax(value: number): number {
  if (value <= 0) return 100;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude;
  const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return step * magnitude;
}

type Point = { x: number; y: number };

/**
 * Monotone cubic interpolation (Fritsch–Carlson): smooth like Apple's Stocks
 * and Health charts, but never overshoots below zero between data points.
 */
function monotonePath(points: Point[]): string {
  const n = points.length;
  if (n === 0) return '';
  if (n === 1) return `M${points[0].x},${points[0].y}`;

  const dx: number[] = [];
  const slope: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dx.push(points[i + 1].x - points[i].x);
    slope.push((points[i + 1].y - points[i].y) / dx[i]);
  }

  const tangent: number[] = [slope[0]];
  for (let i = 1; i < n - 1; i++) {
    if (slope[i - 1] * slope[i] <= 0) {
      tangent.push(0);
    } else {
      const w1 = 2 * dx[i] + dx[i - 1];
      const w2 = dx[i] + 2 * dx[i - 1];
      tangent.push((w1 + w2) / (w1 / slope[i - 1] + w2 / slope[i]));
    }
  }
  tangent.push(slope[n - 2]);

  let d = `M${points[0].x},${points[0].y}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3;
    d += ` C${points[i].x + h},${points[i].y + tangent[i] * h} ${points[i + 1].x - h},${
      points[i + 1].y - tangent[i + 1] * h
    } ${points[i + 1].x},${points[i + 1].y}`;
  }
  return d;
}

export function RevenueChart({ data }: { data: DailyRevenue[] }) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [width, setWidth] = React.useState(0);
  const [hoverIndex, setHoverIndex] = React.useState<number | null>(null);
  const inView = useInView(containerRef, { once: true, margin: '-40px' });
  const reduceMotion = useReducedMotion();
  const gradientId = React.useId();

  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const maxRevenue = niceMax(Math.max(...data.map((d) => d.revenue), 1));
  const gridSteps = [0, 0.5, 1];
  const plotWidth = Math.max(width - Y_AXIS_WIDTH, 0);
  const plotHeight = CHART_HEIGHT - PAD_TOP - PAD_BOTTOM;
  const stepX = data.length > 1 ? plotWidth / (data.length - 1) : 0;

  const points: Point[] = data.map((d, i) => ({
    x: i * stepX,
    y: PAD_TOP + plotHeight * (1 - d.revenue / maxRevenue),
  }));
  const linePath = monotonePath(points);
  const baseline = PAD_TOP + plotHeight;
  const areaPath =
    points.length > 1
      ? `${linePath} L${points[points.length - 1].x},${baseline} L${points[0].x},${baseline} Z`
      : '';

  function handlePointer(event: React.PointerEvent<SVGRectElement>) {
    if (stepX === 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const index = Math.round((event.clientX - rect.left) / stepX);
    setHoverIndex(Math.min(Math.max(index, 0), data.length - 1));
  }

  const hovered = hoverIndex !== null ? data[hoverIndex] : null;
  const hoveredPoint = hoverIndex !== null ? points[hoverIndex] : null;
  const shouldDraw = inView || reduceMotion;

  return (
    <div>
      <div
        ref={containerRef}
        className="relative w-full select-none"
        style={{ height: CHART_HEIGHT }}
      >
        {width > 0 && (
          <>
            {/* Y axis labels */}
            {gridSteps.map((step) => (
              <span
                key={step}
                className="text-label-secondary absolute right-0 -translate-y-1/2 text-[11px] tabular-nums"
                style={{ top: PAD_TOP + plotHeight * (1 - step) }}
              >
                {step === 0 ? 'R$ 0' : formatCurrencyBRL(maxRevenue * step).replace(',00', '')}
              </span>
            ))}

            <svg
              width={plotWidth}
              height={CHART_HEIGHT}
              className="absolute top-0 left-0 overflow-visible"
            >
              <defs>
                <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="var(--system-blue)" stopOpacity={0.28} />
                  <stop offset="100%" stopColor="var(--system-blue)" stopOpacity={0} />
                </linearGradient>
              </defs>

              {gridSteps.map((step) => (
                <line
                  key={step}
                  x1={0}
                  x2={plotWidth}
                  y1={PAD_TOP + plotHeight * (1 - step)}
                  y2={PAD_TOP + plotHeight * (1 - step)}
                  stroke="currentColor"
                  strokeDasharray={step === 0 ? undefined : '2 4'}
                  className="text-foreground/10"
                />
              ))}

              <motion.path
                d={areaPath}
                fill={`url(#${gradientId})`}
                initial={reduceMotion ? false : { opacity: 0 }}
                animate={shouldDraw ? { opacity: 1 } : undefined}
                transition={{ duration: 1, delay: 0.6, ease: 'easeOut' }}
              />
              <motion.path
                d={linePath}
                fill="none"
                stroke="var(--system-blue)"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                initial={reduceMotion ? false : { pathLength: 0 }}
                animate={shouldDraw ? { pathLength: 1 } : undefined}
                transition={{ duration: 1.4, ease: [0.65, 0, 0.35, 1] }}
              />

              {hoveredPoint && (
                <g pointerEvents="none">
                  <line
                    x1={hoveredPoint.x}
                    x2={hoveredPoint.x}
                    y1={PAD_TOP - 6}
                    y2={baseline}
                    stroke="currentColor"
                    className="text-foreground/25"
                  />
                  <circle
                    cx={hoveredPoint.x}
                    cy={hoveredPoint.y}
                    r={5}
                    fill="var(--system-blue)"
                    stroke="var(--tile)"
                    strokeWidth={2}
                  />
                </g>
              )}

              <rect
                x={-stepX / 2}
                y={0}
                width={plotWidth + stepX}
                height={CHART_HEIGHT}
                fill="transparent"
                onPointerMove={handlePointer}
                onPointerDown={handlePointer}
                onPointerLeave={() => setHoverIndex(null)}
              />
            </svg>

            <AnimatePresence>
              {hovered && hoveredPoint && (
                <motion.div
                  key="tooltip"
                  initial={{ opacity: 0, y: 4, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.96 }}
                  transition={{ duration: 0.15 }}
                  className="bg-background/80 ring-foreground/10 pointer-events-none absolute z-10 rounded-xl px-3 py-2 shadow-lg ring-1 backdrop-blur-xl backdrop-saturate-150"
                  style={{
                    top: 0,
                    left: Math.min(Math.max(hoveredPoint.x - 60, 0), plotWidth - 120),
                    width: 120,
                  }}
                >
                  <div className="text-label-secondary text-[11px] font-medium">
                    {hovered.label}
                  </div>
                  <div className="text-sm font-semibold tabular-nums">
                    {formatCurrencyBRL(hovered.revenue)}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </>
        )}
      </div>

      <div className="text-label-secondary relative mt-2 h-4 text-[11px]">
        {width > 0 &&
          data.map((day, i) =>
            (i % 3 === 0 && i < data.length - 2) || i === data.length - 1 ? (
              <span
                key={`${day.date.year}-${day.date.month}-${day.date.day}`}
                className="absolute top-0 whitespace-nowrap tabular-nums"
                style={{
                  left: points[i].x,
                  transform:
                    i === 0
                      ? 'none'
                      : i === data.length - 1
                        ? 'translateX(-100%)'
                        : 'translateX(-50%)',
                }}
              >
                {day.label}
              </span>
            ) : null,
          )}
      </div>
    </div>
  );
}
