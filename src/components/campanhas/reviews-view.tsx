'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { StarIcon } from 'lucide-react';

import { Surface } from '@/components/layout/page';
import { EmptyState } from '@/components/ui/empty-state';
import { getReviewSummaryAction } from '@/server/actions/relationship-actions';

function Stars({ value, size = 'size-3.5' }: { value: number; size?: string }) {
  return (
    <span className="flex">
      {[1, 2, 3, 4, 5].map((n) => (
        <StarIcon
          key={n}
          className={`${size} ${n <= Math.round(value) ? 'fill-[#ffcc00] text-[#ffcc00]' : 'text-foreground/15'}`}
        />
      ))}
    </span>
  );
}

/** Notas e comentários dos clientes depois do atendimento. */
export function ReviewsView() {
  const { data } = useQuery({ queryKey: ['reviews'], queryFn: () => getReviewSummaryAction() });
  const date = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' });
  return (
    <div className="flex flex-col gap-4">
      <p className="text-label-secondary max-w-2xl text-[14px]">
        No atendimento concluído, o botão &ldquo;Pedir avaliação&rdquo; manda o link pelo WhatsApp.
        Quem dá 4 ou 5 estrelas é convidado a avaliar também no Google (cadastre o link em
        Configurações).
      </p>
      {!data || data.count === 0 ? (
        <Surface>
          <EmptyState
            icon={StarIcon}
            title="Nenhuma avaliação ainda"
            description="Peça a avaliação logo depois de cobrar: é quando o cliente mais responde."
          />
        </Surface>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
          <Surface className="flex flex-col gap-3 p-5">
            <div className="flex items-baseline gap-2">
              <span className="text-[40px] leading-none font-bold tabular-nums">
                {data.average?.toLocaleString('pt-BR')}
              </span>
              <span className="text-label-secondary text-[14px]">de 5</span>
            </div>
            <Stars value={data.average ?? 0} size="size-5" />
            <span className="text-label-secondary text-[13px]">
              {data.count} {data.count === 1 ? 'avaliação' : 'avaliações'}
            </span>
            <ul className="flex flex-col gap-1.5">
              {data.distribution.map((d) => (
                <li key={d.rating} className="flex items-center gap-2 text-[12px]">
                  <span className="w-3 tabular-nums">{d.rating}</span>
                  <span className="bg-foreground/[0.07] h-1.5 flex-1 overflow-hidden rounded-full">
                    <span
                      className="block h-full rounded-full bg-[#ffcc00]"
                      style={{ width: `${(d.count / data.count) * 100}%` }}
                    />
                  </span>
                  <span className="text-label-secondary w-6 text-right tabular-nums">
                    {d.count}
                  </span>
                </li>
              ))}
            </ul>
          </Surface>
          <Surface>
            <ul className="divide-foreground/[0.06] divide-y">
              {data.latest.map((r) => (
                <li key={r.id} className="flex flex-col gap-1 px-5 py-3.5">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <Stars value={r.rating} />
                    <Link
                      href={`/clientes/${r.clientId}`}
                      className="text-[14px] font-medium hover:underline"
                    >
                      {r.clientName}
                    </Link>
                    <span className="text-label-secondary text-[12px]">
                      {r.serviceName} com {r.professionalName} ·{' '}
                      {date.format(new Date(r.createdAt))}
                    </span>
                  </div>
                  {r.comment && <p className="text-[14px]">&ldquo;{r.comment}&rdquo;</p>}
                </li>
              ))}
            </ul>
          </Surface>
        </div>
      )}
    </div>
  );
}
