'use client';

import { CalendarCheckIcon, CoinsIcon, HandCoinsIcon, WalletIcon } from 'lucide-react';

import { formatCurrencyBRL } from '@/lib/serialize';
import { StatTile } from '@/components/dashboard/stat-tile';

/**
 * Os quatro números de "Meus ganhos". Fica num componente de navegador porque os quadros recebem
 * o ícone (um componente), e o servidor não pode passar componentes para o navegador.
 */
export function EarningsTiles({
  appointments,
  upcoming,
  production,
  commission,
  rule,
  openAdvances,
  toReceive,
  payout,
}: {
  appointments: number;
  upcoming: number;
  production: number;
  commission: number | null;
  rule: string | null;
  openAdvances: number;
  toReceive: number | null;
  payout: { netAmount: number; paidOn: string } | null;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4">
      <StatTile
        index={0}
        label="Atendimentos"
        value={String(appointments)}
        hint={`${upcoming} marcado(s) nos próximos 7 dias`}
        icon={CalendarCheckIcon}
      />
      <StatTile
        index={1}
        label="Produção"
        value={formatCurrencyBRL(production)}
        hint="O que foi cobrado pelos seus serviços"
        icon={CoinsIcon}
        iconColor="var(--system-orange)"
      />
      <StatTile
        index={2}
        label="Comissão"
        value={commission === null ? '—' : formatCurrencyBRL(commission)}
        hint={rule ?? 'Sem regra de comissão cadastrada. Fale com o responsável.'}
        icon={HandCoinsIcon}
        iconColor="var(--system-green)"
        valueClassName="text-system-green"
      />
      <StatTile
        index={3}
        label={payout ? 'Acerto feito' : 'A receber'}
        value={
          payout
            ? formatCurrencyBRL(payout.netAmount)
            : toReceive === null
              ? '—'
              : formatCurrencyBRL(toReceive)
        }
        hint={
          payout
            ? `Pago em ${payout.paidOn}`
            : openAdvances > 0
              ? `Comissão menos ${formatCurrencyBRL(openAdvances)} de vales`
              : 'Comissão do período, ainda sem acerto'
        }
        icon={WalletIcon}
        iconColor="var(--system-indigo)"
      />
    </div>
  );
}
