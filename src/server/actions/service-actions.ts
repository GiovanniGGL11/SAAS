'use server';

import { toActionResult } from '@/server/action-result';
import { parseId } from '@/server/errors';

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

export async function listServicesAction() {
  const { company } = await requireCurrentCompany();
  const services = await listAllServices(company.id);
  return services.map(serializeService);
}

export async function createServiceAction(input: unknown) {
  return toActionResult(async () => {
    const parsed = serviceInput.parse(input);
    const { userId, company } = await requireCompanyAdmin();

    const service = await createService(company.id, parsed);
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

    const service = await updateService(company.id, id, parsed);
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
