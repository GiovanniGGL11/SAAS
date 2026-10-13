'use server';

import { toActionResult } from '@/server/action-result';
import { parseId } from '@/server/errors';

import { z } from 'zod';

import { requireCompanyAdmin, requireCurrentCompany } from '@/server/auth/require-current-company';
import {
  createClient,
  importClients,
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
import { normalizePhone } from '@/lib/phone';

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
  });
}

export async function setClientVipAction(input: unknown) {
  return toActionResult(async () => {
    const parsed = setClientVipInput.parse(input);
    const { company } = await requireCurrentCompany();

    await setClientVip(company.id, parsed.id, parsed.isVip);
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

const importRowSchema = z.object({
  name: z.string().max(200),
  phone: z.string().max(30).optional(),
  email: z.string().max(200).optional(),
  cpf: z.string().max(20).optional(),
  birthDate: z.string().max(10).optional(),
  zipCode: z.string().max(20).optional(),
  street: z.string().max(200).optional(),
  number: z.string().max(20).optional(),
  complement: z.string().max(100).optional(),
  district: z.string().max(100).optional(),
  city: z.string().max(100).optional(),
  state: z.string().max(20).optional(),
});

// Na planilha o CEP só vale com 8 dígitos e a UF com 2 letras; o resto passa como veio.
function normalizeImportedAddress(r: z.infer<typeof importRowSchema>) {
  const zip = r.zipCode?.replace(/\D/g, '');
  const state = r.state?.trim().toUpperCase();
  return {
    zipCode: zip?.length === 8 ? zip : undefined,
    street: r.street?.trim() || undefined,
    number: r.number?.trim() || undefined,
    complement: r.complement?.trim() || undefined,
    district: r.district?.trim() || undefined,
    city: r.city?.trim() || undefined,
    state: state && /^[A-Z]{2}$/.test(state) ? state : undefined,
  };
}

export async function importClientsAction(input: unknown) {
  return toActionResult(async () => {
    const rows = z
      .array(importRowSchema)
      .max(5000, 'Importe no máximo 5.000 clientes por vez.')
      .parse(input);
    const { company } = await requireCompanyAdmin();
    const result = await importClients(
      company.id,
      rows.map((r) => ({
        name: r.name,
        phone: normalizePhone(r.phone),
        email: r.email?.includes('@') ? r.email.trim().toLowerCase() : undefined,
        cpf: r.cpf?.replace(/\D/g, '') || undefined,
        birthDate:
          r.birthDate && /^\d{4}-\d{2}-\d{2}$/.test(r.birthDate)
            ? new Date(r.birthDate)
            : undefined,
        ...normalizeImportedAddress(r),
      })),
    );
    return result;
  });
}
