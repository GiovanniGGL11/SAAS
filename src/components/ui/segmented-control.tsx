'use client';

import * as React from 'react';
import { motion } from 'motion/react';

import { cn } from '@/lib/utils';

/** iOS-style segmented control whose selection pill slides between options. */
export function SegmentedControl<T extends string>({
  value,
  onValueChange,
  options,
  className,
  size = 'default',
}: {
  value: T;
  onValueChange: (value: T) => void;
  options: { value: T; label: React.ReactNode }[];
  className?: string;
  size?: 'sm' | 'default';
}) {
  const id = React.useId();

  return (
    <div
      role="radiogroup"
      className={cn(
        'bg-foreground/[0.06] inline-flex max-w-full items-center overflow-x-auto rounded-full p-0.5',
        className,
      )}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onValueChange(option.value)}
            className={cn(
              'focus-visible:ring-ring/50 relative shrink-0 rounded-full font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-2',
              size === 'sm' ? 'h-8 px-3 text-xs md:h-7' : 'h-9 px-4 text-[13px] md:h-8',
              selected ? 'text-foreground' : 'text-label-secondary hover:text-foreground',
            )}
          >
            {selected && (
              <motion.span
                layoutId={`segment-${id}`}
                className="bg-background absolute inset-0 rounded-full shadow-[0_1px_4px_rgb(0_0_0/0.12),0_0_0_0.5px_rgb(0_0_0/0.04)] dark:bg-white/15"
                transition={{ type: 'spring', stiffness: 500, damping: 38 }}
              />
            )}
            <span className="relative">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
