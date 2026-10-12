'use server';

import { toActionResult } from '@/server/action-result';
import { parseId } from '@/server/errors';

import { revalidatePath } from 'next/cache';

import { requireCurrentCompany } from '@/server/auth/require-current-company';
import {
  createClient,
  getClientById,
  getClientStats,
  listClientAppointmentHistory,
  listClients,
  setClientActive,
  setClientVip,
  updateClient,
} from '@/server/data/clients';
import { clientInput, setClientActiveInput, setClientVipInput } from '@/lib/validations/client';
import { serializeAppointment } from '@/lib/serialize';
import { Prisma } from '@/generated/prisma/client';
import { UserError } from '@/server/errors';

function toFriendlyError(error: unknown): Error {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    return new UserError('Já existe um cliente com este telefone.');
  }
  return error instanceof Error ? error : new Error('Erro inesperado.');
}

export async function listClientsAction() {
  const { company } = await requireCurrentCompany();
  return listClients(company.id);
}

export async function createClientAction(input: unknown) {
  return toActionResult(async () => {
    const parsed = clientInput.parse(input);
    const { company } = await requireCurrentCompany();

    try {
      const client = await createClient(company.id, {
        ...parsed,
        email: parsed.email || null,
        birthDate: parsed.birthDate ?? null,
      });
      revalidatePath('/clientes');
      revalidatePath('/agenda');
      return client;
    } catch (error) {
      throw toFriendlyError(error);
    }
  });
}

export async function updateClientAction(rawId: unknown, input: unknown) {
  return toActionResult(async () => {
    const id = parseId(rawId);
    const parsed = clientInput.parse(input);
    const { company } = await requireCurrentCompany();

    try {
      const client = await updateClient(company.id, id, {
        ...parsed,
        email: parsed.email || null,
        birthDate: parsed.birthDate ?? null,
      });
      revalidatePath('/clientes');
      revalidatePath('/agenda');
      return client;
    } catch (error) {
      throw toFriendlyError(error);
    }
  });
}

export async function setClientActiveAction(input: unknown) {
  return toActionResult(async () => {
    const parsed = setClientActiveInput.parse(input);
    const { company } = await requireCurrentCompany();

    await setClientActive(company.id, parsed.id, parsed.active);
    revalidatePath('/clientes');
    revalidatePath('/agenda');
  });
}

export async function setClientVipAction(input: unknown) {
  return toActionResult(async () => {
    const parsed = setClientVipInput.parse(input);
    const { company } = await requireCurrentCompany();

    await setClientVip(company.id, parsed.id, parsed.isVip);
    revalidatePath('/clientes');
  });
}

export async function getClientDetailAction(rawId: unknown) {
  const id = parseId(rawId);
  const { company } = await requireCurrentCompany();

  const [client, stats, history] = await Promise.all([
    getClientById(company.id, id),
    getClientStats(company.id, id),
    listClientAppointmentHistory(company.id, id),
  ]);

  if (!client) return null;

  return {
    client,
    stats,
    history: history.map(serializeAppointment),
  };
}
