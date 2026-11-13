import { notFound } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';

import { PLANS, getPlan, planPrice, usdToBrlRate } from '@/lib/billing/plans';
import {
  SITUATION_LABEL,
  getPlatformCompanies,
  getPlatformCosts,
  getPlatformRevenue,
  getPlatformUsers,
  isPlatformAdmin,
  summarizeCompanies,
} from '@/server/platform/overview';
import { PlatformView, type PlatformData } from '@/components/plataforma/platform-view';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Plataforma', robots: { index: false, follow: false } };

const iso = (d: Date | null) => (d ? d.toISOString() : null);

/** Painel do dono do Atendafy. Só para quem está em PLATFORM_ADMIN_USER_IDS; para os demais, 404. */
export default async function PlataformaPage() {
  const { userId } = await auth();
  if (!isPlatformAdmin(userId)) notFound();

  const now = new Date();
  const [companies, revenue, users] = await Promise.all([
    getPlatformCompanies(now),
    getPlatformRevenue(now),
    getPlatformUsers(),
  ]);
  const summary = summarizeCompanies(companies, now);
  const costs = await getPlatformCosts(companies, now);
  const zero = {
    revenue: 0,
    aiCredits: 0,
    aiQuestions: 0,
    aiCost: 0,
    waMessages: 0,
    waCost: 0,
    fee: 0,
    profit: 0,
  };
  const costTotals = [...costs.values()].reduce(
    (t, c) => ({
      revenue: t.revenue + c.revenue,
      aiCost: t.aiCost + c.aiCost,
      waCost: t.waCost + c.waCost,
      fee: t.fee + c.fee,
      profit: t.profit + c.profit,
      aiQuestions: t.aiQuestions + c.aiQuestions,
      waMessages: t.waMessages + c.waMessages,
    }),
    { revenue: 0, aiCost: 0, waCost: 0, fee: 0, profit: 0, aiQuestions: 0, waMessages: 0 },
  );

  const data: PlatformData = {
    generatedAt: now.toISOString(),
    summary: {
      total: summary.total,
      counts: summary.counts,
      mrr: summary.mrr,
      newLast7: summary.newLast7,
      newLast30: summary.newLast30,
    },
    endingSoon: summary.endingSoon.map((c) => ({
      id: c.id,
      name: c.name,
      trialEndsAt: iso(c.trialEndsAt),
      daysLeft: c.daysLeft,
    })),
    revenue: revenue && {
      thisMonth: revenue.thisMonth,
      lastMonth: revenue.lastMonth,
      allTime: revenue.allTime,
      pending: revenue.pending,
      overdue: revenue.overdue,
      balance: revenue.balance,
    },
    companies: companies.map((c) => {
      const courtesyActive = c.situation === 'courtesy' && c.courtesyUntil;
      return {
        id: c.id,
        name: c.name,
        createdAt: c.createdAt.toISOString(),
        situation: c.situation,
        planName: getPlan(courtesyActive ? c.courtesyPlan : c.plan)?.name ?? null,
        until: iso(
          c.situation === 'courtesy'
            ? c.courtesyUntil
            : c.situation === 'paying' || c.situation === 'past_due' || c.situation === 'canceled'
              ? c.currentPeriodEnd
              : c.situation === 'trial_pending'
                ? null
                : c.trialEndsAt,
        ),
        clients: c.clients,
        appointments30d: c.appointments30d,
        courtesy:
          courtesyActive && c.courtesyPlan
            ? {
                until: c.courtesyUntil!.toISOString(),
                planId: c.courtesyPlan,
                planName: getPlan(c.courtesyPlan)?.name ?? c.courtesyPlan,
                note: c.courtesyNote,
              }
            : null,
        billing: (c.asaasCustomerId && revenue?.byCustomer.get(c.asaasCustomerId)) || null,
        costs: costs.get(c.id) ?? zero,
      };
    }),
    users: users && {
      total: users.total,
      latest: users.latest.map((u) => ({
        ...u,
        createdAt: u.createdAt.toISOString(),
        lastSignInAt: iso(u.lastSignInAt),
      })),
    },
    costTotals,
    usdRate: usdToBrlRate(),
    plans: PLANS.filter((p) => p.offered).map((p) => ({
      id: p.id,
      name: p.name,
      price: planPrice(p),
    })),
    situationLabels: SITUATION_LABEL,
  };

  return <PlatformView data={data} />;
}
