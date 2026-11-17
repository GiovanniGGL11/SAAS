import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { prisma } from '@/lib/db';
import { goalPace } from '@/lib/goals';
import { getGoalsOverview, setCompanyGoal, setProfessionalGoals } from '@/server/data/goals';
import { currentMonth, shiftMonth } from '@/server/data/period-goals';
import { createTestCompany, deleteTestCompany } from './helpers';

describe('ritmo da meta', () => {
  it('à frente, no ritmo, abaixo e batida', () => {
    // Meta 3.000 em 30 dias: no dia 10 o esperado é 1.000.
    const base = { target: 3000, dayOfMonth: 10, totalDays: 30 };
    expect(goalPace({ ...base, actual: 1200 }).status).toBe('ahead');
    expect(goalPace({ ...base, actual: 970 }).status).toBe('on_track');
    expect(goalPace({ ...base, actual: 600 }).status).toBe('behind');
    expect(goalPace({ ...base, actual: 3100 }).status).toBe('done');
    const p = goalPace({ ...base, actual: 900 });
    expect(p).toMatchObject({ percent: 30, remaining: 2100, daysLeft: 21, perDayNeeded: 100 });
    expect(p.projection).toBe(2700);
    expect(goalPace({ ...base, target: null, actual: 10 }).status).toBe('none');
  });
});

describe('aba Metas', () => {
  let f: Awaited<ReturnType<typeof createTestCompany>>;
  beforeAll(async () => {
    f = await createTestCompany('goals');
  });
  afterAll(async () => {
    await prisma.periodGoal.deleteMany({ where: { companyId: f.company.id } });
    await deleteTestCompany(f.company.id);
  });

  it('meta da empresa continua valendo nos meses seguintes até mudar; tirar interrompe', async () => {
    const company = { ...f.company, shareGoalsWithTeam: false };
    const month = currentMonth(company.timezone);
    // Meta definida no mês passado continua valendo neste.
    await prisma.periodGoal.create({
      data: {
        companyId: company.id,
        metric: 'received',
        month: shiftMonth(month, -1),
        target: 20000,
        updatedByUserId: 'user_test',
      },
    });
    let data = await getGoalsOverview(company, { includeCompany: true, onlyProfessionalId: null });
    const received = () => data.company!.find((g) => g.metric === 'received')!;
    expect(received()).toMatchObject({ target: 20000, inherited: true });

    await setCompanyGoal(company, 'received', 25000, 'user_test');
    data = await getGoalsOverview(company, { includeCompany: true, onlyProfessionalId: null });
    expect(received()).toMatchObject({ target: 25000, inherited: false });

    await setCompanyGoal(company, 'received', null, 'user_test');
    data = await getGoalsOverview(company, { includeCompany: true, onlyProfessionalId: null });
    expect(received().target).toBeNull();
  });

  it('meta do profissional e o que ele vê (só a dele; empresa só se liberada)', async () => {
    await setProfessionalGoals(f.company.id, f.professional.id, {
      revenue: 8000,
      appointments: 60,
    });
    const company = { ...f.company, shareGoalsWithTeam: false };
    const own = await getGoalsOverview(company, {
      includeCompany: company.shareGoalsWithTeam,
      onlyProfessionalId: f.professional.id,
    });
    expect(own.company).toBeNull();
    expect(own.team).toHaveLength(1);
    expect(own.team[0]).toMatchObject({
      revenue: { target: 8000, actual: 0 },
      appointments: { target: 60, actual: 0 },
    });
  });
});
