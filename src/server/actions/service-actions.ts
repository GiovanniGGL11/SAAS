'use server';

import { revalidatePath } from 'next/cache';

import { requireCurrentCompany } from '@/server/auth/require-current-company';
import {
  createService,
  listAllServices,
  setServiceActive,
  updateService,
} from '@/server/data/services';
import { serviceInput, setServiceActiveInput } from '@/lib/validations/service';
import { serializeService } from '@/lib/serialize';

export async function listServicesAction() {
  const { company } = await requireCurrentCompany();
  const services = await listAllServices(company.id);
  return services.map(serializeService);
}

export async function createServiceAction(input: unknown) {
  const parsed = serviceInput.parse(input);
  const { company } = await requireCurrentCompany();

  const service = await createService(company.id, parsed);
  revalidatePath('/servicos');
  revalidatePath('/agenda');
  return serializeService(service);
}

export async function updateServiceAction(id: string, input: unknown) {
  const parsed = serviceInput.parse(input);
  const { company } = await requireCurrentCompany();

  const service = await updateService(company.id, id, parsed);
  revalidatePath('/servicos');
  revalidatePath('/agenda');
  return serializeService(service);
}

export async function setServiceActiveAction(input: unknown) {
  const parsed = setServiceActiveInput.parse(input);
  const { company } = await requireCurrentCompany();

  await setServiceActive(company.id, parsed.id, parsed.active);
  revalidatePath('/servicos');
  revalidatePath('/agenda');
}
