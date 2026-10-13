import {
  addDays,
  calendarDateToUtc,
  formatTimeInTz,
  utcToCalendarDate,
  type CalendarDate,
} from '@/lib/time';
import { UserError } from '@/server/errors';

/*
  O modelo conversa em horário local da empresa ("2026-10-14T15:00"); o banco guarda UTC. Toda
  conversão passa por aqui, sempre com o fuso da empresa — nunca o do servidor.
*/

const pad = (n: number) => String(n).padStart(2, '0');

export function parseLocalDate(value: string): CalendarDate {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) throw new UserError(`Data inválida: "${value}". Use AAAA-MM-DD.`);
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

export function parseLocalDateTime(value: string, timezone: string): Date {
  const match = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})/.exec(value.trim());
  if (!match) throw new UserError(`Data e hora inválidas: "${value}". Use AAAA-MM-DDTHH:mm.`);
  return calendarDateToUtc(
    parseLocalDate(match[1]),
    Number(match[2]) * 60 + Number(match[3]),
    timezone,
  );
}

/** Do começo do dia `from` ao fim do dia `to` (inclusive), no fuso da empresa. */
export function localDayRange(from: string, to: string | undefined, timezone: string) {
  const start = parseLocalDate(from);
  const end = to ? parseLocalDate(to) : start;
  return {
    startAt: calendarDateToUtc(start, 0, timezone),
    endAt: calendarDateToUtc(addDays(end, 1), 0, timezone),
  };
}

export function formatLocalDate(date: CalendarDate): string {
  return `${date.year}-${pad(date.month)}-${pad(date.day)}`;
}

/** "2026-10-14 15:00" no fuso da empresa — o formato que o modelo recebe. */
export function toLocalDateTime(instant: Date, timezone: string): string {
  return `${formatLocalDate(utcToCalendarDate(instant, timezone))} ${formatTimeInTz(instant, timezone)}`;
}

/** "ter., 14/10 às 15:00" — o formato que a pessoa lê no cartão de confirmação. */
export function toHumanDateTime(instant: Date, timezone: string): string {
  const day = new Intl.DateTimeFormat('pt-BR', {
    timeZone: timezone,
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
  }).format(instant);
  return `${day} às ${formatTimeInTz(instant, timezone)}`;
}

export function formatBRL(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
