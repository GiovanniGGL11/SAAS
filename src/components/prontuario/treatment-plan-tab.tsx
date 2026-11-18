'use client';

import * as React from 'react';
import Link from 'next/link';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2Icon, ClipboardListIcon, PackageIcon, Undo2Icon } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Surface } from '@/components/layout/page';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { unwrapResult } from '@/lib/action-result';
import { cn } from '@/lib/utils';
import {
  markProcedureDoneAction,
  undoProcedureDoneAction,
} from '@/server/actions/medical-record-actions';

export type PlanItemView = {
  quoteId: string;
  itemIndex: number;
  description: string;
  total: number;
  done: number;
  viaPackage: boolean;
  history: { id: string; doneAt: Date | string; by: string; note: string | null }[];
};

export type PlanQuoteView = {
  quoteId: string;
  number: number;
  title: string;
  approvedAt: Date | string | null;
  packageName: string | null;
  items: PlanItemView[];
};

/**
 * Plano de tratamento: os procedimentos dos orçamentos aprovados, com o andamento de cada um.
 * "Sessão feita" marca uma sessão; o pacote (orçamento convertido) anda sozinho pela comanda.
 */
export function TreatmentPlanTab({
  clientId,
  plan,
  when,
}: {
  clientId: string;
  plan: PlanQuoteView[];
  when: (d: Date | string) => string;
}) {
  const queryClient = useQueryClient();
  const [undoing, setUndoing] = React.useState<{ id: string; label: string } | null>(null);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['medical-record', clientId] });

  const mark = useMutation({
    mutationFn: (item: PlanItemView) =>
      markProcedureDoneAction({ clientId, quoteId: item.quoteId, itemIndex: item.itemIndex }).then(
        unwrapResult,
      ),
    onSuccess: (r, item) => {
      toast.success(`${item.description}: sessão ${r.done} de ${r.total} registrada.`);
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const undo = useMutation({
    mutationFn: (id: string) => undoProcedureDoneAction({ clientId, id }).then(unwrapResult),
    onSuccess: () => {
      toast.success('Sessão desfeita.');
      setUndoing(null);
      refresh();
    },
    onError: (e: Error) => {
      setUndoing(null);
      toast.error(e.message);
    },
  });

  if (plan.length === 0) {
    return (
      <Surface className="flex flex-col items-center gap-2 p-8 text-center">
        <ClipboardListIcon className="text-label-secondary size-8" />
        <p className="font-medium">Nenhum procedimento planejado</p>
        <p className="text-label-secondary max-w-md text-[13px]">
          O plano de tratamento vem dos orçamentos aprovados do paciente. Crie e aprove um orçamento
          em{' '}
          <Link href="/comercial?aba=orcamentos" className="text-system-blue underline">
            Comercial › Orçamentos
          </Link>{' '}
          e os procedimentos aparecem aqui, com as sessões para acompanhar.
        </p>
      </Surface>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {plan.map((quote) => (
        <Surface key={quote.quoteId} className="flex flex-col gap-3 p-4 md:p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-[15px] font-semibold">
              Orçamento #{quote.number} · {quote.title}
            </h3>
            <span className="text-label-secondary text-[12px]">
              {quote.approvedAt ? `Aprovado em ${when(quote.approvedAt).slice(0, 8)}` : 'Aprovado'}
              {quote.packageName && (
                <span className="ml-2 inline-flex items-center gap-1">
                  <PackageIcon className="size-3" /> virou o pacote {quote.packageName}
                </span>
              )}
            </span>
          </div>
          <ul className="flex flex-col gap-2">
            {quote.items.map((item) => {
              const complete = item.done >= item.total;
              const percent = item.total > 0 ? Math.min(100, (item.done / item.total) * 100) : 0;
              return (
                <li
                  key={item.itemIndex}
                  className="bg-foreground/[0.03] flex flex-col gap-2 rounded-xl p-3"
                >
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 text-[14px] font-medium">
                        {complete && <CheckCircle2Icon className="text-system-green size-4" />}
                        {item.description}
                      </div>
                      <div
                        className="bg-foreground/[0.08] mt-1.5 h-1.5 overflow-hidden rounded-full"
                        role="progressbar"
                        aria-valuenow={item.done}
                        aria-valuemin={0}
                        aria-valuemax={item.total}
                        aria-label={`${item.description}: ${item.done} de ${item.total} sessões`}
                      >
                        <div
                          className={cn(
                            'h-full rounded-full',
                            complete ? 'bg-system-green' : 'bg-system-blue',
                          )}
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                    </div>
                    <span className="text-[13px] tabular-nums">
                      <strong>{item.done}</strong> de {item.total}{' '}
                      {item.total === 1 ? 'sessão' : 'sessões'}
                    </span>
                    {item.viaPackage ? (
                      <span className="text-label-secondary text-[12px]">conta pela comanda</span>
                    ) : (
                      !complete && (
                        <Button
                          size="xs"
                          variant="outline"
                          disabled={mark.isPending}
                          onClick={() => mark.mutate(item)}
                        >
                          <CheckCircle2Icon /> Sessão feita
                        </Button>
                      )
                    )}
                  </div>
                  {item.history.length > 0 && (
                    <ul className="text-label-secondary flex flex-col gap-0.5 text-[12px]">
                      {item.history.map((h, i) => (
                        <li key={h.id} className="flex items-center justify-between gap-2">
                          <span>
                            Sessão {item.history.length - i} · {when(h.doneAt)} · {h.by}
                            {h.note ? ` · ${h.note}` : ''}
                          </span>
                          <button
                            type="button"
                            className="hover:text-foreground inline-flex items-center gap-1"
                            onClick={() =>
                              setUndoing({
                                id: h.id,
                                label: `sessão ${item.history.length - i} de ${item.description}`,
                              })
                            }
                          >
                            <Undo2Icon className="size-3" /> Desfazer
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </Surface>
      ))}
      <ConfirmDialog
        open={undoing !== null}
        onOpenChange={(open) => !open && setUndoing(null)}
        title="Desfazer esta sessão?"
        description={`A ${undoing?.label ?? 'sessão'} volta a ficar pendente. A alteração fica no histórico.`}
        confirmLabel="Desfazer"
        destructive
        pending={undo.isPending}
        onConfirm={() => undoing && undo.mutate(undoing.id)}
      />
    </div>
  );
}
