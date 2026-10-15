import { afterEach, describe, expect, it } from 'vitest';

import { prisma } from '@/lib/db';
import { completeOnboarding, needsOnboarding } from '@/server/data/onboarding';

describe('primeiro acesso', () => {
  let companyId = '';
  afterEach(async () => {
    await prisma.professionalAvailability.deleteMany({ where: { professional: { companyId } } });
    await prisma.professional.deleteMany({ where: { companyId } });
    await prisma.service.deleteMany({ where: { companyId } });
    await prisma.company.deleteMany({ where: { id: companyId } });
  });

  it('cria serviços, equipe e expediente de uma vez, e só na conta vazia', async () => {
    const suffix = Math.random().toString(36).slice(2, 8);
    const company = await prisma.company.create({
      data: { clerkOrgId: `test_org_onb_${suffix}`, name: 'Nova', slug: `nova-${suffix}` },
    });
    companyId = company.id;
    expect(await needsOnboarding(company.id)).toBe(true);
    const input = {
      services: [
        { name: 'Corte', durationMinutes: 40, price: 50 },
        { name: 'Barba', durationMinutes: 30, price: 35 },
      ],
      professionals: [{ name: 'Ana' }, { name: 'Bruno' }],
      hours: { weekdays: [1, 2, 3, 4, 5], startTime: '09:00', endTime: '18:00' },
      onlineBooking: false,
    };
    await completeOnboarding(company, input);
    expect(await prisma.service.count({ where: { companyId } })).toBe(2);
    const team = await prisma.professional.findMany({
      where: { companyId },
      include: { availabilities: true },
    });
    expect(team.map((p) => p.availabilities.length)).toEqual([5, 5]);
    expect(await needsOnboarding(company.id)).toBe(false);
    await expect(completeOnboarding(company, input)).rejects.toThrow(/já tem serviços/);
  });
});
