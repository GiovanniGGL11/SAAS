import { prisma } from '@/lib/db';
import { sessionsDone } from '@/lib/packages';
import { createTask } from '@/server/data/tasks';
import { createQuote } from '@/server/data/quotes';
import { finishRun, recordSkip, routineGate, startRun, type RunStats } from './runs';

/*
  Renovação de pacotes (Pro, rotina autorizada). Gatilhos:
  - penúltima sessão (falta 1);
  - saldo baixo (25% ou menos, com pelo menos 2 restantes);
  - perto de vencer (15 dias) com sessões sobrando;
  - terminou e o cliente não tem próximo agendamento.
  Ações: tarefa de acompanhamento (com sugestão de contato) e, quando terminou ou está na
  penúltima, um orçamento de renovação em RASCUNHO. Nunca renova sozinho, nunca cobra, não envia
  mensagem e não promete resultado. Cada pacote+gatilho gera no máximo uma tarefa (dedupeKey).
*/

export type RenewalTrigger = 'penultimate' | 'low_balance' | 'expiring' | 'finished_no_booking';

const TRIGGER_LABEL: Record<RenewalTrigger, string> = {
  penultimate: 'está na penúltima sessão',
  low_balance: 'está com poucas sessões restantes',
  expiring: 'vence em breve com sessões sobrando',
  finished_no_booking: 'terminou e não tem próximo agendamento',
};

const EXPIRING_DAYS = 15;
/** Teto por execução: nada de rajada. */
const MAX_PER_RUN = 50;
export const RENEWAL_ORIGIN = 'automation:package_renewal';

export function renewalTrigger(params: {
  done: number;
  total: number;
  validUntil: Date | null;
  hasNextBooking: boolean;
  now: Date;
}): RenewalTrigger | null {
  const remaining = params.total - params.done;
  if (remaining <= 0) return params.hasNextBooking ? null : 'finished_no_booking';
  if (remaining === 1) return 'penultimate';
  if (
    params.validUntil &&
    params.validUntil.getTime() > params.now.getTime() &&
    params.validUntil.getTime() - params.now.getTime() < EXPIRING_DAYS * 86_400_000
  ) {
    return 'expiring';
  }
  if (remaining >= 2 && remaining / params.total <= 0.25) return 'low_balance';
  return null;
}

export async function runPackageRenewal(
  companyId: string,
  trigger: 'cron' | 'manual',
  now = new Date(),
) {
  const gate = await routineGate(companyId, 'package_renewal', now);
  if (!gate.ok) {
    await recordSkip(companyId, 'package_renewal', trigger, gate.reason);
    return { status: 'SKIPPED' as const, reason: gate.reason };
  }
  const run = await startRun(companyId, 'package_renewal', trigger);
  const stats: RunStats = {
    checked: 0,
    tasksCreated: 0,
    quotesPrepared: 0,
    alreadyHandled: 0,
    failures: 0,
  };
  const maxActions = Math.min(gate.limits.maxPerDay ?? MAX_PER_RUN, MAX_PER_RUN);
  try {
    const packages = await prisma.clientPackage.findMany({
      where: { companyId, status: 'ACTIVE', recurring: false, client: { active: true } },
      include: {
        movements: { select: { kind: true, quantity: true } },
        client: { select: { id: true, name: true } },
        service: { select: { id: true, name: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take: 500,
    });
    for (const pkg of packages) {
      if (stats.tasksCreated >= maxActions) break;
      stats.checked++;
      const done = sessionsDone(pkg.movements);
      const hasNextBooking =
        (await prisma.appointment.count({
          where: {
            companyId,
            clientId: pkg.clientId,
            status: { in: ['SCHEDULED', 'CONFIRMED'] },
            startAt: { gt: now },
          },
        })) > 0;
      const reason = renewalTrigger({
        done,
        total: pkg.sessionsTotal,
        validUntil: pkg.periodEnd,
        hasNextBooking,
        now,
      });
      if (!reason) continue;
      try {
        const first = pkg.client.name.trim().split(/\s+/)[0];
        const { created, task } = await createTask(companyId, 'automation', {
          title: `Renovação: ${pkg.client.name} — ${pkg.nameSnapshot}`,
          details:
            `O pacote ${TRIGGER_LABEL[reason]} (${done} de ${pkg.sessionsTotal} sessões). ` +
            `Sugestão de contato: "Oi, ${first}! Seu pacote de ${pkg.service.name} está chegando ao fim. Quer que eu prepare a renovação?" ` +
            'Nada foi enviado ao cliente nem cobrado.',
          clientId: pkg.clientId,
          clientPackageId: pkg.id,
          dueAt: now,
          origin: RENEWAL_ORIGIN,
          dedupeKey: `renewal:${pkg.id}:${reason}`,
        });
        if (!created) {
          stats.alreadyHandled++;
          continue;
        }
        stats.tasksCreated++;
        if (reason === 'finished_no_booking' || reason === 'penultimate') {
          const quote = await createQuote({
            companyId,
            timezone: gate.timezone,
            userId: 'automation',
            origin: RENEWAL_ORIGIN,
            input: {
              clientId: pkg.clientId,
              title: `Renovação — ${pkg.nameSnapshot}`.slice(0, 120),
              items: [
                {
                  kind: 'service',
                  refId: pkg.serviceId,
                  description: pkg.service.name,
                  quantity: 1,
                  sessions: pkg.sessionsTotal,
                  unitPrice: Number(pkg.price),
                  discount: 0,
                },
              ],
              discount: 0,
              paymentTerms: null,
              notes: null,
              validUntil: null,
            },
          });
          await prisma.task.update({ where: { id: task.id }, data: { quoteId: quote.id } });
          stats.quotesPrepared++;
        }
      } catch (error) {
        stats.failures++;
        console.error('[automação] renovação de pacote falhou', pkg.id, error);
      }
    }
    const status =
      stats.failures > 0 ? (stats.tasksCreated > 0 ? 'PARTIAL' : 'FAILED') : 'COMPLETED';
    await finishRun(run.id, { status, stats });
    return { status, stats };
  } catch (error) {
    await finishRun(run.id, {
      status: 'FAILED',
      stats,
      note: error instanceof Error ? error.message.slice(0, 300) : 'Erro inesperado.',
    });
    throw error;
  }
}
