import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { prisma } from '@/lib/db';
import {
  copyPeriodGoals,
  getPeriodGoals,
  monthRange,
  setPeriodGoal,
  shiftMonth,
} from '@/server/data/period-goals';
import { createTestCompany, deleteTestCompany } from './helpers';

const tz = 'America/Sao_Paulo';

describe('metas por período: regras de mês', () => {
  it('mês no fuso da empresa e virada de ano', () => {
    const { start, end } = monthRange('2030-12', tz);
    expect(start.toISOString()).toBe('2030-12-01T03:00:00.000Z');
    expect(end.toISOString()).toBe('2031-01-01T03:00:00.000Z');
    expect(shiftMonth('2031-01', -1)).toBe('2030-12');
    expect(shiftMonth('2030-12', 1)).toBe('2031-01');
    expect(() => monthRange('2030-13', tz)).toThrow(/Mês inválido/);
  });
});

describe('metas por período: servidor', () => {
  let f: Awaited<ReturnType<typeof createTestCompany>>;

  beforeAll(async () => {
    f = await createTestCompany('period_goals');
  });
  afterAll(async () => {
    await deleteTestCompany(f.company.id);
  });

  it('realizado vem dos registros do mês; meta por mês; projeção só no mês em andamento', async () => {
    // Novembro de 2030: duas entradas pagas no mês e uma no mês seguinte (não conta).
    const paid = (amount: number, paidAt: Date) =>
      prisma.transaction.create({
        data: {
          companyId: f.company.id,
          type: 'INCOME',
          status: 'PAID',
          description: 'Entrada (teste)',
          amount,
          paidAt,
          createdByUserId: 'u',
        },
      });
    await paid(100, new Date('2030-11-05T15:00:00Z'));
    await paid(50.5, new Date('2030-11-30T23:00:00Z')); // 20h de 30/11 em Brasília: ainda novembro
    await paid(999, new Date('2030-12-01T04:00:00Z')); // 01h de 01/12 em Brasília

    await setPeriodGoal(f.company.id, 'user_admin', {
      metric: 'received',
      month: '2030-11',
      target: 300,
    });
    // No meio de novembro: projeção do ritmo; em dezembro, sem meta e sem projeção.
    const mid = new Date('2030-11-16T03:00:00Z');
    const nov = await getPeriodGoals(f.company.id, tz, '2030-11', mid);
    const received = nov.items.find((i) => i.metric === 'received')!;
    expect(received).toMatchObject({ target: 300, value: 150.5, pct: 50.2 });
    expect(received.projection).toBeCloseTo(301, 0);

    const dec = await getPeriodGoals(f.company.id, tz, '2030-12', mid);
    expect(dec.running).toBe(false);
    expect(dec.items.find((i) => i.metric === 'received')).toMatchObject({
      target: null,
      value: 999,
      projection: null,
    });

    // Copiar para o mês seguinte não sobrescreve o que já existe lá.
    await setPeriodGoal(f.company.id, 'user_admin', {
      metric: 'new_clients',
      month: '2030-12',
      target: 7,
    });
    await setPeriodGoal(f.company.id, 'user_admin', {
      metric: 'new_clients',
      month: '2030-11',
      target: 3,
    });
    expect(await copyPeriodGoals(f.company.id, 'user_admin', '2030-11', '2030-12')).toEqual({
      copied: 1,
    });
    const after = await getPeriodGoals(f.company.id, tz, '2030-12', mid);
    expect(after.items.find((i) => i.metric === 'new_clients')?.target).toBe(7);
    expect(after.items.find((i) => i.metric === 'received')?.target).toBe(300);

    // Apagar a meta (null) volta a "sem meta".
    await setPeriodGoal(f.company.id, 'user_admin', {
      metric: 'received',
      month: '2030-12',
      target: null,
    });
    expect(
      (await getPeriodGoals(f.company.id, tz, '2030-12', mid)).items.find(
        (i) => i.metric === 'received',
      )?.target,
    ).toBeNull();
    await expect(
      setPeriodGoal(f.company.id, 'user_admin', {
        metric: 'received',
        month: '2030-12',
        target: -1,
      }),
    ).rejects.toThrow(/Meta inválida/);
  });
});
