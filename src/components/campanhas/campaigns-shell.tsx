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

const TABS = [
  { value: 'cupons', label: 'Cupons' },
  { value: 'vales', label: 'Vales-presente' },
  { value: 'mensagens', label: 'Mensagens' },
  { value: 'indicacoes', label: 'Indicações' },
  { value: 'avaliacoes', label: 'Avaliações' },
] as const;
type Tab = (typeof TABS)[number]['value'];

export function CampaignsShell({ coupons }: { coupons: SerializedCoupon[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const raw = useSearchParams().get('aba');
  const tab: Tab = TABS.some((t) => t.value === raw) ? (raw as Tab) : 'cupons';
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Marketing"
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
      {tab === 'mensagens' && <MessagesView />}
      {tab === 'indicacoes' && <ReferralsView />}
      {tab === 'avaliacoes' && <ReviewsView />}
    </div>
  );
}
