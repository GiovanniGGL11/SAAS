import { prisma } from '@/lib/db';

/*
  Atendimentos para fechar: o horário já passou e continuam como agendado/confirmado/em
  atendimento. Só "Concluído" conta como visita (e registra o pagamento no caixa); "Faltou" tira
  da lista sem contar. Agendamentos pelo link ficavam assim e o cliente parecia inativo.
*/

/** Margem depois do fim do horário antes de cobrar o fechamento (atendimento que atrasou). */
const GRACE_MS = 30 * 60_000;
/** Mais antigo que isso não aparece: ninguém lembra se a pessoa veio há meses. */
const LOOKBACK_DAYS = 60;

function pendingWhere(companyId: string, now: Date) {
  return {
    companyId,
    status: {
      in: ['SCHEDULED', 'CONFIRMED', 'IN_PROGRESS'] as (
        'SCHEDULED' | 'CONFIRMED' | 'IN_PROGRESS'
      )[],
    },
    endAt: { lt: new Date(now.getTime() - GRACE_MS) },
    startAt: { gte: new Date(now.getTime() - LOOKBACK_DAYS * 86_400_000) },
  };
}

export async function countAppointmentsToClose(companyId: string, now = new Date()) {
  return prisma.appointment.count({ where: pendingWhere(companyId, now) });
}

export async function listAppointmentsToClose(companyId: string, now = new Date(), limit = 200) {
  const rows = await prisma.appointment.findMany({
    where: pendingWhere(companyId, now),
    orderBy: { startAt: 'desc' },
    take: limit,
    select: {
      id: true,
      startAt: true,
      status: true,
      priceSnapshot: true,
      createdByUserId: true,
      client: { select: { id: true, name: true, phone: true } },
      professional: { select: { name: true, color: true } },
      service: { select: { name: true } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    startAt: r.startAt.toISOString(),
    status: r.status,
    price: Number(r.priceSnapshot),
    online: r.createdByUserId === 'online-booking',
    client: r.client,
    professional: r.professional,
    serviceName: r.service?.name ?? null,
  }));
}
