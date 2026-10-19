import { prisma } from '@/lib/db';
import { RENEWAL_ORIGIN } from './package-renewal';

/*
  Resultados das automações — só o que dá para verificar no banco, com o critério escrito:
  - "originado pela rotina" = registro criado pela rotina (origem gravada no próprio registro:
    tarefa, orçamento ou convite). Nada de atribuir à automação a receita da empresa inteira.
  - agendado, vendido e recebido são números separados; recebido só conta lançamento PAGO ligado
    ao agendamento ou ao pacote que a rotina originou.
  - não estimamos "tempo economizado".
*/

const sum = (values: (number | null | undefined)[]) =>
  Math.round(values.reduce<number>((s, v) => s + (v ?? 0), 0) * 100) / 100;

export async function getAutomationResults(companyId: string, days = 30) {
  const since = new Date(Date.now() - days * 86_400_000);

  const [runs, tasks, quotes, offers, messages, aiEvents] = await Promise.all([
    prisma.automationRun.groupBy({
      by: ['routine', 'status'],
      where: { companyId, startedAt: { gte: since } },
      _count: true,
    }),
    prisma.task.groupBy({
      by: ['status'],
      where: { companyId, origin: { startsWith: 'automation' }, createdAt: { gte: since } },
      _count: true,
    }),
    prisma.quote.findMany({
      where: { companyId, origin: RENEWAL_ORIGIN, createdAt: { gte: since } },
      select: { id: true, status: true, convertedRefId: true },
    }),
    prisma.waitlistOffer.findMany({
      where: { companyId, origin: 'automation', createdAt: { gte: since } },
      select: { status: true, appointmentId: true },
    }),
    prisma.whatsappMessage.groupBy({
      by: ['status'],
      where: { companyId, kind: 'WAITLIST_OFFER', createdAt: { gte: since } },
      _count: true,
    }),
    prisma.aiUsageEvent.aggregate({
      where: { companyId, feature: { startsWith: 'automation' }, createdAt: { gte: since } },
      _count: true,
    }),
  ]);

  const packageIds = quotes.map((q) => q.convertedRefId).filter((id): id is string => !!id);
  const appointmentIds = offers.map((o) => o.appointmentId).filter((id): id is string => !!id);
  const [packages, appointments, paidPackages, paidAppointments] = await Promise.all([
    packageIds.length
      ? prisma.clientPackage.findMany({
          where: { id: { in: packageIds } },
          select: { price: true },
        })
      : [],
    appointmentIds.length
      ? prisma.appointment.findMany({
          where: { id: { in: appointmentIds } },
          select: { status: true, priceSnapshot: true },
        })
      : [],
    packageIds.length
      ? prisma.transaction.aggregate({
          where: { companyId, clientPackageId: { in: packageIds }, type: 'INCOME', status: 'PAID' },
          _sum: { amount: true },
        })
      : null,
    appointmentIds.length
      ? prisma.transaction.aggregate({
          where: {
            companyId,
            appointmentId: { in: appointmentIds },
            type: 'INCOME',
            status: 'PAID',
          },
          _sum: { amount: true },
        })
      : null,
  ]);

  const count = (rows: { status: string; _count: number }[], status: string) =>
    rows.find((r) => r.status === status)?._count ?? 0;
  const runsBy = (routine: string, status: string) =>
    runs.find((r) => r.routine === routine && r.status === status)?._count ?? 0;
  const activeAppointments = appointments.filter((a) => a.status !== 'CANCELED');

  return {
    days,
    runs: ['package_renewal', 'waitlist_auto', 'daily_summary'].map((routine) => ({
      routine,
      completed: runsBy(routine, 'COMPLETED'),
      partial: runsBy(routine, 'PARTIAL'),
      failed: runsBy(routine, 'FAILED'),
      skipped: runsBy(routine, 'SKIPPED'),
    })),
    tasks: {
      created: tasks.reduce((s, t) => s + t._count, 0),
      done: count(tasks, 'DONE'),
      open: count(tasks, 'OPEN'),
    },
    renewals: {
      quotesPrepared: quotes.length,
      sent: quotes.filter((q) => ['SENT', 'APPROVED', 'REJECTED', 'EXPIRED'].includes(q.status))
        .length,
      approved: quotes.filter((q) => q.status === 'APPROVED').length,
      converted: packageIds.length,
      soldValue: sum(packages.map((p) => Number(p.price))),
      receivedValue: Number(paidPackages?._sum.amount ?? 0),
    },
    waitlist: {
      offers: offers.length,
      accepted: offers.filter((o) => o.status === 'ACCEPTED').length,
      declined: offers.filter((o) => o.status === 'DECLINED').length,
      expired: offers.filter((o) => o.status === 'EXPIRED').length,
      bookings: activeAppointments.length,
      scheduledValue: sum(activeAppointments.map((a) => Number(a.priceSnapshot))),
      completedValue: sum(
        activeAppointments.filter((a) => a.status === 'DONE').map((a) => Number(a.priceSnapshot)),
      ),
      receivedValue: Number(paidAppointments?._sum.amount ?? 0),
    },
    messages: {
      sent: count(messages, 'SENT'),
      failed: count(messages, 'FAILED'),
      pending: count(messages, 'PENDING'),
    },
    aiCalls: aiEvents._count,
  };
}

export type AutomationResults = Awaited<ReturnType<typeof getAutomationResults>>;
