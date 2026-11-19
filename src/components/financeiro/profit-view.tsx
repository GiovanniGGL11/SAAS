'use client';

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeftIcon, ChevronRightIcon, InfoIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { SegmentedControl } from '@/components/ui/segmented-control';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Surface } from '@/components/layout/page';
import { unwrapResult } from '@/lib/action-result';
import { formatCurrencyBRL } from '@/lib/serialize';
import { monthLabel, shiftMonth } from '@/lib/month';
import { cn } from '@/lib/utils';
import { getProfitDrillAction, getProfitOverviewAction } from '@/server/actions/pricing-actions';
import type { RankingRow, StatementRow } from '@/server/data/profit-analysis';

type Basis = 'accrual' | 'cash';
type Drill =
  | { source: 'statement'; key: string; title: string }
  | {
      source: 'ranking';
      dimension: 'service' | 'product' | 'professional';
      id: string;
      title: string;
    };

function thisMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

const brl = formatCurrencyBRL;

/** Lucro de verdade (plano Pro): DRE gerencial, equilíbrio, previsto × realizado e rankings. */
export function ProfitView() {
  const [month, setMonth] = React.useState(thisMonth);
  const [basis, setBasis] = React.useState<Basis>('accrual');
  const [drill, setDrill] = React.useState<Drill | null>(null);
  const [dimension, setDimension] = React.useState<'service' | 'product' | 'professional'>(
    'service',
  );
  const { data, error } = useQuery({
    queryKey: ['profit-overview', month, basis],
    queryFn: () => getProfitOverviewAction({ month, basis }).then(unwrapResult),
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
        <SegmentedControl
          size="sm"
          value={basis}
          onValueChange={setBasis}
          options={[
            { value: 'accrual', label: 'Competência' },
            { value: 'cash', label: 'Caixa' },
          ]}
        />
      </div>
      <p className="text-label-secondary text-[12px]">
        {basis === 'accrual'
          ? 'Competência: o que foi feito no mês (pago ou a receber), com o custo dos materiais e produtos que saíram do estoque.'
          : 'Caixa: só o que entrou e saiu da conta no mês, pela data do pagamento.'}
      </p>

      {error && <p className="text-system-red text-[14px]">{(error as Error).message}</p>}
      {!data ? (
        !error && <Skeleton className="h-[560px] rounded-[22px]" />
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <Surface className="p-4 md:p-5">
              <h3 className="mb-3 text-[17px] font-semibold">DRE gerencial</h3>
              <StatementTable
                rows={data.statement.rows}
                onDrill={(row) => setDrill({ source: 'statement', key: row.key, title: row.label })}
              />
              <div className="text-label-secondary mt-3 flex flex-col gap-1 text-[12px]">
                {data.statement.info.packageSessions.count > 0 && (
                  <button
                    type="button"
                    className="flex items-start gap-1.5 text-left underline-offset-2 hover:underline"
                    onClick={() =>
                      setDrill({
                        source: 'statement',
                        key: 'package-sessions',
                        title: 'Sessões já pagas antes',
                      })
                    }
                  >
                    <InfoIcon className="mt-0.5 size-3.5 shrink-0" />
                    {data.statement.info.packageSessions.count} sessão(ões) de pacote/vale usada(s)
                    ({brl(data.statement.info.packageSessions.value)}): a receita já foi contada na
                    venda, não entra de novo.
                  </button>
                )}
                {data.statement.info.pendingRevenue > 0 && (
                  <span>Inclui {brl(data.statement.info.pendingRevenue)} ainda a receber.</span>
                )}
                {data.statement.info.pendingCosts > 0 && (
                  <span>
                    Inclui {brl(data.statement.info.pendingCosts)} de despesas ainda a pagar.
                  </span>
                )}
                {data.statement.info.estimatedItems > 0 && (
                  <span>
                    ≈ {data.statement.info.estimatedItems} movimento(s) de estoque antigos sem custo
                    gravado usam o custo atual do produto (estimado).
                  </span>
                )}
                {data.statement.info.taxRateUsed === null && (
                  <span>
                    Sem alíquota de impostos na calculadora de preço: vale o lançado em “Impostos”.
                  </span>
                )}
              </div>
            </Surface>

            <div className="flex flex-col gap-4">
              <BreakEvenCard
                data={data.statement.breakEven}
                gross={data.statement.totals.grossRevenue}
              />
              <ForecastCard data={data.forecast} />
            </div>
          </div>

          <Surface className="flex flex-col gap-3 p-4 md:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-[17px] font-semibold">O que mais dá lucro</h3>
                <p className="text-label-secondary text-[12px]">
                  Competência do mês. Contribuição = cobrado − taxas − impostos estimados −
                  materiais − comissão. Toque numa linha para ver os atendimentos.
                </p>
              </div>
              <SegmentedControl
                size="sm"
                value={dimension}
                onValueChange={setDimension}
                options={[
                  { value: 'service', label: 'Serviços' },
                  { value: 'product', label: 'Produtos' },
                  { value: 'professional', label: 'Profissionais' },
                ]}
              />
            </div>
            <RankingTable
              rows={
                dimension === 'service'
                  ? data.rankings.services
                  : dimension === 'product'
                    ? data.rankings.products
                    : data.rankings.professionals
              }
              countLabel={dimension === 'product' ? 'Unid.' : 'Atend.'}
              withHours={dimension !== 'product'}
              onDrill={(row) =>
                setDrill({ source: 'ranking', dimension, id: row.id, title: row.name })
              }
            />
          </Surface>
        </>
      )}

      <DrillDialog drill={drill} month={month} basis={basis} onClose={() => setDrill(null)} />
    </div>
  );
}

function StatementTable({
  rows,
  onDrill,
}: {
  rows: StatementRow[];
  onDrill: (row: StatementRow) => void;
}) {
  return (
    <table className="w-full text-[14px]">
      <tbody>
        {rows.map((row) => {
          const total = row.kind === 'subtotal' || row.kind === 'result';
          return (
            <tr
              key={row.key}
              className={cn(
                'border-foreground/[0.06] border-b last:border-0',
                total && 'bg-foreground/[0.03]',
              )}
            >
              <td className={cn('py-2 pr-2', total ? 'font-semibold' : 'pl-3')}>
                {row.drill ? (
                  <button
                    type="button"
                    className="text-left underline-offset-2 hover:underline"
                    onClick={() => onDrill(row)}
                  >
                    {row.label}
                  </button>
                ) : (
                  row.label
                )}
                {row.estimated && (
                  <span className="text-system-orange ml-1 text-[11px]" title="Valor estimado">
                    ≈ estimado
                  </span>
                )}
                {row.note && (
                  <span className="text-label-secondary block text-[11px] font-normal">
                    {row.note}
                  </span>
                )}
              </td>
              <td
                className={cn(
                  'py-2 text-right whitespace-nowrap tabular-nums',
                  total && 'font-semibold',
                  row.kind === 'result' &&
                    (row.value >= 0 ? 'text-system-green' : 'text-system-red'),
                )}
              >
                {brl(row.value)}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function BreakEvenCard({
  data,
  gross,
}: {
  data: {
    fixedExpenses: number;
    contributionPercent: number | null;
    revenueNeeded: number | null;
    averageTicket: number | null;
    appointmentsNeeded: number | null;
    reached: boolean | null;
  };
  gross: number;
}) {
  const progress =
    data.revenueNeeded && data.revenueNeeded > 0 ? Math.min(1, gross / data.revenueNeeded) : null;
  return (
    <Surface className="flex flex-col gap-2 p-4 md:p-5">
      <h3 className="text-[17px] font-semibold">Ponto de equilíbrio</h3>
      {data.revenueNeeded === null ? (
        <p className="text-label-secondary text-[13px]">
          {data.contributionPercent !== null && data.contributionPercent <= 0
            ? 'Os custos variáveis já passam da receita: nenhum faturamento paga as despesas fixas. Reveja preços e custos.'
            : 'Sem vendas no mês ainda para calcular.'}
        </p>
      ) : (
        <>
          <p className="text-[13px]">
            Para pagar {brl(data.fixedExpenses)} de despesas fixas com margem de contribuição de{' '}
            {data.contributionPercent}%, é preciso faturar{' '}
            <strong className="tabular-nums">{brl(data.revenueNeeded)}</strong>
            {data.appointmentsNeeded !== null && data.averageTicket !== null && (
              <>
                {' '}
                — cerca de <strong>{data.appointmentsNeeded} atendimentos</strong> com o ticket
                médio de {brl(data.averageTicket)}
              </>
            )}
            .
          </p>
          {progress !== null && (
            <div className="flex flex-col gap-1">
              <div
                className="bg-foreground/[0.06] h-2 overflow-hidden rounded-full"
                role="progressbar"
                aria-valuenow={Math.round(progress * 100)}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Faturamento em relação ao ponto de equilíbrio"
              >
                <div
                  className={cn(
                    'h-full rounded-full',
                    data.reached ? 'bg-system-green' : 'bg-system-blue',
                  )}
                  style={{ width: `${progress * 100}%` }}
                />
              </div>
              <span className="text-label-secondary text-[12px]">
                {data.reached
                  ? `Equilíbrio atingido: faturou ${brl(gross)}.`
                  : `Faturou ${brl(gross)} — faltam ${brl(data.revenueNeeded - gross)}.`}
              </span>
            </div>
          )}
        </>
      )}
    </Surface>
  );
}

function ForecastCard({
  data,
}: {
  data: {
    revenue: { forecast: number; actual: number; stillScheduled: number };
    appointments: { forecast: number; actual: number };
    expenses: { forecast: number; actual: number };
    profit: { actual: number };
  };
}) {
  const rows = [
    {
      label: 'Receita de atendimentos',
      forecast: brl(data.revenue.forecast),
      actual: brl(data.revenue.actual),
    },
    {
      label: 'Atendimentos',
      forecast: String(data.appointments.forecast),
      actual: String(data.appointments.actual),
    },
    {
      label: 'Despesas',
      forecast: brl(data.expenses.forecast),
      actual: brl(data.expenses.actual),
    },
  ];
  return (
    <Surface className="flex flex-col gap-2 p-4 md:p-5">
      <h3 className="text-[17px] font-semibold">Previsto × realizado</h3>
      <table className="w-full text-[13px]">
        <thead>
          <tr className="text-label-secondary text-[12px]">
            <th className="py-1 text-left font-medium" />
            <th className="py-1 text-right font-medium">Previsto</th>
            <th className="py-1 text-right font-medium">Realizado</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} className="border-foreground/[0.06] border-t">
              <td className="py-1.5">{r.label}</td>
              <td className="py-1.5 text-right tabular-nums">{r.forecast}</td>
              <td className="py-1.5 text-right font-medium tabular-nums">{r.actual}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <span className="text-label-secondary text-[11px]">
        Previsto = concluídos + ainda marcados ({brl(data.revenue.stillScheduled)}); despesas
        previstas = contas fixas + lançamentos do mês. Realizado = concluído e pago.
      </span>
    </Surface>
  );
}

function RankingTable({
  rows,
  countLabel,
  withHours,
  onDrill,
}: {
  rows: RankingRow[];
  countLabel: string;
  withHours: boolean;
  onDrill: (row: RankingRow) => void;
}) {
  if (rows.length === 0) {
    return <p className="text-label-secondary py-6 text-center text-[13px]">Nada no mês ainda.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-[13px]">
        <thead>
          <tr className="text-label-secondary border-foreground/[0.06] border-b text-[12px]">
            <th className="py-2 text-left font-medium">Nome</th>
            <th className="py-2 text-right font-medium">{countLabel}</th>
            <th className="py-2 text-right font-medium">Receita</th>
            <th className="py-2 text-right font-medium">Custos</th>
            <th className="py-2 text-right font-medium">Contribuição</th>
            <th className="py-2 text-right font-medium">Margem</th>
            {withHours && <th className="py-2 text-right font-medium">Por hora</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.id}
              className="border-foreground/[0.06] hover:bg-foreground/[0.03] cursor-pointer border-b last:border-0"
              onClick={() => onDrill(r)}
            >
              <td className="py-2">
                <button type="button" className="text-left font-medium">
                  {r.name}
                </button>
                {r.estimated && <span className="text-system-orange ml-1 text-[11px]">≈</span>}
              </td>
              <td className="py-2 text-right tabular-nums">{r.count}</td>
              <td className="py-2 text-right tabular-nums">{brl(r.revenue)}</td>
              <td className="py-2 text-right tabular-nums">{brl(r.costs)}</td>
              <td
                className={cn(
                  'py-2 text-right font-semibold tabular-nums',
                  r.contribution < 0 && 'text-system-red',
                )}
              >
                {brl(r.contribution)}
              </td>
              <td className="py-2 text-right tabular-nums">
                {r.marginPercent === null ? '—' : `${r.marginPercent}%`}
              </td>
              {withHours && (
                <td className="py-2 text-right tabular-nums">
                  {r.perHour === null ? '—' : brl(r.perHour)}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DrillDialog({
  drill,
  month,
  basis,
  onClose,
}: {
  drill: Drill | null;
  month: string;
  basis: Basis;
  onClose: () => void;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ['profit-drill', month, basis, drill],
    queryFn: () =>
      getProfitDrillAction(
        drill!.source === 'statement'
          ? { source: 'statement', month, basis, key: drill!.key }
          : { source: 'ranking', month, dimension: drill!.dimension, id: drill!.id },
      ).then(unwrapResult),
    enabled: drill !== null,
  });
  return (
    <Dialog open={drill !== null} onOpenChange={(open: boolean) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{drill?.title}</DialogTitle>
          <DialogDescription>
            {monthLabel(month)} ·{' '}
            {drill?.source === 'ranking' || basis === 'accrual' ? 'competência' : 'caixa'}
            {data && ` · total ${brl(data.total)}`}
          </DialogDescription>
        </DialogHeader>
        {isLoading || !data ? (
          <Skeleton className="h-40 rounded-xl" />
        ) : data.items.length === 0 ? (
          <p className="text-label-secondary text-[13px]">Nenhum lançamento.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-[color:var(--separator)] text-[13px]">
            {data.items.map((item, i) => (
              <li key={i} className="flex items-start justify-between gap-3 py-2">
                <div className="min-w-0">
                  <p className="truncate font-medium">{item.description}</p>
                  <p className="text-label-secondary text-[12px]">
                    {new Date(item.date).toLocaleDateString('pt-BR')}
                    {item.detail ? ` · ${item.detail}` : ''}
                    {'status' in item && item.status === 'PENDING' ? ' · pendente' : ''}
                    {'status' in item && item.status === 'CANCELED' ? ' · estornado' : ''}
                    {'estimated' in item && item.estimated ? ' · custo estimado' : ''}
                  </p>
                </div>
                <span className="shrink-0 tabular-nums">{brl(item.amount)}</span>
              </li>
            ))}
            {data.truncated && (
              <li className="text-label-secondary py-2 text-[12px]">Mostrando os 300 primeiros.</li>
            )}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
