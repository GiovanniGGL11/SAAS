import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { prisma } from '@/lib/db';
import { cancelAppointment, createAppointment } from '@/server/data/appointments';
import { listNotices } from '@/server/data/notifications';
import { createTestCompany, deleteTestCompany } from './helpers';

type Fixture = Awaited<ReturnType<typeof createTestCompany>>;

describe('notification bell', () => {
  let a: Fixture;
  let b: Fixture;

  beforeEach(async () => {
    a = await createTestCompany('notice_a');
    b = await createTestCompany('notice_b');
  });

  afterEach(async () => {
    await deleteTestCompany(a.company.id);
    await deleteTestCompany(b.company.id);
  });

  it('lists low stock, client activity, upcoming and birthdays of the own company only', async () => {
    const now = new Date();
    await prisma.product.createMany({
      data: [
        {
          companyId: a.company.id,
          name: 'Pomada',
          costPrice: 10,
          salePrice: 30,
          quantity: 1,
          minQuantity: 3,
        },
        {
          companyId: a.company.id,
          name: 'Óleo',
          costPrice: 10,
          salePrice: 30,
          quantity: 9,
          minQuantity: 3,
        },
        {
          companyId: b.company.id,
          name: 'Shampoo B',
          costPrice: 10,
          salePrice: 30,
          quantity: 0,
          minQuantity: 5,
        },
      ],
    });

    // Reserva online daqui a 1h e um cancelamento pelo link, na empresa A.
    const online = await createAppointment({
      companyId: a.company.id,
      clientId: a.client.id,
      professionalId: a.professional.id,
      serviceId: a.service.id,
      startAt: new Date(Math.ceil((now.getTime() + 3_600_000) / 60_000) * 60_000),
      createdByUserId: 'online-booking',
    });
    const canceled = await createAppointment({
      companyId: a.company.id,
      clientId: a.client.id,
      professionalId: a.professional.id,
      serviceId: a.service.id,
      startAt: new Date(now.getTime() + 5 * 86_400_000),
      createdByUserId: 'user_staff',
    });
    await cancelAppointment({
      companyId: a.company.id,
      id: canceled.id,
      canceledByUserId: 'client-link',
    });
    // Na empresa B, uma reserva online que não pode aparecer para A.
    await createAppointment({
      companyId: b.company.id,
      clientId: b.client.id,
      professionalId: b.professional.id,
      serviceId: b.service.id,
      startAt: new Date(now.getTime() + 3_600_000),
      createdByUserId: 'online-booking',
    });

    const today = new Intl.DateTimeFormat('en-CA', { timeZone: a.company.timezone }).format(now);
    await prisma.client.update({
      where: { id: a.client.id },
      data: { birthDate: new Date(`1990-${today.slice(5)}T00:00:00Z`) },
    });

    const notices = await listNotices(a.company.id, a.company.timezone, now);
    const kinds = notices.map((n) => n.kind);

    expect(notices.filter((n) => n.kind === 'low_stock').map((n) => n.body)).toEqual([
      'Pomada: 1 unidade (mínimo 3)',
    ]);
    expect(kinds).toContain('client_booked');
    expect(kinds).toContain('client_canceled');
    expect(kinds).toContain('birthday');

    const soon = notices.find((n) => n.kind === 'upcoming');
    expect(soon?.href).toContain(`agendamento=${online.id}`);
    expect(notices.find((n) => n.kind === 'birthday')?.href).toBe(`/clientes/${a.client.id}`);

    // Nada da empresa B.
    expect(JSON.stringify(notices)).not.toContain(b.client.name);
    expect(JSON.stringify(notices)).not.toContain('Shampoo B');
    // Agendamento feito pela equipe não vira aviso de "agendamento online".
    expect(notices.filter((n) => n.kind === 'client_booked')).toHaveLength(1);
  });
});
