import { describe, expect, it } from 'vitest';

import { approxQuestionsFor, creditsInfo } from '@/lib/ai-credits';

const usage = (used: number, limit = 600, reserved = 0, period = '2026-11') => ({
  period,
  used,
  reserved,
  limit,
  remaining: Math.max(limit - used - reserved, 0),
});

describe('medidor de créditos de IA', () => {
  it('verde, laranja, vermelho e acabou, com perguntas restantes e renovação', () => {
    expect(creditsInfo(usage(60))).toMatchObject({
      level: 'ok',
      percent: 10,
      questionsLeft: 180,
      renewsOn: '1º/12',
    });
    expect(creditsInfo(usage(450)).level).toBe('warning'); // 75%
    expect(creditsInfo(usage(560)).level).toBe('critical'); // 93%
    expect(creditsInfo(usage(600))).toMatchObject({
      level: 'empty',
      percent: 100,
      questionsLeft: 0,
    });
    // Pedido em andamento já conta.
    expect(creditsInfo(usage(400, 600, 60)).percent).toBe(77);
    // Dezembro renova em janeiro do ano seguinte.
    expect(creditsInfo(usage(0, 600, 0, '2026-12'))).toMatchObject({
      renewsOn: '1º/01',
      renewsOnDate: '2027-01-01',
    });
  });

  it('créditos em perguntas, arredondado para baixo de 50 em 50', () => {
    expect(approxQuestionsFor(600)).toBe(200);
    expect(approxQuestionsFor(1500)).toBe(500);
    expect(approxQuestionsFor(150)).toBe(50);
  });
});
