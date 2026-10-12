'use server';

import { parseId } from '@/server/errors';

import { revalidatePath } from 'next/cache';

import { requireCompanyAdmin, requireCurrentCompany } from '@/server/auth/require-current-company';
import { prisma } from '@/lib/db';
import {
  cancelAppointment,
  createAppointment,
  createScheduleBlock,
  deleteScheduleBlock,
  findNextAvailableSlot,
  getScheduleContext,
  getProfessionalAvailability,
  resizeAppointment,
  setProfessionalAvailability,
  listAppointmentsInRange,
  moveAppointment,
  updateAppointmentStatus,
} from '@/server/data/appointments';
import {
  appointmentRangeInput,
  cancelAppointmentInput,
  createAppointmentInput,
  createScheduleBlockInput,
  deleteScheduleBlockInput,
  moveAppointmentInput,
  nextAvailableSlotInput,
  professionalAvailabilityInput,
  resizeAppointmentInput,
  scheduleContextInput,
  updateAppointmentStatusInput,
} from '@/lib/validations/appointment';
import { serializeAppointment } from '@/lib/serialize';
import { toActionResult } from '@/server/action-result';

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

  /*
    "Cliente novo" no card: é a primeira visita quando não existe agendamento não cancelado dele
    antes deste. Uma consulta agrupada para o período todo, não uma por card.
  */
  const clientIds = [...new Set(appointments.map((a) => a.clientId))];
  const firstVisits = clientIds.length
    ? await prisma.appointment.groupBy({
        by: ['clientId'],
        where: { companyId: company.id, clientId: { in: clientIds }, status: { not: 'CANCELED' } },
        _min: { startAt: true },
      })
    : [];
  const firstStartByClient = new Map(
    firstVisits.map((f) => [f.clientId, f._min.startAt?.getTime()]),
  );

  return appointments.map((appointment) => ({
    ...serializeAppointment(appointment),
    isFirstVisit:
      appointment.status !== 'CANCELED' &&
      firstStartByClient.get(appointment.clientId) === appointment.startAt.getTime(),
  }));
}

export async function getScheduleContextAction(input: unknown) {
  const parsed = scheduleContextInput.parse(input);
  const { company } = await requireCurrentCompany();
  return getScheduleContext(company.id, parsed);
}

export async function createAppointmentAction(input: unknown) {
  return toActionResult(async () => {
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
  });
}

export async function moveAppointmentAction(input: unknown) {
  return toActionResult(async () => {
    const parsed = moveAppointmentInput.parse(input);
    const { userId, company } = await requireCurrentCompany();

    const appointment = await moveAppointment({
      companyId: company.id,
      id: parsed.id,
      startAt: parsed.startAt,
      professionalId: parsed.professionalId,
      updatedByUserId: userId,
    });

    revalidatePath('/agenda');
    return serializeAppointment(appointment);
  });
}

export async function updateAppointmentStatusAction(input: unknown) {
  return toActionResult(async () => {
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
  });
}

export async function cancelAppointmentAction(input: unknown) {
  return toActionResult(async () => {
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
  });
}

export async function createScheduleBlockAction(input: unknown) {
  return toActionResult(async () => {
    const parsed = createScheduleBlockInput.parse(input);
    const { userId, company } = await requireCurrentCompany();
    const block = await createScheduleBlock({
      companyId: company.id,
      ...parsed,
      createdByUserId: userId,
    });
    revalidatePath('/agenda');
    return { id: block.id };
  });
}

export async function deleteScheduleBlockAction(input: unknown) {
  return toActionResult(async () => {
    const parsed = deleteScheduleBlockInput.parse(input);
    const { userId, company } = await requireCurrentCompany();
    await deleteScheduleBlock({ companyId: company.id, id: parsed.id, userId });
    revalidatePath('/agenda');
    return { id: parsed.id };
  });
}

export async function findNextAvailableSlotAction(input: unknown) {
  return toActionResult(async () => {
    const parsed = nextAvailableSlotInput.parse(input);
    const { company } = await requireCurrentCompany();
    return findNextAvailableSlot({ companyId: company.id, timezone: company.timezone, ...parsed });
  });
}

export async function resizeAppointmentAction(input: unknown) {
  return toActionResult(async () => {
    const parsed = resizeAppointmentInput.parse(input);
    const { userId, company } = await requireCurrentCompany();
    const appointment = await resizeAppointment({
      companyId: company.id,
      ...parsed,
      updatedByUserId: userId,
    });
    revalidatePath('/agenda');
    return serializeAppointment(appointment);
  });
}

export async function getProfessionalAvailabilityAction(rawProfessionalId: unknown) {
  const professionalId = parseId(rawProfessionalId);
  const { company } = await requireCurrentCompany();
  return getProfessionalAvailability(company.id, professionalId);
}

export async function setProfessionalAvailabilityAction(input: unknown) {
  return toActionResult(async () => {
    const parsed = professionalAvailabilityInput.parse(input);
    const { company } = await requireCompanyAdmin();
    await setProfessionalAvailability({ companyId: company.id, ...parsed });
    revalidatePath('/agenda');
    revalidatePath('/profissionais');
    return { ok: true };
  });
}
