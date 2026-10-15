import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { prisma } from '@/lib/db';
import { seedDemoCompany } from '@/server/data/demo';
import { getTodayOverview } from '@/server/data/insights';
import { listDueReturns } from '@/server/data/returns';
import { createTestCompany, deleteTestCompany } from './helpers';

type Fixture = Awaited<ReturnType<typeof createTestCompany>>;

describe('empresa de demonstração', () => {
  let fixture: Fixture;

  beforeEach(async () => {
    fixture = await createTestCompany('demo');
  });

  afterEach(async () => {
    await deleteTestCompany(fixture.company.id);
  });

  it('recusa preencher uma empresa real', async () => {
    await expect(seedDemoCompany(fixture.company.id, 'America/Sao_Paulo')).rejects.toThrow(
      'demonstração',
    );
    expect(await prisma.appointment.count({ where: { companyId: fixture.company.id } })).toBe(0);
  }, 60_000);

  it('preenche agenda, caixa, estoque e clientes coerentes entre si', async () => {
    await prisma.company.update({ where: { id: fixture.company.id }, data: { isDemo: true } });
    const result = await seedDemoCompany(fixture.company.id, 'America/Sao_Paulo');
    expect(result.appointments).toBeGreaterThan(300);

    const companyId = fixture.company.id;
    const [done, incomes, future, lowStock] = await Promise.all([
      prisma.appointment.count({ where: { companyId, status: 'DONE' } }),
      prisma.transaction.count({ where: { companyId, type: 'INCOME', category: 'Atendimento' } }),
      prisma.appointment.count({ where: { companyId, startAt: { gt: new Date() } } }),
      prisma.product.count({ where: { companyId, quantity: { lte: 5 } } }),
    ]);
    // Cada atendimento concluído tem a sua entrada no caixa, como a comanda faria.
    expect(incomes).toBe(done);
    expect(future).toBeGreaterThan(0);
    expect(lowStock).toBeGreaterThan(0);

    // Nenhum profissional com dois atendimentos ao mesmo tempo.
    const overlaps = await prisma.$queryRaw<{ n: bigint }[]>`
      SELECT count(*) AS n FROM "Appointment" a JOIN "Appointment" b
        ON a."professionalId" = b."professionalId" AND a.id < b.id
       AND a."startAt" < b."endAt" AND a."endAt" > b."startAt"
      WHERE a."companyId" = ${companyId}`;
    expect(Number(overlaps[0].n)).toBe(0);

    // O painel funciona com esses dados: aniversariante do dia, estoque baixo, retornos.
    const overview = await getTodayOverview(companyId, 'America/Sao_Paulo');
    expect(overview.birthdays.length).toBeGreaterThan(0);
    expect(overview.lowStock).toBeGreaterThan(0);
    expect((await listDueReturns(companyId)).length).toBeGreaterThan(0);
  }, 180_000);
});
