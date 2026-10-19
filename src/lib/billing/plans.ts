/*
  Planos do Atendafy — FONTE ÚNICA das decisões comerciais. A página de assinatura, a cobrança
  na Asaas, o assistente e as validações do servidor leem daqui. Para mudar preço, nome, limite
  ou o que cada plano inclui, edite este arquivo (e só ele).

  PROVISÓRIO: preços, franquias de IA e adicionais abaixo são referências iniciais, não preços
  publicados. `checkoutEnabled: false` impede contratar um plano pela Asaas até a decisão final.

  Identificadores (`id`) são estáveis e ficam gravados em Company.plan — nunca renomeie um id;
  troque só o `name`. "essencial" é o plano Básico (o id antigo foi preservado).
*/

export type PlanId = 'essencial' | 'profissional' | 'pro' | 'rede';

/** Funcionalidades manuais (de gestão). A matriz está pronta; a cobrança do acesso a elas é aplicada aos poucos. */
export type FeatureKey =
  | 'agenda'
  | 'onlineBooking'
  | 'cashier'
  | 'finance'
  | 'clients'
  | 'loyalty'
  | 'stock'
  | 'commissions'
  | 'reports'
  | 'whatsappAutomation'
  | 'campaigns'
  | 'packages'
  | 'forms'
  | 'multiUnit'
  /** Área do cliente ampliada: pacotes, fichas a preencher, documentos liberados, orçamentos e dados. */
  | 'clientPortal'
  /** Orçamentos com versões, link protegido, aprovação e conversão em pacote. */
  | 'quotes'
  /** Lista de espera com preferências e convites com prazo (manual). */
  | 'waitlistInvites'
  /** Convite automático da lista de espera quando abre uma vaga (rotina). */
  | 'waitlistAutomation'
  /** Importação assistida de clientes e produtos (mapeamento, prévia, duplicados, relatório). */
  | 'assistedImport'
  /** Resumo do dia sob demanda. */
  | 'dailySummary'
  /** Resumo do dia gerado sozinho no horário configurado. */
  | 'dailySummaryAuto'
  /** Rotina de renovação de pacotes (tarefas e orçamentos preparados, nunca cobrança). */
  | 'packageRenewal'
  /** Resultados das automações, com critério de atribuição explícito. */
  | 'automationResults'
  /** Checklist por serviço na Visão do atendimento. */
  | 'checklists'
  /** Margem de contribuição por serviço (preço − materiais − comissão). */
  | 'contributionMargin';

/** O que o plano INCLUI de IA. Incluir não basta: o recurso também precisa estar implementado (ver AI_IMPLEMENTED). */
export type AiPlanEntitlements = {
  /** Assistente por texto (consultas e preparo de ações). */
  assistant: boolean;
  /** Comandos de voz curtos. */
  voice: boolean;
  /** Executar alterações depois de aprovação explícita. */
  assistedActions: boolean;
  /** Configurar automações com IA. */
  aiAutomations: boolean;
  /** Execução automática de tarefas previamente autorizadas (modo "Executar regras autorizadas"). */
  autoExecution: boolean;
  /**
   * Franquia mensal em unidades de IA (1 unidade = 1 chamada ao modelo). `null` = ainda não
   * definida: em produção isso BLOQUEIA o uso (nunca significa ilimitado).
   */
  monthlyUnits: number | null;
  /** Limites de áudio (quando a voz existir). */
  maxAudioSecondsPerCommand: number;
  maxAudioMinutesPerMonth: number;
  /** Teto de idas e voltas com o modelo por pedido e tempo máximo de um pedido. */
  maxStepsPerRequest: number;
  maxRequestSeconds: number;
};

export type AddOnId = 'whatsapp_ai';

export type Plan = {
  id: PlanId;
  /** Nome comercial (pode mudar sem migração). */
  name: string;
  /** Preço mensal em centavos e moeda. */
  priceCents: number;
  currency: 'BRL';
  /** Aparece para novas contratações. */
  offered: boolean;
  /** Pode ser contratado agora pela Asaas (falso = preço ainda não publicado). */
  checkoutEnabled: boolean;
  /** Plano antigo mantido para quem já tem (não é oferecido a novas contas). */
  legacy?: boolean;
  /** Profissionais ativos e unidades incluídos (null = sem limite). */
  maxProfessionals: number | null;
  maxUnits: number | null;
  features: Record<FeatureKey, boolean>;
  ai: AiPlanEntitlements;
  /** Adicionais que podem ser contratados neste plano. */
  addOns: AddOnId[];
  /** Destaques mostrados na tela de planos — só o que existe de verdade hoje. */
  highlights: string[];
};

const NO_AI: AiPlanEntitlements = {
  assistant: false,
  voice: false,
  assistedActions: false,
  aiAutomations: false,
  autoExecution: false,
  monthlyUnits: 0,
  maxAudioSecondsPerCommand: 0,
  maxAudioMinutesPerMonth: 0,
  maxStepsPerRequest: 0,
  maxRequestSeconds: 0,
};

const ESSENTIAL_FEATURES: Record<FeatureKey, boolean> = {
  agenda: true,
  onlineBooking: true,
  cashier: true,
  finance: true,
  clients: true,
  loyalty: true,
  stock: true,
  commissions: false,
  reports: false,
  whatsappAutomation: false,
  campaigns: false,
  packages: false,
  forms: false,
  multiUnit: false,
  clientPortal: false,
  quotes: false,
  waitlistInvites: false,
  waitlistAutomation: false,
  assistedImport: false,
  dailySummary: false,
  dailySummaryAuto: false,
  packageRenewal: false,
  automationResults: false,
  checklists: false,
  contributionMargin: false,
};

const FULL_FEATURES: Record<FeatureKey, boolean> = {
  ...ESSENTIAL_FEATURES,
  commissions: true,
  reports: true,
  whatsappAutomation: true,
  campaigns: true,
  packages: true,
  forms: true,
  clientPortal: true,
  quotes: true,
  waitlistInvites: true,
  assistedImport: true,
  dailySummary: true,
  checklists: true,
};

/** Só no Pro: rotinas automáticas e análises que dependem delas. */
const PRO_FEATURES: Record<FeatureKey, boolean> = {
  ...FULL_FEATURES,
  multiUnit: true,
  waitlistAutomation: true,
  dailySummaryAuto: true,
  packageRenewal: true,
  automationResults: true,
  contributionMargin: true,
};

export const PLANS: Plan[] = [
  {
    id: 'essencial',
    name: 'Básico',
    priceCents: 7990,
    currency: 'BRL',
    offered: true,
    checkoutEnabled: true,
    maxProfessionals: 2,
    maxUnits: 1,
    features: ESSENTIAL_FEATURES,
    ai: NO_AI,
    addOns: [],
    highlights: [
      'Até 2 profissionais',
      'Agenda e agendamento online',
      'Comanda, caixa e financeiro',
      'Clientes, fidelidade e estoque',
      'Não inclui inteligência artificial',
    ],
  },
  {
    id: 'profissional',
    name: 'Profissional',
    priceCents: 14990,
    currency: 'BRL',
    offered: true,
    checkoutEnabled: true,
    maxProfessionals: 8,
    maxUnits: 1,
    features: FULL_FEATURES,
    ai: {
      assistant: true,
      voice: true,
      assistedActions: true,
      aiAutomations: false,
      autoExecution: false,
      monthlyUnits: null, // A DEFINIR (decisão comercial pendente)
      maxAudioSecondsPerCommand: 30,
      maxAudioMinutesPerMonth: 60,
      maxStepsPerRequest: 6,
      maxRequestSeconds: 60,
    },
    addOns: ['whatsapp_ai'],
    highlights: [
      'Até 8 profissionais',
      'Tudo do Básico',
      'Comissões, metas e relatórios',
      'WhatsApp automático e campanhas',
      'Pacotes, assinaturas e fichas',
      'Orçamentos com link para o cliente aprovar',
      'Lista de espera com convites e área do cliente completa',
      'Assistente de IA por texto, com sua aprovação antes de alterar dados',
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    priceCents: 29990,
    currency: 'BRL',
    offered: true,
    // Preço ainda não publicado na Asaas: a contratação fica fechada até a decisão final.
    checkoutEnabled: false,
    maxProfessionals: null,
    maxUnits: null,
    features: PRO_FEATURES,
    ai: {
      assistant: true,
      voice: true,
      assistedActions: true,
      aiAutomations: true,
      autoExecution: true,
      monthlyUnits: null, // A DEFINIR — maior que a do Profissional
      maxAudioSecondsPerCommand: 30,
      maxAudioMinutesPerMonth: 180,
      maxStepsPerRequest: 8,
      maxRequestSeconds: 90,
    },
    addOns: ['whatsapp_ai'],
    highlights: [
      'Profissionais ilimitados',
      'Tudo do Profissional',
      'Várias unidades num painel só',
      'Rotinas que você autoriza: renovação de pacotes e lista de espera automática',
      'Resumo do dia automático e resultados das automações',
      'Margem por serviço',
      'Assistente de IA com franquia maior que a do Profissional',
    ],
  },
  {
    // Plano antigo, mantido para quem já assinou. NÃO vira Pro automaticamente: conserva o que
    // foi vendido (profissionais ilimitados, várias unidades) e a IA no nível do Profissional
    // (com aprovação, sem execução automática). Migrar para Pro exige decisão comercial.
    id: 'rede',
    name: 'Rede',
    priceCents: 29990,
    currency: 'BRL',
    offered: false,
    checkoutEnabled: false,
    legacy: true,
    maxProfessionals: null,
    maxUnits: null,
    features: { ...FULL_FEATURES, multiUnit: true },
    ai: {
      assistant: true,
      voice: true,
      assistedActions: true,
      aiAutomations: false,
      autoExecution: false,
      monthlyUnits: null,
      maxAudioSecondsPerCommand: 30,
      maxAudioMinutesPerMonth: 60,
      maxStepsPerRequest: 6,
      maxRequestSeconds: 60,
    },
    addOns: ['whatsapp_ai'],
    highlights: ['Plano anterior, mantido para quem já assina'],
  },
];

/**
 * Teste grátis: concessão TEMPORÁRIA e explícita. Conta nova em teste, sem plano escolhido, usa
 * as funcionalidades do plano base abaixo e uma franquia de IA própria do teste. Quem escolheu
 * o Básico durante o teste fica sem IA (a IA nunca é atribuída em silêncio ao Básico).
 */
export const TRIAL_DAYS = 14;
export const TRIAL_GRANT = {
  basePlan: 'profissional' as PlanId,
  /** Franquia de IA do teste — A DEFINIR (null bloqueia em produção). */
  aiMonthlyUnits: null as number | null,
};

/** Contas que já existiam quando a cobrança entrou: 30 dias a partir daqui. */
export const BILLING_LAUNCH = new Date('2026-10-16T00:00:00-03:00');

/** Atraso: dias de tolerância depois do fim do período pago (uso manual continua; IA pausa). */
export const PAST_DUE_GRACE_DAYS = 7;

/**
 * Só no ambiente de desenvolvimento, quando a franquia do plano ainda não foi definida.
 * Provisório e restrito a NODE_ENV !== 'production' (em produção, sem franquia = bloqueado).
 */
export const DEV_PROVISIONAL_AI_UNITS = 100;

/** Recursos de IA realmente construídos hoje. Incluído no plano + implementado = disponível. */
export const AI_IMPLEMENTED = {
  assistant: true,
  assistedActions: true,
  voice: false,
  aiAutomations: false,
  // Rotinas autorizadas reais: renovação de pacotes e lista de espera (sem chamar o modelo).
  autoExecution: true,
  whatsappAi: false,
} as const;

export type AddOn = {
  id: AddOnId;
  name: string;
  description: string;
  /** Preço ainda não definido (null): não há contratação. */
  priceCents: number | null;
  /** Exige plano com IA. */
  requiresAi: boolean;
  implemented: boolean;
};

export const ADD_ONS: AddOn[] = [
  {
    id: 'whatsapp_ai',
    name: 'Atendimento com IA no WhatsApp',
    description:
      'Respostas com IA para clientes no WhatsApp, com franquia e limite de gastos próprios. Separado do assistente interno e das mensagens automáticas comuns.',
    priceCents: null,
    requiresAi: true,
    implemented: false,
  },
];

/** Preço estimado do provedor por 1 milhão de tokens (para estimar custo; não é cobrança). */
export const AI_PROVIDER_PRICING: Record<
  string,
  { inputPerMillion: number; outputPerMillion: number; currency: 'USD' }
> = {
  // Referência provisória do Gemini Flash; ajuste quando trocar de modelo.
  'gemini-flash-latest': { inputPerMillion: 0.3, outputPerMillion: 2.5, currency: 'USD' },
};

export function getPlan(id: string | null | undefined): Plan | undefined {
  return PLANS.find((p) => p.id === id);
}

export function planPrice(plan: Pick<Plan, 'priceCents'>): number {
  return plan.priceCents / 100;
}

export function getAddOn(id: string): AddOn | undefined {
  return ADD_ONS.find((a) => a.id === id);
}

/** Fim do teste: o gravado na conta ou, para contas antigas, 30 dias depois do lançamento. */
export function effectiveTrialEnd(company: { trialEndsAt: Date | null }): Date {
  return company.trialEndsAt ?? new Date(BILLING_LAUNCH.getTime() + 30 * 86_400_000);
}
