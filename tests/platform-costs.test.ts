import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { prisma } from '@/lib/db';
import { estimateCostMicros } from '@/server/ai/usage';
import { getPlatformCosts, situationOf } from '@/server/platform/overview';
import { createTestCompany, deleteTestCompany } from './helpers';

describe('custos por empresa no painel da plataforma', () => {
  let f: Awaited<ReturnType<typeof createTestCompany>>;
  const previousRate = process.env.USD_BRL_RATE;

  beforeAll(async () => {
    process.env.USD_BRL_RATE = '5';
    f = await createTestCompany('costs');
    await prisma.company.update({
      where: { id: f.company.id },
      data: {
        plan: 'profissional',
        subscriptionStatus: 'ACTIVE',
        currentPeriodEnd: new Date(Date.now() + 20 * 86_400_000),
      },
    });
    await prisma.aiUsageEvent.create({
      data: {
        companyId: f.company.id,
        feature: 'assistant_chat',
        provider: 'gemini',
        calls: 3,
        units: 3,
        estimatedCostMicros: 20_000, // US$ 0,02
        outcome: 'SUCCEEDED',
      },
    });
    await prisma.whatsappMessage.createMany({
      data: [1, 2].map((n) => ({
        companyId: f.company.id,
        kind: 'REMINDER',
        dedupeKey: `custo:${n}`,
        phone: '11988887777',
        text: 'x',
        status: 'SENT' as const,
        channel: 'official',
      })),
    });
  });
  afterAll(async () => {
    process.env.USD_BRL_RATE = previousRate;
    await prisma.aiUsageEvent.deleteMany({ where: { companyId: f.company.id } });
    await deleteTestCompany(f.company.id);
  });

  it('receita, IA, WhatsApp, taxa e lucro do mês em reais', async () => {
    const company = await prisma.company.findUniqueOrThrow({ where: { id: f.company.id } });
    const row = { ...company, activeProfessionals: 1, situation: situationOf(company, new Date()) };
    const costs = (await getPlatformCosts([row], new Date())).get(company.id)!;
    expect(costs).toMatchObject({
      revenue: 79.9,
      aiCredits: 3,
      aiQuestions: 1,
      aiCost: 0.1, // US$ 0,02 × 5
      waMessages: 2,
      waCost: 0.08, // 2 × US$ 0,008 × 5
      fee: 1.99,
    });
    expect(costs.profit).toBeCloseTo(79.9 - 1.99 - 0.1 - 0.08, 2);
  });

  it('modelo sem preço cadastrado estima pelo Flash (nunca zero)', () => {
    const usage = { inputTokens: 1_000_000, outputTokens: 0 };
    expect(estimateCostMicros('modelo-novo', usage).micros).toBe(
      estimateCostMicros('gemini-flash-latest', usage).micros,
    );
    expect(estimateCostMicros('gemini-flash-latest', usage).micros).toBe(750_000);
  });
});
