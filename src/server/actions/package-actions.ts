'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';

import { toActionResult } from '@/server/action-result';
import { parseId } from '@/server/errors';
import { requireCompanyAdmin, requireCurrentCompany } from '@/server/auth/require-current-company';
import { requireFormAccess } from '@/server/auth/form-access';
import {
  adjustPackage,
  createClientPackage,
  extendPackage,
  finalizeSessionRecord,
  getClientPackagesDetail,
  getSessionRecord,
  listClientSessions,
  listCompatiblePackages,
  receivePackagePayment,
  saveSessionRecord,
  signSessionRecord,
} from '@/server/data/package-sessions';
import { ensureMembershipRenewals } from '@/server/data/sales';

const id = z.string().min(1).max(64);
const method = z.enum(['CASH', 'PIX', 'CREDIT_CARD', 'DEBIT_CARD', 'BANK_TRANSFER', 'OTHER']);

/*
  Pacotes no cliente e registro das sessões. Vender e receber é da equipe (como na tela de
  vendas); saldo inicial, ampliação e correção mexem no que já foi pago/feito — só administrador.
  Conteúdo dos registros segue as permissões de fichas.
*/

export async function getClientPackagesAction(rawClientId: unknown) {
  const clientId = parseId(rawClientId);
  const { company } = await requireCurrentCompany();
  await ensureMembershipRenewals(company.id);
  return getClientPackagesDetail(company.id, clientId);
}

const packageInput = z.object({
  clientId: id,
  planId: id.nullable().optional(),
  name: z.string().trim().min(1, 'Informe o nome do pacote.').max(120),
  serviceId: id,
  sessionsTotal: z.number().int().min(1, 'Ao menos 1 sessão.').max(200),
  price: z.number().min(0).max(999_999),
  contractedAt: z.coerce.date(),
  validUntil: z.coerce.date().nullable().optional(),
  responsibleProfessionalId: id.nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  initialFormTemplateId: id.nullable().optional(),
  sessionFormTemplateId: id.nullable().optional(),
  requireSignature: z.boolean(),
  payment: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('full'), method }),
    z.object({ kind: z.literal('partial'), amount: z.number().positive().max(999_999), method }),
    z.object({ kind: z.literal('tab') }),
    z.object({ kind: z.literal('later') }),
  ]),
  opening: z
    .object({
      sessionsDone: z.number().int().min(0).max(200),
      paidAmount: z.number().min(0).max(999_999),
    })
    .nullable()
    .optional(),
});

export async function createClientPackageAction(input: unknown) {
  return toActionResult(async () => {
    const parsed = packageInput.parse(input);
    // Saldo inicial declara valores já pagos sem lançamento: só administrador.
    const { company, userId } = parsed.opening
      ? await requireCompanyAdmin()
      : await requireCurrentCompany();
    const pkg = await createClientPackage({ companyId: company.id, userId, ...parsed });
    revalidatePath(`/clientes/${parsed.clientId}`);
    return { id: pkg.id };
  });
}

export async function receivePackagePaymentAction(input: unknown) {
  return toActionResult(async () => {
    const parsed = z
      .object({ clientPackageId: id, amount: z.number().positive().max(999_999), method })
      .parse(input);
    const { company, userId } = await requireCurrentCompany();
    await receivePackagePayment({ companyId: company.id, userId, ...parsed });
    revalidatePath('/financeiro');
  });
}

export async function extendPackageAction(input: unknown) {
  return toActionResult(async () => {
    const parsed = z
      .object({
        clientPackageId: id,
        sessions: z.number().int().min(1).max(100),
        extraPrice: z.number().min(0).max(999_999),
        reason: z.string().trim().min(3, 'Informe o motivo.').max(300),
      })
      .parse(input);
    const { company, userId } = await requireCompanyAdmin();
    await extendPackage({ companyId: company.id, userId, ...parsed });
  });
}

export async function adjustPackageAction(input: unknown) {
  return toActionResult(async () => {
    const parsed = z
      .object({
        clientPackageId: id,
        delta: z.number().int().min(-200).max(200),
        reason: z.string().trim().min(3, 'Informe o motivo da correção.').max(300),
      })
      .parse(input);
    const { company, userId } = await requireCompanyAdmin();
    await adjustPackage({ companyId: company.id, userId, ...parsed });
  });
}

export async function listCompatiblePackagesAction(input: unknown) {
  const parsed = z
    .object({ clientId: id, serviceIds: z.array(id).min(1).max(6), at: z.coerce.date() })
    .parse(input);
  const { company } = await requireCurrentCompany();
  return listCompatiblePackages(company.id, parsed.clientId, parsed.serviceIds, parsed.at);
}

// ---- Registro da sessão ------------------------------------------------------------------------

export async function getSessionRecordAction(rawAppointmentId: unknown) {
  return toActionResult(async () => {
    const appointmentId = parseId(rawAppointmentId);
    const { company, access } = await requireFormAccess();
    return getSessionRecord(company.id, access, appointmentId);
  });
}

const optionalText = z.string().trim().max(5000).nullable().optional();

export async function saveSessionRecordAction(input: unknown) {
  return toActionResult(async () => {
    const parsed = z
      .object({
        appointmentId: id,
        procedure: z.string().trim().min(1, 'Descreva o que foi feito na sessão.').max(5000),
        clientReport: optionalText,
        orientations: optionalText,
        nextReturn: z.string().trim().max(300).nullable().optional(),
        internalNotes: optionalText,
        amendmentReason: z.string().trim().max(500).nullable().optional(),
      })
      .parse(input);
    const { company, access } = await requireFormAccess();
    return saveSessionRecord({
      companyId: company.id,
      access,
      appointmentId: parsed.appointmentId,
      content: parsed,
      amendmentReason: parsed.amendmentReason,
    });
  });
}

export async function finalizeSessionRecordAction(rawAppointmentId: unknown) {
  return toActionResult(async () => {
    const appointmentId = parseId(rawAppointmentId);
    const { company, access } = await requireFormAccess();
    await finalizeSessionRecord({ companyId: company.id, access, appointmentId });
  });
}

export async function signSessionRecordAction(input: unknown) {
  return toActionResult(async () => {
    const parsed = z
      .object({
        appointmentId: id,
        version: z.number().int().min(1),
        contentHash: z.string().regex(/^[a-f0-9]{64}$/),
        signerName: z.string().trim().min(2, 'Informe o nome de quem assina.').max(120),
        image: z.string().max(400_000),
        strokes: z.number().int().min(0).max(10_000),
      })
      .parse(input);
    const { company, access } = await requireFormAccess();
    await signSessionRecord({ companyId: company.id, access, ...parsed });
  });
}

export async function listClientSessionsAction(input: unknown) {
  const parsed = z.object({ clientId: id, packageId: id.nullable().optional() }).parse(input);
  const { company, access } = await requireFormAccess();
  return listClientSessions(company.id, access, parsed.clientId, { packageId: parsed.packageId });
}
