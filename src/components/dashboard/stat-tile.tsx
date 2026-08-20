'use client';

import { ArrowDownIcon, ArrowUpIcon } from 'lucide-react';
import { motion } from 'motion/react';

import { cn } from '@/lib/utils';

export function StatTile({
  label,
  value,
  delta,
  index = 0,
}: {
  label: string;
  value: string;
  /** Percentage change vs. the prior period. null = no comparable prior data. */
  delta?: number | null;
  /** Position in a group of tiles, used to stagger the entrance animation. */
  index?: number;
}) {
  const hasDelta = delta !== undefined && delta !== null;
  const isPositive = hasDelta && delta >= 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: index * 0.05, ease: [0.34, 1.56, 0.64, 1] }}
      className="hover:border-primary/30 rounded-lg border p-4 transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-0.5 hover:shadow-md hover:shadow-primary/5"
    >
      <div className="text-muted-foreground text-sm">{label}</div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="text-2xl font-semibold tracking-tight tabular-nums">{value}</span>
        {hasDelta && (
          <span
            className={cn(
              'flex items-center gap-0.5 text-xs font-medium tabular-nums',
              isPositive ? 'text-delta-good' : 'text-destructive',
            )}
          >
            {isPositive ? <ArrowUpIcon className="size-3" /> : <ArrowDownIcon className="size-3" />}
            {Math.abs(delta).toFixed(1)}%
          </span>
        )}
      </div>
      {hasDelta && <div className="text-muted-foreground mt-1 text-xs">vs. 30 dias anteriores</div>}
    </motion.div>
  );
}
