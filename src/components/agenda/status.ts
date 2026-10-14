import type { AppointmentStatus } from '@/generated/prisma/client';

export const STATUS_LABELS: Record<AppointmentStatus, string> = {
  SCHEDULED: 'A confirmar',
  CONFIRMED: 'Confirmado',
  IN_PROGRESS: 'Em atendimento',
  DONE: 'Concluído',
  CANCELED: 'Cancelado',
  NO_SHOW: 'Faltou',
};

export const STATUS_BADGE_VARIANT: Record<
  AppointmentStatus,
  'default' | 'secondary' | 'outline' | 'destructive'
> = {
  SCHEDULED: 'outline',
  CONFIRMED: 'default',
  IN_PROGRESS: 'default',
  DONE: 'secondary',
  CANCELED: 'destructive',
  NO_SHOW: 'destructive',
};

export const ACTIVE_STATUS_OPTIONS: AppointmentStatus[] = [
  'SCHEDULED',
  'CONFIRMED',
  'IN_PROGRESS',
  'DONE',
  'NO_SHOW',
];

/**
 * Cor de cada status na grade — o padrão do mercado (Fresha, Zenoti, Square): a recepção lê o que
 * precisa de ação pela cor, sem abrir o card. Laranja é o que ainda falta confirmar.
 */
export const STATUS_COLORS: Record<AppointmentStatus, string> = {
  SCHEDULED: '#ff9500',
  CONFIRMED: 'var(--system-blue)',
  IN_PROGRESS: 'var(--system-indigo)',
  DONE: 'var(--system-green)',
  NO_SHOW: 'var(--system-red)',
  CANCELED: '#8e8e93',
};

/** Ordem da legenda: o caminho normal de um atendimento, depois a exceção. */
export const LEGEND_STATUSES: AppointmentStatus[] = [
  'SCHEDULED',
  'CONFIRMED',
  'IN_PROGRESS',
  'DONE',
  'NO_SHOW',
];

export type QuickStatusAction = {
  status: Exclude<AppointmentStatus, 'CANCELED'>;
  label: string;
  primary?: boolean;
};

/**
 * O próximo passo de cada status, em um clique: Confirmar → Iniciar → Concluir.
 * "Faltou" só faz sentido antes de o atendimento começar.
 */
export function quickStatusActions(status: AppointmentStatus): QuickStatusAction[] {
  switch (status) {
    case 'SCHEDULED':
      return [
        { status: 'CONFIRMED', label: 'Confirmar', primary: true },
        { status: 'IN_PROGRESS', label: 'Iniciar atendimento' },
        { status: 'NO_SHOW', label: 'Faltou' },
      ];
    case 'CONFIRMED':
      return [
        { status: 'IN_PROGRESS', label: 'Iniciar atendimento', primary: true },
        { status: 'NO_SHOW', label: 'Faltou' },
      ];
    case 'IN_PROGRESS':
      return [{ status: 'DONE', label: 'Concluir e cobrar', primary: true }];
    case 'NO_SHOW':
      return [{ status: 'SCHEDULED', label: 'Desfazer falta' }];
    default:
      return [];
  }
}
