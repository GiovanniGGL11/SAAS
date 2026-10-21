'use client';

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2Icon, CopyIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { formatCurrencyBRL } from '@/lib/serialize';
import { unwrapResult } from '@/lib/action-result';
import { getDepositStatusAction } from '@/server/actions/public-booking-actions';

/**
 * PIX do sinal: QR code, copia e cola e o prazo. A tela confere sozinha a cada 5 segundos e mostra
 * "Sinal recebido" assim que o pagamento cai.
 */
export function DepositPayment({
  token,
  deposit,
  full = false,
  timezone,
}: {
  token: string;
  /** O PIX cobre o valor todo (pagamento antecipado), não só um sinal. */
  full?: boolean;
  deposit: { amount: number; qrImage: string; copyPaste: string; expiresAt: string };
  timezone: string;
}) {
  const [copied, setCopied] = React.useState(false);
  const { data } = useQuery({
    queryKey: ['deposit-status', token],
    queryFn: () => getDepositStatusAction({ token }).then(unwrapResult),
    refetchInterval: (query) =>
      query.state.data?.status === 'PENDING' || !query.state.data ? 5000 : false,
  });
  const status = data?.status ?? 'PENDING';
  const expires = new Intl.DateTimeFormat('pt-BR', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(deposit.expiresAt));

  if (status === 'PAID') {
    return (
      <div className="bg-system-green/10 flex items-center gap-3 rounded-xl p-4 text-[15px]">
        <CheckCircle2Icon className="text-system-green size-6 shrink-0" />
        <span>
          <strong>
            {full ? 'Pagamento' : 'Sinal'} de {formatCurrencyBRL(deposit.amount)} recebido.
          </strong>{' '}
          Seu horário está confirmado.
        </span>
      </div>
    );
  }
  if (status === 'EXPIRED') {
    return (
      <div className="bg-system-red/10 rounded-xl p-4 text-[15px]">
        O prazo para pagar {full ? 'o valor' : 'o sinal'} terminou e o horário foi liberado. Faça
        uma nova reserva.
      </div>
    );
  }
  return (
    <div className="border-foreground/[0.08] flex flex-col items-center gap-3 rounded-xl border p-4 text-center">
      <p className="text-[15px]">
        <strong>
          Pague {full ? 'o valor de' : 'o sinal de'} {formatCurrencyBRL(deposit.amount)} por PIX até{' '}
          {expires}
        </strong>{' '}
        para confirmar. Depois disso o horário é liberado.
      </p>
      {/* eslint-disable-next-line @next/next/no-img-element -- QR em base64 vindo da Asaas */}
      <img
        src={`data:image/png;base64,${deposit.qrImage}`}
        alt="QR code do PIX"
        width={200}
        height={200}
        className="rounded-lg"
      />
      <Button
        type="button"
        variant="outline"
        onClick={() => {
          void navigator.clipboard.writeText(deposit.copyPaste);
          setCopied(true);
        }}
      >
        <CopyIcon className="size-4" />
        {copied ? 'Código copiado' : 'Copiar código PIX (copia e cola)'}
      </Button>
      <p className="text-label-secondary text-[12px]">
        Esta tela confirma sozinha quando o pagamento cair.
      </p>
    </div>
  );
}
