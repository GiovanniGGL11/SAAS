'use server';

import { prisma } from '@/lib/db';
import { getOwnProfessional } from '@/server/auth/professional-scope';
import { toActionResult } from '@/server/action-result';
import { parseId } from '@/server/errors';

import { requireCompanyAdmin, requireCurrentCompany } from '@/server/auth/require-current-company';
import {
  createProfessional,
  getProfessionalById,
  getProfessionalMonthlyProduction,
  listAllProfessionals,
  setProfessionalActive,
  updateProfessional,
} from '@/server/data/professionals';
import { professionalInput, setProfessionalActiveInput } from '@/lib/validations/professional';
import { serializeProfessional } from '@/lib/serialize';
import { Prisma } from '@/generated/prisma/client';
import { UserError } from '@/server/errors';
import { assertProfessionalSlots } from '@/server/billing/features';
import { syncSubscriptionValue } from '@/server/billing/subscription';
import { after } from 'next/server';

/** Pro: o valor da assinatura acompanha os profissionais ativos (fora do caminho da resposta). */
function syncBillingLater(companyId: string) {
  after(() =>
    syncSubscriptionValue(companyId).catch((error) =>
      console.error('[billing] valor da assinatura não atualizado', companyId, error),
    ),
  );
}

function toFriendlyError(error: unknown): Error {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    return new UserError('Já existe um profissional com este email.');
  }
  return error instanceof Error ? error : new Error('Erro inesperado.');
}

export async function listProfessionalsAction() {
  const { company } = await requireCurrentCompany();
  // Profissional logado não vê a produção dos colegas: só o próprio cadastro.
  const own = await getOwnProfessional();
  const professionals = (await listAllProfessionals(company.id)).filter(
    (p) => !own || p.id === own.id,
  );

  // Quem tem expediente salvo (sem ele, o profissional não aparece no link de agendamento).
  const scheduled = new Set(
    (
      await prisma.professionalAvailability.findMany({
        where: { professional: { companyId: company.id } },
        select: { professionalId: true },
        distinct: ['professionalId'],
      })
    ).map((a) => a.professionalId),
  );
  const withProduction = await Promise.all(
    professionals.map(async (professional) => ({
      ...serializeProfessional(professional),
      hasSchedule: scheduled.has(professional.id),
      production: await getProfessionalMonthlyProduction(company.id, professional.id),
    })),
  );

  return withProduction;
}

export async function createProfessionalAction(input: unknown) {
  return toActionResult(async () => {
    const parsed = professionalInput.parse(input);
    const { company } = await requireCompanyAdmin();
    await assertProfessionalSlots(company);

    try {
      const professional = await createProfessional(company.id, {
        ...parsed,
        email: parsed.email || null,
        commissionType: parsed.commissionType ?? null,
        commissionValue: parsed.commissionValue ?? null,
      });
      syncBillingLater(company.id);
      return serializeProfessional(professional);
    } catch (error) {
      throw toFriendlyError(error);
    }
  });
}

export async function updateProfessionalAction(rawId: unknown, input: unknown) {
  return toActionResult(async () => {
    const id = parseId(rawId);
    const parsed = professionalInput.parse(input);
    const { company } = await requireCompanyAdmin();

    try {
      const professional = await updateProfessional(company.id, id, {
        ...parsed,
        email: parsed.email || null,
        commissionType: parsed.commissionType ?? null,
        commissionValue: parsed.commissionValue ?? null,
      });
      return serializeProfessional(professional);
    } catch (error) {
      throw toFriendlyError(error);
    }
  });
}

export async function setProfessionalActiveAction(input: unknown) {
  return toActionResult(async () => {
    const parsed = setProfessionalActiveInput.parse(input);
    const { company } = await requireCompanyAdmin();
    if (parsed.active) {
      const current = await getProfessionalById(company.id, parsed.id);
      if (current && !current.active) await assertProfessionalSlots(company);
    }

    await setProfessionalActive(company.id, parsed.id, parsed.active);
    syncBillingLater(company.id);
  });
}
