'use client';

import * as React from 'react';
import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { TargetIcon } from 'lucide-react';
import { toast } from 'sonner';

import { AppleTile, TileEyebrow } from '@/components/dashboard/apple-tile';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { unwrapResult } from '@/lib/action-result';
import { formatCurrencyBRL } from '@/lib/serialize';
import { cn } from '@/lib/utils';
import { setRevenueGoalAction } from '@/server/actions/dashboard-actions';

function parseMoney(value: string): number {
  const n = Number(
    value
      .replace(/[^\d,.-]/g, '')
      .replace(/\./g, '')
      .replace(',', '.'),
  );
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

/** Meta de faturamento do mês: quanto já entrou, a projeção no ritmo atual e quanto falta por dia. */
export function GoalCard({
  goal,
  revenue,
  projection,
  dayOfMonth,
  totalDays,
}: {
  goal: number | null;
  revenue: number;
  projection: number;
  dayOfMonth: number;
  totalDays: number;
}) {
  const router = useRouter();
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(goal ? String(goal).replace('.', ',') : '');
  const save = useMutation({
    mutationFn: (value: number | null) => setRevenueGoalAction({ goal: value }).then(unwrapResult),
    onSuccess: () => {
      setEditing(false);
      toast.success('Meta do mês salva.');
      router.refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const form = (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const value = parseMoney(draft);
        save.mutate(value > 0 ? value : null);
      }}
    >
      <Input
        autoFocus
        inputMode="decimal"
        placeholder="Ex: 20.000"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        className="h-9 w-36"
        aria-label="Meta de faturamento do mês"
      />
      <Button type="submit" size="sm" disabled={save.isPending}>
        Salvar meta
      </Button>
      {goal && (
        <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)}>
          Voltar
        </Button>
      )}
    </form>
  );

  if (!goal || editing) {
    return (
      <AppleTile interactive={false} className="flex flex-col gap-4 p-5 md:p-6">
        <div className="flex items-center gap-2">
          <TargetIcon className="text-system-blue size-4" />
          <TileEyebrow>Meta do mês</TileEyebrow>
        </div>
        <p className="text-[15px] leading-snug">
          Quanto você quer faturar este mês? O painel mostra se o ritmo atual chega lá e quanto
          falta por dia.
        </p>
        {form}
      </AppleTile>
    );
  }

  const progress = Math.min(100, (revenue / goal) * 100);
  const remaining = Math.max(0, goal - revenue);
  const daysLeft = Math.max(1, totalDays - dayOfMonth + 1);
  const onTrack = projection >= goal;
  const reached = revenue >= goal;

  return (
    <AppleTile interactive={false} className="flex flex-col gap-4 p-5 md:p-6">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <TargetIcon className="text-system-blue size-4" />
          <TileEyebrow>Meta do mês</TileEyebrow>
        </div>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="text-system-blue text-[13px] font-medium hover:underline"
        >
          Alterar
        </button>
      </div>
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="text-[26px] leading-none font-semibold tracking-[-0.025em] tabular-nums md:text-[30px]">
          {formatCurrencyBRL(revenue)}
        </span>
        <span className="text-label-secondary text-[14px]">de {formatCurrencyBRL(goal)}</span>
      </div>
      <div className="bg-foreground/[0.07] h-2.5 overflow-hidden rounded-full">
        <div
          className={cn(
            'h-full rounded-full transition-[width] duration-700',
            reached || onTrack ? 'bg-system-green' : 'bg-system-blue',
          )}
          style={{ width: `${progress}%` }}
        />
      </div>
      <p className="text-[13px] leading-snug">
        {reached ? (
          <span className="text-delta-good font-semibold">Meta batida! 🎉</span>
        ) : (
          <>
            <span
              className={cn(
                'font-semibold',
                onTrack ? 'text-delta-good' : 'text-[#b25f00] dark:text-[#ffb340]',
              )}
            >
              {onTrack ? 'No ritmo para bater.' : 'Abaixo do ritmo.'}
            </span>{' '}
            <span className="text-label-secondary">
              Projeção: {formatCurrencyBRL(projection)}. Faltam {formatCurrencyBRL(remaining)} —{' '}
              {formatCurrencyBRL(remaining / daysLeft)} por dia até o fim do mês.
            </span>
          </>
        )}
      </p>
    </AppleTile>
  );
}
