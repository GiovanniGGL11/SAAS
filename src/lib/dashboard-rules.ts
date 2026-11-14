/** Variação percentual entre dois períodos (null quando antes era zero e agora não é). */
export function percentDelta(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return ((current - previous) / previous) * 100;
}

/** Diferença em pontos percentuais entre duas taxas (null se faltar uma delas). */
export function ppDelta(current: number | null, previous: number | null): number | null {
  return current === null || previous === null ? null : Math.round((current - previous) * 10) / 10;
}

/**
 * Quando o painel tem base para apontar um horário de pico. Com poucos agendamentos qualquer
 * horário "ganha" (um único às 09h vira "Pico às 09h"), o que engana mais do que informa.
 */
export const MIN_PEAK_SAMPLE = 5;

/** O painel só mostra o dia útil, e é nessa janela que o pico é procurado. */
const DAY_START_HOUR = 7;
const DAY_END_HOUR = 21;

export type HourCount = { hour: number; count: number };

export function findPeakHour(hours: HourCount[]): { peak: HourCount | null; sample: number } {
  const visible = hours.filter((h) => h.hour >= DAY_START_HOUR && h.hour < DAY_END_HOUR);
  const sample = visible.reduce((sum, h) => sum + h.count, 0);
  if (sample < MIN_PEAK_SAMPLE) return { peak: null, sample };
  const peak = visible.reduce<HourCount | null>(
    (best, h) => (h.count > 0 && (!best || h.count > best.count) ? h : best),
    null,
  );
  return { peak, sample };
}
