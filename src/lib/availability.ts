/**
 * Expediente fora do comum: começa antes das 06:00 ou termina depois das 22:00. Não é proibido
 * (há quem atenda de madrugada), mas quase sempre é um erro de digitação — por isso a tela
 * pergunta antes de salvar.
 */
export const EARLIEST_USUAL = '06:00';
export const LATEST_USUAL = '22:00';

export type WeekIntervals = Record<number, { startTime: string; endTime: string }[]>;

export type UnusualInterval = {
  weekday: number;
  startTime: string;
  endTime: string;
  /** Identifica o intervalo para lembrar que a pessoa já confirmou. */
  key: string;
  reason: 'early' | 'late' | 'both';
};

export function unusualIntervals(week: WeekIntervals): UnusualInterval[] {
  const found: UnusualInterval[] = [];
  for (const [weekday, intervals] of Object.entries(week)) {
    for (const interval of intervals) {
      if (!interval.startTime || !interval.endTime) continue;
      const early = interval.startTime < EARLIEST_USUAL;
      const late = interval.endTime > LATEST_USUAL;
      if (!early && !late) continue;
      found.push({
        weekday: Number(weekday),
        startTime: interval.startTime,
        endTime: interval.endTime,
        key: `${weekday}|${interval.startTime}|${interval.endTime}`,
        reason: early && late ? 'both' : early ? 'early' : 'late',
      });
    }
  }
  return found.sort((a, b) => a.weekday - b.weekday);
}
