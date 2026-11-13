'use client';

import * as React from 'react';
import { motion } from 'motion/react';

import { cn } from '@/lib/utils';

/**
 * iOS-style segmented control whose selection pill slides between options. No celular, quando as
 * opções não cabem numa linha, elas quebram para a linha de baixo — nunca ficam escondidas numa
 * rolagem lateral.
 */
export function SegmentedControl<T extends string>({
  value,
  onValueChange,
  options,
  className,
  size = 'default',
  stretch = false,
}: {
  value: T;
  onValueChange: (value: T) => void;
  options: { value: T; label: React.ReactNode }[];
  className?: string;
  size?: 'sm' | 'default';
  /** Ocupa a largura toda, com as opções do mesmo tamanho (abas no celular). */
  stretch?: boolean;
}) {
  const id = React.useId();

  return (
    <div
      role="radiogroup"
      className={cn(
        // Raio = metade da altura de uma linha: pílula numa linha, cantos suaves quando quebra.
        'bg-foreground/[0.06] inline-flex max-w-full items-center overflow-x-auto p-0.5 max-md:flex-wrap max-md:overflow-visible',
        size === 'sm' ? 'rounded-[16px]' : 'rounded-[18px]',
        stretch && 'flex w-full',
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
              'focus-visible:ring-ring/50 relative shrink-0 rounded-full font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-2 max-md:grow',
              stretch && 'flex-1',
              size === 'sm' ? 'h-7 px-3 text-xs' : 'h-8 px-4 text-[13px]',
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
