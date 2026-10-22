'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import { toast } from 'sonner';

import { unwrapResult } from '@/lib/action-result';
import { maskMoneyInput, moneyToInput, parseMoneyInput } from '@/lib/money-input';
import { formatCurrencyBRL } from '@/lib/serialize';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  copyPreviousGoalsAction,
  getPeriodGoalsAction,
  setPeriodGoalAction,
} from '@/server/actions/report-actions';
import type { getPeriodGoals } from '@/server/data/period-goals';

const MONTHS = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
];

function shift(month: string, delta: number) {
  const [y, m] = month.split('-').map(Number);
  const total = y * 12 + m - 1 + delta;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
}
const monthLabel = (month: string) => {
  const [y, m] = month.split('-').map(Number);
  return `${MONTHS[m - 1]} de ${y}`;
};

type Item = Awaited<ReturnType<typeof getPeriodGoals>>['items'][number];

/** Metas por período (Pro): um alvo por indicador e mês; o realizado vem dos registros. */
export function PeriodGoals() {
  const queryClient = useQueryClient();
  const [month, setMonth] = React.useState<string | null>(null);
  const { data } = useQuery({
    queryKey: ['period-goals', month],
    queryFn: () => getPeriodGoalsAction({ month: month ?? undefined }).then(unwrapResult),
  });
  const shown = month ?? data?.month ?? null;
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['period-goals'] });

  const copy = useMutation({
    mutationFn: () => copyPreviousGoalsAction({ month: shown }).then(unwrapResult),
    onSuccess: (r) => {
      toast.success(
        r.copied
          ? `${r.copied} meta(s) copiada(s) do mês anterior.`
          : 'Este mês já tinha essas metas.',
      );
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <section className="bg-tile flex flex-col gap-4 rounded-[22px] p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-[17px] font-semibold">Metas do mês</h2>
          <p className="text-label-secondary text-[13px]">
            Um alvo para cada indicador, mês a mês. O realizado é calculado pelos registros; a
            projeção (só no mês em andamento) é o ritmo de hoje até o fim do mês.
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Mês anterior"
            disabled={!shown}
            onClick={() => shown && setMonth(shift(shown, -1))}
          >
            <ChevronLeftIcon className="size-4" />
          </Button>
          <span className="min-w-36 text-center text-[14px] font-medium first-letter:uppercase">
            {shown ? monthLabel(shown) : '…'}
          </span>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Próximo mês"
            disabled={!shown}
            onClick={() => shown && setMonth(shift(shown, 1))}
          >
            <ChevronRightIcon className="size-4" />
          </Button>
        </div>
      </div>

      {data && shown && (
        <>
          <div className="flex flex-col gap-2">
            {data.items.map((item) => (
              <GoalRow
                key={`${shown}:${item.metric}`}
                item={item}
                month={shown}
                onSaved={refresh}
              />
            ))}
          </div>
          {data.items.every((i) => i.target === null) && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="self-start"
              disabled={copy.isPending}
              onClick={() => copy.mutate()}
            >
              Copiar metas do mês anterior
            </Button>
          )}
        </>
      )}
    </section>
  );
}

function GoalRow({ item, month, onSaved }: { item: Item; month: string; onSaved: () => void }) {
  const money = item.unit === 'R$';
  const [draft, setDraft] = React.useState(
    item.target === null ? '' : money ? moneyToInput(item.target) : String(item.target),
  );
  const fmt = (n: number) => (money ? formatCurrencyBRL(n) : n.toLocaleString('pt-BR'));
  const save = useMutation({
    mutationFn: (target: number | null) =>
      setPeriodGoalAction({ metric: item.metric, month, target }).then(unwrapResult),
    onSuccess: () => {
      toast.success('Meta salva.');
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const commit = () => {
    const value = money ? parseMoneyInput(draft) : Number(draft.replace(/\D/g, ''));
    const next = draft.trim() && value > 0 ? value : null;
    if (next === item.target) return;
    save.mutate(next);
  };
  const pct = item.pct ?? 0;

  return (
    <div className="ring-foreground/[0.06] flex flex-col gap-2 rounded-xl p-3 ring-1">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-[14px] font-medium">{item.label}</div>
          <div className="text-label-secondary text-[11px]">{item.formula}</div>
        </div>
        <label className="flex items-center gap-2 text-[12px]">
          <span className="text-label-secondary">Meta</span>
          <Input
            className="h-8 w-32"
            inputMode={money ? 'decimal' : 'numeric'}
            placeholder={money ? '0,00' : '0'}
            value={draft}
            onChange={(e) =>
              setDraft(money ? maskMoneyInput(e.target.value) : e.target.value.replace(/\D/g, ''))
            }
            onBlur={commit}
            onKeyDown={(e) => e.key === 'Enter' && commit()}
            aria-label={`Meta de ${item.label}`}
          />
        </label>
      </div>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[13px]">
        <span>
          Realizado: <strong className="tabular-nums">{fmt(item.value)}</strong>
        </span>
        {item.target !== null && (
          <span className="text-label-secondary tabular-nums">
            {item.pct}% de {fmt(item.target)}
          </span>
        )}
        {item.projection !== null && (
          <span className="text-label-secondary tabular-nums">
            Projeção no ritmo atual: {fmt(item.projection)}
          </span>
        )}
      </div>
      {item.target !== null && (
        <div className="bg-foreground/[0.06] h-1.5 overflow-hidden rounded-full">
          <div
            className={`h-full rounded-full ${pct >= 100 ? 'bg-system-green' : 'bg-system-blue'}`}
            style={{ width: `${Math.min(100, pct)}%` }}
          />
        </div>
      )}
    </div>
  );
}
