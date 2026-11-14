import { PLANS, getPlan, planPrice, type FeatureKey, type PlanId } from '@/lib/billing/plans';

/*
  Convite para subir de plano no lugar de um recurso travado: o que o recurso faz, em qual plano
  ele está e quanto custa a mais por dia. Aparece onde a pessoa esbarra, em vez de um erro.
*/

const COPY: Partial<Record<FeatureKey, { title: string; text: string }>> = {
  reports: {
    title: 'Relatórios',
    text: 'Faturamento, serviços e profissionais que mais rendem, cancelamentos e faltas, em qualquer período.',
  },
  commissions: {
    title: 'Comissões',
    text: 'Quanto cada profissional tem a receber, calculado sozinho por serviço e produto, com vales e fechamento do mês.',
  },
  campaigns: {
    title: 'Campanhas',
    text: 'Mensagens para grupos de clientes — sumidos, aniversariantes, VIP — para trazer gente de volta.',
  },
  referrals: {
    title: 'Indicações',
    text: 'Saiba quem indicou quem e recompense os clientes que mais trazem gente nova.',
  },
  forms: {
    title: 'Fichas e formulários',
    text: 'Anamnese, autorizações e fichas de atendimento preenchidas no celular, com histórico por cliente.',
  },
  packages: {
    title: 'Pacotes e assinaturas',
    text: 'Venda pacotes de sessões e mensalidades, com controle do que já foi usado.',
  },
  whatsappAutomation: {
    title: 'WhatsApp automático',
    text: 'Confirmação, lembrete e pedido de avaliação saindo sozinhos do número do salão.',
  },
  multiUnit: {
    title: 'Várias unidades',
    text: 'Todas as unidades num painel só, cada uma com a sua agenda, equipe e caixa.',
  },
};

export type UpgradeOffer = {
  title: string;
  text: string;
  planId: PlanId;
  planName: string;
  planPrice: number;
  /** Quanto custa a mais por dia que o plano atual (ou o preço por dia, sem plano pago). */
  perDay: number;
  /** "a mais por dia que o Básico" ou só "por dia". */
  perDayIsExtra: boolean;
};

/** Plano mais barato que libera o recurso, com a conta do preço por dia. */
export function buildUpgradeOffer(
  feature: FeatureKey,
  currentPlanId: string | null,
): UpgradeOffer | null {
  const target = PLANS.filter((p) => p.offered && p.checkoutEnabled && p.features[feature]).sort(
    (a, b) => a.priceCents - b.priceCents,
  )[0];
  if (!target) return null;
  const current = getPlan(currentPlanId);
  const extra = current && current.priceCents < target.priceCents;
  const monthly = planPrice(target) - (extra ? planPrice(current) : 0);
  return {
    title: COPY[feature]?.title ?? 'Recurso de outro plano',
    text: COPY[feature]?.text ?? '',
    planId: target.id,
    planName: target.name,
    planPrice: planPrice(target),
    perDay: Math.round((monthly / 30) * 100) / 100,
    perDayIsExtra: Boolean(extra),
  };
}

/** "R$ 2,66 por dia" — para os cartões de planos. */
export function pricePerDay(priceCents: number): number {
  return Math.round(priceCents / 30) / 100;
}
