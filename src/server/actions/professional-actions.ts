'use server';

import { revalidatePath } from 'next/cache';

import { requireCurrentCompany } from '@/server/auth/require-current-company';
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

function toFriendlyError(error: unknown): Error {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    return new Error('Já existe um profissional com este email.');
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
  const parsed = professionalInput.parse(input);
  const { company } = await requireCurrentCompany();

  try {
    const professional = await createProfessional(company.id, {
      ...parsed,
      email: parsed.email || null,
      commissionType: parsed.commissionType ?? null,
      commissionValue: parsed.commissionValue ?? null,
    });
    revalidatePath('/profissionais');
    revalidatePath('/agenda');
    return serializeProfessional(professional);
  } catch (error) {
    throw toFriendlyError(error);
  }
}

export async function updateProfessionalAction(id: string, input: unknown) {
  const parsed = professionalInput.parse(input);
  const { company } = await requireCurrentCompany();

  try {
    const professional = await updateProfessional(company.id, id, {
      ...parsed,
      email: parsed.email || null,
      commissionType: parsed.commissionType ?? null,
      commissionValue: parsed.commissionValue ?? null,
    });
    revalidatePath('/profissionais');
    revalidatePath('/agenda');
    return serializeProfessional(professional);
  } catch (error) {
    throw toFriendlyError(error);
  }
}

export async function setProfessionalActiveAction(input: unknown) {
  const parsed = setProfessionalActiveInput.parse(input);
  const { company } = await requireCurrentCompany();

  await setProfessionalActive(company.id, parsed.id, parsed.active);
  revalidatePath('/profissionais');
  revalidatePath('/agenda');
}
