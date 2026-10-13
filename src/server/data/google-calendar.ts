import { prisma } from '@/lib/db';
import type { GoogleCalendarConnection } from '@/generated/prisma/client';
import { UserError } from '@/server/errors';
import { encryptSecret } from '@/server/google/crypto';
import {
  GoogleAuthRevokedError,
  openCalendarSession,
  revokeRefreshToken,
  type GoogleEventInput,
} from '@/server/google/client';
import { formatCurrencyBRL } from '@/lib/serialize';

/** Appointments in these states belong on the calendar; the rest are removed from it. */
const ON_CALENDAR = ['SCHEDULED', 'CONFIRMED', 'IN_PROGRESS', 'DONE'] as const;

/** Cap on the initial copy of future appointments, so connecting stays quick. */
const BACKFILL_LIMIT = 150;

export type GoogleCalendarStatus = {
  connected: boolean;
  email: string | null;
  needsReconnect: boolean;
  professionalIds: string[];
};

export async function getConnectionStatus(
  companyId: string,
  userId: string,
): Promise<GoogleCalendarStatus> {
  const connection = await prisma.googleCalendarConnection.findUnique({
    where: { companyId_userId: { companyId, userId } },
  });
  return {
    connected: !!connection,
    email: connection?.googleEmail ?? null,
    needsReconnect: connection?.needsReconnect ?? false,
    professionalIds: connection?.professionalIds ?? [],
  };
}

/** Keeps only ids that belong to this company — the client sends them, so never trust them. */
async function ownedProfessionalIds(companyId: string, ids: string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const rows = await prisma.professional.findMany({
    where: { companyId, id: { in: ids } },
    select: { id: true },
  });
  return rows.map((row) => row.id);
}

export async function saveConnection(params: {
  companyId: string;
  userId: string;
  googleEmail: string;
  refreshToken: string;
  professionalIds: string[];
}): Promise<GoogleCalendarConnection> {
  const professionalIds = await ownedProfessionalIds(params.companyId, params.professionalIds);
  const refreshTokenEnc = encryptSecret(params.refreshToken);

  return prisma.googleCalendarConnection.upsert({
    where: { companyId_userId: { companyId: params.companyId, userId: params.userId } },
    create: {
      companyId: params.companyId,
      userId: params.userId,
      googleEmail: params.googleEmail,
      refreshTokenEnc,
      professionalIds,
    },
    // Reconnecting (possibly with another Google account) keeps the chosen professionals
    // unless the connect screen passed a new selection.
    update: {
      googleEmail: params.googleEmail,
      refreshTokenEnc,
      needsReconnect: false,
      ...(professionalIds.length > 0 ? { professionalIds } : {}),
    },
  });
}

/** Changes which professionals feed the calendar; copies in new ones, clears removed ones. */
export async function setConnectionProfessionals(
  companyId: string,
  userId: string,
  requestedIds: string[],
): Promise<void> {
  const connection = await prisma.googleCalendarConnection.findUnique({
    where: { companyId_userId: { companyId, userId } },
  });
  if (!connection) throw new UserError('Conecte sua conta Google primeiro.');

  const professionalIds = await ownedProfessionalIds(companyId, requestedIds);
  const removed = connection.professionalIds.filter((id) => !professionalIds.includes(id));

  await prisma.googleCalendarConnection.update({
    where: { id: connection.id },
    data: { professionalIds },
  });

  if (removed.length > 0) await removeEventsForProfessionals(connection.id, removed);
  await backfillConnection(connection.id);
}

export async function disconnectGoogleCalendar(companyId: string, userId: string): Promise<void> {
  const connection = await prisma.googleCalendarConnection.findUnique({
    where: { companyId_userId: { companyId, userId } },
  });
  if (!connection) return;

  // Events already in the user's Google Calendar stay — they're theirs now. We just
  // stop touching them and tell Google to forget our access.
  await revokeRefreshToken(connection.refreshTokenEnc).catch(() => undefined);
  await prisma.googleCalendarConnection.delete({ where: { id: connection.id } });
}

type AppointmentForSync = NonNullable<Awaited<ReturnType<typeof loadAppointment>>>;

async function loadAppointment(companyId: string, appointmentId: string) {
  return prisma.appointment.findFirst({
    where: { id: appointmentId, companyId },
    include: {
      client: { select: { name: true, phone: true } },
      professional: { select: { name: true } },
      company: { select: { timezone: true } },
    },
  });
}

function toEvent(appointment: AppointmentForSync): GoogleEventInput {
  const lines = [
    `Cliente: ${appointment.client.name}${appointment.client.phone ? ` · ${appointment.client.phone}` : ''}`,
    `Profissional: ${appointment.professional.name}`,
    `Valor: ${formatCurrencyBRL(Number(appointment.priceSnapshot))}`,
  ];
  if (appointment.notes) lines.push('', appointment.notes);

  return {
    summary: `${appointment.serviceNameSnapshot} — ${appointment.client.name}`,
    description: lines.join('\n'),
    start: appointment.startAt,
    end: appointment.endAt,
    timeZone: appointment.company.timezone,
  };
}

async function markNeedsReconnect(connectionId: string) {
  await prisma.googleCalendarConnection.update({
    where: { id: connectionId },
    data: { needsReconnect: true },
  });
}

/**
 * Makes every linked Google Calendar match one appointment: create/update it where its
 * professional is linked, remove it where it no longer belongs (cancelled, or moved to
 * another professional). Failures are per-connection and never thrown to the caller.
 */
export async function syncAppointmentToGoogle(
  companyId: string,
  appointmentId: string,
): Promise<void> {
  const appointment = await loadAppointment(companyId, appointmentId);
  if (!appointment) return;

  const wanted = (ON_CALENDAR as readonly string[]).includes(appointment.status);

  const [connections, existing] = await Promise.all([
    prisma.googleCalendarConnection.findMany({
      where: { companyId, needsReconnect: false },
    }),
    prisma.googleCalendarEvent.findMany({ where: { appointmentId } }),
  ]);
  const existingByConnection = new Map(existing.map((event) => [event.connectionId, event]));

  for (const connection of connections) {
    const shouldHave = wanted && connection.professionalIds.includes(appointment.professionalId);
    const current = existingByConnection.get(connection.id);
    if (!shouldHave && !current) continue;

    try {
      const session = await openCalendarSession(connection.refreshTokenEnc);

      if (!shouldHave && current) {
        await session.deleteEvent(current.googleEventId);
        await prisma.googleCalendarEvent.delete({ where: { id: current.id } });
        continue;
      }

      const event = toEvent(appointment);
      if (current) {
        const stillThere = await session.updateEvent(current.googleEventId, event);
        if (stillThere) {
          await prisma.googleCalendarEvent.update({
            where: { id: current.id },
            data: { syncedAt: new Date() },
          });
          continue;
        }
        // The user deleted it in Google: put it back rather than silently diverge.
        await prisma.googleCalendarEvent.delete({ where: { id: current.id } });
      }

      const googleEventId = await session.createEvent(event);
      await prisma.googleCalendarEvent.create({
        data: { connectionId: connection.id, appointmentId, googleEventId },
      });
    } catch (error) {
      if (error instanceof GoogleAuthRevokedError) {
        await markNeedsReconnect(connection.id);
      } else {
        console.error('[google-calendar] sync failed', { connectionId: connection.id, error });
      }
    }
  }
}

async function removeEventsForProfessionals(connectionId: string, professionalIds: string[]) {
  const connection = await prisma.googleCalendarConnection.findUnique({
    where: { id: connectionId },
  });
  if (!connection) return;

  const events = await prisma.googleCalendarEvent.findMany({
    where: { connectionId, appointment: { professionalId: { in: professionalIds } } },
  });
  if (events.length === 0) return;

  try {
    const session = await openCalendarSession(connection.refreshTokenEnc);
    for (const event of events) {
      await session.deleteEvent(event.googleEventId);
      await prisma.googleCalendarEvent.delete({ where: { id: event.id } });
    }
  } catch (error) {
    if (error instanceof GoogleAuthRevokedError) await markNeedsReconnect(connectionId);
    else console.error('[google-calendar] cleanup failed', { connectionId, error });
  }
}

/** Copies the upcoming appointments of the linked professionals that aren't on Google yet. */
export async function backfillConnection(connectionId: string): Promise<void> {
  const connection = await prisma.googleCalendarConnection.findUnique({
    where: { id: connectionId },
  });
  if (!connection || connection.needsReconnect || connection.professionalIds.length === 0) return;

  const upcoming = await prisma.appointment.findMany({
    where: {
      companyId: connection.companyId,
      professionalId: { in: connection.professionalIds },
      status: { in: [...ON_CALENDAR] },
      startAt: { gte: new Date() },
      googleEvents: { none: { connectionId } },
    },
    orderBy: { startAt: 'asc' },
    take: BACKFILL_LIMIT,
    select: { id: true },
  });

  for (const { id } of upcoming) {
    await syncAppointmentToGoogle(connection.companyId, id);
    // A revoked grant would fail every remaining one the same way.
    const fresh = await prisma.googleCalendarConnection.findUnique({
      where: { id: connectionId },
      select: { needsReconnect: true },
    });
    if (!fresh || fresh.needsReconnect) return;
  }
}
