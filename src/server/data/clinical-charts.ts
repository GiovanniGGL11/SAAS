import type { Prisma } from '@/generated/prisma/client';
import { prisma } from '@/lib/db';
import { normalizeToothMark, type ToothMarkInput } from '@/lib/odontogram';
import { normalizeFacePoints, type FacePoint } from '@/lib/face-map';
import { UserError } from '@/server/errors';

/*
  Odontograma e mapa facial do prontuário (fase 5). Nada se apaga: a marcação do dente é
  "removida" guardando quem e quando; a aplicação do mapa facial é anulada com o motivo.
*/

async function assertClient(companyId: string, clientId: string) {
  const client = await prisma.client.findFirst({
    where: { id: clientId, companyId },
    select: { id: true },
  });
  if (!client) throw new UserError('Paciente não encontrado.');
}

/** As validações puras lançam Error comum; aqui viram mensagem para a tela. */
function validated<T>(fn: () => T): T {
  try {
    return fn();
  } catch (error) {
    if (error instanceof Error && !(error instanceof UserError)) throw new UserError(error.message);
    throw error;
  }
}

// ── Odontograma ─────────────────────────────────────────────────────────────

/** Todas as marcações (as removidas também, para o histórico), da mais nova para a mais antiga. */
export async function listToothMarks(companyId: string, clientId: string) {
  return prisma.toothMark.findMany({
    where: { companyId, clientId },
    orderBy: { createdAt: 'desc' },
    take: 1000,
    select: {
      id: true,
      tooth: true,
      faces: true,
      condition: true,
      status: true,
      note: true,
      authorName: true,
      createdAt: true,
      doneAt: true,
      doneByName: true,
      removedAt: true,
      removedByName: true,
    },
  });
}

export async function addToothMark(params: {
  companyId: string;
  clientId: string;
  mark: ToothMarkInput;
  userId: string;
  userName: string;
}) {
  const mark = validated(() => normalizeToothMark(params.mark));
  await assertClient(params.companyId, params.clientId);
  return prisma.toothMark.create({
    data: {
      companyId: params.companyId,
      clientId: params.clientId,
      ...mark,
      authorUserId: params.userId,
      authorName: params.userName,
      ...(mark.status === 'done' ? { doneAt: new Date(), doneByName: params.userName } : {}),
    },
  });
}

async function findActiveMark(companyId: string, clientId: string, id: string) {
  const mark = await prisma.toothMark.findFirst({ where: { id, companyId, clientId } });
  if (!mark) throw new UserError('Marcação não encontrada.');
  if (mark.removedAt) throw new UserError('Esta marcação já foi removida.');
  return mark;
}

/** "A fazer" que foi feito: passa para azul. */
export async function markToothDone(params: {
  companyId: string;
  clientId: string;
  id: string;
  userName: string;
}) {
  const mark = await findActiveMark(params.companyId, params.clientId, params.id);
  if (mark.status === 'done') throw new UserError('Esta marcação já está como feita.');
  const { count } = await prisma.toothMark.updateMany({
    where: { id: mark.id, status: 'planned', removedAt: null },
    data: { status: 'done', doneAt: new Date(), doneByName: params.userName },
  });
  if (count === 0) throw new UserError('Esta marcação mudou. Atualize a tela.');
}

/** Tira do odontograma, mas guarda no histórico. */
export async function removeToothMark(params: {
  companyId: string;
  clientId: string;
  id: string;
  userName: string;
}) {
  const mark = await findActiveMark(params.companyId, params.clientId, params.id);
  await prisma.toothMark.updateMany({
    where: { id: mark.id, removedAt: null },
    data: { removedAt: new Date(), removedByName: params.userName },
  });
}

// ── Mapa facial ─────────────────────────────────────────────────────────────

export async function listFaceMaps(companyId: string, clientId: string) {
  const rows = await prisma.faceMap.findMany({
    where: { companyId, clientId },
    orderBy: { createdAt: 'desc' },
    take: 100,
    select: {
      id: true,
      title: true,
      points: true,
      notes: true,
      authorName: true,
      createdAt: true,
      canceledAt: true,
      canceledByName: true,
      cancelReason: true,
      professionalId: true,
    },
  });
  return rows.map((r) => ({ ...r, points: r.points as unknown as FacePoint[] }));
}

export async function createFaceMap(params: {
  companyId: string;
  clientId: string;
  title: string;
  points: unknown;
  notes?: string | null;
  professionalId?: string | null;
  userId: string;
  userName: string;
}) {
  const title = params.title.trim().slice(0, 100);
  if (!title) throw new UserError('Diga qual foi o procedimento (ex.: Toxina botulínica).');
  const points = validated(() => normalizeFacePoints(params.points));
  await assertClient(params.companyId, params.clientId);
  if (params.professionalId) {
    const pro = await prisma.professional.findFirst({
      where: { id: params.professionalId, companyId: params.companyId },
      select: { id: true },
    });
    if (!pro) throw new UserError('Profissional não encontrado.');
  }
  return prisma.faceMap.create({
    data: {
      companyId: params.companyId,
      clientId: params.clientId,
      title,
      points: points as unknown as Prisma.InputJsonValue,
      notes: params.notes?.trim().slice(0, 2000) || null,
      professionalId: params.professionalId ?? null,
      authorUserId: params.userId,
      authorName: params.userName,
    },
  });
}

export async function cancelFaceMap(params: {
  companyId: string;
  clientId: string;
  id: string;
  reason: string;
  userName: string;
}) {
  const reason = params.reason.trim().slice(0, 300);
  if (!reason) throw new UserError('Diga por que está anulando.');
  const row = await prisma.faceMap.findFirst({
    where: { id: params.id, companyId: params.companyId, clientId: params.clientId },
    select: { id: true, canceledAt: true },
  });
  if (!row) throw new UserError('Aplicação não encontrada.');
  if (row.canceledAt) throw new UserError('Esta aplicação já foi anulada.');
  const { count } = await prisma.faceMap.updateMany({
    where: { id: row.id, canceledAt: null },
    data: { canceledAt: new Date(), canceledByName: params.userName, cancelReason: reason },
  });
  if (count === 0) throw new UserError('Esta aplicação já foi anulada.');
}
