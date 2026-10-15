/**
 * Regras e formatos do agendamento público que valem igual no navegador e no servidor: validação
 * de nome e WhatsApp, máscara do telefone e a divisão dos horários por período do dia.
 */

// ---- Nome e WhatsApp -------------------------------------------------------------------------

export function validateBookingName(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) return 'Informe seu nome.';
  if (trimmed.length < 2) return 'Informe pelo menos 2 letras.';
  if (trimmed.length > 120) return 'Use até 120 caracteres.';
  return null;
}

/**
 * WhatsApp brasileiro com DDD (10 ou 11 dígitos) ou internacional começando com "+" (10 a 15
 * dígitos, o padrão E.164). O servidor guarda só os dígitos, como em todo o sistema.
 */
export function validateBookingPhone(raw: string): string | null {
  const value = raw.trim();
  const digits = value.replace(/\D/g, '');
  if (!digits) return 'Informe seu WhatsApp.';
  if (value.startsWith('+')) {
    return digits.length >= 10 && digits.length <= 15
      ? null
      : 'Número internacional: inclua o código do país e o número completo.';
  }
  return digits.length === 10 || digits.length === 11
    ? null
    : 'Informe o WhatsApp com DDD, por exemplo (11) 98888-7777.';
}

/** Máscara enquanto digita: (11) 98888-7777; com "+" na frente, deixa o formato internacional livre. */
export function maskBookingPhone(raw: string): string {
  if (raw.trim().startsWith('+')) {
    return `+${raw.replace(/\D/g, '').slice(0, 15)}`;
  }
  const d = raw.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : '';
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

// ---- Horários por período -------------------------------------------------------------------

export type DayPeriod = 'dawn' | 'morning' | 'afternoon' | 'evening';

export const PERIOD_LABEL: Record<DayPeriod, string> = {
  dawn: 'Madrugada',
  morning: 'Manhã',
  afternoon: 'Tarde',
  evening: 'Noite',
};

const PERIOD_ORDER: DayPeriod[] = ['dawn', 'morning', 'afternoon', 'evening'];

/** "09:30" → manhã. Madrugada até 5h59, manhã até 11h59, tarde até 17h59, noite depois. */
export function periodOf(label: string): DayPeriod {
  const hour = Number(label.slice(0, 2));
  if (hour < 6) return 'dawn';
  if (hour < 12) return 'morning';
  if (hour < 18) return 'afternoon';
  return 'evening';
}

/**
 * Só os períodos que têm horário de verdade — madrugada aparece apenas quando o expediente cai
 * nela, nunca como aba vazia.
 */
export function groupSlotsByPeriod<T extends { label: string }>(
  slots: T[],
): { period: DayPeriod; slots: T[] }[] {
  const groups = new Map<DayPeriod, T[]>();
  for (const slot of slots) {
    const period = periodOf(slot.label);
    groups.set(period, [...(groups.get(period) ?? []), slot]);
  }
  return PERIOD_ORDER.filter((p) => groups.has(p)).map((period) => ({
    period,
    slots: groups.get(period)!,
  }));
}

// ---- Datas (montadas à mão: saem iguais no servidor e no navegador) --------------------------

export const WEEKDAY_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
export const WEEKDAY_LONG = [
  'domingo',
  'segunda-feira',
  'terça-feira',
  'quarta-feira',
  'quinta-feira',
  'sexta-feira',
  'sábado',
];
export const MONTH_LONG = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
];

export type DateParts = { year: number; month: number; day: number };

export function weekdayOf(d: DateParts): number {
  return new Date(Date.UTC(d.year, d.month - 1, d.day)).getUTCDay();
}

export function dateKey(d: DateParts): string {
  return `${d.year}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`;
}

/** "quinta-feira, 16 de outubro" */
export function longDate(d: DateParts): string {
  return `${WEEKDAY_LONG[weekdayOf(d)]}, ${d.day} de ${MONTH_LONG[d.month - 1]}`;
}

/** "45 min", "1h", "1h30" */
export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`;
}

/** "10:30" + 45 min → "11:15" */
export function addMinutesToLabel(label: string, minutes: number): string {
  const [h, m] = label.split(':').map(Number);
  const total = h * 60 + m + minutes;
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}
