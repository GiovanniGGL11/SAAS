'use client';

import * as React from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';

import { unwrapResult } from '@/lib/action-result';
import { formatCurrencyBRL } from '@/lib/serialize';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { getAdvancedKpisAction } from '@/server/actions/report-actions';
import { listTeamAction } from '@/server/actions/task-actions';

/** Indicadores avançados (Pro): fórmula e denominador sempre à vista. */
export function AdvancedKpis() {
  const [days, setDays] = React.useState<'30' | '90' | '180'>('90');
  const { data } = useQuery({
    queryKey: ['advanced-kpis', days],
    queryFn: () => getAdvancedKpisAction({ days: Number(days) }).then(unwrapResult),
  });
  const { data: team } = useQuery({
    queryKey: ['team'],
    queryFn: () => listTeamAction().then(unwrapResult),
    staleTime: 300_000,
  });
  const name = (id: string | null) =>
    id ? (team?.members.find((m) => m.userId === id)?.name ?? 'Equipe') : 'Sem responsável';
  return (
    <section className="bg-tile flex flex-col gap-4 rounded-[22px] p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-[17px] font-semibold">Indicadores comerciais e de prazos</h2>
          <p className="text-label-secondary text-[13px]">
            Cada número mostra a conta usada. Previsto (estimativas) e recebido (pagamentos) ficam
            separados. Resultados das automações em{' '}
            <Link href="/dashboard/automacoes" className="text-system-blue hover:underline">
              Ações automáticas
            </Link>
            .
          </p>
        </div>
        <SegmentedControl
          size="sm"
          value={days}
          onValueChange={setDays}
          options={[
            { value: '30', label: '30 dias' },
            { value: '90', label: '90 dias' },
            { value: '180', label: '180 dias' },
          ]}
        />
      </div>
      {!data ? (
        <p className="text-label-secondary text-[13px]">Calculando…</p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.kpis.map((k) => (
              <div key={k.key} className="bg-background/60 flex flex-col gap-0.5 rounded-2xl p-3">
                <span className="text-label-secondary text-[12px]">{k.label}</span>
                <span className="text-[22px] font-semibold tabular-nums">
                  {k.value == null
                    ? '—'
                    : k.unit === 'R$'
                      ? formatCurrencyBRL(k.value)
                      : k.unit === '%'
                        ? `${k.value.toLocaleString('pt-BR')}%`
                        : k.value}
                </span>
                {k.denominator !== undefined && k.unit === '%' && (
                  <span className="text-label-secondary text-[12px]">
                    {k.numerator} de {k.denominator}
                  </span>
                )}
                <span className="text-label-secondary text-[11px]">{k.formula}</span>
                {k.smallSample && (
                  <span className="text-[11px] text-amber-800 dark:text-amber-300">
                    Amostra pequena: use com cautela.
                  </span>
                )}
              </div>
            ))}
          </div>
          {data.timePerStage.length > 0 && (
            <div className="flex flex-col gap-1">
              <h3 className="text-[14px] font-semibold">Tempo médio por etapa do funil</h3>
              {data.timePerStage.map((s) => (
                <div key={s.stage} className="text-[13px]">
                  {s.stage}:{' '}
                  <span className="tabular-nums">{s.averageDays.toLocaleString('pt-BR')} dias</span>{' '}
                  <span className="text-label-secondary">
                    ({s.samples} passagem{s.samples === 1 ? '' : 's'}
                    {s.smallSample ? ', amostra pequena' : ''})
                  </span>
                </div>
              ))}
            </div>
          )}
          {data.byOwner.length > 0 && (
            <div className="overflow-x-auto">
              <h3 className="mb-1 text-[14px] font-semibold">Por responsável</h3>
              <table className="w-full min-w-[420px] text-[13px]">
                <thead className="text-label-secondary text-left">
                  <tr>
                    <th className="py-1 font-medium">Pessoa</th>
                    <th className="py-1 text-right font-medium">Ganhas</th>
                    <th className="py-1 text-right font-medium">Perdidas</th>
                    <th className="py-1 text-right font-medium">Conversão</th>
                    <th className="py-1 text-right font-medium">Estimado ganho</th>
                    <th className="py-1 text-right font-medium">Tarefas feitas</th>
                  </tr>
                </thead>
                <tbody>
                  {data.byOwner.map((r) => (
                    <tr key={r.ownerUserId ?? 'none'} className="border-foreground/[0.06] border-t">
                      <td className="py-1">{name(r.ownerUserId)}</td>
                      <td className="py-1 text-right tabular-nums">{r.won}</td>
                      <td className="py-1 text-right tabular-nums">{r.lost}</td>
                      <td className="py-1 text-right tabular-nums">
                        {r.conversion == null ? '—' : `${r.conversion}%`}
                      </td>
                      <td className="py-1 text-right tabular-nums">
                        {formatCurrencyBRL(r.wonEstimated)}
                      </td>
                      <td className="py-1 text-right tabular-nums">{r.tasksDone}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}
