'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';

import { toActionResult } from '@/server/action-result';
import { requireCompanyAdmin } from '@/server/auth/require-current-company';
import { assertFeature } from '@/server/billing/features';
import {
  applyPrice,
  deletePricingSimulation,
  getPricingContext,
  listPricingSimulations,
  savePricingProfile,
  savePricingSimulation,
} from '@/server/data/pricing';
import {
  getForecastVsActual,
  getManagerialStatement,
  getProfitRankings,
  getRankingDrill,
  getStatementDrill,
} from '@/server/data/profit-analysis';
import { currentMonthKey } from '@/lib/month';

/*
  Precificação e lucro. Tudo conferido aqui no servidor (a tela esconder um botão não basta):
  calculadora com dados reais = Profissional ou superior; DRE gerencial e rankings = Pro.
  Mudar de plano não apaga nada — os parâmetros e simulações ficam guardados.
*/

const money = z.number().min(0).max(99_999_999);
const percent = z.number().min(0).max(100);
const PAYMENT = z.enum(['CASH', 'PIX', 'CREDIT_CARD', 'DEBIT_CARD', 'BANK_TRANSFER', 'OTHER']);

export async function getPricingContextAction() {
  return toActionResult(async () => {
    const { company } = await requireCompanyAdmin();
    assertFeature(company, 'pricingCalculator');
    return getPricingContext(company.id);
  });
}

const profileInput = z.object({
  useRecurringExpenses: z.boolean(),
  extraFixedMonthly: money,
  ownerWithdrawal: money,
  availableHours: z.number().min(0).max(10_000),
  occupancyPercent: percent,
  taxPercent: percent,
  targetMarginPercent: percent,
  defaultPaymentMethod: PAYMENT.nullable(),
});

export async function savePricingProfileAction(input: unknown) {
  return toActionResult(async () => {
    const data = profileInput.parse(input);
    const { company, userId } = await requireCompanyAdmin();
    assertFeature(company, 'pricingCalculator');
    await savePricingProfile(company.id, data, userId);
  });
}

export async function applyPriceAction(input: unknown) {
  return toActionResult(async () => {
    const data = z
      .object({
        kind: z.enum(['service', 'product']),
        id: z.string().min(1).max(64),
        price: z.number().positive('O preço precisa ser maior que zero.').max(999_999),
      })
      .parse(input);
    const { company, userId } = await requireCompanyAdmin();
    assertFeature(company, 'pricingCalculator');
    const result = await applyPrice({ companyId: company.id, userId, ...data });
    revalidatePath('/servicos');
    revalidatePath('/estoque');
    return result;
  });
}

export async function listPricingSimulationsAction() {
  return toActionResult(async () => {
    const { company } = await requireCompanyAdmin();
    assertFeature(company, 'pricingCalculator');
    return listPricingSimulations(company.id);
  });
}

const jsonRecord = z.record(z.string(), z.union([z.number(), z.string(), z.boolean(), z.null()]));

export async function savePricingSimulationAction(input: unknown) {
  return toActionResult(async () => {
    const data = z
      .object({
        name: z.string().trim().min(1, 'Dê um nome à simulação.').max(120),
        kind: z.enum(['service', 'product']),
        serviceId: z.string().max(64).nullish(),
        productId: z.string().max(64).nullish(),
        inputs: jsonRecord.refine((r) => Object.keys(r).length <= 60),
        summary: jsonRecord.refine((r) => Object.keys(r).length <= 40),
      })
      .parse(input);
    const { company, userId } = await requireCompanyAdmin();
    assertFeature(company, 'pricingCalculator');
    return savePricingSimulation({ companyId: company.id, userId, ...data });
  });
}

export async function deletePricingSimulationAction(input: unknown) {
  return toActionResult(async () => {
    const { id } = z.object({ id: z.string().min(1).max(64) }).parse(input);
    const { company } = await requireCompanyAdmin();
    assertFeature(company, 'pricingCalculator');
    await deletePricingSimulation(company.id, id);
  });
}

const monthInput = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Mês inválido.');
const basisInput = z.enum(['accrual', 'cash']);

export async function getProfitOverviewAction(input: unknown) {
  return toActionResult(async () => {
    const parsed = z.object({ month: monthInput.optional(), basis: basisInput }).parse(input);
    const { company } = await requireCompanyAdmin();
    assertFeature(company, 'profitAnalysis');
    const month = parsed.month ?? currentMonthKey(company.timezone);
    const [statement, forecast, rankings] = await Promise.all([
      getManagerialStatement(company.id, company.timezone, month, parsed.basis),
      getForecastVsActual(company.id, company.timezone, month),
      getProfitRankings(company.id, company.timezone, month),
    ]);
    return { statement, forecast, rankings };
  });
}

export async function getProfitDrillAction(input: unknown) {
  return toActionResult(async () => {
    const parsed = z
      .discriminatedUnion('source', [
        z.object({
          source: z.literal('statement'),
          month: monthInput,
          basis: basisInput,
          key: z.string().min(1).max(200),
        }),
        z.object({
          source: z.literal('ranking'),
          month: monthInput,
          dimension: z.enum(['service', 'product', 'professional']),
          id: z.string().min(1).max(64),
        }),
      ])
      .parse(input);
    const { company } = await requireCompanyAdmin();
    assertFeature(company, 'profitAnalysis');
    if (parsed.source === 'statement') {
      return getStatementDrill(
        company.id,
        company.timezone,
        parsed.month,
        parsed.basis,
        parsed.key,
      );
    }
    const items = await getRankingDrill(
      company.id,
      company.timezone,
      parsed.month,
      parsed.dimension,
      parsed.id,
    );
    return {
      total: Math.round(items.reduce((s, i) => s + i.amount, 0) * 100) / 100,
      items,
      truncated: false,
    };
  });
}
