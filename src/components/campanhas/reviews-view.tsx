'use client';

import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { unwrapResult } from '@/lib/action-result';
import { StarIcon } from 'lucide-react';

import { Surface } from '@/components/layout/page';
import { EmptyState } from '@/components/ui/empty-state';
import {
  createReviewFollowUpAction,
  getReviewSummaryAction,
} from '@/server/actions/relationship-actions';

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
        Depois de avaliar, todo cliente (qualquer nota) recebe o convite opcional para o Google.
        Comentários só são públicos com autorização do cliente.
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
            {data.count < 10 && (
              <span className="text-[12px] text-amber-800 dark:text-amber-300">
                Poucas respostas: a média ainda pode mudar bastante.
              </span>
            )}
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
                  {r.comment && (
                    <p className="text-[14px]">
                      &ldquo;{r.comment}&rdquo;
                      <span className="text-label-secondary ml-2 text-[11px]">
                        {r.publicConsent ? 'pode ser publicado' : 'não autorizado para publicação'}
                      </span>
                    </p>
                  )}
                  {r.rating <= 3 && <FollowUp reviewId={r.id} taskId={r.followUpTaskId} />}
                </li>
              ))}
            </ul>
          </Surface>
        </div>
      )}
    </div>
  );
}

/** Nota baixa: abrir uma tarefa para a equipe tratar (uma por avaliação). */
function FollowUp({ reviewId, taskId }: { reviewId: string; taskId: string | null }) {
  const queryClient = useQueryClient();
  const create = useMutation({
    mutationFn: () => createReviewFollowUpAction(reviewId).then(unwrapResult),
    onSuccess: () => {
      toast.success('Tarefa criada em Atividades.');
      queryClient.invalidateQueries({ queryKey: ['reviews'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  if (taskId) {
    return (
      <Link
        href={`/atividades?tarefa=${taskId}`}
        className="text-system-blue self-start text-[12px] hover:underline"
      >
        Ver tarefa de tratamento
      </Link>
    );
  }
  return (
    <Button
      size="sm"
      variant="outline"
      className="self-start"
      disabled={create.isPending}
      onClick={() => create.mutate()}
    >
      Criar tarefa para tratar
    </Button>
  );
}
