import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { prisma } from '@/lib/db';
import { checkoutAppointment, createAppointment } from '@/server/data/appointments';
import { listClients } from '@/server/data/clients';
import { getMyEarnings } from '@/server/data/my-earnings';
import { createTestCompany, deleteTestCompany } from './helpers';

describe('login do profissional: meus ganhos e meus clientes', () => {
  let f: Awaited<ReturnType<typeof createTestCompany>>;
  let colleagueId: string;
  let otherClientId: string;
  const range = { startAt: new Date(Date.UTC(2030, 2, 1)), endAt: new Date(Date.UTC(2030, 3, 1)) };

  beforeAll(async () => {
    f = await createTestCompany('earn');
    await prisma.professional.update({
      where: { id: f.professional.id },
      data: { commissionType: 'PERCENTAGE', commissionValue: 40 },
    });
    const colleague = await prisma.professional.create({
      data: { companyId: f.company.id, name: 'Colega', color: '#ff9500' },
    });
    colleagueId = colleague.id;
    const other = await prisma.client.create({
      data: { companyId: f.company.id, name: 'Cliente do colega', phone: '11977776666' },
    });
    otherClientId = other.id;

    // Dois atendimentos dele (um concluído e pago), um do colega.
    const mine = await createAppointment({
      companyId: f.company.id,
      clientId: f.client.id,
      professionalId: f.professional.id,
      serviceId: f.service.id, // R$ 50
      startAt: new Date(Date.UTC(2030, 2, 10, 13)),
      createdByUserId: 'user_test',
    });
    await checkoutAppointment({
      companyId: f.company.id,
      id: mine.id,
      paymentMethod: 'PIX',
      updatedByUserId: 'user_test',
    });
    await createAppointment({
      companyId: f.company.id,
      clientId: other.id,
      professionalId: colleagueId,
      serviceId: f.service.id,
      startAt: new Date(Date.UTC(2030, 2, 11, 13)),
      createdByUserId: 'user_test',
    });
    await prisma.professionalAdvance.create({
      data: {
        companyId: f.company.id,
        professionalId: f.professional.id,
        amount: 5,
        createdByUserId: 'user_test',
      },
    });
  });
  afterAll(async () => {
    await prisma.professionalAdvance.deleteMany({ where: { companyId: f.company.id } });
    await deleteTestCompany(f.company.id);
  });

  it('produção, comissão e a receber (comissão menos vales), só dos atendimentos dele', async () => {
    const earnings = await getMyEarnings(
      f.company.id,
      f.professional.id,
      range,
      new Date(Date.UTC(2030, 2, 1)),
    );
    expect(earnings).toMatchObject({
      appointments: 1,
      production: 50,
      commission: 20, // 40% de R$ 50
      openAdvances: 5,
      toReceive: 15,
      payout: null,
    });
    expect(earnings.done.map((d) => d.clientName)).toEqual([f.client.name]);
  });

  it('a lista de clientes do profissional traz só quem ele atende', async () => {
    const mine = await listClients(f.company.id, f.professional.id);
    expect(mine.map((c) => c.id)).toEqual([f.client.id]);
    const all = await listClients(f.company.id);
    expect(all.map((c) => c.id)).toEqual(expect.arrayContaining([f.client.id, otherClientId]));
  });
});
