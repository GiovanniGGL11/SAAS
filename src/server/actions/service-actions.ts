'use server';

import { z } from 'zod';

import { prisma } from '@/lib/db';
import { toActionResult } from '@/server/action-result';
import { UserError, parseId } from '@/server/errors';

import { requireCompanyAdmin, requireCurrentCompany } from '@/server/auth/require-current-company';
import {
  createService,
  listAllServices,
  setServiceActive,
  updateService,
} from '@/server/data/services';
import { serviceInput, setServiceActiveInput } from '@/lib/validations/service';
import { serializeService } from '@/lib/serialize';
import { recordAuditLog } from '@/server/data/audit';
import { assertFeature } from '@/server/billing/features';
import {
  assertSupplies,
  listServiceSupplies,
  setServiceSupplies,
} from '@/server/data/service-supplies';
import {
  assertStaffing,
  listServiceStaffing,
  saveServiceStaffing,
  type Staffing,
} from '@/server/data/service-professionals';

export async function listServicesAction() {
  const { company } = await requireCurrentCompany();
  const services = await listAllServices(company.id);
  return services.map(serializeService);
}

export async function createServiceAction(input: unknown) {
  return toActionResult(async () => {
    const parsed = serviceInput.parse(input);
    const { userId, company } = await requireCompanyAdmin();

    const { supplies, professionals, ...fields } = parsed;
    if (fields.checklistItems?.length) assertFeature(company, 'checklists');
    // Confere estoque e profissionais antes de criar o serviço (nada fica pela metade).
    await assertSupplies(company.id, supplies ?? []);
    await assertStaffing(company.id, professionals ?? []);
    const service = await createService(company.id, fields);
    if (supplies?.length) await setServiceSupplies(company.id, service.id, supplies);
    if (professionals?.length) await saveServiceStaffing(company.id, service.id, professionals);
    await recordAuditLog({
      companyId: company.id,
      entityType: 'Service',
      entityId: service.id,
      action: 'created',
      userId,
      metadata: { source: 'app', name: service.name },
    });
    return serializeService(service);
  });
}

export async function updateServiceAction(rawId: unknown, input: unknown) {
  return toActionResult(async () => {
    const id = parseId(rawId);
    const parsed = serviceInput.parse(input);
    const { userId, company } = await requireCompanyAdmin();

    const { supplies, professionals, ...fields } = parsed;
    if (fields.checklistItems?.length) assertFeature(company, 'checklists');
    await assertSupplies(company.id, supplies ?? []);
    await assertStaffing(company.id, professionals ?? []);
    const service = await updateService(company.id, id, fields);
    // `undefined` mantém a lista atual; lista vazia limpa (o serviço deixa de consumir estoque).
    if (supplies !== undefined) await setServiceSupplies(company.id, service.id, supplies);
    // Profissionais: `undefined` mantém; lista vazia = todos fazem pelo preço do serviço.
    if (professionals !== undefined)
      await saveServiceStaffing(company.id, service.id, professionals);
    await recordAuditLog({
      companyId: company.id,
      entityType: 'Service',
      entityId: service.id,
      action: 'updated',
      userId,
      metadata: { source: 'app', name: service.name },
    });
    return serializeService(service);
  });
}

export async function setServiceActiveAction(input: unknown) {
  return toActionResult(async () => {
    const parsed = setServiceActiveInput.parse(input);
    const { userId, company } = await requireCompanyAdmin();

    await setServiceActive(company.id, parsed.id, parsed.active);
    await recordAuditLog({
      companyId: company.id,
      entityType: 'Service',
      entityId: parsed.id,
      action: 'updated',
      userId,
      metadata: { source: 'app', active: parsed.active },
    });
  });
}

/** Materiais que o serviço consome, com o saldo atual de cada um. */
export async function getServiceSuppliesAction(rawId: unknown) {
  const id = parseId(rawId);
  const { company } = await requireCurrentCompany();
  return listServiceSupplies(company.id, id);
}

/**
 * Cadastro do serviço: profissionais ativos e quem faz este serviço (com o preço de cada um).
 * Sem `serviceId` (serviço novo), só a lista de profissionais.
 */
export async function getServiceStaffingAction(input: unknown) {
  return toActionResult(async () => {
    const { serviceId } = z
      .object({ serviceId: z.string().min(1).max(64).nullable() })
      .parse(input);
    const { company } = await requireCurrentCompany();
    const [professionals, staffing] = await Promise.all([
      prisma.professional.findMany({
        where: { companyId: company.id, active: true },
        select: { id: true, name: true, color: true },
        orderBy: { name: 'asc' },
      }),
      serviceId
        ? listServiceStaffing(company.id, serviceId)
        : Promise.resolve<Staffing>({ professionalIds: null, prices: {} }),
    ]);
    return { professionals, staffing };
  });
}

/** Link do cliente: liga/desliga o serviço no agendamento online, sem abrir o cadastro. */
export async function setServicePublicVisibleAction(input: unknown) {
  return toActionResult(async () => {
    const parsed = z
      .object({ id: z.string().min(1).max(64), publicVisible: z.boolean() })
      .parse(input);
    const { userId, company } = await requireCompanyAdmin();
    const result = await prisma.service.updateMany({
      where: { id: parsed.id, companyId: company.id },
      data: { publicVisible: parsed.publicVisible },
    });
    if (result.count === 0) throw new UserError('Serviço não encontrado.');
    await recordAuditLog({
      companyId: company.id,
      entityType: 'Service',
      entityId: parsed.id,
      action: 'updated',
      userId,
      metadata: { source: 'app', publicVisible: parsed.publicVisible },
    });
    return { publicVisible: parsed.publicVisible };
  });
}
