/** Textos das opções dos modelos de ficha, compartilhados entre editor, listas e diálogos. */

export const FILLER_LABEL = {
  PROFESSIONAL: 'Só a equipe',
  CLIENT: 'O cliente (pelo link)',
  BOTH: 'Equipe ou cliente',
} as const;

export const RENEWAL_LABEL = {
  EACH_VISIT: 'A cada atendimento',
  ONCE: 'Uma única vez',
  AFTER_DAYS: 'Depois de um prazo',
} as const;

export const REQUIREMENT_LABEL = {
  NONE: 'Não exigir para iniciar',
  SUBMITTED: 'Exigir ficha enviada',
  REVIEWED: 'Exigir ficha revisada',
} as const;

export const ENTRY_STATUS_TONE = {
  REQUESTED: 'bg-foreground/[0.06] text-label-secondary',
  DRAFT: 'bg-amber-500/15 text-amber-800 dark:text-amber-300',
  SUBMITTED: 'bg-system-blue/12 text-system-blue',
  REVIEWED: 'bg-system-green/15 text-[#1f7a35] dark:text-system-green',
} as const;

export const RECORD_STATUS_LABEL = {
  DRAFT: 'Registro em rascunho',
  FINALIZED: 'Registro finalizado',
  AMENDED: 'Registro retificado',
} as const;

export const SIGNATURE_LABEL = {
  not_required: 'Assinatura não exigida',
  pending: 'Assinatura pendente',
  signed: 'Assinatura coletada',
} as const;

export function formatDate(
  value: Date | string | null | undefined,
  timezone: string,
  withTime = false,
) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: timezone,
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    ...(withTime ? { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' as const } : {}),
  }).format(new Date(value));
}
