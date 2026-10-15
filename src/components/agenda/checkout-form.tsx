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
  // Pagamento dividido: as outras formas com valor; a principal fica com o restante.
  const [split, setSplit] = React.useState<{ method: Method; amount: string }[]>([]);

  const typedDiscount = parseMoney(discount);
  // Desconto acima do serviço vira de graça, não crédito: limita e avisa (o servidor faz o mesmo).
  const discountValue = Math.min(typedDiscount, price);
  const discountCapped = typedDiscount > price;
  const tipValue = parseMoney(tip);
  const serviceTotal = Math.max(0, price - discountValue);
  const preview = serviceTotal + tipValue;
  const splitValues = split.map((part) => ({
    paymentMethod: part.method,
    amount: parseMoney(part.amount),
  }));
  const splitTotal = splitValues.reduce((sum, part) => sum + part.amount, 0);
  const remainder = Math.round((serviceTotal - splitTotal) * 100) / 100;
  const methodLabel = (value: Method) => METHODS.find((m) => m.value === value)!.label;

  const mutation = useMutation({
    mutationFn: () =>
      checkoutAppointmentAction({
        id: appointmentId,
        paymentMethod: method,
        discount: discountValue || undefined,
        couponCode: coupon.trim() || undefined,
        tip: tipValue || undefined,
        split: splitValues.length ? splitValues.filter((part) => part.amount > 0) : undefined,
      }).then(unwrapResult),
    onSuccess: ({ total }) => {
      toast.success(`Concluído e cobrado: ${formatCurrencyBRL(total + tipValue)}.`);
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
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

      {split.map((part, index) => (
        <div key={index} className="flex items-center gap-2">
          <span className="text-label-secondary w-6 text-[12px]">+</span>
          <select
            aria-label="Outra forma de pagamento"
            value={part.method}
            onChange={(e) =>
              setSplit((rows) =>
                rows.map((r, i) => (i === index ? { ...r, method: e.target.value as Method } : r)),
              )
            }
            className="bg-background ring-foreground/[0.08] h-8 rounded-lg px-2 text-[12px] ring-1"
          >
            {METHODS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
          <Input
            inputMode="decimal"
            placeholder="Valor"
            value={part.amount}
            onChange={(e) =>
              setSplit((rows) =>
                rows.map((r, i) => (i === index ? { ...r, amount: e.target.value } : r)),
              )
            }
            className="h-8 w-24"
            aria-label="Valor desta forma de pagamento"
          />
          <button
            type="button"
            onClick={() => setSplit((rows) => rows.filter((_, i) => i !== index))}
            className="text-label-secondary hover:text-foreground text-[12px]"
          >
            Remover
          </button>
        </div>
      ))}
      <div className="flex items-center justify-between text-[12px]">
        {split.length < 2 ? (
          <button
            type="button"
            onClick={() =>
              setSplit((rows) => [
                ...rows,
                { method: method === 'CREDIT_CARD' ? 'PIX' : 'CREDIT_CARD', amount: '' },
              ])
            }
            className="text-system-blue font-medium hover:underline"
          >
            Dividir pagamento
          </button>
        ) : (
          <span />
        )}
        {split.length > 0 && (
          <span className={cn('text-label-secondary', remainder < 0 && 'text-destructive')}>
            {remainder < 0
              ? 'As partes passam do total do serviço'
              : // A gorjeta entra inteira na forma principal: mostra a conta para fechar com o total.
                `${methodLabel(method)}: ${formatCurrencyBRL(remainder)}${
                  tipValue > 0
                    ? ` + ${formatCurrencyBRL(tipValue)} de gorjeta = ${formatCurrencyBRL(remainder + tipValue)}`
                    : ''
                }${coupon.trim() ? ' (− cupom)' : ''}`}
          </span>
        )}
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

      {discountCapped && (
        <p className="text-[12px] text-[#8a4b00] dark:text-[#ffb340]">
          O desconto foi limitado a {formatCurrencyBRL(price)}, o valor do serviço.
          {tipValue > 0 && ` Fica só a gorjeta: ${formatCurrencyBRL(tipValue)}.`}
        </p>
      )}
      {split.length > 0 && tipValue > 0 && (
        <p className="text-label-secondary text-[12px]">
          A gorjeta é recebida em {methodLabel(method)}, a forma principal.
        </p>
      )}

      <div className="flex items-center justify-between gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Voltar
        </Button>
        <Button type="submit" size="sm" disabled={mutation.isPending || remainder < 0}>
          {mutation.isPending
            ? 'Concluindo...'
            : `Concluir e cobrar ${formatCurrencyBRL(preview)}${coupon.trim() ? ' (− cupom)' : ''}`}
        </Button>
      </div>
    </form>
  );
}
