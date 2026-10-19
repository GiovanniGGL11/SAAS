import { prisma } from '@/lib/db';
import { UserError } from '@/server/errors';
import { withinContactWindow } from '@/server/data/business-preferences';
import { createWaitlistOffer, findOpenSlotsForWaitlist } from '@/server/data/waitlist';
import { getZapiConfig, sendOnce } from '@/server/whatsapp/automation';
import { finishRun, recordSkip, routineGate, startRun, type RunStats } from './runs';

/*
  Lista de espera automática (Pro, rotina autorizada). Para cada pessoa esperando (a mais antiga
  primeiro), se houver vaga compatível, cria UM convite com prazo e guarda o horário — o mesmo
  convite da tela, com as mesmas revalidações. Nunca dispara para a lista inteira: uma pessoa por
  horário, uma pendência por pessoa e teto por execução.
  Mensagem real só quando: WhatsApp integrado (Z-API) + cliente autorizou WhatsApp + dentro da
  janela de contato + a autorização da rotina permite mensagens (scope.sendMessages). Sem isso, o
  convite fica na tela da equipe e na área do cliente.
*/

const MAX_PER_RUN = 5;
const RESPONSE_MINUTES = 120;
export const WAITLIST_AUTO_ORIGIN = 'automation';

export async function runWaitlistAuto(
  companyId: string,
  trigger: 'cron' | 'manual',
  now = new Date(),
) {
  const gate = await routineGate(companyId, 'waitlist_auto', now);
  if (!gate.ok) {
    await recordSkip(companyId, 'waitlist_auto', trigger, gate.reason);
    return { status: 'SKIPPED' as const, reason: gate.reason };
  }
  const run = await startRun(companyId, 'waitlist_auto', trigger);
  const stats: RunStats = {
    checked: 0,
    offersCreated: 0,
    messagesSent: 0,
    messagesSkipped: 0,
    failures: 0,
  };
  const maxOffers = Math.min(gate.limits.maxPerDay ?? MAX_PER_RUN, MAX_PER_RUN);
  const allowMessages = gate.scope.sendMessages === true;
  try {
    const slotsByEntry = await findOpenSlotsForWaitlist(companyId, gate.timezone);
    const entries = await prisma.waitlistEntry.findMany({
      where: {
        companyId,
        status: 'WAITING',
        id: { in: Object.keys(slotsByEntry) },
        offers: { none: { status: 'PENDING' } },
      },
      include: { client: { select: { phone: true } } },
      orderBy: { createdAt: 'asc' },
    });
    const config = allowMessages ? await getZapiConfig(companyId) : null;
    const taken = new Set<string>();
    for (const entry of entries) {
      if (stats.offersCreated >= maxOffers) break;
      stats.checked++;
      const slot = slotsByEntry[entry.id]?.find(
        (s) => !taken.has(`${s.professionalId}|${s.startAt}`),
      );
      if (!slot) continue;
      try {
        const result = await createWaitlistOffer({
          companyId,
          timezone: gate.timezone,
          userId: 'automation',
          entryId: entry.id,
          professionalId: slot.professionalId,
          startAt: new Date(slot.startAt),
          responseMinutes: RESPONSE_MINUTES,
          origin: 'automation',
        });
        taken.add(`${slot.professionalId}|${slot.startAt}`);
        stats.offersCreated++;
        const canMessage =
          config &&
          entry.contactChannel === 'WHATSAPP' &&
          withinContactWindow(gate.prefs, gate.timezone, now);
        if (canMessage) {
          const outcome = await sendOnce({
            companyId,
            kind: 'WAITLIST_OFFER',
            dedupeKey: `waitlist-offer:${result.offer.id}`,
            phone: entry.client.phone,
            text: `${result.message} Responda pela área do cliente ou por aqui.`,
            clientId: entry.clientId,
            config,
          });
          if (outcome === 'sent') stats.messagesSent++;
          else stats.messagesSkipped++;
        } else {
          stats.messagesSkipped++;
        }
      } catch (error) {
        // Vaga tomada no meio do caminho é normal: conta como falha leve e segue.
        stats.failures++;
        if (!(error instanceof UserError)) {
          console.error('[automação] convite automático falhou', entry.id, error);
        }
      }
    }
    const status =
      stats.failures > 0 && stats.offersCreated === 0 && stats.checked > 0
        ? 'PARTIAL'
        : 'COMPLETED';
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
