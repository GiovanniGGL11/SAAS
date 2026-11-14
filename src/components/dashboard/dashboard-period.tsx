'use client';

import * as React from 'react';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2Icon } from 'lucide-react';

import { cn } from '@/lib/utils';
import { formatCurrencyBRL } from '@/lib/serialize';
import { percentDelta, ppDelta } from '@/lib/dashboard-rules';
import { REPORT_PRESETS, type ReportPreset } from '@/lib/validations/report';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { KpiTile } from '@/components/dashboard/kpi-tile';
import { RevenueChart } from '@/components/dashboard/revenue-chart';
import { AppleTile, TileEyebrow } from '@/components/dashboard/apple-tile';
import { TeamPerformance } from '@/components/dashboard/team-performance';
import { getDashboardPeriodAction } from '@/server/actions/dashboard-actions';
import type { DashboardPeriodData } from '@/server/data/dashboard-period';

/*
  Período do Início ("Como o negócio está indo" e Equipe). Trocar o período busca só esses números
  (não recarrega a página inteira): o botão muda na hora, os números de antes ficam na tela,
  levemente apagados, até chegarem os novos. Os outros períodos são buscados assim que a pessoa
  encosta no seletor, então a troca costuma ser instantânea.
*/

const COMPARE_LABEL: Record<ReportPreset, string> = {
  last7: 'vs. 7 dias anteriores',
  last30: 'vs. 30 dias anteriores',
  last90: 'vs. 90 dias anteriores',
  thisMonth: 'vs. mesmo número de dias antes',
  lastMonth: 'vs. o mês anterior',
};

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const queryKey = (preset: ReportPreset) => ['dashboard-period', preset] as const;

type PeriodContextValue = {
  preset: ReportPreset;
  setPreset: (preset: ReportPreset) => void;
  prefetchAll: () => void;
  data: DashboardPeriodData;
  /** Buscando o período novo (os números na tela ainda são do anterior). */
  updating: boolean;
};

const PeriodContext = React.createContext<PeriodContextValue | null>(null);

function usePeriod() {
  const ctx = React.useContext(PeriodContext);
  if (!ctx) throw new Error('usePeriod fora do DashboardPeriodProvider');
  return ctx;
}

export function DashboardPeriodProvider({
  initial,
  children,
}: {
  initial: DashboardPeriodData;
  children: React.ReactNode;
}) {
  const queryClient = useQueryClient();
  const [preset, setPresetState] = React.useState<ReportPreset>(initial.preset);
  const prefetched = React.useRef(false);

  const query = useQuery({
    queryKey: queryKey(preset),
    queryFn: () => getDashboardPeriodAction(preset),
    initialData: preset === initial.preset ? initial : undefined,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });

  const prefetchAll = React.useCallback(() => {
    if (prefetched.current) return;
    prefetched.current = true;
    for (const p of REPORT_PRESETS) {
      if (p.value === preset) continue;
      void queryClient.prefetchQuery({
        queryKey: queryKey(p.value),
        queryFn: () => getDashboardPeriodAction(p.value),
        staleTime: 60_000,
      });
    }
  }, [preset, queryClient]);

  const setPreset = React.useCallback((next: ReportPreset) => {
    setPresetState(next);
    // O período fica no endereço (para voltar nele), sem recarregar a página.
    const url = new URL(window.location.href);
    url.searchParams.set('periodo', next);
    window.history.replaceState(window.history.state, '', url);
  }, []);

  const value: PeriodContextValue = {
    preset,
    setPreset,
    prefetchAll,
    data: query.data ?? initial,
    updating: query.isFetching && query.isPlaceholderData,
  };
  return <PeriodContext.Provider value={value}>{children}</PeriodContext.Provider>;
}

function Updating({ children, className }: { children: React.ReactNode; className?: string }) {
  const { updating } = usePeriod();
  return (
    <div
      aria-busy={updating}
      className={cn(
        'transition-opacity duration-200',
        updating && 'pointer-events-none opacity-50',
        className,
      )}
    >
      {children}
    </div>
  );
}

/** "Como o negócio está indo": seletor de período, números e faturamento por dia. */
export function PeriodResults({ aside }: { aside: React.ReactNode }) {
  const { preset, setPreset, prefetchAll, data, updating } = usePeriod();
  const { current, previous } = data.insights;
  const compareLabel = COMPARE_LABEL[preset];
  const presetLabel = REPORT_PRESETS.find((p) => p.value === preset)!.label;

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3 md:mt-4">
        <div>
          <h2 className="flex items-center gap-2 text-[22px] font-bold tracking-[-0.02em] md:text-[26px]">
            Como o negócio está indo
            {updating && (
              <Loader2Icon
                className="text-label-secondary size-4 animate-spin"
                aria-label="Atualizando"
              />
            )}
          </h2>
          <p className="text-label-secondary text-[14px]">
            {presetLabel}, {compareLabel.replace('vs. ', 'comparado com ')}.
          </p>
        </div>
        <div onPointerEnter={prefetchAll} onTouchStart={prefetchAll} onFocus={prefetchAll}>
          <SegmentedControl
            value={preset}
            onValueChange={setPreset}
            options={REPORT_PRESETS.map((p) => ({ value: p.value, label: p.label }))}
          />
        </div>
      </div>
      <Updating className="grid grid-cols-2 gap-3 sm:gap-4 md:gap-5 lg:grid-cols-4">
        <KpiTile
          index={0}
          label="Faturamento"
          value={current.revenue}
          format="currency"
          delta={percentDelta(current.revenue, previous.revenue)}
          compareLabel={compareLabel}
          hint="Tudo o que entrou: serviços, produtos e gorjetas."
        />
        <KpiTile
          index={1}
          label="Atendimentos"
          value={current.completed}
          format="integer"
          delta={percentDelta(current.completed, previous.completed)}
          compareLabel={compareLabel}
          hint={
            current.onlineRate !== null
              ? `${current.onlineRate.toLocaleString('pt-BR')}% dos horários foram marcados online.`
              : 'Atendimentos concluídos no período.'
          }
        />
        <KpiTile
          index={2}
          label="Ticket médio"
          value={current.avgTicket}
          format="currency"
          delta={percentDelta(current.avgTicket, previous.avgTicket)}
          compareLabel={compareLabel}
          hint="Faturamento ÷ atendimentos."
        />
        <KpiTile
          index={3}
          label="Ocupação da equipe"
          value={current.occupancy}
          format="percent"
          delta={ppDelta(current.occupancy, previous.occupancy)}
          deltaUnit="p.p."
          compareLabel={compareLabel}
          hint="Tempo atendendo ÷ tempo disponível. No setor, 56% é a média e 75% é o topo."
        />
        <KpiTile
          index={0}
          label="Clientes que voltaram"
          value={current.returningRate}
          format="percent"
          delta={ppDelta(current.returningRate, previous.returningRate)}
          deltaUnit="p.p."
          compareLabel={compareLabel}
          hint={`${plural(current.clientsServed, 'cliente atendido', 'clientes atendidos')} · ${current.newClientsServed} pela primeira vez.`}
        />
        <KpiTile
          index={1}
          label="Já têm próximo horário"
          value={data.insights.rebookingRate}
          format="percent"
          compareLabel={compareLabel}
          hint="Dos clientes atendidos no período. Marcar o retorno na hora de cobrar aumenta este número."
        />
        <KpiTile
          index={2}
          label="Faltas e cancelamentos"
          value={current.lossRate}
          format="percent"
          delta={ppDelta(current.lossRate, previous.lossRate)}
          deltaUnit="p.p."
          lowerIsBetter
          compareLabel={compareLabel}
          hint={`${plural(current.noShows, 'falta', 'faltas')} e ${plural(current.cancellations, 'cancelamento', 'cancelamentos')}. Confirmar pelo WhatsApp reduz.`}
        />
        <KpiTile
          index={3}
          label="Novos clientes"
          value={current.newClientsServed}
          format="integer"
          delta={percentDelta(current.newClientsServed, previous.newClientsServed)}
          compareLabel={compareLabel}
          hint="Atendidos pela primeira vez no período."
        />
      </Updating>
      <div className="grid grid-cols-1 items-start gap-4 md:gap-5 lg:grid-cols-3">
        <Updating className="lg:col-span-2">
          <AppleTile index={0} interactive={false}>
            <div className="mb-5 flex flex-wrap items-end justify-between gap-2">
              <div>
                <TileEyebrow>Faturamento por dia</TileEyebrow>
                <div className="mt-1 text-[28px] leading-none font-semibold tracking-[-0.025em] tabular-nums">
                  {formatCurrencyBRL(current.revenue)}
                </div>
              </div>
              <span className="text-label-secondary text-xs">{presetLabel} · entradas pagas</span>
            </div>
            <RevenueChart data={data.revenueByDay} />
          </AppleTile>
        </Updating>
        {aside}
      </div>
    </>
  );
}

/** Desempenho da equipe no período escolhido. */
export function PeriodTeam({
  goals,
}: {
  goals: Record<string, { goal: number; revenue: number }>;
}) {
  const { data } = usePeriod();
  const { reviews } = data;
  return (
    <Updating>
      <TeamPerformance
        team={data.insights.team}
        goals={goals}
        ratings={reviews.byProfessional}
        overallRating={
          reviews.average === null ? null : { average: reviews.average, count: reviews.count }
        }
      />
    </Updating>
  );
}
