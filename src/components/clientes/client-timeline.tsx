'use client';

import * as React from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { HistoryIcon } from 'lucide-react';

import { unwrapResult } from '@/lib/action-result';
import { formatCurrencyBRL } from '@/lib/serialize';
import { cn } from '@/lib/utils';
import { EmptyState } from '@/components/ui/empty-state';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { getClientTimelineAction } from '@/server/actions/client-actions';

const KIND_LABEL = {
  appointment: 'Atendimento',
  quote: 'Orçamento',
  payment: 'Pagamento',
  sale: 'Venda',
  task: 'Tarefa',
  document: 'Documento',
  interaction: 'Comercial',
  job: 'Serviço',
  review: 'Avaliação',
  change: 'Cadastro',
} as const;

/** Tudo o que aconteceu com o cliente, do mais recente ao mais antigo, com o link da origem. */
export function ClientTimeline({ clientId, timezone }: { clientId: string; timezone: string }) {
  const [filter, setFilter] = React.useState<'all' | 'shared'>('all');
  const { data, isLoading } = useQuery({
    queryKey: ['client-timeline', clientId],
    queryFn: () => getClientTimelineAction(clientId).then(unwrapResult),
  });
  const events = (data ?? []).filter((e) => filter === 'all' || e.visibility === 'shared');
  return (
    <div className="flex flex-col gap-3">
      <SegmentedControl
        size="sm"
        className="self-start"
        value={filter}
        onValueChange={setFilter}
        options={[
          { value: 'all', label: 'Tudo' },
          { value: 'shared', label: 'Só o que o cliente também vê' },
        ]}
      />
      {!isLoading && events.length === 0 ? (
        <EmptyState
          icon={HistoryIcon}
          title="Nada registrado ainda"
          description="Atendimentos, orçamentos, pagamentos, tarefas e documentos aparecem aqui."
        />
      ) : (
        <ol className="flex flex-col gap-1.5">
          {events.map((e) => {
            const body = (
              <>
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="text-label-secondary text-[12px] tabular-nums">
                    {new Intl.DateTimeFormat('pt-BR', {
                      timeZone: timezone,
                      day: '2-digit',
                      month: '2-digit',
                      year: '2-digit',
                    }).format(new Date(e.at))}
                  </span>
                  <span className="text-label-secondary text-[11px] uppercase">
                    {KIND_LABEL[e.kind]}
                  </span>
                  <span className="text-[14px] font-medium">{e.title}</span>
                  {e.amount != null && (
                    <span className="text-[13px] tabular-nums">{formatCurrencyBRL(e.amount)}</span>
                  )}
                </div>
                <div className="text-label-secondary text-[12px]">
                  {e.detail}
                  {e.visibility === 'internal' && (
                    <span className={cn(e.detail && 'ml-1')}>· interno</span>
                  )}
                </div>
              </>
            );
            return (
              <li key={e.id}>
                {e.href ? (
                  <Link
                    href={e.href}
                    className="bg-tile hover:bg-foreground/[0.04] block rounded-xl px-3 py-2"
                  >
                    {body}
                  </Link>
                ) : (
                  <div className="bg-tile rounded-xl px-3 py-2">{body}</div>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
