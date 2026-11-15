import { describe, expect, it } from 'vitest';

import { professionalDayLoad } from '@/lib/agenda-load';

const at = (h: number, m = 0) => new Date(Date.UTC(2026, 10, 14, h, m));
const appt = (start: number, end: number, status = 'CONFIRMED') => ({
  startAt: at(start),
  endAt: at(end),
  status,
});
// Sábado (6): 09h–18h = 540 min.
const schedule = [{ weekday: 6, range: { startMinutes: 540, endMinutes: 1080 } }];

describe('ocupação do profissional no dia', () => {
  it('conta agendamentos e a parte do expediente ocupada (sem cancelados e faltas)', () => {
    const load = professionalDayLoad({
      appointments: [
        appt(9, 11),
        appt(11, 12, 'DONE'),
        appt(12, 13, 'CANCELED'),
        appt(13, 14, 'NO_SHOW'),
      ],
      schedule,
      weekday: 6,
    });
    expect(load).toEqual({ count: 2, occupancy: 33, works: true }); // 180 de 540 min
  });

  it('agenda lotada não passa de 100%', () => {
    expect(
      professionalDayLoad({ appointments: [appt(8, 20)], schedule, weekday: 6 }).occupancy,
    ).toBe(100);
  });

  it('folga no dia: não trabalha (a menos que tenha agendamento)', () => {
    expect(professionalDayLoad({ appointments: [], schedule, weekday: 0 })).toEqual({
      count: 0,
      occupancy: null,
      works: false,
    });
    expect(professionalDayLoad({ appointments: [appt(10, 11)], schedule, weekday: 0 }).works).toBe(
      true,
    );
  });

  it('sem expediente cadastrado: conta como quem trabalha, sem porcentagem', () => {
    expect(professionalDayLoad({ appointments: [], schedule: undefined, weekday: 6 })).toEqual({
      count: 0,
      occupancy: null,
      works: true,
    });
  });
});
