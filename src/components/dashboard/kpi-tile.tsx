'use client';

import { ArrowDownRightIcon, ArrowUpRightIcon } from 'lucide-react';

import { cn } from '@/lib/utils';
import { AppleTile, TileEyebrow } from '@/components/dashboard/apple-tile';
import { AnimatedNumber, type NumberFormat } from '@/components/dashboard/animated-number';

/** Apple-style KPI tile with an animated count-up value. */
export function KpiTile({
  label,
  value,
  format,
  delta,
  index = 0,
  deltaUnit = '%',
  lowerIsBetter = false,
  compareLabel = 'vs. 30 dias anteriores',
  hint,
}: {
  label: string;
  /** null = sem dado para calcular (mostra "—"). */
  value: number | null;
  format: NumberFormat;
  /** Percentage change vs. the prior period. null = no comparable prior data. */
  delta?: number | null;
  /** '%' = variação relativa; 'p.p.' = diferença em pontos percentuais (para taxas). */
  deltaUnit?: '%' | 'p.p.';
  /** Faltas e cancelamentos: subir é ruim. */
  lowerIsBetter?: boolean;
  compareLabel?: string;
  /** Linha curta explicando o indicador (ou a referência de mercado). */
  hint?: string;
  /** Position in a group of tiles, used to stagger the entrance animation. */
  index?: number;
}) {
  const hasDelta = delta !== undefined && delta !== null;
  const isFlat = hasDelta && Math.abs(delta) < 0.05;
  const isPositive = hasDelta && delta > 0;
  const isGood = lowerIsBetter ? !isPositive : isPositive;

  return (
    <AppleTile index={index} className="flex flex-col justify-between gap-5 p-4 md:p-6">
      <TileEyebrow>{label}</TileEyebrow>
      <div>
        {value === null ? (
          <span className="text-label-secondary block text-[22px] leading-none font-semibold sm:text-[26px] md:text-[30px]">
            —
          </span>
        ) : (
          <AnimatedNumber
            value={value}
            format={format}
            className="block truncate text-[22px] leading-none font-semibold tracking-[-0.025em] tabular-nums sm:text-[26px] md:text-[30px]"
          />
        )}
        <div className="mt-3 flex min-h-5 flex-wrap items-center gap-x-2 gap-y-1">
          {hasDelta ? (
            <span
              className={cn(
                'inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums',
                isFlat
                  ? 'bg-foreground/[0.06] text-label-secondary'
                  : isGood
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
              {Math.abs(delta).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}
              {deltaUnit === '%' ? '%' : ' p.p.'}
            </span>
          ) : null}
          <span className="text-label-secondary text-xs">
            {hasDelta ? compareLabel : 'Sem dados no período anterior'}
          </span>
        </div>
        {hint && <p className="text-label-secondary mt-2 text-[11px] leading-snug">{hint}</p>}
      </div>
    </AppleTile>
  );
}
