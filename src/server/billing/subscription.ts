import { prisma } from '@/lib/db';
import type { Company, SubscriptionStatus } from '@/generated/prisma/client';
import {
  PAST_DUE_GRACE_DAYS,
  effectiveTrialEnd,
  getPlan,
  monthlyPriceCents,
  professionalsLimitLabel,
  type PlanId,
} from '@/lib/billing/plans';
import { UserError } from '@/server/errors';
import {
  AsaasError,
  cancelSubscription,
  createCustomer,
  createSubscription,
  listSubscriptionPayments,
  updateSubscription,
} from '@/server/billing/asaas';

/*
  Assinatura do Atendafy, cobrada pela conta Asaas da plataforma (ASAAS_API_KEY). Sem a chave, a
  tela mostra os planos e o teste, mas não cobra. O bloqueio de quem não pagou só vale com
  BILLING_ENFORCE=true — ligado de propósito, quando a cobrança estiver valendo.
*/

export function billingConfigured(): boolean {
  return Boolean(process.env.ASAAS_API_KEY?.trim());
}

function apiKey(): string {
  const key = process.env.ASAAS_API_KEY?.trim();
  if (!key) throw new UserError('A cobrança ainda não está configurada.');
  return key;
}

export type SubscriptionState = {
  status: SubscriptionStatus;
  plan: string | null;
  trialEnd: Date;
  trialDaysLeft: number;
  currentPeriodEnd: Date | null;
  /** Sem acesso: teste acabou e não há assinatura em dia (só com BILLING_ENFORCE=true). */
  blocked: boolean;
  /** Conta nova que ainda não liberou o 1º mês grátis. */
  trialPending: boolean;
  /** Acesso cortesia (sem pagar) em vigor: até quando. */
  courtesyUntil: Date | null;
  configured: boolean;
};

export function getSubscriptionState(
  company: Pick<
    Company,
    'subscriptionStatus' | 'plan' | 'trialEndsAt' | 'currentPeriodEnd' | 'trialPending'
  > &
    Partial<Pick<Company, 'courtesyUntil'>>,
  now = new Date(),
): SubscriptionState {
  const courtesyUntil =
    company.courtesyUntil && company.courtesyUntil.getTime() > now.getTime()
      ? company.courtesyUntil
      : null;
  const trialEnd = effectiveTrialEnd(company);
  const trialDaysLeft = Math.max(0, Math.ceil((trialEnd.getTime() - now.getTime()) / 86_400_000));
  const periodOk = company.currentPeriodEnd
    ? company.currentPeriodEnd.getTime() + PAST_DUE_GRACE_DAYS * 86_400_000 > now.getTime()
    : false;
  const hasAccess =
    courtesyUntil !== null ||
    trialDaysLeft > 0 ||
    company.subscriptionStatus === 'ACTIVE' ||
    // Atrasou: alguns dias de tolerância; cancelou: vale até o fim do período pago.
    ((company.subscriptionStatus === 'PAST_DUE' || company.subscriptionStatus === 'CANCELED') &&
      periodOk);
  return {
    status: company.subscriptionStatus,
    plan: company.plan,
    trialEnd,
    trialDaysLeft,
    currentPeriodEnd: company.currentPeriodEnd,
    blocked: process.env.BILLING_ENFORCE === 'true' && billingConfigured() && !hasAccess,
    trialPending: company.trialPending,
    courtesyUntil,
    configured: billingConfigured(),
  };
}

const ymd = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Valor mensal na Asaas e a descrição da cobrança: o preço do plano mais os profissionais ativos
 * além dos incluídos (Pro).
 */
async function subscriptionCharge(
  plan: NonNullable<ReturnType<typeof getPlan>>,
  companyId: string,
) {
  const active = plan.extraProfessionalCents
    ? await prisma.professional.count({ where: { companyId, active: true } })
    : 0;
  const cents = monthlyPriceCents(plan, active);
  const extra =
    cents > plan.priceCents && plan.includedProfessionals !== undefined
      ? active - plan.includedProfessionals
      : 0;
  return {
    value: cents / 100,
    description:
      `Atendafy — plano ${plan.name}` +
      (extra > 0
        ? ` + ${extra} ${extra === 1 ? 'profissional extra' : 'profissionais extras'}`
        : ''),
  };
}

/**
 * Assina o plano: cria (uma vez) o cliente na Asaas e a assinatura mensal. Durante o teste, a
 * primeira cobrança vence no fim do teste; depois disso, hoje. Devolve o link de pagamento quando
 * a cobrança já existe.
 */
export async function startSubscription(
  company: Company,
  input: { planId: PlanId; name: string; cpfCnpj: string; email: string; phone?: string | null },
) {
  const plan = getPlan(input.planId);
  if (!plan) throw new UserError('Plano não encontrado.');
  // Preço ainda não publicado (ou plano antigo): a contratação fica fechada.
  if (!plan.offered || !plan.checkoutEnabled) {
    throw new UserError(`O plano ${plan.name} ainda não está disponível para contratação.`);
  }
  if (company.asaasSubscriptionId && company.subscriptionStatus !== 'CANCELED') {
    throw new UserError(
      'Já existe uma assinatura ativa. Para trocar de plano, cancele a atual primeiro.',
    );
  }
  const key = apiKey();
  try {
    const customerId =
      company.asaasCustomerId ??
      (
        await createCustomer(key, {
          name: input.name,
          cpfCnpj: input.cpfCnpj.replace(/\D/g, ''),
          email: input.email,
          mobilePhone: input.phone?.replace(/\D/g, '') || null,
          externalReference: company.id,
        })
      ).id;
    const trialEnd = effectiveTrialEnd(company);
    const firstDue = trialEnd.getTime() > Date.now() ? trialEnd : new Date();
    const charge = await subscriptionCharge(plan, company.id);
    const subscription = await createSubscription(key, {
      customer: customerId,
      value: charge.value,
      nextDueDate: ymd(firstDue),
      description: charge.description,
      externalReference: company.id,
    });
    await prisma.company.update({
      where: { id: company.id },
      data: { asaasCustomerId: customerId, asaasSubscriptionId: subscription.id, plan: plan.id },
    });
    const payments = await listSubscriptionPayments(key, subscription.id);
    const pending = payments.data.find((p) => p.status === 'PENDING' || p.status === 'OVERDUE');
    return { invoiceUrl: pending?.invoiceUrl ?? null, firstDue: ymd(firstDue) };
  } catch (error) {
    if (error instanceof AsaasError) throw new UserError(`A Asaas recusou: ${error.message}`);
    throw error;
  }
}

/** Próxima cobrança em aberto (link de pagamento), para quem está com a assinatura atrasada. */
export async function pendingInvoiceUrl(company: Company): Promise<string | null> {
  if (!company.asaasSubscriptionId || !billingConfigured()) return null;
  const payments = await listSubscriptionPayments(apiKey(), company.asaasSubscriptionId);
  return (
    payments.data.find((p) => p.status === 'PENDING' || p.status === 'OVERDUE')?.invoiceUrl ?? null
  );
}

/**
 * Troca de plano na mesma assinatura: muda o valor das próximas cobranças (e da que está em aberto).
 * Não troca para um plano com menos profissionais do que a empresa tem ativos.
 */
export async function changeSubscriptionPlan(company: Company, planId: PlanId) {
  const plan = getPlan(planId);
  if (!plan) throw new UserError('Plano não encontrado.');
  if (!plan.offered || !plan.checkoutEnabled) {
    throw new UserError(`O plano ${plan.name} ainda não está disponível para contratação.`);
  }
  if (!company.asaasSubscriptionId || company.subscriptionStatus === 'CANCELED') {
    throw new UserError('Não há assinatura ativa para trocar de plano.');
  }
  if (company.plan === plan.id) throw new UserError(`Você já está no plano ${plan.name}.`);
  if (plan.maxProfessionals !== null) {
    const active = await prisma.professional.count({
      where: { companyId: company.id, active: true },
    });
    if (active > plan.maxProfessionals) {
      throw new UserError(
        `O plano ${plan.name} permite ${professionalsLimitLabel(plan.maxProfessionals)} e você tem ${active} ativos. Desative alguns antes de trocar.`,
      );
    }
  }
  try {
    await updateSubscription(
      apiKey(),
      company.asaasSubscriptionId,
      await subscriptionCharge(plan, company.id),
    );
  } catch (error) {
    if (error instanceof AsaasError) throw new UserError(`A Asaas recusou: ${error.message}`);
    throw error;
  }
  await prisma.company.update({ where: { id: company.id }, data: { plan: plan.id } });
}

/**
 * Profissional ativado ou desativado: num plano que cobra por profissional extra (Pro), atualiza o
 * valor da assinatura (inclusive a cobrança em aberto). Sem assinatura, nada a fazer.
 */
export async function syncSubscriptionValue(companyId: string) {
  if (!billingConfigured()) return;
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { plan: true, asaasSubscriptionId: true, subscriptionStatus: true },
  });
  const plan = getPlan(company?.plan);
  if (!company?.asaasSubscriptionId || company.subscriptionStatus === 'CANCELED') return;
  if (!plan?.extraProfessionalCents) return;
  await updateSubscription(
    apiKey(),
    company.asaasSubscriptionId,
    await subscriptionCharge(plan, companyId),
  );
}

export type Invoice = {
  id: string;
  status: string;
  value: number;
  dueDate: string;
  invoiceUrl: string;
};

/** Últimas cobranças da assinatura (mais recentes primeiro). */
export async function listInvoices(company: Company): Promise<Invoice[]> {
  if (!company.asaasSubscriptionId || !billingConfigured()) return [];
  const payments = await listSubscriptionPayments(apiKey(), company.asaasSubscriptionId);
  return payments.data
    .map(({ id, status, value, dueDate, invoiceUrl }) => ({
      id,
      status,
      value,
      dueDate,
      invoiceUrl,
    }))
    .sort((a, b) => b.dueDate.localeCompare(a.dueDate))
    .slice(0, 12);
}

export async function cancelCompanySubscription(company: Company) {
  if (!company.asaasSubscriptionId) throw new UserError('Não há assinatura para cancelar.');
  await cancelSubscription(apiKey(), company.asaasSubscriptionId);
  await prisma.company.update({
    where: { id: company.id },
    data: { subscriptionStatus: 'CANCELED' },
  });
}

type AsaasWebhook = {
  id?: string;
  event?: string;
  payment?: { id?: string; subscription?: string | null; dueDate?: string; status?: string };
  subscription?: { id?: string };
};

function addMonth(ymdDate: string): Date {
  const d = new Date(`${ymdDate}T12:00:00-03:00`);
  d.setMonth(d.getMonth() + 1);
  return d;
}

const dayStart = (ymdDate: string) => new Date(`${ymdDate}T00:00:00-03:00`);

/**
 * Eventos da Asaas: pagamento confirmado ativa e estende o período; atraso, estorno e cancelamento
 * marcam a conta. A Asaas reenvia eventos, então cada id é processado uma vez só, e um atraso de
 * uma cobrança cujo período já está pago é ignorado.
 */
export async function handleBillingWebhook(
  payload: AsaasWebhook,
): Promise<'updated' | 'ignored' | 'duplicate'> {
  if (payload.id) {
    const seen = await prisma.billingWebhookEvent.findUnique({ where: { id: payload.id } });
    if (seen) return 'duplicate';
  }
  const subscriptionId = payload.payment?.subscription ?? payload.subscription?.id ?? null;
  const result = await applyBillingEvent(payload, subscriptionId);
  if (payload.id) {
    await prisma.billingWebhookEvent
      .create({
        data: {
          id: payload.id,
          event: payload.event ?? '',
          subscriptionId,
          paymentId: payload.payment?.id ?? null,
          result,
        },
      })
      .catch(() => undefined); // mesmo evento chegando em paralelo: o primeiro já registrou
  }
  return result;
}

async function applyBillingEvent(
  payload: AsaasWebhook,
  subscriptionId: string | null,
): Promise<'updated' | 'ignored'> {
  if (!subscriptionId) return 'ignored';
  const company = await prisma.company.findUnique({
    where: { asaasSubscriptionId: subscriptionId },
  });
  if (!company) return 'ignored';
  const dueDate = payload.payment?.dueDate;
  switch (payload.event) {
    case 'PAYMENT_CONFIRMED':
    case 'PAYMENT_RECEIVED': {
      const periodEnd = addMonth(dueDate ?? new Date().toISOString().slice(0, 10));
      await prisma.company.update({
        where: { id: company.id },
        data: {
          // Pagou uma cobrança antiga depois de cancelar: estende o período, mas segue cancelada.
          subscriptionStatus: company.subscriptionStatus === 'CANCELED' ? 'CANCELED' : 'ACTIVE',
          currentPeriodEnd:
            company.currentPeriodEnd && company.currentPeriodEnd > periodEnd
              ? company.currentPeriodEnd
              : periodEnd,
        },
      });
      return 'updated';
    }
    case 'PAYMENT_OVERDUE': {
      // O período desta cobrança já está pago (evento atrasado ou reenviado): nada muda.
      if (dueDate && company.currentPeriodEnd && company.currentPeriodEnd >= addMonth(dueDate)) {
        return 'ignored';
      }
      if (company.subscriptionStatus === 'CANCELED') return 'ignored';
      await prisma.company.update({
        where: { id: company.id },
        data: {
          subscriptionStatus: 'PAST_DUE',
          // Primeira cobrança (fim do teste) atrasada: a tolerância conta do vencimento.
          currentPeriodEnd: company.currentPeriodEnd ?? (dueDate ? dayStart(dueDate) : new Date()),
        },
      });
      return 'updated';
    }
    case 'PAYMENT_REFUNDED':
    case 'PAYMENT_CHARGEBACK_REQUESTED': {
      // Dinheiro devolvido: o período pago por esta cobrança deixa de valer.
      const paidUntil = dueDate ? dayStart(dueDate) : new Date();
      await prisma.company.update({
        where: { id: company.id },
        data: {
          subscriptionStatus: company.subscriptionStatus === 'CANCELED' ? 'CANCELED' : 'PAST_DUE',
          currentPeriodEnd:
            company.currentPeriodEnd && company.currentPeriodEnd < paidUntil
              ? company.currentPeriodEnd
              : paidUntil,
        },
      });
      return 'updated';
    }
    case 'SUBSCRIPTION_DELETED':
    case 'SUBSCRIPTION_INACTIVATED':
      await prisma.company.update({
        where: { id: company.id },
        data: { subscriptionStatus: 'CANCELED' },
      });
      return 'updated';
    default:
      return 'ignored';
  }
}
