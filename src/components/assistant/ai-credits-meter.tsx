'use client';

import Link from 'next/link';
import { SparklesIcon } from 'lucide-react';

import { cn } from '@/lib/utils';
import { CREDITS_PER_QUESTION, creditsInfo, type CreditsUsage } from '@/lib/ai-credits';

const LEVEL_STYLE = {
  ok: { bar: 'bg-system-green', text: 'text-label-secondary' },
  warning: { bar: 'bg-system-orange', text: 'text-system-orange' },
  critical: { bar: 'bg-system-red', text: 'text-system-red' },
  empty: { bar: 'bg-system-red', text: 'text-system-red' },
} as const;

/**
 * Créditos de IA do mês, sempre à vista: quanto sobra, a barra (verde → laranja → vermelha), a
 * conta em perguntas e quando renova. "full" explica como o crédito é gasto.
 */
export function AiCreditsMeter({
  usage,
  variant = 'compact',
  canUpgrade = false,
}: {
  usage: CreditsUsage;
  variant?: 'compact' | 'full';
  /** Administrador sem o maior plano: mostra o caminho para ter mais créditos. */
  canUpgrade?: boolean;
}) {
  const info = creditsInfo(usage);
  const style = LEVEL_STYLE[info.level];
  const fmt = (n: number) => n.toLocaleString('pt-BR');

  return (
    <div className={cn('flex flex-col gap-1.5', variant === 'full' && 'gap-2')}>
      <div className="flex items-baseline justify-between gap-2">
        <span
          className={cn(
            'flex items-center gap-1.5 font-medium',
            variant === 'full' ? 'text-[14px]' : 'text-[12px]',
          )}
        >
          <SparklesIcon className="text-system-blue size-3.5" aria-hidden />
          Créditos de IA
        </span>
        <span
          className={cn(
            'tabular-nums',
            variant === 'full' ? 'text-[14px] font-semibold' : 'text-[12px] font-medium',
          )}
        >
          {fmt(usage.remaining)}{' '}
          <span className="text-label-secondary font-normal">de {fmt(usage.limit)} restantes</span>
        </span>
      </div>
      <div
        className="bg-foreground/[0.08] h-2 overflow-hidden rounded-full"
        role="progressbar"
        aria-label="Créditos de IA usados neste mês"
        aria-valuemin={0}
        aria-valuemax={usage.limit}
        aria-valuenow={usage.limit - usage.remaining}
      >
        <div
          className={cn('h-full rounded-full transition-[width] duration-700 ease-out', style.bar)}
          style={{ width: `${info.percent}%` }}
        />
      </div>
      <p className={cn('text-[11px] leading-snug', style.text)}>
        {info.level === 'empty'
          ? `Os créditos deste mês acabaram. Renovam em ${info.renewsOn}; o resto do sistema continua normal.`
          : `≈ ${fmt(info.questionsLeft)} perguntas restantes · ${info.percent}% usado · renova em ${info.renewsOn}`}
      </p>
      {variant === 'full' && (
        <p className="text-label-secondary text-[12px] leading-snug">
          Cada pergunta usa de 1 a 6 créditos — cerca de {CREDITS_PER_QUESTION} em média —, conforme
          quantas consultas o assistente precisa fazer (por exemplo, ver a agenda e depois os
          clientes). Executar o que você aprovou não gasta crédito.
        </p>
      )}
      {canUpgrade && (info.level === 'critical' || info.level === 'empty') && (
        <Link href="/assinatura" className="text-system-blue text-[12px] font-medium">
          Precisa de mais? O plano Pro tem mais créditos →
        </Link>
      )}
    </div>
  );
}
