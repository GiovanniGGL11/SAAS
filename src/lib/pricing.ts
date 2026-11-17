/*
  Calculadora de preço (gerencial) — a conta de "quanto custa, quanto cobrar e quanto sobra".

  Custo fixo por hora      = despesas fixas mensais ÷ horas previstas de atendimento
  Retirada-alvo por hora   = retirada mensal desejada ÷ horas previstas de atendimento
  Base do serviço          = insumos + outros custos diretos + cobranças fixas por atendimento
                             + duração em horas × (custo fixo por hora + retirada-alvo por hora)
  Preço mínimo sustentável = base ÷ (1 − taxas percentuais)
  Preço para a meta        = base ÷ (1 − taxas percentuais − margem desejada)

  Horas previstas = horas disponíveis × ocupação esperada (160 h a 75% = 120 h). Em equipe, as
  horas são as da equipe toda: o custo fixo compartilhado entra uma vez só.
  Taxas percentuais (cartão, impostos sobre a venda, comissão em %) incidem sobre o preço cobrado.
  Preços sugeridos são arredondados PARA CIMA ao centavo.
*/

export type PricingInputs = {
  /** Despesas fixas mensais (manter o negócio aberto). */
  fixedMonthly: number;
  /** Quanto o dono quer receber por mês pelo próprio trabalho. */
  ownerWithdrawal: number;
  /** Horas disponíveis para atender no mês (da equipe toda, se houver equipe). */
  availableHours: number;
  /** Ocupação esperada da agenda, 0–100. */
  occupancyPercent: number;
  /** Duração do atendimento em minutos, contando preparo e limpeza que ocupam a agenda. */
  durationMinutes: number;
  /** Insumos por atendimento (R$). */
  supplies: number;
  /** Outros custos diretos por atendimento (R$). */
  otherDirectCosts: number;
  /** Cobranças fixas por atendimento (ex.: comissão fixa, taxa fixa da maquininha) (R$). */
  fixedChargesPerService: number;
  /** Soma das taxas sobre o preço (cartão, impostos, comissão %), 0–1 (10% = 0,10). */
  percentRates: number;
  /** Margem de lucro desejada sobre o preço, 0–1. */
  targetMargin: number;
};

export type PricingProblem = 'hours' | 'duration' | 'rates' | 'margin';

export const PRICING_PROBLEM_TEXT: Record<PricingProblem, string> = {
  hours:
    'Informe as horas de atendimento do mês e a ocupação (as horas previstas não podem ser zero).',
  duration: 'Informe a duração do atendimento.',
  rates: 'As taxas sobre a venda somam 100% ou mais: nenhum preço cobre os custos.',
  margin: 'Taxas + margem desejada chegam a 100% ou mais: essa margem é inviável. Reduza a margem.',
};

export type PricingResult = {
  expectedHours: number;
  fixedPerHour: number;
  withdrawalPerHour: number;
  durationHours: number;
  /** Custos diretos do atendimento (insumos + outros + cobranças fixas). */
  directCosts: number;
  base: number;
  minPrice: number | null;
  targetPrice: number | null;
  problems: PricingProblem[];
};

/** Arredonda para cima ao centavo (sem cair em 77,7800000001 → 77,79). */
export function ceilCents(value: number): number {
  return Math.ceil(Math.round(value * 1e6) / 1e4) / 100;
}
const cents = (value: number) => Math.round(value * 100) / 100;

export function calculatePricing(i: PricingInputs): PricingResult {
  const problems: PricingProblem[] = [];
  const expectedHours = Math.max(0, i.availableHours) * (Math.max(0, i.occupancyPercent) / 100);
  if (!(expectedHours > 0)) problems.push('hours');
  const durationHours = Math.max(0, i.durationMinutes) / 60;
  if (!(durationHours > 0)) problems.push('duration');
  const fixedPerHour = expectedHours > 0 ? i.fixedMonthly / expectedHours : 0;
  const withdrawalPerHour = expectedHours > 0 ? i.ownerWithdrawal / expectedHours : 0;
  const directCosts = i.supplies + i.otherDirectCosts + i.fixedChargesPerService;
  const base = directCosts + durationHours * (fixedPerHour + withdrawalPerHour);
  if (i.percentRates >= 1) problems.push('rates');
  else if (i.percentRates + i.targetMargin >= 1) problems.push('margin');
  const ok = expectedHours > 0 && durationHours > 0;
  return {
    expectedHours: cents(expectedHours),
    fixedPerHour: cents(fixedPerHour),
    withdrawalPerHour: cents(withdrawalPerHour),
    durationHours,
    directCosts: cents(directCosts),
    base: cents(base),
    minPrice: ok && i.percentRates < 1 ? ceilCents(base / (1 - i.percentRates)) : null,
    targetPrice:
      ok && i.percentRates + i.targetMargin < 1
        ? ceilCents(base / (1 - i.percentRates - i.targetMargin))
        : null,
    problems,
  };
}

export type PriceOutcome = {
  price: number;
  /** O que sobra do preço depois das taxas percentuais. */
  netOfRates: number;
  /** Disponível por hora para remunerar o dono e gerar lucro. */
  availablePerHour: number | null;
  /** Lucro do atendimento depois de reservar a retirada do dono. */
  profit: number;
  /** Lucro por hora depois de reservar a retirada. */
  profitPerHour: number | null;
  /** Margem (lucro ÷ preço), 0–1. */
  margin: number | null;
};

/** Resultado de cobrar um preço (atual, sugerido, com desconto ou outra forma de pagamento). */
export function outcomeAt(
  i: PricingInputs,
  price: number,
  options: { percentRates?: number } = {},
): PriceOutcome {
  const r = calculatePricing(i);
  const rates = options.percentRates ?? i.percentRates;
  const netOfRates = price * (1 - rates);
  const hours = r.durationHours;
  // Antes da retirada: o que o atendimento deixa depois de taxas, custos diretos e custo fixo.
  const available = netOfRates - r.directCosts - hours * r.fixedPerHour;
  const profit = available - hours * r.withdrawalPerHour;
  return {
    price: cents(price),
    netOfRates: cents(netOfRates),
    availablePerHour: hours > 0 ? cents(available / hours) : null,
    profit: cents(profit),
    profitPerHour: hours > 0 ? cents(profit / hours) : null,
    margin: price > 0 ? Math.round((profit / price) * 10000) / 10000 : null,
  };
}

/** Insumo comprado em embalagem: R$ 80 por 500 ml, gastando 25 ml → R$ 4,00 por atendimento. */
export function supplyCost(packagePrice: number, packageQuantity: number, perService: number) {
  if (!(packageQuantity > 0)) return null;
  return cents((packagePrice / packageQuantity) * perService);
}

export type ResaleInputs = {
  /** Preço pago pelo lote. */
  lotPrice: number;
  /** Unidades no lote. */
  lotUnits: number;
  /** Frete da compra (do lote todo), rateado pelas unidades. */
  lotFreight: number;
  /** Embalagem por unidade vendida. */
  packagingPerUnit: number;
  /** Parte das despesas compartilhadas por unidade (critério de rateio), R$. */
  sharedPerUnit: number;
  percentRates: number;
  targetMargin: number;
};

export function calculateResale(i: ResaleInputs) {
  const unitCost =
    i.lotUnits > 0 ? (i.lotPrice + i.lotFreight) / i.lotUnits + i.packagingPerUnit : null;
  const base = unitCost === null ? null : unitCost + i.sharedPerUnit;
  return {
    unitCost: unitCost === null ? null : cents(unitCost),
    base: base === null ? null : cents(base),
    minPrice: base !== null && i.percentRates < 1 ? ceilCents(base / (1 - i.percentRates)) : null,
    targetPrice:
      base !== null && i.percentRates + i.targetMargin < 1
        ? ceilCents(base / (1 - i.percentRates - i.targetMargin))
        : null,
  };
}

/** Lucro por unidade e margem vendendo a `price`. */
export function resaleOutcome(i: ResaleInputs, price: number) {
  const r = calculateResale(i);
  if (r.base === null) return null;
  const profit = price * (1 - i.percentRates) - r.base;
  return {
    profit: cents(profit),
    margin: price > 0 ? Math.round((profit / price) * 10000) / 10000 : null,
  };
}
