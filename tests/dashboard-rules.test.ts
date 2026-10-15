import { describe, expect, it } from 'vitest';

import { MIN_PEAK_SAMPLE, findPeakHour } from '@/lib/dashboard-rules';

const hours = (counts: Record<number, number>) =>
  Array.from({ length: 24 }, (_, hour) => ({ hour, count: counts[hour] ?? 0 }));

describe('horário de pico do painel', () => {
  it('sem base suficiente não aponta pico (um agendamento às 9h não é "pico")', () => {
    expect(findPeakHour(hours({ 9: 1 }))).toEqual({ peak: null, sample: 1 });
    expect(findPeakHour(hours({ 9: MIN_PEAK_SAMPLE - 1 })).peak).toBeNull();
    expect(findPeakHour(hours({})).peak).toBeNull();
  });

  it('com base suficiente aponta o horário mais cheio do dia útil', () => {
    const result = findPeakHour(hours({ 9: 2, 14: 3, 18: 1 }));
    expect(result.sample).toBe(6);
    expect(result.peak).toEqual({ hour: 14, count: 3 });
  });

  it('fora da janela de 7h às 21h não conta para a base nem para o pico', () => {
    expect(findPeakHour(hours({ 3: 10, 22: 10, 9: 1 })).peak).toBeNull();
  });
});
