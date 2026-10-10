'use client';

import * as React from 'react';
import { motion, useReducedMotion } from 'motion/react';

import { cn } from '@/lib/utils';

/**
 * Apple-style surface: borderless #f5f5f7 tile with a large radius, a soft
 * spotlight that follows the cursor and a scroll-triggered fade-up entrance.
 * The spotlight position is written to CSS variables directly so mouse moves
 * never re-render React.
 */
export function AppleTile({
  children,
  className,
  index = 0,
  interactive = true,
}: {
  children: React.ReactNode;
  className?: string;
  /** Position in a group of tiles, used to stagger the entrance animation. */
  index?: number;
  /** Enables the hover lift + cursor spotlight. */
  interactive?: boolean;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    el.style.setProperty('--spot-x', `${event.clientX - rect.left}px`);
    el.style.setProperty('--spot-y', `${event.clientY - rect.top}px`);
  }

  return (
    <motion.div
      ref={ref}
      initial={reduceMotion ? false : { opacity: 0, y: 24, scale: 0.98 }}
      whileInView={{ opacity: 1, y: 0, scale: 1 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ type: 'spring', stiffness: 260, damping: 30, delay: index * 0.06 }}
      onPointerMove={interactive ? handlePointerMove : undefined}
      className={cn(
        'group/tile bg-tile relative isolate overflow-hidden rounded-[22px] p-5 md:p-6',
        interactive &&
          'hover:bg-tile-hover transition-[background-color,transform,box-shadow] duration-500 ease-[cubic-bezier(0.25,0.1,0.25,1)] hover:-translate-y-0.5 hover:shadow-[0_18px_40px_-24px_rgb(0_0_0/0.25)]',
        className,
      )}
    >
      {interactive && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 opacity-0 transition-opacity duration-500 group-hover/tile:opacity-100"
          style={{
            background:
              'radial-gradient(420px circle at var(--spot-x, 50%) var(--spot-y, 50%), color-mix(in oklab, var(--system-blue) 9%, transparent), transparent 70%)',
          }}
        />
      )}
      {children}
    </motion.div>
  );
}

export function TileEyebrow({ children }: { children: React.ReactNode }) {
  return <div className="text-label-secondary text-[13px] font-medium">{children}</div>;
}
