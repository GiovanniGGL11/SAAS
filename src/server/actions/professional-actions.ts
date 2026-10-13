'use server';

import { toActionResult } from '@/server/action-result';
import { parseId } from '@/server/errors';

import { requireCompanyAdmin, requireCurrentCompany } from '@/server/auth/require-current-company';
import {
  createProfessional,
  getProfessionalMonthlyProduction,
  listAllProfessionals,
  setProfessionalActive,
  updateProfessional,
} from '@/server/data/professionals';
import { professionalInput, setProfessionalActiveInput } from '@/lib/validations/professional';
import { serializeProfessional } from '@/lib/serialize';
import { Prisma } from '@/generated/prisma/client';
import { UserError } from '@/server/errors';

function toFriendlyError(error: unknown): Error {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    return new UserError('Já existe um profissional com este email.');
  }
  return error instanceof Error ? error : new Error('Erro inesperado.');
}

export async function listProfessionalsAction() {
  const { company } = await requireCurrentCompany();
  const professionals = await listAllProfessionals(company.id);

  const withProduction = await Promise.all(
    professionals.map(async (professional) => ({
      ...serializeProfessional(professional),
      production: await getProfessionalMonthlyProduction(company.id, professional.id),
    })),
  );

  return withProduction;
}

export async function createProfessionalAction(input: unknown) {
  return toActionResult(async () => {
    const parsed = professionalInput.parse(input);
    const { company } = await requireCompanyAdmin();

    try {
      const professional = await createProfessional(company.id, {
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

    await setProfessionalActive(company.id, parsed.id, parsed.active);
  });
}
