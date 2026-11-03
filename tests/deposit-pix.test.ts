import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/server/whatsapp/automation', () => ({ scheduleConfirmation: vi.fn() }));

import { prisma } from '@/lib/db';
import { createAppointment } from '@/server/data/appointments';
import {
  createDeposit,
  getDepositConfig,
  markDepositPaid,
  refreshDeposit,
  releaseExpiredDeposits,
} from '@/server/billing/deposit';
import { createTestCompany, deleteTestCompany } from './helpers';

describe('PIX direto na chave do negócio (confirmação manual)', () => {
  let fixture: Awaited<ReturnType<typeof createTestCompany>>;
  let companyId: string;
  const fetchSpy = vi.fn(async () => Response.json({}));

  beforeEach(async () => {
    fixture = await createTestCompany('pixchave');
    companyId = fixture.company.id;
    await prisma.company.update({
      where: { id: companyId },
      data: {
        depositMethod: 'pix',
        depositPercent: 50,
        pixKey: '+5511999998888',
        pixKeyType: 'PHONE',
        pixName: 'Studio Teste',
        pixCity: 'Sao Paulo',
      },
    });
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    await deleteTestCompany(companyId);
  });

  it('gera o PIX sem Asaas, não expira e só confirma pela equipe', async () => {
    const config = (await getDepositConfig(companyId))!;
    expect(config.method).toBe('pix');
    expect(config.apiKey).toBeNull();

    const appointment = await createAppointment({
      companyId,
      clientId: fixture.client.id,
      professionalId: fixture.professional.id,
      serviceId: fixture.service.id, // R$ 50
      startAt: new Date(Date.UTC(2030, 10, 4, 13)),
      createdByUserId: 'online-booking',
    });
    const deposit = (await createDeposit({
      companyId,
      timezone: 'America/Sao_Paulo',
      appointmentId: appointment.id,
      clientId: fixture.client.id,
      name: 'Cliente',
      phone: '11988887777',
      config,
    }))!;
    expect(deposit.amount).toBe(25);
    expect(deposit.expiresAt).toBeNull();
    expect(deposit.copyPaste).toContain('0114+5511999998888');
    expect(deposit.copyPaste).toContain('540525.00');
    expect(deposit.qrImage.length).toBeGreaterThan(100);
    expect(fetchSpy).not.toHaveBeenCalled(); // nada de Asaas

    // Não há prazo: a rotina de liberar horários não cancela.
    expect(await releaseExpiredDeposits(companyId)).toBe(0);
    expect(await refreshDeposit(companyId, appointment.id)).toBe('PENDING');

    // A equipe confirma: entra no financeiro como Sinal e a nota é atualizada.
    expect(await markDepositPaid(companyId, appointment.id)).toBe(true);
    expect(await refreshDeposit(companyId, appointment.id)).toBe('PAID');
    const paid = await prisma.appointment.findUniqueOrThrow({ where: { id: appointment.id } });
    expect(paid.status).toBe('CONFIRMED');
    expect(paid.notes).toContain('PIX de R$ 25,00 recebido');
    const tx = await prisma.transaction.findFirstOrThrow({
      where: { companyId, appointmentId: appointment.id },
    });
    expect(Number(tx.amount)).toBe(25);
    expect(tx.category).toBe('Sinal');
  });

  it('sem chave cadastrada não cobra', async () => {
    await prisma.company.update({ where: { id: companyId }, data: { pixKey: null } });
    expect(await getDepositConfig(companyId)).toBeNull();
  });
});
