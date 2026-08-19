'use client';

import { CheckIcon } from 'lucide-react';

import { cn } from '@/lib/utils';

export const PRESET_COLORS = [
  '#f97316', // orange
  '#f59e0b', // amber
  '#eab308', // yellow
  '#22c55e', // green
  '#10b981', // emerald
  '#14b8a6', // teal
  '#06b6d4', // cyan
  '#0ea5e9', // sky
  '#3b82f6', // blue
  '#6366f1', // indigo
  '#8b5cf6', // violet
  '#a855f7', // purple
  '#d946ef', // fuchsia
  '#ec4899', // pink
  '#f43f5e', // rose
  '#64748b', // slate
];

export function ColorPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (color: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {PRESET_COLORS.map((color) => (
        <button
          key={color}
          type="button"
          onClick={() => onChange(color)}
          className="ring-offset-background flex size-7 items-center justify-center rounded-full ring-offset-2 transition-transform hover:scale-110 focus-visible:outline-none"
          style={{
            backgroundColor: color,
            boxShadow: value === color ? `0 0 0 2px ${color}` : undefined,
          }}
          aria-label={`Selecionar cor ${color}`}
        >
          {value === color && <CheckIcon className="size-4 text-white drop-shadow" />}
        </button>
      ))}
      <div
        className={cn(
          'flex size-7 items-center justify-center rounded-full border',
          !PRESET_COLORS.includes(value) && 'ring-2 ring-offset-2',
        )}
        style={{ backgroundColor: PRESET_COLORS.includes(value) ? undefined : value }}
      >
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="size-7 cursor-pointer opacity-0"
          aria-label="Cor personalizada"
        />
      </div>
    </div>
  );
}
