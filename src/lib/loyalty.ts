import { formatCurrencyBRL } from '@/lib/serialize';

/** The program fields these helpers need, in plain numbers (server or client side). */
export type LoyaltyRules = {
  mode: 'STAMPS' | 'POINTS' | 'CASHBACK';
  stampsRequired: number;
  pointsPerReal: number;
  pointsRequired: number;
  cashbackPercent: number;
  rewardType: 'FREE_SERVICE' | 'PERCENT_DISCOUNT' | 'FIXED_DISCOUNT' | 'CUSTOM';
  rewardValue: number | null;
  rewardDescription: string | null;
  rewardService: { name: string } | null;
};

/** How much one completed appointment at `price` is worth under the program. */
export function earnedFor(rules: LoyaltyRules, price: number): number {
  switch (rules.mode) {
    case 'STAMPS':
      return 1;
    case 'POINTS':
      return Math.floor(price * rules.pointsPerReal);
    case 'CASHBACK':
      return Math.round(price * rules.cashbackPercent) / 100;
  }
}

/** Balance needed to redeem the reward; null for cashback (any amount is usable). */
export function rewardThreshold(rules: LoyaltyRules): number | null {
  if (rules.mode === 'STAMPS') return rules.stampsRequired;
  if (rules.mode === 'POINTS') return rules.pointsRequired;
  return null;
}

export function describeReward(rules: LoyaltyRules): string {
  if (rules.mode === 'CASHBACK') return 'Desconto com o saldo de cashback';
  switch (rules.rewardType) {
    case 'FREE_SERVICE':
      return `${rules.rewardService?.name ?? 'Serviço'} grátis`;
    case 'PERCENT_DISCOUNT':
      return `${formatNumber(rules.rewardValue ?? 0)}% de desconto`;
    case 'FIXED_DISCOUNT':
      return `${formatCurrencyBRL(rules.rewardValue ?? 0)} de desconto`;
    case 'CUSTOM':
      return rules.rewardDescription || 'Recompensa';
  }
}

/** One-line summary of the rule, e.g. "A cada 10 atendimentos: Corte grátis". */
export function describeRule(rules: LoyaltyRules): string {
  switch (rules.mode) {
    case 'STAMPS':
      return `A cada ${rules.stampsRequired} ${rules.stampsRequired === 1 ? 'atendimento' : 'atendimentos'}: ${describeReward(rules)}`;
    case 'POINTS':
      return `${formatNumber(rules.pointsPerReal)} ${rules.pointsPerReal === 1 ? 'ponto' : 'pontos'} por R$ 1 · ${formatNumber(rules.pointsRequired)} pontos: ${describeReward(rules)}`;
    case 'CASHBACK':
      return `${formatNumber(rules.cashbackPercent)}% de cada atendimento volta como saldo`;
  }
}

export function formatLoyaltyAmount(mode: LoyaltyRules['mode'], amount: number): string {
  if (mode === 'CASHBACK') return formatCurrencyBRL(amount);
  const unit =
    mode === 'STAMPS' ? (amount === 1 ? 'selo' : 'selos') : amount === 1 ? 'ponto' : 'pontos';
  return `${formatNumber(amount)} ${unit}`;
}

function formatNumber(value: number): string {
  return value.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
}
