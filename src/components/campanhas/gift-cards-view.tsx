'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { GiftIcon, PlusIcon } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Surface } from '@/components/layout/page';
import { EmptyState } from '@/components/ui/empty-state';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { SaleDialog } from '@/components/vendas/sale-dialog';
import { unwrapResult } from '@/lib/action-result';
import { formatCurrencyBRL } from '@/lib/serialize';
import { cn } from '@/lib/utils';
import { cancelGiftCardAction, listGiftCardsAction } from '@/server/actions/sales-actions';

type Card = Awaited<ReturnType<typeof listGiftCardsAction>>[number];

export function GiftCardsView() {
  const queryClient = useQueryClient();
  const [saleOpen, setSaleOpen] = React.useState(false);
  const [toCancel, setToCancel] = React.useState<Card | null>(null);
  const { data } = useQuery({ queryKey: ['gift-cards'], queryFn: () => listGiftCardsAction() });
  const cancel = useMutation({
    mutationFn: (id: string) => cancelGiftCardAction(id).then(unwrapResult),
    onSuccess: () => {
      toast.success('Vale cancelado.');
      setToCancel(null);
      queryClient.invalidateQueries({ queryKey: ['gift-cards'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const outstanding = (data ?? [])
    .filter((c) => c.status === 'ACTIVE' && !c.expired)
    .reduce((s, c) => s + c.balance, 0);
  const date = new Intl.DateTimeFormat('pt-BR');

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-label-secondary text-[14px]">
          Saldo em vales ainda não usados:{' '}
          <strong className="text-foreground">{formatCurrencyBRL(outstanding)}</strong>. O cliente
          informa o código na hora de pagar.
        </p>
        <Button onClick={() => setSaleOpen(true)}>
          <PlusIcon className="size-4" />
          Vender vale-presente
        </Button>
      </div>
      <Surface>
        {!data || data.length === 0 ? (
          <EmptyState
            icon={GiftIcon}
            title="Nenhum vale-presente vendido"
            description="Ótimo para Dia das Mães, Natal e aniversários."
          />
        ) : (
          <ul className="divide-foreground/[0.06] divide-y">
            {data.map((c) => {
              const inactive = c.status !== 'ACTIVE' || c.expired || c.balance <= 0;
              return (
                <li
                  key={c.id}
                  className={cn(
                    'flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3.5',
                    inactive && 'opacity-60',
                  )}
                >
                  <span className="bg-foreground/[0.06] rounded-lg px-2 py-1 font-mono text-[14px] font-semibold tracking-wider">
                    {c.code}
                  </span>
                  <span className="min-w-0 flex-1 text-[14px]">
                    {c.recipientName ? `Para ${c.recipientName}` : 'Vale-presente'}
                    {c.buyerName ? ` · de ${c.buyerName}` : ''}
                    <span className="text-label-secondary block text-[12px]">
                      Vendido em {date.format(new Date(c.createdAt))}
                      {c.expiresAt ? ` · vale até ${date.format(new Date(c.expiresAt))}` : ''}
                      {c.status === 'CANCELED'
                        ? ' · Cancelado'
                        : c.expired
                          ? ' · Vencido'
                          : c.balance <= 0
                            ? ' · Usado'
                            : ''}
                    </span>
                  </span>
                  <span className="text-right tabular-nums">
                    <span className="font-semibold">{formatCurrencyBRL(c.balance)}</span>
                    <span className="text-label-secondary block text-[12px]">
                      de {formatCurrencyBRL(c.initialAmount)}
                    </span>
                  </span>
                  {c.status === 'ACTIVE' && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive"
                      onClick={() => setToCancel(c)}
                    >
                      Cancelar
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Surface>
      <SaleDialog
        open={saleOpen}
        onOpenChange={(open) => {
          setSaleOpen(open);
          if (!open) queryClient.invalidateQueries({ queryKey: ['gift-cards'] });
        }}
        defaultTab="vale"
      />
      <ConfirmDialog
        open={toCancel !== null}
        title="Cancelar este vale-presente?"
        description="O código deixa de valer. O valor recebido na venda continua no financeiro (devolva por fora, se for o caso)."
        confirmLabel="Cancelar vale"
        destructive
        pending={cancel.isPending}
        onConfirm={() => toCancel && cancel.mutate(toCancel.id)}
        onOpenChange={(open) => !open && setToCancel(null)}
      />
    </div>
  );
}
