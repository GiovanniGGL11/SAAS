import { describe, expect, it } from 'vitest';

import { unusualIntervals } from '@/lib/availability';

const week = (over: Record<number, { startTime: string; endTime: string }[]>) => ({
  0: [],
  1: [],
  2: [],
  3: [],
  4: [],
  5: [],
  6: [],
  ...over,
});

describe('expediente: aviso de horário incomum', () => {
  it('expediente comum não gera aviso', () => {
    expect(
      unusualIntervals(
        week({
          1: [{ startTime: '09:00', endTime: '18:00' }],
          2: [
            { startTime: '06:00', endTime: '12:00' },
            { startTime: '13:00', endTime: '22:00' },
          ],
        }),
      ),
    ).toEqual([]);
  });

  it('começar de madrugada ou terminar de noite pede confirmação', () => {
    const found = unusualIntervals(
      week({
        4: [{ startTime: '01:00', endTime: '18:00' }],
        5: [{ startTime: '09:00', endTime: '23:30' }],
        6: [{ startTime: '00:00', endTime: '23:59' }],
      }),
    );
    expect(found.map((f) => [f.weekday, f.reason])).toEqual([
      [4, 'early'],
      [5, 'late'],
      [6, 'both'],
    ]);
    expect(found[0].key).toBe('4|01:00|18:00');
  });

  it('campo vazio (ainda digitando) não conta como incomum', () => {
    expect(unusualIntervals(week({ 1: [{ startTime: '', endTime: '18:00' }] }))).toEqual([]);
  });
});
