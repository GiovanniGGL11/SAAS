import { z } from 'zod';

import { prisma } from '@/lib/db';
import { discountPercent, type QuoteContent } from '@/lib/quotes';
import { utcToCalendarDate, utcToMinutesSinceMidnight } from '@/lib/time';
import { UserError } from '@/server/errors';
import { recordAuditLog } from '@/server/data/audit';

/*
  Preferências do negócio. Separação que o resto do sistema respeita:
  - LINGUAGEM (tom, observações, quando chamar uma pessoa): só orienta o texto da IA. Vai para o
    modelo como dado delimitado; nunca libera permissão, nunca muda regra.
  - REGRAS DO SERVIDOR (desconto máximo, janela de contato, valor que sempre exige aprovação, teto
    de gasto automático, resumo do dia, pausas): conferidas no código, não no texto.
  - PERMISSÕES de acesso continuam nos papéis da organização e nas permissões de fichas.
  Só administradores alteram; a IA não tem ferramenta para mudar preferências nem autorizações.
*/

export const ROUTINES = ['package_renewal', 'waitlist_auto', 'daily_summary'] as const;
export type Routine = (typeof ROUTINES)[number];

export const ROUTINE_LABEL: Record<Routine, string> = {
  package_renewal: 'Renovação de pacotes',
  waitlist_auto: 'Lista de espera automática',
  daily_summary: 'Resumo do dia automático',
};

export const TONES = ['cordial', 'formal', 'descontraido'] as const;
export const TONE_LABEL: Record<(typeof TONES)[number], string> = {
  cordial: 'Cordial',
  formal: 'Formal',
  descontraido: 'Descontraído',
};

const DEFAULTS = {
  tone: 'cordial',
  languageNotes: null as string | null,
  escalationNotes: null as string | null,
  escalateOnComplaint: true,
  escalateOnHealth: true,
  contactStartMinutes: 8 * 60,
  contactEndMinutes: 20 * 60,
  contactWeekdays: [1, 2, 3, 4, 5, 6],
  maxDiscountPercent: null as number | null,
  approvalAboveCents: null as number | null,
  autoSpendLimitUnits: null as number | null,
  dailySummaryAuto: false,
  dailySummaryHour: 7,
  notifyQuotes: true,
  notifyTasks: true,
  notifyApprovals: true,
  automationsPaused: false,
  pausedRoutines: [] as string[],
  pausedAt: null as Date | null,
  pausedByUserId: null as string | null,
};

export type BusinessPreferencesData = typeof DEFAULTS;

export async function getPreferences(companyId: string): Promise<BusinessPreferencesData> {
  const row = await prisma.businessPreferences.findUnique({ where: { companyId } });
  if (!row) return { ...DEFAULTS };
  return {
    tone: row.tone,
    languageNotes: row.languageNotes,
    escalationNotes: row.escalationNotes,
    escalateOnComplaint: row.escalateOnComplaint,
    escalateOnHealth: row.escalateOnHealth,
    contactStartMinutes: row.contactStartMinutes,
    contactEndMinutes: row.contactEndMinutes,
    contactWeekdays: row.contactWeekdays,
    maxDiscountPercent: row.maxDiscountPercent,
    approvalAboveCents: row.approvalAboveCents,
    autoSpendLimitUnits: row.autoSpendLimitUnits,
    dailySummaryAuto: row.dailySummaryAuto,
    dailySummaryHour: row.dailySummaryHour,
    notifyQuotes: row.notifyQuotes,
    notifyTasks: row.notifyTasks,
    notifyApprovals: row.notifyApprovals,
    automationsPaused: row.automationsPaused,
    pausedRoutines: row.pausedRoutines,
    pausedAt: row.pausedAt,
    pausedByUserId: row.pausedByUserId,
  };
}

export const preferencesInput = z
  .object({
    tone: z.enum(TONES),
    languageNotes: z.string().trim().max(600).nullish(),
    escalationNotes: z.string().trim().max(600).nullish(),
    escalateOnComplaint: z.boolean(),
    escalateOnHealth: z.boolean(),
    contactStartMinutes: z.number().int().min(0).max(1440),
    contactEndMinutes: z.number().int().min(0).max(1440),
    contactWeekdays: z.array(z.number().int().min(0).max(6)).max(7),
    maxDiscountPercent: z.number().int().min(0).max(100).nullish(),
    approvalAboveCents: z.number().int().min(0).max(100_000_000).nullish(),
    autoSpendLimitUnits: z.number().int().min(0).max(1_000_000).nullish(),
    dailySummaryAuto: z.boolean(),
    dailySummaryHour: z.number().int().min(0).max(23),
    notifyQuotes: z.boolean(),
    notifyTasks: z.boolean(),
    notifyApprovals: z.boolean(),
  })
  .refine((v) => v.contactStartMinutes < v.contactEndMinutes, {
    message: 'O fim da janela de contato precisa ser depois do início.',
  });

export type PreferencesInput = z.infer<typeof preferencesInput>;

/** Salva as preferências (só administradores — conferido na ação). Pausas têm função própria. */
export async function savePreferences(companyId: string, userId: string, input: PreferencesInput) {
  const data = {
    ...input,
    languageNotes: input.languageNotes || null,
    escalationNotes: input.escalationNotes || null,
    contactWeekdays: [...new Set(input.contactWeekdays)].sort(),
    maxDiscountPercent: input.maxDiscountPercent ?? null,
    approvalAboveCents: input.approvalAboveCents ?? null,
    autoSpendLimitUnits: input.autoSpendLimitUnits ?? null,
    updatedByUserId: userId,
  };
  await prisma.businessPreferences.upsert({
    where: { companyId },
    create: { companyId, ...data },
    update: data,
  });
  await recordAuditLog({
    companyId,
    entityType: 'BusinessPreferences',
    entityId: companyId,
    action: 'updated',
    userId,
    // Só quais campos mudaram de grupo, não o texto livre.
    metadata: { fields: Object.keys(input) },
  });
}

// ---- Regras aplicadas no servidor --------------------------------------------------------------

/** Desconto do orçamento dentro do limite das preferências (conferido ao salvar). */
export async function assertQuoteDiscountAllowed(
  companyId: string,
  content: Pick<QuoteContent, 'items' | 'discount'>,
) {
  const prefs = await getPreferences(companyId);
  if (prefs.maxDiscountPercent == null) return;
  const percent = discountPercent(content);
  if (percent > prefs.maxDiscountPercent) {
    throw new UserError(
      `O desconto (${percent.toLocaleString('pt-BR')}%) passa do limite de ${prefs.maxDiscountPercent}% definido nas Preferências do negócio.`,
    );
  }
}

/** Agora está dentro da janela de contato com clientes? (Mensagens automáticas só nela.) */
export function withinContactWindow(
  prefs: Pick<
    BusinessPreferencesData,
    'contactStartMinutes' | 'contactEndMinutes' | 'contactWeekdays'
  >,
  timezone: string,
  at = new Date(),
): boolean {
  const d = utcToCalendarDate(at, timezone);
  const weekday = new Date(Date.UTC(d.year, d.month - 1, d.day)).getUTCDay();
  if (prefs.contactWeekdays.length && !prefs.contactWeekdays.includes(weekday)) return false;
  const minutes = utcToMinutesSinceMidnight(at, timezone);
  return minutes >= prefs.contactStartMinutes && minutes < prefs.contactEndMinutes;
}

/** A rotina pode rodar agora? (Pausa geral, pausa da rotina.) */
export function routinePaused(
  prefs: Pick<BusinessPreferencesData, 'automationsPaused' | 'pausedRoutines'>,
  routine: Routine,
): boolean {
  return prefs.automationsPaused || prefs.pausedRoutines.includes(routine);
}

/**
 * Pausa ou retoma as ações automáticas (geral ou de uma rotina). Retomar NÃO executa o que ficou
 * para trás: cada rotina recomeça do zero e revalida tudo na próxima execução.
 */
export async function setAutomationPause(params: {
  companyId: string;
  userId: string;
  routine: Routine | 'all';
  paused: boolean;
}) {
  const prefs = await getPreferences(params.companyId);
  const pausedRoutines =
    params.routine === 'all'
      ? prefs.pausedRoutines
      : params.paused
        ? [...new Set([...prefs.pausedRoutines, params.routine])]
        : prefs.pausedRoutines.filter((r) => r !== params.routine);
  const automationsPaused = params.routine === 'all' ? params.paused : prefs.automationsPaused;
  const data = {
    automationsPaused,
    pausedRoutines,
    pausedAt: params.paused ? new Date() : prefs.pausedAt,
    pausedByUserId: params.paused ? params.userId : prefs.pausedByUserId,
  };
  await prisma.businessPreferences.upsert({
    where: { companyId: params.companyId },
    create: { companyId: params.companyId, ...data },
    update: data,
  });
  // Convites automáticos ainda pendentes continuam valendo até o prazo (já foram oferecidos):
  // pausar impede novos, não desfaz o que o cliente já recebeu.
  await recordAuditLog({
    companyId: params.companyId,
    entityType: 'Automation',
    entityId: params.routine,
    action: params.paused ? 'paused' : 'resumed',
    userId: params.userId,
  });
}

/**
 * Texto das preferências de linguagem para o assistente, delimitado como DADO. O prompt deixa
 * claro que nada aqui libera ações, muda permissões ou substitui regras.
 */
export function languagePreferencesForPrompt(prefs: BusinessPreferencesData): string {
  const lines = [
    `Tom: ${TONE_LABEL[prefs.tone as keyof typeof TONE_LABEL] ?? 'Cordial'}.`,
    prefs.languageNotes ? `Observações de linguagem: ${prefs.languageNotes}` : null,
    prefs.escalateOnComplaint ? 'Reclamação: sugerir que uma pessoa da equipe assuma.' : null,
    prefs.escalateOnHealth
      ? 'Assunto de saúde ou reação adversa: não orientar; sugerir que uma pessoa da equipe assuma.'
      : null,
    prefs.escalationNotes ? `Outros casos para chamar uma pessoa: ${prefs.escalationNotes}` : null,
  ].filter(Boolean);
  return lines.join('\n');
}
