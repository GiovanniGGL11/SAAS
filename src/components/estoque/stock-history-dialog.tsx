'use client';

import { useQuery } from '@tanstack/react-query';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { listStockMovementsAction } from '@/server/actions/stock-actions';
import { cn } from '@/lib/utils';

const TYPE_LABEL = { IN: 'Entrada', OUT: 'Saída', SALE: 'Venda' } as const;

/** As últimas 100 movimentações: quem mexeu, quando, quanto e por quê. */
export function StockHistoryDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const query = useQuery({
    queryKey: ['stock-movements'],
    queryFn: () => listStockMovementsAction(),
    enabled: open,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85svh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Histórico do estoque</DialogTitle>
          <DialogDescription>As 100 movimentações mais recentes.</DialogDescription>
        </DialogHeader>
        {query.isLoading ? (
          <Skeleton className="h-48 w-full rounded-xl" />
        ) : (query.data ?? []).length === 0 ? (
          <p className="text-label-secondary py-6 text-center text-sm">
            Nenhuma movimentação ainda.
          </p>
        ) : (
          <ul className="divide-foreground/[0.06] flex flex-col divide-y text-[13px]">
            {query.data!.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <div className="truncate font-medium">{m.product.name}</div>
                  <div className="text-label-secondary truncate text-xs">
                    {new Intl.DateTimeFormat('pt-BR', {
                      dateStyle: 'short',
                      timeStyle: 'short',
                    }).format(new Date(m.createdAt))}
                    {m.reason ? ` · ${m.reason}` : ''}
                  </div>
                </div>
                <span
                  className={cn(
                    'shrink-0 font-semibold tabular-nums',
                    m.type === 'IN' ? 'text-system-green' : 'text-system-red',
                  )}
                >
                  {m.type === 'IN' ? '+' : '−'}
                  {m.quantity}{' '}
                  <span className="text-label-secondary font-normal">{TYPE_LABEL[m.type]}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
