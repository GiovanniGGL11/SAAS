import { clerkClient } from '@clerk/nextjs/server';

import { prisma } from '@/lib/db';
import { getPlan } from '@/lib/billing/plans';
import type { Company } from '@/generated/prisma/client';
import { PAID_STATUSES, asaasRequest } from '@/server/billing/asaas';
import { getSubscriptionState } from '@/server/billing/subscription';

/*
  Painel da plataforma (/plataforma): visão do dono do Atendafy sobre todas as empresas, testes,
  assinaturas e o faturamento na Asaas. Só abre para os usuários do Clerk listados em
  PLATFORM_ADMIN_USER_IDS (separados por vírgula); para qualquer outro, a página não existe.
*/

export function isPlatformAdmin(userId: string | null | undefined): boolean {
  if (!userId) return false;
  return (process.env.PLATFORM_ADMIN_USER_IDS ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean)
    .includes(userId);
}

export type CompanySituation =
  'paying' | 'courtesy' | 'past_due' | 'canceled' | 'trial' | 'trial_pending' | 'trial_ended';

export const SITUATION_LABEL: Record<CompanySituation, string> = {
  paying: 'Pagando',
  courtesy: 'Cortesia',
  past_due: 'Pagamento atrasado',
  canceled: 'Cancelada',
  trial: 'Em teste',
  trial_pending: 'Teste a liberar',
  trial_ended: 'Teste acabou',
};

type CompanyRow = Pick<
  Company,
  | 'id'
  | 'name'
  | 'createdAt'
  | 'plan'
  | 'subscriptionStatus'
  | 'trialEndsAt'
  | 'trialPending'
  | 'currentPeriodEnd'
> &
  Partial<Pick<Company, 'courtesyUntil'>>;

export function situationOf(company: CompanyRow, now: Date): CompanySituation {
  if (company.subscriptionStatus === 'ACTIVE') return 'paying';
  if (company.courtesyUntil && company.courtesyUntil.getTime() > now.getTime()) return 'courtesy';
  if (company.subscriptionStatus === 'PAST_DUE') return 'past_due';
  if (company.subscriptionStatus === 'CANCELED') return 'canceled';
  if (company.trialPending) return 'trial_pending';
  return getSubscriptionState(company, now).trialDaysLeft > 0 ? 'trial' : 'trial_ended';
}

/** Contagens por situação, receita recorrente esperada e testes que acabam em 7 dias. */
export function summarizeCompanies(companies: CompanyRow[], now: Date) {
  const day = 86_400_000;
  const counts = Object.fromEntries(Object.keys(SITUATION_LABEL).map((k) => [k, 0])) as Record<
    CompanySituation,
    number
  >;
  let mrr = 0;
  const endingSoon: (CompanyRow & { daysLeft: number })[] = [];
  for (const company of companies) {
    const situation = situationOf(company, now);
    counts[situation] += 1;
    // Receita recorrente: quem paga ou está só atrasado (ainda é assinante). Cortesia não entra.
    if (situation === 'paying' || situation === 'past_due') {
      mrr += (getPlan(company.plan)?.priceCents ?? 0) / 100;
    }
    if (situation === 'trial') {
      const daysLeft = getSubscriptionState(company, now).trialDaysLeft;
      if (daysLeft <= 7) endingSoon.push({ ...company, daysLeft });
    }
  }
  endingSoon.sort((a, b) => a.daysLeft - b.daysLeft);
  return {
    total: companies.length,
    counts,
    mrr: Math.round(mrr * 100) / 100,
    newLast7: companies.filter((c) => now.getTime() - c.createdAt.getTime() < 7 * day).length,
    newLast30: companies.filter((c) => now.getTime() - c.createdAt.getTime() < 30 * day).length,
    endingSoon,
  };
}

export type AsaasPayment = {
  customer?: string;
  value: number;
  netValue?: number;
  status: string;
  dueDate: string;
  paymentDate?: string | null;
  clientPaymentDate?: string | null;
};

export type CustomerBilling = {
  paid: number;
  paidNet: number;
  paidCount: number;
  lastPaidAt: string | null;
  open: number;
  overdue: number;
  nextDueDate: string | null;
};

/** Quanto cada cliente da Asaas (= empresa) já pagou, o que está em aberto e o próximo vencimento. */
export function billingByCustomer(payments: AsaasPayment[]): Map<string, CustomerBilling> {
  const result = new Map<string, CustomerBilling>();
  for (const p of payments) {
    if (!p.customer) continue;
    const b = result.get(p.customer) ?? {
      paid: 0,
      paidNet: 0,
      paidCount: 0,
      lastPaidAt: null,
      open: 0,
      overdue: 0,
      nextDueDate: null,
    };
    if (PAID_STATUSES.has(p.status)) {
      b.paid += p.value;
      b.paidNet += p.netValue ?? p.value;
      b.paidCount += 1;
      const paidAt = p.paymentDate ?? p.clientPaymentDate ?? p.dueDate;
      if (!b.lastPaidAt || paidAt > b.lastPaidAt) b.lastPaidAt = paidAt;
    } else if (p.status === 'PENDING') {
      b.open += p.value;
      if (!b.nextDueDate || p.dueDate < b.nextDueDate) b.nextDueDate = p.dueDate;
    } else if (p.status === 'OVERDUE') {
      b.overdue += p.value;
    }
    result.set(p.customer, b);
  }
  return result;
}

/** Cobranças da conta da plataforma num filtro, somando todas as páginas (até 1.000). */
async function listPayments(apiKey: string, query: string) {
  let offset = 0;
  const all: AsaasPayment[] = [];
  for (let page = 0; page < 10; page++) {
    const res = await asaasRequest<{ data: AsaasPayment[]; hasMore: boolean }>(
      apiKey,
      `/payments?${query}${query ? '&' : ''}limit=100&offset=${offset}`,
    );
    all.push(...res.data);
    if (!res.hasMore) break;
    offset += 100;
  }
  return all;
}

const ymd = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Faturamento na Asaas (conta da plataforma): totais do mês, em aberto, saldo e quanto cada
 * cliente pagou. `null` quando a chave não está configurada ou a Asaas falha.
 */
export async function getPlatformRevenue(now: Date) {
  const apiKey = process.env.ASAAS_API_KEY?.trim();
  if (!apiKey) return null;
  try {
    const monthStart = ymd(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)));
    const prevStart = ymd(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)));
    const today = ymd(now);
    const [payments, balance] = await Promise.all([
      listPayments(apiKey, ''),
      asaasRequest<{ balance: number }>(apiKey, '/finance/balance'),
    ]);
    const paidBetween = (from: string, to: string) => {
      const rows = payments.filter((p) => {
        const at = p.paymentDate ?? p.clientPaymentDate;
        return PAID_STATUSES.has(p.status) && at && at >= from && at <= to;
      });
      return {
        count: rows.length,
        gross: rows.reduce((s, p) => s + p.value, 0),
        net: rows.reduce((s, p) => s + (p.netValue ?? p.value), 0),
      };
    };
    const byStatus = (status: string) => {
      const rows = payments.filter((p) => p.status === status);
      return { count: rows.length, total: rows.reduce((s, p) => s + p.value, 0) };
    };
    const prevEnd = ymd(new Date(Date.parse(`${monthStart}T00:00:00Z`) - 86_400_000));
    return {
      thisMonth: paidBetween(monthStart, today),
      lastMonth: paidBetween(prevStart, prevEnd),
      allTime: paidBetween('2000-01-01', today),
      pending: byStatus('PENDING'),
      overdue: byStatus('OVERDUE'),
      balance: balance.balance,
      byCustomer: billingByCustomer(payments),
    };
  } catch {
    return null;
  }
}

/** Contas de usuário no Clerk: total e os últimos cadastros. `null` se o Clerk falhar. */
export async function getPlatformUsers() {
  try {
    const client = await clerkClient();
    const [total, latest] = await Promise.all([
      client.users.getCount(),
      client.users.getUserList({ orderBy: '-created_at', limit: 30 }),
    ]);
    return {
      total,
      latest: latest.data.map((u) => ({
        id: u.id,
        name: [u.firstName, u.lastName].filter(Boolean).join(' ') || null,
        email: u.primaryEmailAddress?.emailAddress ?? u.emailAddresses[0]?.emailAddress ?? null,
        createdAt: new Date(u.createdAt),
        lastSignInAt: u.lastSignInAt ? new Date(u.lastSignInAt) : null,
      })),
    };
  } catch {
    return null;
  }
}

/** Empresas reais (sem demonstração, excluídas nem empresas criadas pelos testes automáticos). */
export async function getPlatformCompanies(now: Date) {
  const companies = await prisma.company.findMany({
    where: { deletedAt: null, isDemo: false, NOT: { clerkOrgId: { startsWith: 'test_org_' } } },
    select: {
      id: true,
      name: true,
      createdAt: true,
      plan: true,
      subscriptionStatus: true,
      trialEndsAt: true,
      trialPending: true,
      currentPeriodEnd: true,
      courtesyUntil: true,
      courtesyPlan: true,
      courtesyNote: true,
      asaasCustomerId: true,
    },
    orderBy: { createdAt: 'desc' },
  });
  const ids = companies.map((c) => c.id);
  const since = new Date(now.getTime() - 30 * 86_400_000);
  const [clients, appointments] = await Promise.all([
    prisma.client.groupBy({ by: ['companyId'], where: { companyId: { in: ids } }, _count: true }),
    prisma.appointment.groupBy({
      by: ['companyId'],
      where: { companyId: { in: ids }, startAt: { gte: since } },
      _count: true,
    }),
  ]);
  const clientCount = new Map(clients.map((r) => [r.companyId, r._count]));
  const apptCount = new Map(appointments.map((r) => [r.companyId, r._count]));
  return companies.map((c) => ({
    ...c,
    situation: situationOf(c, now),
    clients: clientCount.get(c.id) ?? 0,
    appointments30d: apptCount.get(c.id) ?? 0,
  }));
}
