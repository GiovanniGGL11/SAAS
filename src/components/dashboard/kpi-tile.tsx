'use client';

import { ArrowDownRightIcon, ArrowUpRightIcon } from 'lucide-react';

import { cn } from '@/lib/utils';
import { AppleTile, TileEyebrow } from '@/components/dashboard/apple-tile';
import { AnimatedNumber, type NumberFormat } from '@/components/dashboard/animated-number';

/** Apple-style KPI tile with an animated count-up value. */
export function KpiTile({
  label,
  value,
  format,
  delta,
  index = 0,
}: {
  label: string;
  value: number;
  format: NumberFormat;
  /** Percentage change vs. the prior period. null = no comparable prior data. */
  delta?: number | null;
  /** Position in a group of tiles, used to stagger the entrance animation. */
  index?: number;
}) {
  const hasDelta = delta !== undefined && delta !== null;
  const isPositive = hasDelta && delta >= 0;

  return (
    <AppleTile index={index} className="flex flex-col justify-between gap-5 p-4 md:p-6">
      <TileEyebrow>{label}</TileEyebrow>
      <div>
        <AnimatedNumber
          value={value}
          format={format}
          className="block truncate text-[22px] leading-none font-semibold tracking-[-0.025em] tabular-nums sm:text-[26px] md:text-[30px]"
        />
        <div className="mt-3 flex min-h-5 flex-wrap items-center gap-x-2 gap-y-1">
          {hasDelta ? (
            <span
              className={cn(
                'inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums',
                isPositive
                  ? 'bg-system-green/15 text-delta-good'
                  : 'bg-system-red/12 text-destructive',
              )}
            >
              {isPositive ? (
                <ArrowUpRightIcon className="size-3" strokeWidth={2.5} />
              ) : (
                <ArrowDownRightIcon className="size-3" strokeWidth={2.5} />
              )}
              {Math.abs(delta).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%
            </span>
          ) : null}
          <span className="text-label-secondary text-xs">
            {hasDelta ? 'vs. 30 dias anteriores' : 'Sem dados no período anterior'}
          </span>
        </div>
      </div>
    </AppleTile>
  );
}
