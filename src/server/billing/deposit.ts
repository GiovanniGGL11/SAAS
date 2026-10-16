import { prisma } from '@/lib/db';
import { openSecret } from '@/server/secret-box';
import { UserError } from '@/server/errors';
import { feeFields } from '@/server/data/finance';
import { recordAuditLog } from '@/server/data/audit';
import { cancelAppointment } from '@/server/data/appointments';
import { scheduleConfirmation } from '@/server/whatsapp/automation';
import { formatTimeInTz, utcToCalendarDate } from '@/lib/time';
import {
  AsaasError,
  PAID_STATUSES,
  createCustomer,
  createPixPayment,
  getPayment,
  getPixQrCode,
} from '@/server/billing/asaas';

/*
  Sinal por PIX no agendamento online, recebido na conta Asaas do próprio salão. O horário fica
  reservado por alguns minutos; pago, o agendamento confirma e o sinal entra no financeiro (e é
  descontado na comanda). Não pago no prazo, o horário volta a ficar livre.
*/

/** Valor mínimo de cobrança na Asaas. */
const MIN_DEPOSIT = 5;

export type DepositConfig = { percent: number; holdMinutes: number; apiKey: string };

export async function getDepositConfig(companyId: string): Promise<DepositConfig | null> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { asaasApiKey: true, depositPercent: true, depositHoldMinutes: true },
  });
  if (!company?.asaasApiKey || company.depositPercent <= 0) return null;
  try {
    return {
      percent: company.depositPercent,
      holdMinutes: company.depositHoldMinutes,
      apiKey: openSecret(company.asaasApiKey),
    };
  } catch {
    return null;
  }
}

export function depositAmountFor(price: number, percent: number): number | null {
  const amount = Math.round(price * percent) / 100;
  return amount >= MIN_DEPOSIT ? amount : null;
}

export type DepositCharge = {
  amount: number;
  qrImage: string;
  copyPaste: string;
  expiresAt: string;
};

/** Gera o PIX do sinal para um agendamento recém-criado e guarda o prazo para pagar. */
export async function createDeposit(params: {
  companyId: string;
  timezone: string;
  appointmentId: string;
  clientId: string;
  name: string;
  phone: string;
  cpf: string;
  config: DepositConfig;
}): Promise<DepositCharge | null> {
  const appointment = await prisma.appointment.findFirstOrThrow({
    where: { id: params.appointmentId, companyId: params.companyId },
  });
  const amount = depositAmountFor(Number(appointment.priceSnapshot), params.config.percent);
  if (amount === null) return null;
  const day = utcToCalendarDate(new Date(), params.timezone);
  const startLabel = `${new Intl.DateTimeFormat('pt-BR', { timeZone: params.timezone, day: '2-digit', month: '2-digit' }).format(appointment.startAt)} às ${formatTimeInTz(appointment.startAt, params.timezone)}`;
  const customer = await createCustomer(params.config.apiKey, {
    name: params.name.trim(),
    cpfCnpj: params.cpf.replace(/\D/g, ''),
    mobilePhone: params.phone.replace(/\D/g, ''),
    externalReference: params.clientId,
  });
  const payment = await createPixPayment(params.config.apiKey, {
    customer: customer.id,
    value: amount,
    dueDate: `${day.year}-${String(day.month).padStart(2, '0')}-${String(day.day).padStart(2, '0')}`,
    description: `Sinal — ${appointment.serviceNameSnapshot} em ${startLabel}`,
    externalReference: appointment.id,
  });
  const qr = await getPixQrCode(params.config.apiKey, payment.id);
  const expiresAt = new Date(Date.now() + params.config.holdMinutes * 60_000);
  await prisma.appointment.update({
    where: { id: appointment.id },
    data: {
      depositAmount: amount,
      depositStatus: 'PENDING',
      depositPaymentId: payment.id,
      depositExpiresAt: expiresAt,
      notes: [
        appointment.notes,
        `Aguardando sinal PIX de R$ ${amount.toFixed(2).replace('.', ',')}`,
      ]
        .filter(Boolean)
        .join(' · '),
    },
  });
  return {
    amount,
    qrImage: qr.encodedImage,
    copyPaste: qr.payload,
    expiresAt: expiresAt.toISOString(),
  };
}

/** Sinal pago: confirma o horário e lança a entrada "Sinal" (descontada depois na comanda). */
export async function markDepositPaid(companyId: string, appointmentId: string): Promise<boolean> {
  const updated = await prisma.$transaction(async (tx) => {
    const appointment = await tx.appointment.findFirst({ where: { id: appointmentId, companyId } });
    if (!appointment || appointment.depositStatus === 'PAID' || appointment.depositAmount === null)
      return false;
    const marked = await tx.appointment.updateMany({
      where: { id: appointmentId, depositStatus: { in: ['PENDING', 'EXPIRED'] } },
      data: {
        depositStatus: 'PAID',
        ...(appointment.status === 'SCHEDULED' ? { status: 'CONFIRMED' as const } : {}),
        notes: (appointment.notes ?? '').replace(/Aguardando sinal PIX/, 'Sinal PIX pago') || null,
      },
    });
    if (marked.count === 0) return false;
    const paidAt = new Date();
    await tx.transaction.create({
      data: {
        companyId,
        appointmentId,
        clientId: appointment.clientId,
        type: 'INCOME',
        status: 'PAID',
        category: 'Sinal',
        description: `Sinal — ${appointment.serviceNameSnapshot}`,
        amount: appointment.depositAmount,
        paymentMethod: 'PIX',
        paidAt,
        createdByUserId: 'online-booking',
        ...(await feeFields(tx, companyId, {
          type: 'INCOME',
          status: 'PAID',
          amount: appointment.depositAmount,
          paymentMethod: 'PIX',
          paidAt,
        })),
      },
    });
    await recordAuditLog(
      {
        companyId,
        entityType: 'Appointment',
        entityId: appointmentId,
        action: 'status_changed',
        userId: 'online-booking',
        metadata: { deposit: 'PAID', amount: Number(appointment.depositAmount) },
      },
      tx,
    );
    return true;
  });
  // Com o sinal pago, a confirmação automática pelo WhatsApp (se ligada) pode sair.
  if (updated) scheduleConfirmation(companyId, appointmentId);
  return updated;
}

/** Consulta a Asaas e dá baixa se já foi pago. Usado pela tela do cliente e antes de expirar. */
export async function refreshDeposit(
  companyId: string,
  appointmentId: string,
  config?: DepositConfig | null,
) {
  const appointment = await prisma.appointment.findFirst({
    where: { id: appointmentId, companyId },
    select: { depositStatus: true, depositPaymentId: true },
  });
  if (!appointment?.depositPaymentId) return null;
  if (appointment.depositStatus !== 'PENDING') return appointment.depositStatus;
  const cfg = config ?? (await getDepositConfig(companyId));
  if (!cfg) return appointment.depositStatus;
  try {
    const payment = await getPayment(cfg.apiKey, appointment.depositPaymentId);
    if (PAID_STATUSES.has(payment.status)) {
      await markDepositPaid(companyId, appointmentId);
      return 'PAID' as const;
    }
  } catch (error) {
    console.error('[sinal] falha ao consultar a Asaas', appointmentId, error);
  }
  return appointment.depositStatus;
}

/**
 * Libera horários com sinal vencido: confere na Asaas (pode ter sido pago no último minuto) e, se
 * não foi, cancela o agendamento. Roda ao listar horários do link, ao abrir a agenda e no cron.
 */
export async function releaseExpiredDeposits(companyId: string, limit = 20) {
  const expired = await prisma.appointment.findMany({
    where: { companyId, depositStatus: 'PENDING', depositExpiresAt: { lt: new Date() } },
    select: { id: true },
    take: limit,
  });
  if (expired.length === 0) return 0;
  const config = await getDepositConfig(companyId);
  let released = 0;
  for (const { id } of expired) {
    const status = await refreshDeposit(companyId, id, config);
    if (status === 'PAID') continue;
    const marked = await prisma.appointment.updateMany({
      where: { id, depositStatus: 'PENDING' },
      data: { depositStatus: 'EXPIRED' },
    });
    if (marked.count === 0) continue;
    await cancelAppointment({
      companyId,
      id,
      canceledByUserId: 'online-booking',
      reason: 'Sinal PIX não pago no prazo',
    });
    released += 1;
  }
  return released;
}

export function asUserError(error: unknown): never {
  if (error instanceof AsaasError)
    throw new UserError(`Não foi possível gerar o PIX do sinal: ${error.message}`);
  throw error;
}
