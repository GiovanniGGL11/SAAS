'use client';

import { SparklesIcon } from 'lucide-react';

import type { TopPerformer } from '@/server/data/dashboard';
import { AppleTile, TileEyebrow } from '@/components/dashboard/apple-tile';
import { AnimatedNumber } from '@/components/dashboard/animated-number';

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return (
    (parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')
  ).toUpperCase();
}

export function TopPerformerCard({
  label,
  performer,
  countLabel,
  index = 0,
}: {
  label: string;
  performer: TopPerformer | null;
  countLabel: string;
  index?: number;
}) {
  if (!performer) {
    return (
      <AppleTile index={index} className="flex flex-col gap-4">
        <TileEyebrow>{label}</TileEyebrow>
        <div className="text-label-secondary flex flex-1 items-center gap-2 text-sm">
          <SparklesIcon className="size-4" />
          Sem dados nos últimos 30 dias.
        </div>
      </AppleTile>
    );
  }

  return (
    <AppleTile index={index} className="flex flex-col justify-between gap-5">
      <TileEyebrow>{label}</TileEyebrow>
      <div className="flex items-center gap-3.5">
        <div
          className="relative flex size-12 shrink-0 items-center justify-center rounded-full text-base font-semibold text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.35)] transition-transform duration-500 group-hover/tile:scale-105"
          style={{
            background: `linear-gradient(145deg, color-mix(in oklab, ${performer.color} 75%, white), ${performer.color})`,
          }}
        >
          {initials(performer.name)}
        </div>
        <div className="min-w-0">
          <div className="truncate text-[19px] leading-tight font-semibold tracking-[-0.02em]">
            {performer.name}
          </div>
          <div className="text-label-secondary mt-0.5 text-[13px] tabular-nums">
            <AnimatedNumber value={performer.revenue} format="currency" /> · {performer.count}{' '}
            {countLabel}
          </div>
        </div>
      </div>
    </AppleTile>
  );
}
