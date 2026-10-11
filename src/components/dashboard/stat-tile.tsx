'use client';

import type { LucideIcon } from 'lucide-react';
import { ArrowDownRightIcon, ArrowUpRightIcon } from 'lucide-react';

import { cn } from '@/lib/utils';
import { AppleTile, TileEyebrow } from '@/components/dashboard/apple-tile';

export function StatTile({
  label,
  value,
  delta,
  hint,
  icon: Icon,
  iconColor = 'var(--system-blue)',
  valueClassName,
  index = 0,
}: {
  label: string;
  value: string;
  /** Percentage change vs. the prior period. null = no comparable prior data. */
  delta?: number | null;
  /** Small secondary line under the value. */
  hint?: React.ReactNode;
  icon?: LucideIcon;
  iconColor?: string;
  valueClassName?: string;
  /** Position in a group of tiles, used to stagger the entrance animation. */
  index?: number;
}) {
  const hasDelta = delta !== undefined && delta !== null;
  const isFlat = hasDelta && Math.abs(delta) < 0.05;
  const isPositive = hasDelta && delta > 0;

  return (
    <AppleTile index={index} className="flex flex-col justify-between gap-4 p-4 md:p-5">
      <div className="flex items-center justify-between gap-2">
        <TileEyebrow>{label}</TileEyebrow>
        {Icon && (
          <span
            className="flex size-7 items-center justify-center rounded-full text-white"
            style={{ backgroundColor: iconColor }}
          >
            <Icon className="size-3.5" strokeWidth={2.5} />
          </span>
        )}
      </div>
      <div>
        <div
          className={cn(
            'truncate text-[22px] leading-none font-semibold tracking-[-0.025em] tabular-nums md:text-[26px]',
            valueClassName,
          )}
        >
          {value}
        </div>
        {(hasDelta || hint) && (
          <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1">
            {hasDelta && (
              <span
                className={cn(
                  'inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums',
                  isFlat
                    ? 'bg-foreground/[0.06] text-label-secondary'
                    : isPositive
                      ? 'bg-system-green/15 text-delta-good'
                      : 'bg-system-red/12 text-destructive',
                )}
              >
                {!isFlat &&
                  (isPositive ? (
                    <ArrowUpRightIcon className="size-3" strokeWidth={2.5} />
                  ) : (
                    <ArrowDownRightIcon className="size-3" strokeWidth={2.5} />
                  ))}
                {Math.abs(delta).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%
              </span>
            )}
            {hint && <span className="text-label-secondary text-xs">{hint}</span>}
          </div>
        )}
      </div>
    </AppleTile>
  );
}
