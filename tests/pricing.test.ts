import { describe, expect, it } from 'vitest';

import {
  calculatePricing,
  calculateResale,
  ceilCents,
  outcomeAt,
  resaleOutcome,
  supplyCost,
  type PricingInputs,
} from '@/lib/pricing';

/** O exemplo do pedido: serviço de 1 h, R$ 20 de insumos, R$ 2.400 fixos, R$ 3.600 de retirada,
 *  120 h previstas, 10% de taxas sobre a venda e margem-alvo de 20%. */
const exemplo: PricingInputs = {
  fixedMonthly: 2400,
  ownerWithdrawal: 3600,
  availableHours: 160,
  occupancyPercent: 75, // 160 h × 75% = 120 h
  durationMinutes: 60,
  supplies: 20,
  otherDirectCosts: 0,
  fixedChargesPerService: 0,
  percentRates: 0.1,
  targetMargin: 0.2,
};

describe('calculadora de preço — exemplo do pedido', () => {
  it('custo por hora, base, preço mínimo e preço para a meta', () => {
    const r = calculatePricing(exemplo);
    expect(r.expectedHours).toBe(120);
    expect(r.fixedPerHour).toBe(20);
    expect(r.withdrawalPerHour).toBe(30);
    expect(r.base).toBe(70);
    expect(r.minPrice).toBe(77.78);
    expect(r.targetPrice).toBe(100);
    expect(r.problems).toEqual([]);
  });

  it('cobrando R$ 100: R$ 50 por hora para o dono e o lucro; R$ 20 de lucro por hora', () => {
    const o = outcomeAt(exemplo, 100);
    expect(o.availablePerHour).toBe(50);
    expect(o.profitPerHour).toBe(20);
    expect(o.margin).toBe(0.2);
  });

  it('com R$ 10 de desconto: lucro R$ 11 e margem 12,22%', () => {
    const o = outcomeAt(exemplo, 90);
    expect(o.profit).toBe(11);
    expect(Math.round(o.margin! * 10000) / 100).toBe(12.22);
  });

  it('trocar cartão (10%) por Pix (0%) aumenta o lucro', () => {
    const pix = outcomeAt(exemplo, 100, { percentRates: 0 });
    expect(pix.profit).toBe(30);
  });

  it('explica dados faltando ou margem inviável', () => {
    expect(calculatePricing({ ...exemplo, availableHours: 0 }).problems).toContain('hours');
    expect(calculatePricing({ ...exemplo, occupancyPercent: 0 }).minPrice).toBeNull();
    expect(calculatePricing({ ...exemplo, targetMargin: 0.9 }).problems).toContain('margin');
    expect(calculatePricing({ ...exemplo, targetMargin: 0.9 }).targetPrice).toBeNull();
    expect(calculatePricing({ ...exemplo, percentRates: 1 }).problems).toContain('rates');
    expect(calculatePricing({ ...exemplo, durationMinutes: 0 }).problems).toContain('duration');
  });

  it('arredonda para cima ao centavo', () => {
    expect(ceilCents(77.7777)).toBe(77.78);
    expect(ceilCents(100)).toBe(100);
    expect(ceilCents(77.78)).toBe(77.78);
  });
});

describe('insumos e revenda', () => {
  it('frasco de 500 ml por R$ 80, gastando 25 ml, custa R$ 4 por atendimento', () => {
    expect(supplyCost(80, 500, 25)).toBe(4);
    expect(supplyCost(80, 0, 25)).toBeNull();
  });

  it('produto para revenda: custo com frete e embalagem, lucro e margem', () => {
    const i = {
      lotPrice: 300,
      lotUnits: 10,
      lotFreight: 20,
      packagingPerUnit: 1,
      sharedPerUnit: 0,
      percentRates: 0.1,
      targetMargin: 0.2,
    };
    const r = calculateResale(i);
    expect(r.unitCost).toBe(33); // (300 + 20) / 10 + 1
    expect(r.minPrice).toBe(36.67); // 33 / 0,9
    expect(r.targetPrice).toBe(47.15); // 33 / 0,7 = 47,142… ↑
    const o = resaleOutcome(i, 50)!;
    expect(o.profit).toBe(12); // 50 × 0,9 − 33
    expect(o.margin).toBe(0.24);
  });
});
