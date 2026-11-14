/*
  Créditos de IA: 1 crédito = 1 consulta ao modelo. Uma pergunta usa de 1 a 6 (o assistente pode
  precisar ver a agenda, depois os clientes...), ~3 em média. A franquia renova todo dia 1º.
*/

/** Média de créditos por pergunta, para traduzir créditos em "cerca de N perguntas". */
export const CREDITS_PER_QUESTION = 3;

export type CreditsUsage = {
  /** "AAAA-MM" no fuso da empresa. */
  period: string;
  used: number;
  /** Pedidos em andamento (ainda não conciliados). */
  reserved: number;
  limit: number;
  remaining: number;
};

export type CreditsLevel = 'ok' | 'warning' | 'critical' | 'empty';

export function creditsInfo(usage: CreditsUsage) {
  const spent = usage.used + usage.reserved;
  const percent = usage.limit > 0 ? Math.min(100, Math.round((spent / usage.limit) * 100)) : 100;
  const level: CreditsLevel =
    usage.remaining <= 0 ? 'empty' : percent >= 90 ? 'critical' : percent >= 70 ? 'warning' : 'ok';
  const [year, month] = usage.period.split('-').map(Number);
  // Dia 1º do mês seguinte ao período.
  const renewMonth = month === 12 ? 1 : month + 1;
  const renewYear = month === 12 ? year + 1 : year;
  return {
    percent,
    level,
    questionsLeft: Math.floor(usage.remaining / CREDITS_PER_QUESTION),
    renewsOn: `1º/${String(renewMonth).padStart(2, '0')}`,
    renewsOnDate: `${renewYear}-${String(renewMonth).padStart(2, '0')}-01`,
  };
}

/** "cerca de 200 perguntas" para um total de créditos. */
export function approxQuestionsFor(credits: number): number {
  return Math.max(0, Math.floor(credits / CREDITS_PER_QUESTION / 50) * 50);
}
