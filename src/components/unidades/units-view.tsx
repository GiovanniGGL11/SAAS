'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useOrganizationList } from '@clerk/nextjs';
import { Building2Icon } from 'lucide-react';

import { PageHeader, Surface } from '@/components/layout/page';
import { Button } from '@/components/ui/button';
import { StatTile } from '@/components/dashboard/stat-tile';
import { formatCurrencyBRL } from '@/lib/serialize';
import { cn } from '@/lib/utils';
import type { getUnitsOverview } from '@/server/data/units';

type Overview = Awaited<ReturnType<typeof getUnitsOverview>>;

const pct = (v: number | null) =>
  v === null ? '—' : `${v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;

/** Todas as unidades do dono lado a lado, no mês atual. */
export function UnitsView({
  overview,
  currentCompanyId,
}: {
  overview: Overview;
  currentCompanyId: string;
}) {
  const router = useRouter();
  const { setActive } = useOrganizationList();
  const [switching, setSwitching] = React.useState<string | null>(null);
  const delta =
    overview.totals.revenuePrev > 0
      ? Math.round(
          ((overview.totals.revenue - overview.totals.revenuePrev) / overview.totals.revenuePrev) *
            1000,
        ) / 10
      : null;

  async function open(clerkOrgId: string, id: string) {
    if (id === currentCompanyId) return router.push('/dashboard');
    setSwitching(id);
    await setActive?.({ organization: clerkOrgId });
    router.push('/dashboard');
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Unidades"
        description="O mês atual de todas as unidades em que você é administrador, comparado ao período anterior."
      />
      {overview.rows.length <= 1 ? (
        <Surface className="flex items-start gap-4 p-6">
          <Building2Icon className="text-system-blue size-6 shrink-0" />
          <div className="flex flex-col gap-1 text-[14px]">
            <span className="font-semibold">Você tem uma unidade só</span>
            <span className="text-label-secondary">
              Para abrir outra, use o seletor de empresa no topo da tela → &ldquo;Criar
              organização&rdquo;. Cada unidade tem agenda, equipe, caixa e financeiro próprios, e
              aqui você vê todas juntas.
            </span>
          </div>
        </Surface>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4">
            <StatTile
              index={0}
              label="Faturamento no mês (todas)"
              value={formatCurrencyBRL(overview.totals.revenue)}
              hint={
                delta === null
                  ? undefined
                  : `${delta > 0 ? '+' : ''}${delta.toLocaleString('pt-BR')}% vs. período anterior`
              }
            />
            <StatTile
              index={1}
              label="Atendimentos no mês"
              value={String(overview.totals.completed)}
            />
            <StatTile
              index={2}
              label="Ticket médio"
              value={formatCurrencyBRL(overview.totals.avgTicket)}
            />
            <StatTile index={3} label="Atendimentos hoje" value={String(overview.totals.today)} />
          </div>
          <Surface className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-[14px]">
              <thead>
                <tr className="text-label-secondary border-foreground/[0.06] border-b text-left text-[12px]">
                  <th className="px-5 py-3 font-medium">Unidade</th>
                  <th className="px-3 py-3 text-right font-medium">Faturamento</th>
                  <th className="px-3 py-3 text-right font-medium">Atend.</th>
                  <th className="px-3 py-3 text-right font-medium">Ticket</th>
                  <th className="px-3 py-3 text-right font-medium">Ocupação</th>
                  <th className="px-3 py-3 text-right font-medium">Retorno</th>
                  <th className="px-3 py-3 text-right font-medium">Faltas</th>
                  <th className="px-3 py-3 text-right font-medium">Hoje</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody>
                {overview.rows.map((r) => (
                  <tr key={r.id} className="border-foreground/[0.06] border-b last:border-0">
                    <td className="px-5 py-3 font-medium">
                      {r.name}
                      {r.id === currentCompanyId && (
                        <span className="text-label-secondary ml-2 text-[12px]">
                          (aberta agora)
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">
                      {formatCurrencyBRL(r.revenue)}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">{r.completed}</td>
                    <td className="px-3 py-3 text-right tabular-nums">
                      {formatCurrencyBRL(r.avgTicket)}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">{pct(r.occupancy)}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{pct(r.returningRate)}</td>
                    <td
                      className={cn(
                        'px-3 py-3 text-right tabular-nums',
                        (r.lossRate ?? 0) > 10 && 'text-destructive',
                      )}
                    >
                      {pct(r.lossRate)}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">
                      {r.today}
                      <span
                        className={cn(
                          'ml-1.5 text-[11px]',
                          r.cashOpen ? 'text-delta-good' : 'text-label-secondary',
                        )}
                      >
                        {r.cashOpen ? 'caixa aberto' : 'caixa fechado'}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={switching !== null}
                        onClick={() => open(r.clerkOrgId, r.id)}
                      >
                        {switching === r.id ? 'Abrindo...' : 'Abrir'}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Surface>
        </>
      )}
    </div>
  );
}
