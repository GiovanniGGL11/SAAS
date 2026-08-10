import type { Appointment, Service } from '@/generated/prisma/client';
import type { AppointmentWithRelations } from '@/server/data/appointments';

/**
 * Prisma's Decimal (priceSnapshot) is a class instance that React's Server
 * Action/RSC transport cannot serialize on its own. Money stays Decimal at
 * rest (src/server/data) for precision; everything crossing into a Client
 * Component goes through here first, converted to a plain number — fine for
 * display, since no further arithmetic happens client-side.
 */
export function serializeAppointment<T extends Appointment>(
  appointment: T,
): Omit<T, 'priceSnapshot'> & { priceSnapshot: number } {
  return { ...appointment, priceSnapshot: Number(appointment.priceSnapshot) };
}

export type SerializedAppointment = Omit<AppointmentWithRelations, 'priceSnapshot'> & {
  priceSnapshot: number;
};

export function serializeService<T extends Service>(
  service: T,
): Omit<T, 'price'> & { price: number } {
  return { ...service, price: Number(service.price) };
}

export type SerializedService = Omit<Service, 'price'> & { price: number };

export function formatCurrencyBRL(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
