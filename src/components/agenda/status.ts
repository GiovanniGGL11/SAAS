import type { AppointmentStatus } from '@/generated/prisma/client';

export const STATUS_LABELS: Record<AppointmentStatus, string> = {
  SCHEDULED: 'Agendado',
  CONFIRMED: 'Confirmado',
  IN_PROGRESS: 'Em andamento',
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
