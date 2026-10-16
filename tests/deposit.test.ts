import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/server/whatsapp/automation', () => ({ scheduleConfirmation: vi.fn() }));

import { prisma } from '@/lib/db';
import { sealSecret } from '@/server/secret-box';
import { checkoutAppointment, createAppointment } from '@/server/data/appointments';
import { computeCommissions } from '@/server/data/commissions';
import {
  createDeposit,
  depositAmountFor,
  getDepositConfig,
  markDepositPaid,
  releaseExpiredDeposits,
} from '@/server/billing/deposit';
import { createTestCompany, deleteTestCompany } from './helpers';

const TZ = 'America/Sao_Paulo';

describe('sinal por PIX no agendamento online', () => {
  let fixture: Awaited<ReturnType<typeof createTestCompany>>;
  let companyId: string;
  let paymentStatus = 'PENDING';
  let slot = 0;

  beforeEach(async () => {
    fixture = await createTestCompany('sinal');
    companyId = fixture.company.id;
    await prisma.company.update({
      where: { id: companyId },
      data: {
        asaasApiKey: sealSecret('$aact_hmlg_salao'),
        depositPercent: 30,
        depositHoldMinutes: 30,
      },
    });
    await prisma.professional.update({
      where: { id: fixture.professional.id },
      data: { commissionType: 'PERCENTAGE', commissionValue: 50 },
    });
    paymentStatus = 'PENDING';
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.endsWith('/customers')) return Response.json({ id: 'cus_x' });
        if (url.endsWith('/payments'))
          return Response.json({
            id: `pay_${Math.random().toString(36).slice(2)}`,
            status: 'PENDING',
            invoiceUrl: 'x',
          });
        if (url.endsWith('/pixQrCode'))
          return Response.json({
            encodedImage: 'QRBASE64',
            payload: '000201PIX',
            expirationDate: '',
          });
        return Response.json({ id: 'pay', status: paymentStatus, value: 15 });
      }),
    );
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    await deleteTestCompany(companyId);
  });

  const book = async () => {
    const appointment = await createAppointment({
      companyId,
      clientId: fixture.client.id,
      professionalId: fixture.professional.id,
      serviceId: fixture.service.id, // R$ 50
      startAt: new Date(Date.UTC(2030, 10, 4, 12 + slot++)),
      createdByUserId: 'online-booking',
    });
    const config = (await getDepositConfig(companyId))!;
    const deposit = await createDeposit({
      companyId,
      timezone: TZ,
      appointmentId: appointment.id,
      clientId: fixture.client.id,
      name: 'Cliente',
      phone: '11988887777',
      cpf: '12345678909',
      config,
    });
    return { appointment, deposit };
  };

  it('valor mínimo da Asaas', () => {
    expect(depositAmountFor(50, 30)).toBe(15);
    expect(depositAmountFor(10, 30)).toBeNull(); // R$ 3 < R$ 5
  });

  it('pago: confirma, lança o sinal, desconta na comanda e entra na comissão', async () => {
    const { appointment, deposit } = await book();
    expect(deposit).toMatchObject({ amount: 15, qrImage: 'QRBASE64', copyPaste: '000201PIX' });
    expect(await markDepositPaid(companyId, appointment.id)).toBe(true);
    expect(await markDepositPaid(companyId, appointment.id)).toBe(false); // só uma vez
    const after = await prisma.appointment.findUniqueOrThrow({ where: { id: appointment.id } });
    expect([after.status, after.depositStatus]).toEqual(['CONFIRMED', 'PAID']);

    const { total } = await checkoutAppointment({
      companyId,
      id: appointment.id,
      paymentMethod: 'CASH',
      updatedByUserId: 'u',
    });
    expect(total).toBe(35); // R$ 50 − R$ 15 de sinal
    const [line] = await computeCommissions(
      companyId,
      { startAt: new Date(Date.UTC(2030, 10, 1)), endAt: new Date(Date.UTC(2030, 10, 30)) },
      [fixture.professional.id],
    );
    expect(line.base).toBe(50);
    expect(line.commission).toBe(25);
  });

  it('vencido: confere na Asaas; sem pagamento, cancela e libera; pago no último minuto, confirma', async () => {
    const late = await book();
    const paidLate = await book();
    await prisma.appointment.updateMany({
      where: { id: { in: [late.appointment.id, paidLate.appointment.id] } },
      data: { depositExpiresAt: new Date(Date.now() - 60_000) },
    });
    // O primeiro consulta a Asaas como "pendente"; depois a Asaas passa a dizer "pago".
    let calls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({ id: 'pay', status: calls++ === 0 ? 'PENDING' : 'RECEIVED', value: 15 }),
      ),
    );
    expect(await releaseExpiredDeposits(companyId)).toBe(1);
    const rows = await prisma.appointment.findMany({
      where: { id: { in: [late.appointment.id, paidLate.appointment.id] } },
      orderBy: { startAt: 'asc' },
      select: { status: true, depositStatus: true },
    });
    expect(rows).toEqual([
      { status: 'CANCELED', depositStatus: 'EXPIRED' },
      { status: 'CONFIRMED', depositStatus: 'PAID' },
    ]);
  });
});
