'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PlusIcon, XIcon } from 'lucide-react';
import { toast } from 'sonner';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { unwrapResult } from '@/lib/action-result';
import { formatCurrencyBRL, type SerializedProduct } from '@/lib/serialize';
import { cn } from '@/lib/utils';
import { createPurchaseAction, listPurchasesAction } from '@/server/actions/schedule-actions';

function parseMoney(value: string): number {
  const n = Number(value.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

type Line = { productId: string; quantity: string; unitCost: string };

/** Entrada de mercadoria do fornecedor: estoque, custo médio e conta a pagar num passo só. */
export function PurchaseDialog({
  open,
  onOpenChange,
  products,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  products: SerializedProduct[];
}) {
  const queryClient = useQueryClient();
  const active = products.filter((p) => p.active);
  const blank = (): Line => ({ productId: active[0]?.id ?? '', quantity: '1', unitCost: '' });
  const [lines, setLines] = React.useState<Line[]>([blank()]);
  const [supplier, setSupplier] = React.useState('');
  const [invoice, setInvoice] = React.useState('');
  const [payLater, setPayLater] = React.useState(false);
  const [dueDate, setDueDate] = React.useState('');
  const [method, setMethod] = React.useState('PIX');
  const total = lines.reduce((s, l) => s + (Number(l.quantity) || 0) * parseMoney(l.unitCost), 0);

  const close = () => {
    setLines([blank()]);
    setSupplier('');
    setInvoice('');
    setPayLater(false);
    setDueDate('');
    onOpenChange(false);
  };

  const save = useMutation({
    mutationFn: () =>
      createPurchaseAction({
        supplier: supplier || undefined,
        invoiceNumber: invoice || undefined,
        items: lines.map((l) => ({
          productId: l.productId,
          quantity: Number(l.quantity) || 0,
          unitCost: parseMoney(l.unitCost),
        })),
        payment: payLater ? { dueDate } : { method },
      }).then(unwrapResult),
    onSuccess: ({ total }) => {
      toast.success(
        `Entrada registrada: ${formatCurrencyBRL(total)}${payLater ? ' em contas a pagar' : ''}. Estoque e custo médio atualizados.`,
      );
      for (const key of ['products', 'purchases', 'transactions', 'cash-flow'])
        queryClient.invalidateQueries({ queryKey: [key] });
      close();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(next: boolean) => (next ? onOpenChange(true) : close())}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Entrada de mercadoria</DialogTitle>
          <DialogDescription>
            Soma no estoque, recalcula o custo médio e lança a compra no financeiro.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 text-sm">
          <div className="grid grid-cols-2 gap-2">
            <Input
              placeholder="Fornecedor (opcional)"
              value={supplier}
              onChange={(e) => setSupplier(e.target.value)}
              maxLength={120}
            />
            <Input
              placeholder="Nº da nota (opcional)"
              value={invoice}
              onChange={(e) => setInvoice(e.target.value)}
              maxLength={40}
            />
          </div>
          <div className="text-label-secondary grid grid-cols-[1fr_64px_96px_24px] gap-2 text-[12px]">
            <span>Produto</span>
            <span>Qtd.</span>
            <span>Custo un. (R$)</span>
            <span />
          </div>
          {lines.map((line, index) => (
            <div key={index} className="grid grid-cols-[1fr_64px_96px_24px] items-center gap-2">
              <select
                value={line.productId}
                onChange={(e) =>
                  setLines((ls) =>
                    ls.map((l, i) => (i === index ? { ...l, productId: e.target.value } : l)),
                  )
                }
                className="bg-background ring-foreground/[0.08] h-9 min-w-0 rounded-lg px-2 ring-1"
              >
                {active.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} (custo atual {formatCurrencyBRL(p.costPrice)})
                  </option>
                ))}
              </select>
              <Input
                type="number"
                min={1}
                value={line.quantity}
                onChange={(e) =>
                  setLines((ls) =>
                    ls.map((l, i) => (i === index ? { ...l, quantity: e.target.value } : l)),
                  )
                }
                className="h-9"
              />
              <Input
                inputMode="decimal"
                placeholder="0,00"
                value={line.unitCost}
                onChange={(e) =>
                  setLines((ls) =>
                    ls.map((l, i) => (i === index ? { ...l, unitCost: e.target.value } : l)),
                  )
                }
                className="h-9"
              />
              <button
                type="button"
                aria-label="Remover linha"
                disabled={lines.length === 1}
                onClick={() => setLines((ls) => ls.filter((_, i) => i !== index))}
                className="text-label-secondary hover:text-foreground disabled:opacity-30"
              >
                <XIcon className="size-4" />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setLines((ls) => [...ls, blank()])}
            className="text-system-blue flex items-center gap-1 self-start text-[13px] font-medium hover:underline"
          >
            <PlusIcon className="size-3.5" /> Adicionar produto
          </button>
          <div className="flex flex-wrap items-center gap-2">
            {[
              [false, 'Paga agora'],
              [true, 'Conta a pagar'],
            ].map(([value, label]) => (
              <button
                key={String(value)}
                type="button"
                onClick={() => setPayLater(value as boolean)}
                className={cn(
                  'rounded-full px-3 py-1.5 text-[12px] font-medium',
                  payLater === value ? 'bg-foreground text-background' : 'bg-foreground/[0.06]',
                )}
              >
                {label as string}
              </button>
            ))}
            {payLater ? (
              <Input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="h-9 w-40"
                aria-label="Vencimento"
              />
            ) : (
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value)}
                className="bg-background ring-foreground/[0.08] h-9 rounded-lg px-2 ring-1"
                aria-label="Forma de pagamento"
              >
                <option value="PIX">PIX</option>
                <option value="CASH">Dinheiro</option>
                <option value="BANK_TRANSFER">Transferência</option>
                <option value="CREDIT_CARD">Cartão de crédito</option>
                <option value="DEBIT_CARD">Cartão de débito</option>
                <option value="OTHER">Outro (boleto...)</option>
              </select>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={close}>
            Voltar
          </Button>
          <Button
            disabled={save.isPending || total <= 0 || active.length === 0 || (payLater && !dueDate)}
            onClick={() => save.mutate()}
          >
            Registrar {formatCurrencyBRL(total)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Últimas compras, para conferir com as notas do fornecedor. */
export function PurchasesHistoryDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data } = useQuery({
    queryKey: ['purchases'],
    queryFn: () => listPurchasesAction(),
    enabled: open,
  });
  const date = new Intl.DateTimeFormat('pt-BR');
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Compras de mercadoria</DialogTitle>
          <DialogDescription>As últimas 50 entradas.</DialogDescription>
        </DialogHeader>
        {!data || data.length === 0 ? (
          <p className="text-label-secondary text-sm">Nenhuma compra registrada.</p>
        ) : (
          <ul className="divide-foreground/[0.06] max-h-96 divide-y overflow-y-auto">
            {data.map((p) => (
              <li key={p.id} className="flex flex-col gap-0.5 py-2.5 text-[13px]">
                <div className="flex justify-between gap-2">
                  <span className="font-medium">
                    {p.supplier ?? 'Sem fornecedor'}
                    {p.invoiceNumber ? ` · NF ${p.invoiceNumber}` : ''}
                  </span>
                  <span className="font-semibold tabular-nums">{formatCurrencyBRL(p.total)}</span>
                </div>
                <span className="text-label-secondary">
                  {date.format(new Date(p.createdAt))} ·{' '}
                  {p.items.map((i) => `${i.name} × ${i.quantity}`).join(', ')}
                </span>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
