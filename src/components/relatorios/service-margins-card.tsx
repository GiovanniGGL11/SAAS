'use client';

import { useQuery } from '@tanstack/react-query';

import { unwrapResult } from '@/lib/action-result';
import { formatCurrencyBRL } from '@/lib/serialize';
import { getServiceMarginsAction } from '@/server/actions/report-actions';

/** Margem de contribuição por serviço (Pro): preço − materiais − comissão do serviço. */
export function ServiceMarginsCard() {
  const { data } = useQuery({
    queryKey: ['service-margins'],
    queryFn: () => getServiceMarginsAction().then(unwrapResult),
  });
  if (!data) return null;
  return (
    <section className="bg-tile flex flex-col gap-3 rounded-[22px] p-5">
      <div>
        <h2 className="text-[17px] font-semibold">Margem por serviço</h2>
        <p className="text-label-secondary text-[13px]">
          Preço − materiais (ficha de consumo do serviço, pelo custo do estoque) − comissão própria
          do serviço. Quando a comissão é a do profissional, ela varia e não entra na conta.
        </p>
      </div>
      {data.length === 0 ? (
        <p className="text-label-secondary text-[13px]">Nenhum serviço ativo.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-[13px]">
            <thead className="text-label-secondary text-left">
              <tr>
                <th className="py-1.5 font-medium">Serviço</th>
                <th className="py-1.5 text-right font-medium">Preço</th>
                <th className="py-1.5 text-right font-medium">Materiais</th>
                <th className="py-1.5 text-right font-medium">Comissão</th>
                <th className="py-1.5 text-right font-medium">Margem</th>
              </tr>
            </thead>
            <tbody>
              {data.map((s) => (
                <tr key={s.id} className="border-foreground/[0.06] border-t align-top">
                  <td className="py-1.5">
                    {s.name}
                    {s.materialItems.length > 0 && (
                      <div className="text-label-secondary text-[12px]">
                        {s.materialItems.join(', ')}
                      </div>
                    )}
                  </td>
                  <td className="py-1.5 text-right tabular-nums">{formatCurrencyBRL(s.price)}</td>
                  <td className="py-1.5 text-right tabular-nums">
                    {s.materials ? formatCurrencyBRL(s.materials) : '—'}
                  </td>
                  <td className="py-1.5 text-right tabular-nums">
                    {s.commission == null ? 'varia' : formatCurrencyBRL(s.commission)}
                  </td>
                  <td
                    className={`py-1.5 text-right font-semibold tabular-nums ${s.margin < 0 ? 'text-system-red' : ''}`}
                  >
                    {formatCurrencyBRL(s.margin)}
                    {s.marginPercent != null && (
                      <span className="text-label-secondary block text-[11px] font-normal">
                        {s.marginPercent.toLocaleString('pt-BR')}%
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
