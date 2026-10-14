'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PlusIcon, RepeatIcon } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Surface } from '@/components/layout/page';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { unwrapResult } from '@/lib/action-result';
import { formatCurrencyBRL } from '@/lib/serialize';
import { PAYMENT_METHODS } from '@/lib/validations/finance';
import { cn } from '@/lib/utils';
import {
  createRecurringExpenseAction,
  listFinanceCategoriesAction,
  listRecurringExpensesAction,
  setRecurringExpenseActiveAction,
  updateRecurringExpenseAction,
} from '@/server/actions/finance-actions';

type Recurring = Awaited<ReturnType<typeof listRecurringExpensesAction>>[number];

function parseMoney(value: string): number {
  const n = Number(value.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

/** Aluguel, luz, sistema: cadastrados uma vez, viram conta pendente todo mês em Lançamentos. */
export function RecurringExpensesView() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = React.useState<Recurring | 'new' | null>(null);
  const { data } = useQuery({
    queryKey: ['recurring-expenses'],
    queryFn: () => listRecurringExpensesAction(),
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['recurring-expenses'] });
    queryClient.invalidateQueries({ queryKey: ['transactions'] });
    queryClient.invalidateQueries({ queryKey: ['cash-flow'] });
  };

  const toggle = useMutation({
    mutationFn: (input: { id: string; active: boolean }) =>
      setRecurringExpenseActiveAction(input).then(unwrapResult),
    onSuccess: (_, input) => {
      toast.success(
        input.active
          ? 'Conta fixa reativada.'
          : 'Conta fixa pausada; as pendentes foram canceladas.',
      );
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const monthlyTotal = (data ?? []).filter((r) => r.active).reduce((s, r) => s + r.amount, 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-label-secondary text-[14px]">
          Cada conta fixa entra como pendente em Lançamentos (este mês e o próximo), no dia do
          vencimento.
          {monthlyTotal > 0 && (
            <>
              {' '}
              Total por mês:{' '}
              <strong className="text-foreground">{formatCurrencyBRL(monthlyTotal)}</strong>.
            </>
          )}
        </p>
        <Button onClick={() => setEditing('new')}>
          <PlusIcon className="size-4" />
          Nova conta fixa
        </Button>
      </div>

      {!data ? (
        <Skeleton className="h-48 rounded-[22px]" />
      ) : data.length === 0 ? (
        <Surface>
          <EmptyState
            icon={RepeatIcon}
            title="Nenhuma conta fixa"
            description="Cadastre aluguel, energia, internet e o que mais se paga todo mês."
          />
        </Surface>
      ) : (
        <Surface>
          <ul className="divide-foreground/[0.06] divide-y">
            {data.map((r) => (
              <li
                key={r.id}
                className={cn('flex items-center gap-4 px-5 py-3.5', !r.active && 'opacity-55')}
              >
                <button
                  type="button"
                  onClick={() => setEditing(r)}
                  className="min-w-0 flex-1 text-left"
                >
                  <div className="truncate font-medium">{r.description}</div>
                  <div className="text-label-secondary text-[13px]">
                    Todo dia {r.dayOfMonth}
                    {r.category ? ` · ${r.category}` : ''}
                    {!r.active && ' · Pausada'}
                  </div>
                </button>
                <span className="font-semibold tabular-nums">{formatCurrencyBRL(r.amount)}</span>
                <Switch
                  checked={r.active}
                  aria-label={r.active ? 'Pausar' : 'Reativar'}
                  disabled={toggle.isPending}
                  onCheckedChange={(active: boolean) => toggle.mutate({ id: r.id, active })}
                />
              </li>
            ))}
          </ul>
        </Surface>
      )}

      <RecurringDialog
        key={editing === 'new' ? 'new' : (editing?.id ?? 'closed')}
        expense={editing === 'new' ? null : editing}
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        onSaved={() => {
          setEditing(null);
          refresh();
        }}
      />
    </div>
  );
}

function RecurringDialog({
  expense,
  open,
  onOpenChange,
  onSaved,
}: {
  expense: Recurring | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [description, setDescription] = React.useState(expense?.description ?? '');
  const [category, setCategory] = React.useState(expense?.category ?? '');
  const [amount, setAmount] = React.useState(
    expense ? String(expense.amount).replace('.', ',') : '',
  );
  const [day, setDay] = React.useState(String(expense?.dayOfMonth ?? 5));
  const [method, setMethod] = React.useState<string>(expense?.paymentMethod ?? '');
  const { data: categories } = useQuery({
    queryKey: ['finance-categories'],
    queryFn: () => listFinanceCategoriesAction(),
    enabled: open,
  });

  const save = useMutation({
    mutationFn: () => {
      const input = {
        description,
        category: category.trim() || null,
        amount: parseMoney(amount),
        dayOfMonth: Number(day),
        paymentMethod: (method || null) as (typeof PAYMENT_METHODS)[number]['value'] | null,
      };
      return (
        expense
          ? updateRecurringExpenseAction(expense.id, input)
          : createRecurringExpenseAction(input)
      ).then(unwrapResult);
    },
    onSuccess: () => {
      toast.success(
        expense ? 'Conta fixa atualizada (e as pendentes também).' : 'Conta fixa criada.',
      );
      onSaved();
    },
    onError: (error: Error) => toast.error(error.message || 'Não foi possível salvar.'),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{expense ? 'Editar conta fixa' : 'Nova conta fixa'}</DialogTitle>
          <DialogDescription>
            {expense
              ? 'A mudança vale para as contas ainda pendentes; as já pagas ficam como estão.'
              : 'Entra como pendente todo mês, no dia do vencimento.'}
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-3 text-sm"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <label className="flex flex-col gap-1.5">
            <span className="font-medium">Descrição</span>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ex: Aluguel"
              required
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="font-medium">Valor (R$)</span>
              <Input
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0,00"
                required
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="font-medium">Vence todo dia</span>
              <Input
                type="number"
                min={1}
                max={31}
                value={day}
                onChange={(e) => setDay(e.target.value)}
                required
              />
            </label>
          </div>
          <label className="flex flex-col gap-1.5">
            <span className="font-medium">Categoria</span>
            <Input
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              list="recurring-categories"
              autoComplete="off"
            />
            <datalist id="recurring-categories">
              {(categories?.EXPENSE ?? []).map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="font-medium">Forma de pagamento</span>
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              className="bg-background ring-foreground/[0.08] h-10 rounded-xl px-3 ring-1"
            >
              <option value="">Não definida</option>
              {PAYMENT_METHODS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Voltar
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? 'Salvando...' : 'Salvar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
