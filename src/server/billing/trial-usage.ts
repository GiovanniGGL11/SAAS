import { prisma } from '@/lib/db';
import { getPlan } from '@/lib/billing/plans';

/*
  O que a empresa usou no teste que é do Profissional (e some no Básico). Aparece na Assinatura
  durante o teste: ver o que vai perder é o melhor argumento para escolher o plano certo.
*/

export type TrialUsageItem = { label: string; count: number };

export async function trialUsageSummary(companyId: string): Promise<TrialUsageItem[]> {
  const basicMax = getPlan('essencial')?.maxProfessionals ?? 2;
  const [
    campaigns,
    packages,
    forms,
    quotes,
    commissions,
    autoMessages,
    aiQuestions,
    professionals,
  ] = await Promise.all([
    prisma.campaign.count({ where: { companyId } }),
    prisma.clientPackage.count({ where: { companyId } }),
    prisma.formEntry.count({ where: { companyId } }),
    prisma.quote.count({ where: { companyId } }),
    prisma.commissionPayout.count({ where: { companyId } }),
    prisma.whatsappMessage.count({ where: { companyId, status: 'SENT', kind: { not: 'TEST' } } }),
    prisma.aiUsageEvent.count({
      where: { companyId, feature: 'assistant_chat', outcome: 'SUCCEEDED' },
    }),
    prisma.professional.count({ where: { companyId, active: true } }),
  ]);
  const items: TrialUsageItem[] = [
    { label: 'campanhas criadas', count: campaigns },
    { label: 'pacotes vendidos', count: packages },
    { label: 'fichas preenchidas', count: forms },
    { label: 'orçamentos feitos', count: quotes },
    { label: 'comissões fechadas', count: commissions },
    { label: 'mensagens automáticas no WhatsApp', count: autoMessages },
    { label: 'perguntas ao assistente de IA', count: aiQuestions },
  ];
  if (professionals > basicMax) {
    items.push({
      label: `profissionais ativos (o Básico permite ${basicMax})`,
      count: professionals,
    });
  }
  return items.filter((i) => i.count > 0);
}
