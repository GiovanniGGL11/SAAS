'use client';

import * as React from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ChevronLeftIcon, ChevronRightIcon, DownloadIcon } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Surface } from '@/components/layout/page';
import { unwrapResult } from '@/lib/action-result';
import { formatCurrencyBRL } from '@/lib/serialize';
import { monthLabel, shiftMonth } from '@/lib/month';
import { cn } from '@/lib/utils';
import { exportMonthCsvAction, getIncomeStatementAction } from '@/server/actions/finance-actions';

function thisMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Resultado do mês (DRE simplificado, regime de caixa), com os dois meses anteriores ao lado. */
export function IncomeStatementView() {
  const [month, setMonth] = React.useState(thisMonth);
  const { data } = useQuery({
    queryKey: ['income-statement', month],
    queryFn: () => getIncomeStatementAction({ month }),
  });

  const exportCsv = useMutation({
    mutationFn: () => exportMonthCsvAction({ month }).then(unwrapResult),
    onSuccess: ({ filename, csv }) => {
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(url);
    },
    onError: (error: Error) => toast.error(error.message || 'Não foi possível exportar.'),
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Mês anterior"
            onClick={() => setMonth((m) => shiftMonth(m, -1))}
          >
            <ChevronLeftIcon className="size-4" />
          </Button>
          <span className="min-w-40 text-center text-[17px] font-semibold">
            {monthLabel(month)}
          </span>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Próximo mês"
            disabled={month >= thisMonth()}
            onClick={() => setMonth((m) => shiftMonth(m, 1))}
          >
            <ChevronRightIcon className="size-4" />
          </Button>
        </div>
        <Button variant="outline" disabled={exportCsv.isPending} onClick={() => exportCsv.mutate()}>
          <DownloadIcon className="size-4" />
          Planilha para o contador
        </Button>
      </div>

      {!data ? (
        <Skeleton className="h-96 rounded-[22px]" />
      ) : (
        <Surface className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-[14px]">
            <thead>
              <tr className="text-label-secondary border-foreground/[0.06] border-b text-[12px]">
                <th className="px-5 py-3 text-left font-medium" />
                {data.months.map((m, i) => (
                  <th
                    key={m.key}
                    className={cn('px-5 py-3 text-right font-medium', i === 0 && 'text-foreground')}
                  >
                    {m.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <Section title="Receitas" />
              {data.income.map((line) => (
                <Row key={`i-${line.category}`} label={line.category} values={line.values} indent />
              ))}
              <Row label="Receita bruta" values={data.grossIncome} strong />
              <Row label="(−) Taxas de cartão" values={data.fees.map(negate)} muted />
              <Row label="Receita líquida" values={data.netIncome} strong />
              <Section title="Despesas" />
              {data.expenses.length === 0 && (
                <tr>
                  <td colSpan={4} className="text-label-secondary px-5 py-2 pl-8 text-[13px]">
                    Nenhuma despesa paga no período.
                  </td>
                </tr>
              )}
              {data.expenses.map((line) => (
                <Row
                  key={`e-${line.category}`}
                  label={line.category}
                  values={line.values.map(negate)}
                  indent
                />
              ))}
              <Row label="Total de despesas" values={data.totalExpenses.map(negate)} strong />
              <tr className="bg-foreground/[0.03]">
                <td className="px-5 py-4 text-[15px] font-bold">Resultado</td>
                {data.result.map((value, i) => (
                  <td
                    key={i}
                    className={cn(
                      'px-5 py-4 text-right text-[15px] font-bold tabular-nums',
                      value < 0 ? 'text-system-red' : 'text-delta-good',
                    )}
                  >
                    {formatCurrencyBRL(value)}
                    <div className="text-label-secondary text-[11px] font-normal">
                      {data.margin[i] === null
                        ? '—'
                        : `margem ${data.margin[i]!.toLocaleString('pt-BR')}%`}
                    </div>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </Surface>
      )}
      <p className="text-label-secondary text-[12px]">
        Regime de caixa: conta o que foi pago dentro do mês, pela data do pagamento. Lançamentos
        pendentes e cancelados ficam de fora; a planilha traz todos, com o status.
      </p>
    </div>
  );
}

/** Saída como negativa, sem mostrar "-R$ 0,00". */
const negate = (value: number) => (value ? -value : 0);

function Section({ title }: { title: string }) {
  return (
    <tr>
      <td
        colSpan={4}
        className="text-label-secondary px-5 pt-4 pb-1 text-[12px] font-semibold tracking-wide uppercase"
      >
        {title}
      </td>
    </tr>
  );
}

function Row({
  label,
  values,
  strong,
  muted,
  indent,
}: {
  label: string;
  values: number[];
  strong?: boolean;
  muted?: boolean;
  indent?: boolean;
}) {
  return (
    <tr className={cn(strong && 'border-foreground/[0.06] border-t')}>
      <td
        className={cn(
          'px-5 py-2',
          indent && 'pl-8',
          strong && 'font-semibold',
          muted && 'text-label-secondary',
        )}
      >
        {label}
      </td>
      {values.map((value, i) => (
        <td
          key={i}
          className={cn(
            'px-5 py-2 text-right tabular-nums',
            strong && 'font-semibold',
            muted && 'text-label-secondary',
            i > 0 && 'text-label-secondary',
          )}
        >
          {formatCurrencyBRL(value)}
        </td>
      ))}
    </tr>
  );
}
