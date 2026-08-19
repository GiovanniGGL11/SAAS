import type {
  Appointment,
  AppointmentProduct,
  Product,
  Professional,
  Service,
  Transaction,
} from '@/generated/prisma/client';
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

/** commissionValue is Decimal | null — same cross-boundary problem as price. */
export function serializeProfessional<T extends Professional>(
  professional: T,
): Omit<T, 'commissionValue'> & { commissionValue: number | null } {
  return {
    ...professional,
    commissionValue:
      professional.commissionValue === null ? null : Number(professional.commissionValue),
  };
}

export type SerializedProfessional = Omit<Professional, 'commissionValue'> & {
  commissionValue: number | null;
};

export function serializeTransaction<T extends Transaction>(
  transaction: T,
): Omit<T, 'amount'> & { amount: number } {
  return { ...transaction, amount: Number(transaction.amount) };
}

export type SerializedTransaction = Omit<Transaction, 'amount'> & { amount: number };

export function serializeProduct<T extends Product>(
  product: T,
): Omit<T, 'costPrice' | 'salePrice'> & { costPrice: number; salePrice: number } {
  return {
    ...product,
    costPrice: Number(product.costPrice),
    salePrice: Number(product.salePrice),
  };
}

export type SerializedProduct = Omit<Product, 'costPrice' | 'salePrice'> & {
  costPrice: number;
  salePrice: number;
};

/** priceSnapshot on AppointmentProduct is the unit price at time of sale. */
export function serializeAppointmentProduct<T extends AppointmentProduct>(
  appointmentProduct: T,
): Omit<T, 'priceSnapshot'> & { priceSnapshot: number } {
  return { ...appointmentProduct, priceSnapshot: Number(appointmentProduct.priceSnapshot) };
}

export type SerializedAppointmentProduct = Omit<AppointmentProduct, 'priceSnapshot'> & {
  priceSnapshot: number;
};

export function formatCurrencyBRL(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
