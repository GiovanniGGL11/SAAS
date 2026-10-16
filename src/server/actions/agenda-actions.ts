'use server';

import { parseId } from '@/server/errors';

import { revalidatePath } from 'next/cache';

import { requireCompanyAdmin, requireCurrentCompany } from '@/server/auth/require-current-company';
import { prisma } from '@/lib/db';
import {
  AppointmentConflictError,
  cancelAppointment,
  checkoutAppointment,
  updateAppointmentDetails,
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
  checkoutAppointmentInput,
  updateAppointmentDetailsInput,
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
import { scheduleGoogleSync } from '@/server/google/background';
import { scheduleConfirmation, scheduleReviewRequest } from '@/server/whatsapp/automation';
import { buildConfirmationMessage } from '@/server/confirmation-message';
import { findWaitlistMatchesForFreedSlot } from '@/server/data/waitlist';
import { PackageUnavailableError } from '@/server/data/package-sessions';
import { releaseExpiredDeposits } from '@/server/billing/deposit';

export async function getAppointmentsForRangeAction(input: unknown) {
  const parsed = appointmentRangeInput.parse(input);
  const { company } = await requireCurrentCompany();
  // Sinal PIX vencido libera o horário antes de mostrar a agenda (rápido quando não há nenhum).
  if (company.depositPercent > 0) {
    await releaseExpiredDeposits(company.id).catch((error) => console.error('[sinal]', error));
  }

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

    const create = (startAt: Date, clientPackageId: string | null) =>
      createAppointment({
        companyId: company.id,
        clientId: parsed.clientId,
        professionalId: parsed.professionalId,
        serviceId: parsed.serviceId,
        extraServiceIds: parsed.extraServiceIds,
        startAt,
        notes: parsed.notes,
        clientPackageId,
        createdByUserId: userId,
      });

    // O primeiro precisa entrar: conflito (ou pacote que não serve) nele é erro para quem agenda.
    const appointment = await create(parsed.startAt, parsed.clientPackageId ?? null);
    const createdIds = [appointment.id];
    const skipped: string[] = [];
    let repeated = 0;
    // Repetições além do saldo do pacote entram como atendimento avulso (e são avisadas).
    let repeatPackage = parsed.clientPackageId ?? null;
    let withoutPackage = 0;
    if (parsed.repeat) {
      // Recorrência: as próximas datas no mesmo horário; ocupadas são puladas e avisadas.
      for (let i = 1; i < parsed.repeat.times; i++) {
        const startAt = new Date(
          parsed.startAt.getTime() + i * parsed.repeat.everyWeeks * 7 * 86_400_000,
        );
        try {
          let created;
          try {
            created = await create(startAt, repeatPackage);
          } catch (error) {
            if (!(repeatPackage && error instanceof PackageUnavailableError)) throw error;
            repeatPackage = null;
            created = await create(startAt, null);
          }
          if (parsed.clientPackageId && !repeatPackage) withoutPackage++;
          createdIds.push(created.id);
          repeated++;
        } catch (error) {
          if (error instanceof AppointmentConflictError) {
            skipped.push(
              new Intl.DateTimeFormat('pt-BR', {
                timeZone: company.timezone,
                day: '2-digit',
                month: '2-digit',
              }).format(startAt),
            );
          } else throw error;
        }
      }
    }

    scheduleGoogleSync(company.id, createdIds);
    // WhatsApp automático (se ligado): confirmação do primeiro horário marcado.
    scheduleConfirmation(company.id, appointment.id);
    revalidatePath('/agenda');

    // Mensagem de WhatsApp para o cliente confirmar. O agendamento já existe: se montar a
    // mensagem falhar, a criação não pode falhar junto.
    const confirmation = await buildConfirmationMessage(company.id, appointment.id).catch(
      () => null,
    );
    return {
      ...serializeAppointment(appointment),
      repeated,
      skipped,
      withoutPackage,
      confirmation,
    };
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

    scheduleGoogleSync(company.id, [appointment.id]);
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

    scheduleGoogleSync(company.id, [appointment.id]);
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

    scheduleGoogleSync(company.id, [appointment.id]);
    revalidatePath('/agenda');
    // A vaga que abriu: quem da lista de espera cabe nela. Falhar aqui não desfaz o cancelamento.
    const waitlistMatches = await findWaitlistMatchesForFreedSlot(company.id, company.timezone, {
      professionalId: appointment.professionalId,
      startAt: appointment.startAt,
      endAt: appointment.endAt,
    }).catch(() => []);
    return { ...serializeAppointment(appointment), waitlistMatches };
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
    scheduleGoogleSync(company.id, [appointment.id]);
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

export async function checkoutAppointmentAction(input: unknown) {
  return toActionResult(async () => {
    const parsed = checkoutAppointmentInput.parse(input);
    const { userId, company } = await requireCurrentCompany();
    const result = await checkoutAppointment({
      companyId: company.id,
      ...parsed,
      updatedByUserId: userId,
    });
    scheduleGoogleSync(company.id, [result.appointment.id]);
    scheduleReviewRequest(company.id, result.appointment.id);
    revalidatePath('/agenda');
    revalidatePath('/financeiro');
    return { total: result.total };
  });
}

export async function updateAppointmentDetailsAction(input: unknown) {
  return toActionResult(async () => {
    const parsed = updateAppointmentDetailsInput.parse(input);
    const { userId, company } = await requireCurrentCompany();
    const appointment = await updateAppointmentDetails({
      companyId: company.id,
      ...parsed,
      updatedByUserId: userId,
    });
    scheduleGoogleSync(company.id, [appointment.id]);
    revalidatePath('/agenda');
    return serializeAppointment(appointment);
  });
}
