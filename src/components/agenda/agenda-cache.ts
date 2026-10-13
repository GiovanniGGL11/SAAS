import type { QueryClient, QueryKey } from '@tanstack/react-query';

import type { GridAppointment } from '@/components/agenda/calendar-grid';
import type { AppointmentStatus } from '@/generated/prisma/client';

/**
 * Cache otimista da Agenda.
 *
 * Os agendamentos moram em várias consultas do React Query — uma por período (dia, semana, mês) e
 * por filtro, com a chave `['appointments', início, fim, serviço, status]`. Quando a pessoa cria,
 * muda o status ou cancela, o servidor leva um tempo para responder (e depois mais um para a
 * consulta ser refeita). Em vez de esperar, escrevemos a mudança em todas as consultas em cache
 * na hora, guardamos uma foto do que havia antes e a restauramos se o servidor recusar.
 * No fim, `invalidateQueries` traz a verdade do banco por cima.
 */

export const APPOINTMENTS_KEY = ['appointments'] as const;
export const SCHEDULE_CONTEXT_KEY = ['schedule-context'] as const;

const OPTIMISTIC_PREFIX = 'optimistic-';

/** Agendamento ainda não confirmado pelo servidor: aparece na grade, mas não dá para mexer nele. */
export function isOptimisticId(id: string): boolean {
  return id.startsWith(OPTIMISTIC_PREFIX);
}

export type AppointmentsSnapshot = [QueryKey, GridAppointment[] | undefined][];

type RangeKey = { start: number; end: number; serviceId?: string; status?: string };

/** Lê o período e os filtros que a consulta de agendamentos guardou na própria chave. */
function parseKey(key: QueryKey): RangeKey | null {
  const [, start, end, serviceId, status] = key as [string, string, string, string?, string?];
  const startMs = Date.parse(start);
  const endMs = Date.parse(end);
  if (Number.isNaN(startMs) || Number.isNaN(endMs)) return null;
  return { start: startMs, end: endMs, serviceId, status };
}

/**
 * Prepara uma mudança otimista: cancela buscas em andamento (para que uma resposta velha não
 * sobrescreva o que acabamos de escrever) e devolve a foto do cache para o rollback.
 */
export async function beginOptimistic(queryClient: QueryClient): Promise<AppointmentsSnapshot> {
  await queryClient.cancelQueries({ queryKey: APPOINTMENTS_KEY });
  return queryClient.getQueriesData<GridAppointment[]>({ queryKey: APPOINTMENTS_KEY });
}

export function rollbackOptimistic(queryClient: QueryClient, snapshot?: AppointmentsSnapshot) {
  if (!snapshot) return;
  for (const [key, data] of snapshot) queryClient.setQueryData(key, data);
}

function sortByStart(list: GridAppointment[]): GridAppointment[] {
  return [...list].sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
}

/** Insere o agendamento em toda consulta em cache cujo período e filtros o incluem. */
export function insertAppointment(queryClient: QueryClient, appointment: GridAppointment) {
  for (const [key, data] of queryClient.getQueriesData<GridAppointment[]>({
    queryKey: APPOINTMENTS_KEY,
  })) {
    const range = parseKey(key);
    if (!range || !data) continue;
    const overlaps =
      appointment.startAt.getTime() < range.end && appointment.endAt.getTime() > range.start;
    const matchesFilters =
      (!range.serviceId || range.serviceId === appointment.serviceId) &&
      (!range.status || range.status === appointment.status);
    if (!overlaps || !matchesFilters) continue;
    queryClient.setQueryData(key, sortByStart([...data, appointment]));
  }
}

/** Aplica `patch` ao agendamento em todas as consultas (status, horário, profissional…). */
export function patchAppointment(
  queryClient: QueryClient,
  id: string,
  patch: (appointment: GridAppointment) => GridAppointment,
) {
  for (const [key, data] of queryClient.getQueriesData<GridAppointment[]>({
    queryKey: APPOINTMENTS_KEY,
  })) {
    if (!data?.some((a) => a.id === id)) continue;
    const range = parseKey(key);
    const next = data
      .map((a) => (a.id === id ? patch(a) : a))
      // Com filtro de status ativo, quem deixa de bater com ele sai da lista imediatamente.
      .filter((a) => !range?.status || a.status === range.status);
    queryClient.setQueryData(key, next);
  }
}

export function setAppointmentStatus(
  queryClient: QueryClient,
  id: string,
  status: AppointmentStatus,
) {
  patchAppointment(queryClient, id, (a) => ({
    ...a,
    status,
    ...(status === 'CANCELED' ? { canceledAt: new Date() } : {}),
  }));
}

type ClientLite = { id: string; name: string; phone: string | null };
type ProfessionalLite = { id: string; name: string; color: string };
type ServiceLite = {
  id: string;
  name: string;
  color: string;
  durationMinutes: number;
  price: number;
};

/**
 * Monta o agendamento "provisório" com o que a tela já sabe (cliente, profissional, serviço e o
 * horário escolhido). Os campos que só o servidor conhece ficam em branco; a consulta refeita
 * logo depois troca este item pelo real.
 */
export function buildOptimisticAppointment(input: {
  client: ClientLite;
  professional: ProfessionalLite;
  service: ServiceLite;
  startAt: Date;
  notes?: string | null;
}): GridAppointment {
  const { client, professional, service, startAt } = input;
  const now = new Date();
  return {
    id: `${OPTIMISTIC_PREFIX}${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`,
    companyId: '',
    clientId: client.id,
    professionalId: professional.id,
    serviceId: service.id,
    startAt,
    endAt: new Date(startAt.getTime() + service.durationMinutes * 60_000),
    status: 'SCHEDULED',
    serviceNameSnapshot: service.name,
    durationMinutesSnapshot: service.durationMinutes,
    priceSnapshot: service.price,
    notes: input.notes ?? null,
    createdByUserId: '',
    updatedByUserId: null,
    canceledAt: null,
    canceledByUserId: null,
    cancellationReason: null,
    reminderSentAt: null,
    createdAt: now,
    updatedAt: now,
    client: { id: client.id, name: client.name, phone: client.phone },
    professional: { id: professional.id, name: professional.name, color: professional.color },
    service: { id: service.id, name: service.name, color: service.color },
  };
}

// ---- Bloqueios de horário ----------------------------------------------------------------------

export type ScheduleBlockLite = {
  id: string;
  professionalId: string;
  startAt: Date;
  endAt: Date;
  reason: string | null;
};
type ScheduleContext = { availabilities: unknown[]; blocks: ScheduleBlockLite[] };

export async function beginOptimisticBlocks(queryClient: QueryClient) {
  await queryClient.cancelQueries({ queryKey: SCHEDULE_CONTEXT_KEY });
  return queryClient.getQueriesData<ScheduleContext>({ queryKey: SCHEDULE_CONTEXT_KEY });
}

export function rollbackBlocks(
  queryClient: QueryClient,
  snapshot?: [QueryKey, ScheduleContext | undefined][],
) {
  if (!snapshot) return;
  for (const [key, data] of snapshot) queryClient.setQueryData(key, data);
}

export function mutateBlocks(
  queryClient: QueryClient,
  change: (blocks: ScheduleBlockLite[]) => ScheduleBlockLite[],
  /** Só as consultas cujo período cruza este intervalo recebem o bloqueio novo. */
  within?: { startAt: Date; endAt: Date },
) {
  for (const [key, data] of queryClient.getQueriesData<ScheduleContext>({
    queryKey: SCHEDULE_CONTEXT_KEY,
  })) {
    if (!data) continue;
    if (within) {
      const range = parseKey(key);
      if (!range || within.startAt.getTime() >= range.end || within.endAt.getTime() <= range.start)
        continue;
    }
    queryClient.setQueryData(key, { ...data, blocks: change(data.blocks) });
  }
}
