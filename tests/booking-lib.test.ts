import { describe, expect, it } from 'vitest';

import {
  addMinutesToLabel,
  formatDuration,
  groupSlotsByPeriod,
  longDate,
  maskBookingPhone,
  periodOf,
  validateBookingName,
  validateBookingPhone,
} from '@/lib/booking';

describe('agendamento público: nome e WhatsApp', () => {
  it('nome: obrigatório, sem exigir sobrenome', () => {
    expect(validateBookingName('')).toBe('Informe seu nome.');
    expect(validateBookingName('   ')).toBe('Informe seu nome.');
    expect(validateBookingName('A')).toBe('Informe pelo menos 2 letras.');
    expect(validateBookingName('Bia')).toBeNull();
    expect(validateBookingName('x'.repeat(121))).toBe('Use até 120 caracteres.');
  });

  it('WhatsApp brasileiro com DDD, fixo ou celular', () => {
    expect(validateBookingPhone('')).toBe('Informe seu WhatsApp.');
    expect(validateBookingPhone('98888-7777')).toContain('com DDD');
    expect(validateBookingPhone('(11) 98888-7777')).toBeNull();
    expect(validateBookingPhone('(11) 3333-4444')).toBeNull();
    expect(validateBookingPhone('(11) 98888-77771')).toContain('com DDD');
  });

  it('internacional continua aceito quando começa com +', () => {
    expect(validateBookingPhone('+351912345678')).toBeNull();
    expect(validateBookingPhone('+1 415 555 0100')).toBeNull();
    expect(validateBookingPhone('+12')).toContain('código do país');
  });

  it('máscara enquanto digita', () => {
    expect(maskBookingPhone('1')).toBe('(1');
    expect(maskBookingPhone('119')).toBe('(11) 9');
    expect(maskBookingPhone('1133334444')).toBe('(11) 3333-4444');
    expect(maskBookingPhone('11988887777')).toBe('(11) 98888-7777');
    expect(maskBookingPhone('119888877779999')).toBe('(11) 98888-7777');
    expect(maskBookingPhone('+351 912 345 678')).toBe('+351912345678');
  });
});

describe('agendamento público: horários por período', () => {
  it('madrugada, manhã, tarde e noite pelos limites certos', () => {
    expect(periodOf('00:00')).toBe('dawn');
    expect(periodOf('05:45')).toBe('dawn');
    expect(periodOf('06:00')).toBe('morning');
    expect(periodOf('11:45')).toBe('morning');
    expect(periodOf('12:00')).toBe('afternoon');
    expect(periodOf('17:45')).toBe('afternoon');
    expect(periodOf('18:00')).toBe('evening');
  });

  it('só os períodos com horário, na ordem do dia; madrugada só se existir', () => {
    const groups = groupSlotsByPeriod(
      ['18:30', '09:00', '14:00', '09:15'].map((label) => ({ label })),
    );
    expect(groups.map((g) => g.period)).toEqual(['morning', 'afternoon', 'evening']);
    expect(groups[0].slots.map((s) => s.label)).toEqual(['09:00', '09:15']);

    const withDawn = groupSlotsByPeriod([{ label: '02:45' }, { label: '10:00' }]);
    expect(withDawn.map((g) => g.period)).toEqual(['dawn', 'morning']);
  });

  it('textos de data, duração e término', () => {
    expect(longDate({ year: 2026, month: 10, day: 16 })).toBe('sexta-feira, 16 de outubro');
    expect(formatDuration(45)).toBe('45 min');
    expect(formatDuration(60)).toBe('1h');
    expect(formatDuration(90)).toBe('1h30');
    expect(addMinutesToLabel('10:30', 45)).toBe('11:15');
  });
});
