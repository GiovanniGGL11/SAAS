'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PlusIcon, XIcon } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { unwrapResult } from '@/lib/action-result';
import { PAYMENT_METHODS } from '@/lib/validations/finance';
import {
  addFinanceCategoryAction,
  getPaymentFeesAction,
  listFinanceCategoriesAction,
  removeFinanceCategoryAction,
  savePaymentFeesAction,
} from '@/server/actions/finance-actions';

const SYSTEM_CATEGORIES = ['Atendimento', 'Gorjeta', 'Produto'];

export function FinanceSettingsView() {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <FeesCard />
      <CategoriesCard />
    </div>
  );
}

type FeeRow = { paymentMethod: string; feePercent: string; settlementDays: string };

/** Taxa da maquininha e prazo de recebimento: o financeiro passa a mostrar o líquido e quando cai. */
function FeesCard() {
  const queryClient = useQueryClient();
  const { data } = useQuery({ queryKey: ['payment-fees'], queryFn: () => getPaymentFeesAction() });
  const [rows, setRows] = React.useState<FeeRow[] | null>(null);
  const current: FeeRow[] =
    rows ??
    (data ?? []).map((f) => ({
      paymentMethod: f.paymentMethod,
      feePercent: String(f.feePercent).replace('.', ','),
      settlementDays: String(f.settlementDays),
    }));

  const save = useMutation({
    mutationFn: () =>
      savePaymentFeesAction(
        current.map((r) => ({
          paymentMethod: r.paymentMethod,
          feePercent: Number(r.feePercent.replace(',', '.')) || 0,
          settlementDays: Math.round(Number(r.settlementDays) || 0),
        })),
      ).then(unwrapResult),
    onSuccess: () => {
      toast.success('Taxas salvas. Valem para os próximos pagamentos.');
      setRows(null);
      queryClient.invalidateQueries({ queryKey: ['payment-fees'] });
    },
    onError: (error: Error) => toast.error(error.message || 'Não foi possível salvar.'),
  });

  const update = (index: number, patch: Partial<FeeRow>) =>
    setRows(current.map((r, i) => (i === index ? { ...r, ...patch } : r)));

  return (
    <section className="bg-tile flex flex-col gap-4 rounded-[22px] p-5">
      <div>
        <h2 className="text-[17px] font-semibold">Taxas e prazos de recebimento</h2>
        <p className="text-label-secondary text-[13px]">
          Copie da sua maquininha. A taxa é descontada de cada entrada e o prazo mostra quando o
          dinheiro cai na conta. Pagamentos já feitos não mudam.
        </p>
      </div>
      {!data ? (
        <Skeleton className="h-60 rounded-xl" />
      ) : (
        <div className="flex flex-col gap-2">
          <div className="text-label-secondary grid grid-cols-[1fr_88px_88px] gap-2 text-[12px]">
            <span>Forma</span>
            <span>Taxa (%)</span>
            <span>Cai em (dias)</span>
          </div>
          {current.map((row, index) => (
            <div
              key={row.paymentMethod}
              className="grid grid-cols-[1fr_88px_88px] items-center gap-2"
            >
              <span className="text-[14px]">
                {PAYMENT_METHODS.find((m) => m.value === row.paymentMethod)?.label}
              </span>
              <Input
                inputMode="decimal"
                aria-label={`Taxa ${row.paymentMethod}`}
                value={row.feePercent}
                onChange={(e) => update(index, { feePercent: e.target.value })}
                className="h-9"
              />
              <Input
                type="number"
                min={0}
                max={120}
                aria-label={`Prazo ${row.paymentMethod}`}
                value={row.settlementDays}
                onChange={(e) => update(index, { settlementDays: e.target.value })}
                className="h-9"
              />
            </div>
          ))}
          <Button
            className="mt-2 self-end"
            disabled={!rows || save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? 'Salvando...' : 'Salvar taxas'}
          </Button>
        </div>
      )}
    </section>
  );
}

function CategoriesCard() {
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: ['finance-categories'],
    queryFn: () => listFinanceCategoriesAction(),
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['finance-categories'] });

  const add = useMutation({
    mutationFn: (input: { type: 'INCOME' | 'EXPENSE'; name: string }) =>
      addFinanceCategoryAction(input).then(unwrapResult),
    onSuccess: refresh,
    onError: (error: Error) => toast.error(error.message),
  });
  const remove = useMutation({
    mutationFn: (input: { type: 'INCOME' | 'EXPENSE'; name: string }) =>
      removeFinanceCategoryAction(input).then(unwrapResult),
    onSuccess: refresh,
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <section className="bg-tile flex flex-col gap-4 rounded-[22px] p-5">
      <div>
        <h2 className="text-[17px] font-semibold">Categorias</h2>
        <p className="text-label-secondary text-[13px]">
          Aparecem como sugestão nos lançamentos e organizam o DRE. Remover não mexe nos lançamentos
          antigos.
        </p>
      </div>
      {!data ? (
        <Skeleton className="h-60 rounded-xl" />
      ) : (
        (['EXPENSE', 'INCOME'] as const).map((type) => (
          <CategoryGroup
            key={type}
            title={type === 'INCOME' ? 'Entradas' : 'Saídas'}
            names={data[type]}
            pending={add.isPending || remove.isPending}
            onAdd={(name) => add.mutateAsync({ type, name })}
            onRemove={(name) => remove.mutate({ type, name })}
          />
        ))
      )}
    </section>
  );
}

function CategoryGroup({
  title,
  names,
  pending,
  onAdd,
  onRemove,
}: {
  title: string;
  names: string[];
  pending: boolean;
  onAdd: (name: string) => Promise<unknown>;
  onRemove: (name: string) => void;
}) {
  const [draft, setDraft] = React.useState('');
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[13px] font-semibold">{title}</span>
      <div className="flex flex-wrap gap-1.5">
        {names.map((name) => (
          <span
            key={name}
            className="bg-foreground/[0.06] inline-flex items-center gap-1 rounded-full py-1 pr-1.5 pl-3 text-[12px] font-medium"
          >
            {name}
            {!SYSTEM_CATEGORIES.includes(name) && (
              <button
                type="button"
                aria-label={`Remover ${name}`}
                disabled={pending}
                onClick={() => onRemove(name)}
                className="text-label-secondary hover:text-foreground rounded-full p-0.5"
              >
                <XIcon className="size-3" />
              </button>
            )}
          </span>
        ))}
      </div>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!draft.trim()) return;
          void onAdd(draft)
            .then(() => setDraft(''))
            .catch(() => {});
        }}
      >
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={`Nova categoria de ${title.toLowerCase()}`}
          className="h-9"
          maxLength={60}
        />
        <Button
          type="submit"
          variant="outline"
          size="sm"
          className="h-9"
          disabled={pending || !draft.trim()}
        >
          <PlusIcon className="size-4" />
          Adicionar
        </Button>
      </form>
    </div>
  );
}
