'use client';

import * as React from 'react';
import Link from 'next/link';
import { ChevronRightIcon } from 'lucide-react';

import { cn } from '@/lib/utils';

/**
 * Phone replacement for a table: one tappable row per record (iOS Settings style).
 * Pages render this `md:hidden` next to their `hidden md:block` table.
 */
export function MobileList({ className, ...props }: React.ComponentProps<'ul'>) {
  return (
    <ul className={cn('divide-foreground/[0.06] divide-y md:hidden', className)} {...props} />
  );
}

export function MobileListItem({
  leading,
  title,
  subtitle,
  trailing,
  href,
  onClick,
  chevron = true,
}: {
  leading?: React.ReactNode;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  /** Right-aligned value (price, balance…). Controls with their own taps should stop propagation. */
  trailing?: React.ReactNode;
  href?: string;
  onClick?: () => void;
  chevron?: boolean;
}) {
  const content = (
    <>
      {leading}
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1.5 text-[15px] font-medium">{title}</div>
        {subtitle && (
          <div className="text-label-secondary truncate text-[13px] tabular-nums">{subtitle}</div>
        )}
      </div>
      {trailing && <div className="flex shrink-0 items-center gap-2">{trailing}</div>}
      {chevron && (href || onClick) && (
        <ChevronRightIcon className="text-label-secondary/60 size-4 shrink-0" />
      )}
    </>
  );
  const rowClass =
    'flex min-h-14 w-full items-center gap-3 px-4 py-2.5 text-left transition-colors active:bg-foreground/[0.05]';

  return (
    <li>
      {href ? (
        <Link href={href} className={rowClass}>
          {content}
        </Link>
      ) : onClick ? (
        // A div, not a button: rows may contain their own controls (a Switch is a button).
        <div
          role="button"
          tabIndex={0}
          onClick={onClick}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              onClick();
            }
          }}
          className={cn(rowClass, 'cursor-pointer')}
        >
          {content}
        </div>
      ) : (
        <div className={rowClass}>{content}</div>
      )}
    </li>
  );
}
