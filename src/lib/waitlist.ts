import { utcToCalendarDate, utcToMinutesSinceMidnight } from '@/lib/time';

/*
  Regras puras da lista de espera: um horário serve para quem está esperando? Usada pela sugestão
  manual, pelo convite e pela rotina automática — todas aceitam o mesmo critério.
*/

export type WaitlistPreferences = {
  professionalId: string | null;
  acceptedProfessionalIds: string[];
  desiredDate: string | null;
  weekdays: number[];
  timeFrom: number | null;
  timeTo: number | null;
  validUntil: Date | null;
};

export type CandidateSlot = { professionalId: string; startAt: Date; endAt: Date };

export const WEEKDAY_SHORT = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'] as const;

/** Profissionais aceitos; `null` = qualquer um. */
export function acceptedProfessionals(entry: WaitlistPreferences): string[] | null {
  if (entry.acceptedProfessionalIds.length) return entry.acceptedProfessionalIds;
  return entry.professionalId ? [entry.professionalId] : null;
}

function dayKey(date: Date, timezone: string) {
  const d = utcToCalendarDate(date, timezone);
  return `${d.year}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`;
}

/** O horário cabe nas preferências do cliente (profissional, dia, semana, faixa e validade)? */
export function slotFitsEntry(
  entry: WaitlistPreferences,
  slot: CandidateSlot,
  timezone: string,
  now = new Date(),
): boolean {
  if (slot.startAt.getTime() <= now.getTime()) return false;
  if (entry.validUntil && slot.startAt.getTime() > entry.validUntil.getTime()) return false;
  const pros = acceptedProfessionals(entry);
  if (pros && !pros.includes(slot.professionalId)) return false;
  if (entry.desiredDate && dayKey(slot.startAt, timezone) !== entry.desiredDate) return false;
  if (entry.weekdays.length) {
    const d = utcToCalendarDate(slot.startAt, timezone);
    const weekday = new Date(Date.UTC(d.year, d.month - 1, d.day)).getUTCDay();
    if (!entry.weekdays.includes(weekday)) return false;
  }
  const start = utcToMinutesSinceMidnight(slot.startAt, timezone);
  const duration = Math.round((slot.endAt.getTime() - slot.startAt.getTime()) / 60_000);
  if (entry.timeFrom != null && start < entry.timeFrom) return false;
  if (entry.timeTo != null && start + duration > entry.timeTo) return false;
  return true;
}

export function minutesLabel(minutes: number) {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

/** Resumo legível das preferências ("seg, qua · 08:00–12:00 · até 30/10"). */
export function preferencesLabel(entry: WaitlistPreferences, timezone: string): string {
  const parts: string[] = [];
  if (entry.desiredDate) {
    const [, m, d] = entry.desiredDate.split('-');
    parts.push(`dia ${d}/${m}`);
  }
  if (entry.weekdays.length) parts.push(entry.weekdays.map((w) => WEEKDAY_SHORT[w]).join(', '));
  if (entry.timeFrom != null || entry.timeTo != null) {
    parts.push(`${minutesLabel(entry.timeFrom ?? 0)}–${minutesLabel(entry.timeTo ?? 1440)}`);
  }
  if (entry.validUntil) {
    const d = utcToCalendarDate(entry.validUntil, timezone);
    parts.push(`até ${String(d.day).padStart(2, '0')}/${String(d.month).padStart(2, '0')}`);
  }
  return parts.join(' · ') || 'qualquer dia e horário';
}
