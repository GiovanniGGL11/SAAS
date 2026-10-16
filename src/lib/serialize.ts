import type {
  Appointment,
  AppointmentProduct,
  Coupon,
  LoyaltyEntry,
  LoyaltyProgram,
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
): Omit<T, 'priceSnapshot' | 'depositAmount'> & { priceSnapshot: number; depositAmount: number | null } {
  return {
    ...appointment,
    priceSnapshot: Number(appointment.priceSnapshot),
    depositAmount: appointment.depositAmount === null ? null : Number(appointment.depositAmount),
  };
}

export type SerializedAppointment = Omit<AppointmentWithRelations, 'priceSnapshot' | 'depositAmount'> & {
  priceSnapshot: number;
  depositAmount: number | null;
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
): Omit<T, 'amount' | 'feeAmount'> & { amount: number; feeAmount: number } {
  return {
    ...transaction,
    amount: Number(transaction.amount),
    feeAmount: Number(transaction.feeAmount),
  };
}

export type SerializedTransaction = Omit<Transaction, 'amount' | 'feeAmount'> & {
  amount: number;
  feeAmount: number;
};

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

export function serializeCoupon<T extends Coupon>(
  coupon: T,
): Omit<T, 'discountValue'> & { discountValue: number } {
  return { ...coupon, discountValue: Number(coupon.discountValue) };
}

export type SerializedCoupon = Omit<Coupon, 'discountValue'> & { discountValue: number };

type LoyaltyDecimalFields = 'pointsPerReal' | 'cashbackPercent' | 'rewardValue';

export function serializeLoyaltyProgram<T extends LoyaltyProgram>(
  program: T,
): Omit<T, LoyaltyDecimalFields> & {
  pointsPerReal: number;
  cashbackPercent: number;
  rewardValue: number | null;
} {
  return {
    ...program,
    pointsPerReal: Number(program.pointsPerReal),
    cashbackPercent: Number(program.cashbackPercent),
    rewardValue: program.rewardValue === null ? null : Number(program.rewardValue),
  };
}

export type SerializedLoyaltyProgram = Omit<LoyaltyProgram, LoyaltyDecimalFields> & {
  pointsPerReal: number;
  cashbackPercent: number;
  rewardValue: number | null;
  rewardService: { id: string; name: string } | null;
};

export function serializeLoyaltyEntry<T extends LoyaltyEntry>(
  entry: T,
): Omit<T, 'amount'> & { amount: number } {
  return { ...entry, amount: Number(entry.amount) };
}

export type SerializedLoyaltyEntry = Omit<LoyaltyEntry, 'amount'> & { amount: number };

export function formatCurrencyBRL(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
