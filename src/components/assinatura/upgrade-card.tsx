import Link from 'next/link';
import { LockIcon, SparklesIcon } from 'lucide-react';

import { formatCurrencyBRL } from '@/lib/serialize';
import type { UpgradeOffer } from '@/lib/billing/upgrade';

/**
 * No lugar de um recurso que o plano não inclui: o que ele faz, em qual plano está e quanto
 * custa a mais por dia — com o caminho para assinar. Melhor que um erro ou uma tela vazia.
 */
export function UpgradeCard({ offer }: { offer: UpgradeOffer }) {
  return (
    <section className="bg-tile relative isolate flex flex-col items-center gap-4 overflow-hidden rounded-[26px] px-6 py-10 text-center md:py-14">
      <div
        aria-hidden
        className="bg-system-blue/15 pointer-events-none absolute -top-24 left-1/2 -z-10 size-72 -translate-x-1/2 rounded-full blur-[80px]"
      />
      <span className="bg-system-blue/12 text-system-blue flex size-12 items-center justify-center rounded-2xl">
        <LockIcon className="size-5" />
      </span>
      <span className="bg-system-blue/10 text-system-blue inline-flex items-center gap-1 rounded-full px-3 py-1 text-[12px] font-semibold">
        <SparklesIcon className="size-3.5" /> Plano {offer.planName}
      </span>
      <div className="flex max-w-md flex-col gap-2">
        <h2 className="text-[24px] leading-tight font-bold tracking-[-0.02em] md:text-[28px]">
          {offer.title}
        </h2>
        {offer.text && <p className="text-label-secondary text-[15px]">{offer.text}</p>}
      </div>
      <p className="text-[14px]">
        <strong>{formatCurrencyBRL(offer.planPrice)}/mês</strong>
        <span className="text-label-secondary">
          {' '}
          · {offer.perDayIsExtra ? 'só ' : ''}
          {formatCurrencyBRL(offer.perDay)} {offer.perDayIsExtra ? 'a mais por dia' : 'por dia'}
        </span>
      </p>
      <Link
        href="/assinatura"
        className="bg-system-blue rounded-full px-6 py-2.5 text-[15px] font-semibold text-white shadow-[0_10px_30px_-12px_var(--system-blue)] transition-transform hover:scale-[1.03] active:scale-[0.98]"
      >
        Ver planos e assinar
      </Link>
      <span className="text-label-secondary text-[12px]">
        Seus dados ficam guardados. Ao assinar, o recurso libera na hora.
      </span>
    </section>
  );
}
