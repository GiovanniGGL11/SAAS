import { prisma } from '@/lib/db';
import { UserError } from '@/server/errors';
import { SERVICE_COLORS, TEAM_COLORS } from '@/lib/onboarding/templates';
import { setOnlineBookingEnabled } from '@/server/data/public-booking';

export type OnboardingInput = {
  services: { name: string; durationMinutes: number; price: number }[];
  professionals: { name: string }[];
  hours: { weekdays: number[]; startTime: string; endTime: string };
  onlineBooking: boolean;
};

/** Conta nova: sem serviço e sem profissional ainda (o assistente só aparece nesse caso). */
export async function needsOnboarding(companyId: string): Promise<boolean> {
  const [services, professionals] = await Promise.all([
    prisma.service.count({ where: { companyId } }),
    prisma.professional.count({ where: { companyId } }),
  ]);
  return services === 0 && professionals === 0;
}

/**
 * Cria de uma vez serviços, equipe e o expediente de todos; liga o link online se pedido. Tudo
 * numa transação: se algo falhar, nada fica pela metade.
 */
export async function completeOnboarding(
  company: { id: string; clerkOrgId: string },
  input: OnboardingInput,
) {
  if (!(await needsOnboarding(company.id))) {
    throw new UserError('Esta empresa já tem serviços ou equipe cadastrados.');
  }
  const [startH, startM] = input.hours.startTime.split(':').map(Number);
  const [endH, endM] = input.hours.endTime.split(':').map(Number);
  if (endH * 60 + endM <= startH * 60 + startM)
    throw new UserError('O horário de fechamento precisa ser depois da abertura.');

  await prisma.$transaction(async (tx) => {
    await tx.service.createMany({
      data: input.services.map((s, i) => ({
        companyId: company.id,
        name: s.name.trim(),
        durationMinutes: s.durationMinutes,
        price: s.price,
        color: SERVICE_COLORS[i % SERVICE_COLORS.length],
      })),
    });
    for (const [i, p] of input.professionals.entries()) {
      const professional = await tx.professional.create({
        data: {
          companyId: company.id,
          name: p.name.trim(),
          color: TEAM_COLORS[i % TEAM_COLORS.length],
        },
      });
      await tx.professionalAvailability.createMany({
        data: input.hours.weekdays.map((weekday) => ({
          professionalId: professional.id,
          weekday,
          startTime: input.hours.startTime,
          endTime: input.hours.endTime,
        })),
      });
    }
  });
  if (input.onlineBooking) await setOnlineBookingEnabled(company.clerkOrgId, true);
}
