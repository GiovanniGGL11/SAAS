'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';

import { prisma } from '@/lib/db';
import { toActionResult } from '@/server/action-result';
import { UserError, parseId } from '@/server/errors';
import { assertFeature } from '@/server/billing/features';
import { recordAuditLog } from '@/server/data/audit';
import { requireCompanyAdmin, requireCurrentCompany } from '@/server/auth/require-current-company';
import {
  cancelClientPackage,
  cancelGiftCard,
  listClientPackages,
  listGiftCards,
  listOpenTab,
  listPackagePlans,
  receiveTab,
  savePackagePlan,
  savePackagePlanWithNewService,
  sellGiftCard,
  sellPackage,
  sellProducts,
  setPackagePlanActive,
} from '@/server/data/sales';

const method = z.enum(['CASH', 'PIX', 'CREDIT_CARD', 'DEBIT_CARD', 'BANK_TRANSFER', 'OTHER']);
const payment = z.union([z.object({ method }), z.object({ tab: z.literal(true) })]);
const id = z.string().min(1).max(64);

/*
  Vender (pacote, vale, produto) e receber fiado é da recepção: qualquer pessoa da equipe.
  Criar/editar planos e cancelar vendas é do admin.
*/

export async function listPackagePlansAction() {
  const { company } = await requireCurrentCompany();
  return listPackagePlans(company.id);
}

export async function savePackagePlanAction(input: unknown) {
  return toActionResult(async () => {
    const parsed = z
      .object({
        id: id.nullable(),
        name: z.string().trim().min(1, 'Informe o nome.').max(120),
        serviceId: id.nullable(),
        /** Serviço criado aqui mesmo: novo ou a soma de outros. */
        newService: z
          .object({
            name: z.string().trim().min(1, 'Informe o nome do serviço.').max(200),
            durationMinutes: z
              .number({ message: 'Informe a duração.' })
              .int()
              .min(5, 'Duração mínima de 5 minutos.')
              .max(600, 'Duração máxima de 10 horas.'),
            price: z.number().min(0).max(999_999),
            combineIds: z.array(id).max(10).optional(),
          })
          .nullable()
          .optional(),
        sessions: z.number().int().min(1, 'Ao menos 1 sessão.').max(100),
        price: z.number().positive('Informe o preço.').max(999_999),
        validityDays: z.number().int().min(1).max(3650).nullable().optional(),
        recurring: z.boolean(),
      })
      .parse(input);
    const { userId, company } = await requireCompanyAdmin();
    assertFeature(company, 'packages');
    const { newService, serviceId, ...plan } = parsed;
    if (newService) {
      const created = await savePackagePlanWithNewService(company.id, parsed.id, plan, newService);
      await recordAuditLog({
        companyId: company.id,
        entityType: 'Service',
        entityId: created.serviceId,
        action: 'created',
        userId,
        metadata: { source: 'package_plan', name: created.serviceName },
      });
    } else {
      if (!serviceId) throw new UserError('Escolha o serviço.');
      await savePackagePlan(company.id, parsed.id, { ...plan, serviceId });
    }
    revalidatePath('/servicos');
  });
}

export async function setPackagePlanActiveAction(input: unknown) {
  return toActionResult(async () => {
    const parsed = z.object({ id, active: z.boolean() }).parse(input);
    const { company } = await requireCompanyAdmin();
    await setPackagePlanActive(company.id, parsed.id, parsed.active);
  });
}

export async function sellPackageAction(input: unknown) {
  return toActionResult(async () => {
    const parsed = z.object({ clientId: id, planId: id, payment }).parse(input);
    const { userId, company } = await requireCurrentCompany();
    await sellPackage({ companyId: company.id, ...parsed, userId });
    revalidatePath(`/clientes/${parsed.clientId}`);
  });
}

export async function sellGiftCardAction(input: unknown) {
  return toActionResult(async () => {
    const parsed = z
      .object({
        amount: z.number().positive('Informe o valor do vale.').max(99_999),
        buyerName: z.string().max(120).optional(),
        recipientName: z.string().max(120).optional(),
        clientId: id.nullable().optional(),
        validityDays: z.number().int().min(1).max(3650).nullable().optional(),
        payment,
      })
      .parse(input);
    const { userId, company } = await requireCurrentCompany();
    const card = await sellGiftCard({ companyId: company.id, ...parsed, userId });
    return { code: card.code };
  });
}

export async function sellProductsAction(input: unknown) {
  return toActionResult(async () => {
    const parsed = z
      .object({
        clientId: id.nullable().optional(),
        items: z
          .array(z.object({ productId: id, quantity: z.number().int().min(1).max(999) }))
          .min(1)
          .max(30),
        payment,
      })
      .parse(input);
    const { userId, company } = await requireCurrentCompany();
    const result = await sellProducts({ companyId: company.id, ...parsed, userId });
    revalidatePath('/estoque');
    return result;
  });
}

export async function listGiftCardsAction() {
  const { company } = await requireCompanyAdmin();
  return listGiftCards(company.id);
}

export async function cancelGiftCardAction(rawId: unknown) {
  return toActionResult(async () => {
    const cardId = parseId(rawId);
    const { company } = await requireCompanyAdmin();
    await cancelGiftCard(company.id, cardId);
  });
}

export async function listClientPackagesAction(rawClientId: unknown) {
  const clientId = parseId(rawClientId);
  const { company } = await requireCurrentCompany();
  return listClientPackages(company.id, clientId);
}

export async function cancelClientPackageAction(rawId: unknown) {
  return toActionResult(async () => {
    const pkgId = parseId(rawId);
    const { company } = await requireCompanyAdmin();
    await cancelClientPackage(company.id, pkgId);
  });
}

export async function listOpenTabAction(rawClientId: unknown) {
  const clientId = parseId(rawClientId);
  const { company } = await requireCurrentCompany();
  return listOpenTab(company.id, clientId);
}

export async function receiveTabAction(input: unknown) {
  return toActionResult(async () => {
    const parsed = z.object({ transactionId: id, method }).parse(input);
    const { company } = await requireCurrentCompany();
    return receiveTab(company.id, parsed.transactionId, parsed.method);
  });
}

/** O que dá para usar na comanda deste atendimento: pacotes do cliente para os serviços dele. */
export async function getCheckoutOptionsAction(rawAppointmentId: unknown) {
  const appointmentId = parseId(rawAppointmentId);
  const { company } = await requireCurrentCompany();
  const appointment = await prisma.appointment.findFirst({
    where: { id: appointmentId, companyId: company.id },
    select: { clientId: true, serviceId: true, items: { select: { serviceId: true } } },
  });
  if (!appointment) return { packages: [] };
  const serviceIds = new Set([appointment.serviceId, ...appointment.items.map((i) => i.serviceId)]);
  const packages = (await listClientPackages(company.id, appointment.clientId)).filter(
    (p) => serviceIds.has(p.serviceId) && p.remaining > 0 && !p.expired,
  );
  return { packages };
}
