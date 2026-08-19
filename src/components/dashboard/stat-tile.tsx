import { ArrowDownIcon, ArrowUpIcon } from 'lucide-react';

import { cn } from '@/lib/utils';

export function StatTile({
  label,
  value,
  delta,
}: {
  label: string;
  value: string;
  /** Percentage change vs. the prior period. null = no comparable prior data. */
  delta?: number | null;
}) {
  const hasDelta = delta !== undefined && delta !== null;
  const isPositive = hasDelta && delta >= 0;

  return (
    <div className="rounded-lg border p-4">
      <div className="text-muted-foreground text-sm">{label}</div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="text-2xl font-semibold tracking-tight">{value}</span>
        {hasDelta && (
          <span
            className={cn(
              'flex items-center gap-0.5 text-xs font-medium',
              isPositive ? 'text-delta-good' : 'text-destructive',
            )}
          >
            {isPositive ? <ArrowUpIcon className="size-3" /> : <ArrowDownIcon className="size-3" />}
            {Math.abs(delta).toFixed(1)}%
          </span>
        )}
      </div>
      <div className="text-muted-foreground mt-1 text-xs">vs. 30 dias anteriores</div>
    </div>
  );
}
