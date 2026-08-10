'use server';

import { revalidatePath } from 'next/cache';

import { requireCurrentCompany } from '@/server/auth/require-current-company';
import {
  cancelAppointment,
  createAppointment,
  listAppointmentsInRange,
  moveAppointment,
  updateAppointmentStatus,
} from '@/server/data/appointments';
import {
  appointmentRangeInput,
  cancelAppointmentInput,
  createAppointmentInput,
  moveAppointmentInput,
  updateAppointmentStatusInput,
} from '@/lib/validations/appointment';
import { serializeAppointment } from '@/lib/serialize';

export async function getAppointmentsForRangeAction(input: unknown) {
  const parsed = appointmentRangeInput.parse(input);
  const { company } = await requireCurrentCompany();

  const appointments = await listAppointmentsInRange(
    company.id,
    { startAt: parsed.startAt, endAt: parsed.endAt },
    {
      professionalId: parsed.professionalId,
      serviceId: parsed.serviceId,
      status: parsed.status,
    },
  );

  return appointments.map(serializeAppointment);
}

export async function createAppointmentAction(input: unknown) {
  const parsed = createAppointmentInput.parse(input);
  const { userId, company } = await requireCurrentCompany();

  const appointment = await createAppointment({
    companyId: company.id,
    clientId: parsed.clientId,
    professionalId: parsed.professionalId,
    serviceId: parsed.serviceId,
    startAt: parsed.startAt,
    notes: parsed.notes,
    createdByUserId: userId,
  });

  revalidatePath('/agenda');
  return serializeAppointment(appointment);
}

export async function moveAppointmentAction(input: unknown) {
  const parsed = moveAppointmentInput.parse(input);
  const { userId, company } = await requireCurrentCompany();

  const appointment = await moveAppointment({
    companyId: company.id,
    id: parsed.id,
    startAt: parsed.startAt,
    updatedByUserId: userId,
  });

  revalidatePath('/agenda');
  return serializeAppointment(appointment);
}

export async function updateAppointmentStatusAction(input: unknown) {
  const parsed = updateAppointmentStatusInput.parse(input);
  const { userId, company } = await requireCurrentCompany();

  const appointment = await updateAppointmentStatus({
    companyId: company.id,
    id: parsed.id,
    status: parsed.status,
    updatedByUserId: userId,
  });

  revalidatePath('/agenda');
  return serializeAppointment(appointment);
}

export async function cancelAppointmentAction(input: unknown) {
  const parsed = cancelAppointmentInput.parse(input);
  const { userId, company } = await requireCurrentCompany();

  const appointment = await cancelAppointment({
    companyId: company.id,
    id: parsed.id,
    canceledByUserId: userId,
    reason: parsed.reason,
  });

  revalidatePath('/agenda');
  return serializeAppointment(appointment);
}
