'use client';

import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { unwrapResult } from '@/lib/action-result';
import { formatCurrencyBRL } from '@/lib/serialize';
import { checkoutAppointmentAction } from '@/server/actions/agenda-actions';
import { cn } from '@/lib/utils';

const METHODS = [
  { value: 'PIX', label: 'PIX' },
  { value: 'CASH', label: 'Dinheiro' },
  { value: 'CREDIT_CARD', label: 'Crédito' },
  { value: 'DEBIT_CARD', label: 'Débito' },
] as const;

type Method = (typeof METHODS)[number]['value'];

function parseMoney(value: string): number {
  const n = Number(value.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0;
}

/**
 * A comanda: concluir já registrando como foi pago. Desconto, cupom e gorjeta são opcionais; o
 * servidor confere o cupom e calcula o valor final — o total aqui é só a prévia sem o cupom.
 */
export function CheckoutForm({
  appointmentId,
  price,
  onDone,
  onCancel,
}: {
  appointmentId: string;
  price: number;
  onDone: () => void;
  onCancel: () => void;
}) {
  const queryClient = useQueryClient();
  const [method, setMethod] = React.useState<Method>('PIX');
  const [discount, setDiscount] = React.useState('');
  const [coupon, setCoupon] = React.useState('');
  const [tip, setTip] = React.useState('');

  const discountValue = parseMoney(discount);
  const tipValue = parseMoney(tip);
  const preview = Math.max(0, price - discountValue) + tipValue;

  const mutation = useMutation({
    mutationFn: () =>
      checkoutAppointmentAction({
        id: appointmentId,
        paymentMethod: method,
        discount: discountValue || undefined,
        couponCode: coupon.trim() || undefined,
        tip: tipValue || undefined,
      }).then(unwrapResult),
    onSuccess: ({ total }) => {
      toast.success(`Concluído e cobrado: ${formatCurrencyBRL(total + tipValue)}.`);
      // Cobrar mexe no caixa, no estoque (produtos vendidos), nos relatórios e na fidelidade do cliente.
      for (const key of [
        'appointments',
        'transactions',
        'cash-flow',
        'report',
        'products',
        'client-detail',
        'client-loyalty',
        'loyalty-overview',
      ]) {
        queryClient.invalidateQueries({ queryKey: [key] });
      }
      onDone();
    },
    onError: (error: Error) => toast.error(error.message || 'Não foi possível concluir.'),
  });

  return (
    <form
      className="bg-system-green/[0.06] ring-system-green/20 flex flex-col gap-3 rounded-xl p-3 ring-1"
      onSubmit={(event) => {
        event.preventDefault();
        mutation.mutate();
      }}
    >
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-semibold">Concluir e cobrar</span>
        <span className="text-label-secondary text-[12px]">Serviço {formatCurrencyBRL(price)}</span>
      </div>

      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Forma de pagamento">
        {METHODS.map((m) => (
          <button
            key={m.value}
            type="button"
            role="radio"
            aria-checked={method === m.value}
            onClick={() => setMethod(m.value)}
            className={cn(
              'rounded-full px-3 py-1.5 text-[12px] font-medium transition-colors',
              method === m.value
                ? 'bg-foreground text-background'
                : 'bg-foreground/[0.06] hover:bg-foreground/[0.1]',
            )}
          >
            {m.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-2">
        <label className="flex flex-col gap-1 text-[11px]">
          <span className="text-label-secondary">Desconto (R$)</span>
          <Input
            inputMode="decimal"
            placeholder="0,00"
            value={discount}
            onChange={(e) => setDiscount(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-[11px]">
          <span className="text-label-secondary">Cupom</span>
          <Input
            placeholder="Código"
            value={coupon}
            onChange={(e) => setCoupon(e.target.value.toUpperCase())}
            maxLength={40}
          />
        </label>
        <label className="flex flex-col gap-1 text-[11px]">
          <span className="text-label-secondary">Gorjeta (R$)</span>
          <Input
            inputMode="decimal"
            placeholder="0,00"
            value={tip}
            onChange={(e) => setTip(e.target.value)}
          />
        </label>
      </div>

      <div className="flex items-center justify-between gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Voltar
        </Button>
        <Button type="submit" size="sm" disabled={mutation.isPending}>
          {mutation.isPending
            ? 'Concluindo...'
            : `Concluir e cobrar ${formatCurrencyBRL(preview)}${coupon.trim() ? ' (− cupom)' : ''}`}
        </Button>
      </div>
    </form>
  );
}
