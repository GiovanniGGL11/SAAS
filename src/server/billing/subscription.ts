import { prisma } from '@/lib/db';
import type { Company, SubscriptionStatus } from '@/generated/prisma/client';
import {
  PAST_DUE_GRACE_DAYS,
  effectiveTrialEnd,
  getPlan,
  planPrice,
  type PlanId,
} from '@/lib/billing/plans';
import { UserError } from '@/server/errors';
import {
  AsaasError,
  cancelSubscription,
  createCustomer,
  createSubscription,
  listSubscriptionPayments,
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
  configured: boolean;
};

export function getSubscriptionState(
  company: Pick<Company, 'subscriptionStatus' | 'plan' | 'trialEndsAt' | 'currentPeriodEnd'>,
  now = new Date(),
): SubscriptionState {
  const trialEnd = effectiveTrialEnd(company);
  const trialDaysLeft = Math.max(0, Math.ceil((trialEnd.getTime() - now.getTime()) / 86_400_000));
  const periodOk = company.currentPeriodEnd
    ? company.currentPeriodEnd.getTime() + PAST_DUE_GRACE_DAYS * 86_400_000 > now.getTime()
    : false;
  const hasAccess =
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
    configured: billingConfigured(),
  };
}

const ymd = (d: Date) => d.toISOString().slice(0, 10);

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
    const subscription = await createSubscription(key, {
      customer: customerId,
      value: planPrice(plan),
      nextDueDate: ymd(firstDue),
      description: `Atendafy — plano ${plan.name}`,
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

export async function cancelCompanySubscription(company: Company) {
  if (!company.asaasSubscriptionId) throw new UserError('Não há assinatura para cancelar.');
  await cancelSubscription(apiKey(), company.asaasSubscriptionId);
  await prisma.company.update({
    where: { id: company.id },
    data: { subscriptionStatus: 'CANCELED' },
  });
}

type AsaasWebhook = {
  event?: string;
  payment?: { id?: string; subscription?: string | null; dueDate?: string; status?: string };
  subscription?: { id?: string };
};

function addMonth(ymdDate: string): Date {
  const d = new Date(`${ymdDate}T12:00:00-03:00`);
  d.setMonth(d.getMonth() + 1);
  return d;
}

/** Eventos da Asaas: pagamento confirmado ativa e estende o período; atraso e cancelamento marcam a conta. */
export async function handleBillingWebhook(payload: AsaasWebhook): Promise<'updated' | 'ignored'> {
  const subscriptionId = payload.payment?.subscription ?? payload.subscription?.id;
  if (!subscriptionId) return 'ignored';
  const company = await prisma.company.findUnique({
    where: { asaasSubscriptionId: subscriptionId },
  });
  if (!company) return 'ignored';
  switch (payload.event) {
    case 'PAYMENT_CONFIRMED':
    case 'PAYMENT_RECEIVED': {
      const periodEnd = payload.payment?.dueDate
        ? addMonth(payload.payment.dueDate)
        : addMonth(new Date().toISOString().slice(0, 10));
      await prisma.company.update({
        where: { id: company.id },
        data: {
          subscriptionStatus: 'ACTIVE',
          currentPeriodEnd:
            company.currentPeriodEnd && company.currentPeriodEnd > periodEnd
              ? company.currentPeriodEnd
              : periodEnd,
        },
      });
      return 'updated';
    }
    case 'PAYMENT_OVERDUE':
      await prisma.company.update({
        where: { id: company.id },
        data: { subscriptionStatus: 'PAST_DUE' },
      });
      return 'updated';
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
