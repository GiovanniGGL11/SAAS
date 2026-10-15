'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowRightIcon, CheckCircle2Icon, ChevronDownIcon, CircleIcon } from 'lucide-react';

import { AppleTile, TileEyebrow } from '@/components/dashboard/apple-tile';
import { cn } from '@/lib/utils';

export type SetupStep = { label: string; hint: string; href: string; done: boolean };

/**
 * Primeiros passos de uma conta nova. Fechado por padrão: uma linha com o progresso e só a
 * próxima pendência, para não ocupar a primeira tela. Some sozinho quando tudo estiver feito.
 */
export function SetupChecklist({ steps }: { steps: SetupStep[] }) {
  const [expanded, setExpanded] = React.useState(false);
  const done = steps.filter((s) => s.done).length;
  const next = steps.find((s) => !s.done);
  if (!next) return null;

  return (
    <AppleTile interactive={false} className="flex flex-col gap-3 p-4 md:p-5">
      <div className="flex items-center gap-3">
        <TileEyebrow>Primeiros passos</TileEyebrow>
        <div className="bg-foreground/[0.07] h-1.5 flex-1 overflow-hidden rounded-full">
          <div
            className="bg-system-green h-full rounded-full transition-[width] duration-500"
            style={{ width: `${(done / steps.length) * 100}%` }}
          />
        </div>
        <span className="text-label-secondary text-[12px] tabular-nums">
          {done} de {steps.length}
        </span>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="text-system-blue flex items-center gap-0.5 text-[13px] font-medium"
        >
          {expanded ? 'Recolher' : 'Ver todos'}
          <ChevronDownIcon
            className={cn('size-4 transition-transform', expanded && 'rotate-180')}
          />
        </button>
      </div>

      {expanded ? (
        <ul className="flex flex-col gap-1">
          {steps.map((step) => (
            <li key={step.label}>
              <Link
                href={step.href}
                className={cn(
                  'hover:bg-foreground/[0.04] flex items-start gap-3 rounded-xl px-2 py-2',
                  step === next && 'bg-system-blue/[0.06]',
                )}
              >
                {step.done ? (
                  <CheckCircle2Icon className="text-system-green mt-0.5 size-5 shrink-0" />
                ) : (
                  <CircleIcon className="text-label-secondary mt-0.5 size-5 shrink-0" />
                )}
                <span>
                  <span className={step.done ? 'text-label-secondary line-through' : 'font-medium'}>
                    {step.label}
                  </span>
                  {!step.done && (
                    <span className="text-label-secondary block text-[13px]">{step.hint}</span>
                  )}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        // Fechado: só o que fazer agora.
        <Link
          href={next.href}
          className="bg-system-blue/[0.07] hover:bg-system-blue/[0.11] flex items-center gap-3 rounded-2xl px-3 py-2.5 transition-colors"
        >
          <CircleIcon className="text-system-blue size-5 shrink-0" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[14px] font-semibold">{next.label}</span>
            <span className="text-label-secondary block truncate text-[12px]">{next.hint}</span>
          </span>
          <span className="text-system-blue flex shrink-0 items-center gap-1 text-[13px] font-semibold">
            Fazer agora
            <ArrowRightIcon className="size-4" />
          </span>
        </Link>
      )}
    </AppleTile>
  );
}
