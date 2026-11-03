import { prisma } from '@/lib/db';
import { effectiveTrialEnd } from '@/lib/billing/plans';
import type { EmailSender } from '@/server/email';
import { listTeamMembers } from '@/server/team';
import { billingConfigured, pendingInvoiceUrl } from '@/server/billing/subscription';

/*
  Avisos de cobrança por e-mail aos administradores da empresa, enviados pelo cron diário:
  - teste acaba em até 3 dias (sem assinatura criada);
  - teste terminou (nos 3 dias seguintes, sem assinatura em dia);
  - pagamento atrasado (uma vez por período).
  Cada aviso sai uma vez só (BillingNotice.key). Sem a cobrança configurada, nada é enviado.
*/

const DAY = 86_400_000;
const ymd = (d: Date) => d.toISOString().slice(0, 10);
const date = (d: Date) =>
  new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo' }).format(d);

type Notice = {
  kind: 'trial_3d' | 'trial_end' | 'past_due';
  key: string;
  subject: string;
  text: string;
};

export async function sendBillingNotices(
  send: EmailSender,
  baseUrl: string,
  now = new Date(),
  /** Só estas empresas (testes). */
  companyIds?: string[],
) {
  if (!billingConfigured()) return { skipped: 'Cobrança não configurada.' };
  const companies = await prisma.company.findMany({
    where: {
      deletedAt: null,
      isDemo: false,
      subscriptionStatus: { in: ['TRIAL', 'PAST_DUE'] },
      ...(companyIds ? { id: { in: companyIds } } : {}),
    },
  });
  const link = `${baseUrl}/assinatura`;
  let sent = 0;
  let failed = 0;

  for (const company of companies) {
    let notice: Notice | null = null;
    if (company.subscriptionStatus === 'TRIAL' && !company.asaasSubscriptionId) {
      const trialEnd = effectiveTrialEnd(company);
      const left = trialEnd.getTime() - now.getTime();
      if (left > 0 && left <= 3 * DAY) {
        notice = {
          kind: 'trial_3d',
          key: `${company.id}:trial_3d:${ymd(trialEnd)}`,
          subject: `Seu teste do Atendafy termina em ${date(trialEnd)}`,
          text: `Olá!\n\nO teste grátis da ${company.name} no Atendafy termina em ${date(trialEnd)}.\n\nPara continuar usando agenda, clientes e financeiro sem interrupção, escolha um plano:\n${link}\n\nPague por PIX, boleto ou cartão e cancele quando quiser.\n\nEquipe Atendafy`,
        };
      } else if (left <= 0 && left > -3 * DAY) {
        notice = {
          kind: 'trial_end',
          key: `${company.id}:trial_end:${ymd(trialEnd)}`,
          subject: 'Seu teste do Atendafy terminou',
          text: `Olá!\n\nO teste grátis da ${company.name} no Atendafy terminou em ${date(trialEnd)}.\n\nSeus dados continuam guardados. Para voltar a usar, escolha um plano:\n${link}\n\nEquipe Atendafy`,
        };
      }
    } else if (company.subscriptionStatus === 'PAST_DUE') {
      const invoice = await pendingInvoiceUrl(company).catch(() => null);
      notice = {
        kind: 'past_due',
        key: `${company.id}:past_due:${company.currentPeriodEnd ? ymd(company.currentPeriodEnd) : 'sem-periodo'}`,
        subject: 'Pagamento do Atendafy em atraso',
        text: `Olá!\n\nNão identificamos o pagamento da assinatura da ${company.name} no Atendafy.\n\nPague a fatura em aberto para evitar a suspensão do acesso:\n${invoice ?? link}\n\nSe já pagou, desconsidere este aviso.\n\nEquipe Atendafy`,
      };
    }
    if (!notice) continue;

    const already = await prisma.billingNotice.findUnique({ where: { key: notice.key } });
    if (already) continue;
    const admins = (await listTeamMembers(company.clerkOrgId).catch(() => [])).filter(
      (m) => m.role === 'admin' && m.email.includes('@'),
    );
    if (admins.length === 0) continue;
    try {
      for (const admin of admins)
        await send({ to: admin.email, subject: notice.subject, text: notice.text });
      await prisma.billingNotice.create({
        data: { companyId: company.id, kind: notice.kind, key: notice.key },
      });
      sent++;
    } catch {
      failed++;
    }
  }
  return { sent, failed };
}
