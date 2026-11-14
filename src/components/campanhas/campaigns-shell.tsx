'use client';

import * as React from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import { PageHeader } from '@/components/layout/page';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { CouponList } from '@/components/campanhas/coupon-list';
import { GiftCardsView } from '@/components/campanhas/gift-cards-view';
import { MessagesView } from '@/components/campanhas/messages-view';
import { ReferralsView } from '@/components/campanhas/referrals-view';
import { ReviewsView } from '@/components/campanhas/reviews-view';
import type { SerializedCoupon } from '@/lib/serialize';
import type { UpgradeOffer } from '@/lib/billing/upgrade';
import { UpgradeCard } from '@/components/assinatura/upgrade-card';

const TABS = [
  { value: 'cupons', label: 'Cupons' },
  { value: 'vales', label: 'Vales-presente' },
  { value: 'mensagens', label: 'Mensagens' },
  { value: 'indicacoes', label: 'Indicações' },
  { value: 'avaliacoes', label: 'Avaliações' },
] as const;
type Tab = (typeof TABS)[number]['value'];

export function CampaignsShell({
  coupons,
  locked = {},
}: {
  coupons: SerializedCoupon[];
  /** Abas que o plano não inclui: mostram o convite para subir de plano. */
  locked?: Partial<Record<Tab, UpgradeOffer | null>>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const raw = useSearchParams().get('aba');
  const tab: Tab = TABS.some((t) => t.value === raw) ? (raw as Tab) : 'cupons';
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Cupons"
        description="Cupons, vales-presente, mensagens para grupos de clientes, indicações e avaliações."
      />
      <SegmentedControl
        value={tab}
        onValueChange={(next) =>
          router.replace(next === 'cupons' ? pathname : `${pathname}?aba=${next}`, {
            scroll: false,
          })
        }
        options={TABS.map((t) => ({ value: t.value, label: t.label }))}
        className="self-start"
      />
      {tab === 'cupons' && <CouponList initialCoupons={coupons} />}
      {tab === 'vales' && <GiftCardsView />}
      {tab === 'mensagens' &&
        (locked.mensagens ? <UpgradeCard offer={locked.mensagens} /> : <MessagesView />)}
      {tab === 'indicacoes' &&
        (locked.indicacoes ? <UpgradeCard offer={locked.indicacoes} /> : <ReferralsView />)}
      {tab === 'avaliacoes' && <ReviewsView />}
    </div>
  );
}
