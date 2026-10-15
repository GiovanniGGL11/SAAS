'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MinusIcon, PlusIcon } from 'lucide-react';
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
import { Combobox } from '@/components/ui/combobox';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { unwrapResult } from '@/lib/action-result';
import { formatCurrencyBRL } from '@/lib/serialize';
import { cn } from '@/lib/utils';
import { listClientsAction } from '@/server/actions/client-actions';
import { listActiveProductsAction } from '@/server/actions/stock-actions';
import {
  listPackagePlansAction,
  sellGiftCardAction,
  sellPackageAction,
  sellProductsAction,
} from '@/server/actions/sales-actions';

const METHODS = [
  { value: 'PIX', label: 'PIX' },
  { value: 'CASH', label: 'Dinheiro' },
  { value: 'CREDIT_CARD', label: 'Crédito' },
  { value: 'DEBIT_CARD', label: 'Débito' },
  { value: 'TAB', label: 'Fiado' },
] as const;
type PayChoice = (typeof METHODS)[number]['value'];
type Tab = 'produtos' | 'pacote' | 'vale';

function parseMoney(value: string): number {
  const n = Number(value.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

const toPayment = (choice: PayChoice) =>
  choice === 'TAB' ? ({ tab: true } as const) : ({ method: choice } as const);

/** Venda fora do atendimento: produtos no balcão, pacote/assinatura ou vale-presente. */
export function SaleDialog({
  open,
  onOpenChange,
  defaultClientId,
  defaultTab = 'produtos',
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultClientId?: string;
  defaultTab?: Tab;
}) {
  const queryClient = useQueryClient();
  const [tab, setTab] = React.useState<Tab>(defaultTab);
  const [clientId, setClientId] = React.useState(defaultClientId ?? '');
  const [pay, setPay] = React.useState<PayChoice>('PIX');
  const [cart, setCart] = React.useState<Record<string, number>>({});
  const [planId, setPlanId] = React.useState('');
  const [giftAmount, setGiftAmount] = React.useState('');
  const [recipient, setRecipient] = React.useState('');
  const [buyer, setBuyer] = React.useState('');

  const { data: clients } = useQuery({
    queryKey: ['clients'],
    queryFn: () => listClientsAction(),
    enabled: open,
  });
  const { data: products } = useQuery({
    queryKey: ['products-active'],
    queryFn: () => listActiveProductsAction(),
    enabled: open && tab === 'produtos',
  });
  const { data: plans } = useQuery({
    queryKey: ['package-plans'],
    queryFn: () => listPackagePlansAction(),
    enabled: open && tab === 'pacote',
  });

  const cartItems = Object.entries(cart).filter(([, q]) => q > 0);
  const cartTotal = cartItems.reduce(
    (sum, [id, q]) => sum + (products?.find((p) => p.id === id)?.salePrice ?? 0) * q,
    0,
  );
  const plan = plans?.find((p) => p.id === planId);
  const total =
    tab === 'produtos' ? cartTotal : tab === 'pacote' ? (plan?.price ?? 0) : parseMoney(giftAmount);
  const needsClient = pay === 'TAB' || tab === 'pacote';

  // Cada venda começa do zero: aba, cliente, carrinho e pagamento.
  const reset = () => {
    setTab(defaultTab);
    setClientId(defaultClientId ?? '');
    setCart({});
    setPlanId('');
    setGiftAmount('');
    setRecipient('');
    setBuyer('');
    setPay('PIX');
  };

  const sell = useMutation({
    mutationFn: async () => {
      if (needsClient && !clientId)
        throw new Error(
          tab === 'pacote'
            ? 'Escolha o cliente do pacote.'
            : 'Para deixar no fiado, escolha o cliente.',
        );
      const payment = toPayment(pay);
      if (tab === 'produtos') {
        const r = await sellProductsAction({
          clientId: clientId || null,
          items: cartItems.map(([productId, quantity]) => ({ productId, quantity })),
          payment,
        }).then(unwrapResult);
        return `Venda registrada: ${formatCurrencyBRL(r.total)}.`;
      }
      if (tab === 'pacote') {
        await sellPackageAction({ clientId, planId, payment }).then(unwrapResult);
        return `${plan?.recurring ? 'Assinatura' : 'Pacote'} vendido para o cliente.`;
      }
      const r = await sellGiftCardAction({
        amount: parseMoney(giftAmount),
        recipientName: recipient || undefined,
        buyerName: buyer || undefined,
        clientId: clientId || null,
        payment,
      }).then(unwrapResult);
      return `Vale-presente criado. Código: ${r.code}`;
    },
    onSuccess: (message) => {
      toast.success(message, { duration: 10_000 });
      for (const key of [
        'cash-register',
        'transactions',
        'cash-flow',
        'products-active',
        'client-detail',
        'client-packages',
        'client-tab',
        'gift-cards',
      ])
        queryClient.invalidateQueries({ queryKey: [key] });
      close();
    },
    onError: (e: Error) => toast.error(e.message || 'Não foi possível registrar a venda.'),
  });

  function close() {
    reset();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={(next: boolean) => (next ? onOpenChange(true) : close())}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nova venda</DialogTitle>
          <DialogDescription>
            Produtos no balcão, pacotes e assinaturas ou vale-presente.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 text-sm">
          <SegmentedControl
            value={tab}
            onValueChange={setTab}
            options={[
              { value: 'produtos', label: 'Produtos' },
              { value: 'pacote', label: 'Pacote' },
              { value: 'vale', label: 'Vale-presente' },
            ]}
          />

          <div className="flex flex-col gap-1.5">
            <span className="font-medium">Cliente {needsClient ? '' : '(opcional)'}</span>
            <Combobox
              options={(clients ?? [])
                .filter((c) => c.active)
                .map((c) => ({ value: c.id, label: c.name, description: c.phone ?? undefined }))}
              value={clientId}
              onChange={setClientId}
              placeholder="Selecionar cliente"
              searchPlaceholder="Buscar cliente..."
            />
          </div>

          {tab === 'produtos' && (
            <div className="ring-foreground/[0.08] max-h-64 overflow-y-auto rounded-xl ring-1">
              {(products ?? []).length === 0 && (
                <p className="text-label-secondary p-4">
                  Nenhum produto ativo. Cadastre em Estoque.
                </p>
              )}
              {(products ?? []).map((p) => {
                const q = cart[p.id] ?? 0;
                return (
                  <div
                    key={p.id}
                    className="border-foreground/[0.06] flex items-center gap-3 border-b px-3 py-2 last:border-0"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{p.name}</div>
                      <div className="text-label-secondary text-[12px]">
                        {formatCurrencyBRL(p.salePrice)} · {p.quantity} em estoque
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        aria-label={`Menos ${p.name}`}
                        disabled={q === 0}
                        onClick={() => setCart((c) => ({ ...c, [p.id]: Math.max(0, q - 1) }))}
                        className="bg-foreground/[0.06] flex size-7 items-center justify-center rounded-full disabled:opacity-30"
                      >
                        <MinusIcon className="size-3.5" />
                      </button>
                      <span className="w-5 text-center tabular-nums">{q}</span>
                      <button
                        type="button"
                        aria-label={`Mais ${p.name}`}
                        disabled={q >= p.quantity}
                        onClick={() => setCart((c) => ({ ...c, [p.id]: q + 1 }))}
                        className="bg-foreground/[0.06] flex size-7 items-center justify-center rounded-full disabled:opacity-30"
                      >
                        <PlusIcon className="size-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {tab === 'pacote' && (
            <div className="flex flex-col gap-1.5">
              <span className="font-medium">Plano</span>
              {(plans ?? []).filter((p) => p.active).length === 0 ? (
                <p className="text-label-secondary">
                  Nenhum pacote cadastrado. O admin cria em Serviços → Pacotes e assinaturas.
                </p>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {(plans ?? [])
                    .filter((p) => p.active)
                    .map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setPlanId(p.id)}
                        className={cn(
                          'flex items-center justify-between rounded-xl px-3 py-2.5 text-left ring-1 transition-colors',
                          planId === p.id
                            ? 'ring-system-blue bg-system-blue/[0.06] ring-2'
                            : 'ring-foreground/[0.08]',
                        )}
                      >
                        <span>
                          <span className="font-medium">{p.name}</span>
                          <span className="text-label-secondary block text-[12px]">
                            {p.sessions}× {p.serviceName}
                            {p.recurring
                              ? ' por mês · renova todo mês'
                              : p.validityDays
                                ? ` · validade ${p.validityDays} dias`
                                : ''}
                          </span>
                        </span>
                        <span className="font-semibold tabular-nums">
                          {formatCurrencyBRL(p.price)}
                          {p.recurring ? '/mês' : ''}
                        </span>
                      </button>
                    ))}
                </div>
              )}
            </div>
          )}

          {tab === 'vale' && (
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1.5">
                <span className="font-medium">Valor (R$)</span>
                <Input
                  inputMode="decimal"
                  placeholder="0,00"
                  value={giftAmount}
                  onChange={(e) => setGiftAmount(e.target.value)}
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="font-medium">Para quem</span>
                <Input
                  placeholder="Opcional"
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value)}
                  maxLength={120}
                />
              </label>
              <label className="col-span-2 flex flex-col gap-1.5">
                <span className="font-medium">Quem comprou</span>
                <Input
                  placeholder="Opcional"
                  value={buyer}
                  onChange={(e) => setBuyer(e.target.value)}
                  maxLength={120}
                />
              </label>
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <span className="font-medium">Pagamento</span>
            <div className="flex flex-wrap gap-1.5">
              {METHODS.map((m) => (
                <button
                  key={m.value}
                  type="button"
                  aria-pressed={pay === m.value}
                  onClick={() => setPay(m.value)}
                  className={cn(
                    'rounded-full px-3 py-1.5 text-[12px] font-medium transition-colors',
                    pay === m.value
                      ? 'bg-foreground text-background'
                      : 'bg-foreground/[0.06] hover:bg-foreground/[0.1]',
                  )}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={close}>
            Voltar
          </Button>
          <Button
            disabled={
              sell.isPending ||
              total <= 0 ||
              (tab === 'produtos' && cartItems.length === 0) ||
              (tab === 'pacote' && !planId)
            }
            onClick={() => sell.mutate()}
          >
            {sell.isPending
              ? 'Registrando...'
              : `${pay === 'TAB' ? 'Lançar no fiado' : 'Receber'} ${formatCurrencyBRL(total)}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
