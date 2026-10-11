'use client';

import * as React from 'react';
import { SearchIcon, XIcon } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';

/** Case- and accent-insensitive "contains" used by every list search box. */
export function matchesSearch(query: string, ...fields: (string | null | undefined)[]): boolean {
  const normalize = (value: string) => value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  const needle = normalize(query.trim());
  if (!needle) return true;
  return fields.some((field) => field && normalize(field).includes(needle));
}

/** Spotlight-style rounded search field with a clear button. */
export function SearchField({
  value,
  onChange,
  placeholder = 'Buscar…',
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={cn('relative w-full sm:max-w-xs', className)}>
      <SearchIcon className="text-label-secondary pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2" />
      <Input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="rounded-full pr-9 pl-10"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="Limpar busca"
          className="bg-foreground/25 text-background hover:bg-foreground/40 absolute top-1/2 right-3 flex size-4 -translate-y-1/2 items-center justify-center rounded-full transition-colors"
        >
          <XIcon className="size-3" strokeWidth={3} />
        </button>
      )}
    </div>
  );
}

/** Row of list controls: search on the left, filters on the right. */
export function ListToolbar({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap items-center justify-between gap-3">{children}</div>;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return (
    (parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')
  ).toUpperCase();
}

/** Contacts-style initials avatar, tinted with the entity's color when it has one. */
export function InitialsAvatar({
  name,
  color = '#8e8e93',
  className,
}: {
  name: string;
  color?: string;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        'flex size-8 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.3)]',
        className,
      )}
      style={{
        background: `linear-gradient(145deg, color-mix(in oklab, ${color} 70%, white), ${color})`,
      }}
    >
      {initials(name)}
    </span>
  );
}
