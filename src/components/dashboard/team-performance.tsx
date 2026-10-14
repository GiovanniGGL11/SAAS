import Link from 'next/link';

import { AppleTile, TileEyebrow } from '@/components/dashboard/apple-tile';
import { formatCurrencyBRL } from '@/lib/serialize';
import type { ProfessionalPerformance } from '@/server/data/insights';

/** Desempenho de cada profissional no período: faturado, atendimentos, ticket e ocupação. */
export function TeamPerformance({ team }: { team: ProfessionalPerformance[] }) {
  return (
    <AppleTile interactive={false} className="flex flex-col gap-4 p-5 md:p-6">
      <div className="flex items-end justify-between gap-2">
        <TileEyebrow>Desempenho da equipe</TileEyebrow>
        <Link
          href="/relatorios"
          className="text-system-blue text-[13px] font-medium hover:underline"
        >
          Comissões e detalhes
        </Link>
      </div>
      {team.length === 0 ? (
        <p className="text-label-secondary text-[14px]">
          Cadastre a equipe para ver o desempenho de cada um.
        </p>
      ) : (
        <div className="-mx-1 overflow-x-auto">
          <table className="w-full min-w-[420px] text-[14px]">
            <thead>
              <tr className="text-label-secondary text-left text-[12px]">
                <th className="px-1 pb-2 font-medium">Profissional</th>
                <th className="px-1 pb-2 text-right font-medium">Faturado</th>
                <th className="px-1 pb-2 text-right font-medium">Atend.</th>
                <th className="px-1 pb-2 text-right font-medium">Ticket</th>
                <th className="w-[30%] px-1 pb-2 pl-4 font-medium">Ocupação</th>
              </tr>
            </thead>
            <tbody>
              {team.map((p) => (
                <tr key={p.id} className="border-foreground/[0.06] border-t">
                  <td className="px-1 py-2.5">
                    <span className="flex items-center gap-2 font-medium">
                      <span
                        className="size-2.5 shrink-0 rounded-full"
                        style={{ background: p.color }}
                      />
                      <span className="truncate">{p.name}</span>
                    </span>
                  </td>
                  <td className="px-1 py-2.5 text-right tabular-nums">
                    {formatCurrencyBRL(p.revenue)}
                  </td>
                  <td className="px-1 py-2.5 text-right tabular-nums">{p.count}</td>
                  <td className="text-label-secondary px-1 py-2.5 text-right tabular-nums">
                    {p.count ? formatCurrencyBRL(p.avgTicket) : '—'}
                  </td>
                  <td className="px-1 py-2.5 pl-4">
                    {p.occupancy === null ? (
                      <span className="text-label-secondary text-[12px]">Sem expediente</span>
                    ) : (
                      <span className="flex items-center gap-2">
                        <span className="bg-foreground/[0.07] h-1.5 flex-1 overflow-hidden rounded-full">
                          <span
                            className="block h-full rounded-full"
                            style={{ width: `${p.occupancy}%`, background: p.color }}
                          />
                        </span>
                        <span className="w-10 text-right text-[12px] tabular-nums">
                          {p.occupancy.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}%
                        </span>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AppleTile>
  );
}
