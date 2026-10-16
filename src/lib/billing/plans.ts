/*
  Planos do Atendafy. Valores de referência do mercado (Trinks, AppBarber, Avec em 2026) — ajuste
  aqui; a página de assinatura e a cobrança na Asaas leem deste arquivo.
*/

export type PlanId = 'essencial' | 'profissional' | 'rede';

export type Plan = {
  id: PlanId;
  name: string;
  price: number;
  /** Profissionais ativos incluídos (null = sem limite). */
  maxProfessionals: number | null;
  highlights: string[];
};

export const PLANS: Plan[] = [
  {
    id: 'essencial',
    name: 'Essencial',
    price: 79.9,
    maxProfessionals: 2,
    highlights: [
      'Até 2 profissionais',
      'Agenda e agendamento online',
      'Comanda, caixa e financeiro',
      'Clientes e fidelidade',
    ],
  },
  {
    id: 'profissional',
    name: 'Profissional',
    price: 149.9,
    maxProfessionals: 8,
    highlights: [
      'Até 8 profissionais',
      'Tudo do Essencial',
      'Comissões, metas e relatórios',
      'WhatsApp automático e campanhas',
      'Pacotes, assinaturas e fichas',
    ],
  },
  {
    id: 'rede',
    name: 'Rede',
    price: 299.9,
    maxProfessionals: null,
    highlights: [
      'Profissionais ilimitados',
      'Tudo do Profissional',
      'Várias unidades num painel só',
      'Suporte prioritário',
    ],
  },
];

export const TRIAL_DAYS = 14;
/** Contas que já existiam quando a cobrança entrou: 30 dias a partir daqui. */
export const BILLING_LAUNCH = new Date('2026-10-16T00:00:00-03:00');

export function getPlan(id: string | null | undefined): Plan | undefined {
  return PLANS.find((p) => p.id === id);
}

/** Fim do teste: o gravado na conta ou, para contas antigas, 30 dias depois do lançamento. */
export function effectiveTrialEnd(company: { trialEndsAt: Date | null }): Date {
  return company.trialEndsAt ?? new Date(BILLING_LAUNCH.getTime() + 30 * 86_400_000);
}
