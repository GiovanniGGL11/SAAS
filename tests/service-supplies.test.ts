import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { prisma } from '@/lib/db';
import {
  cancelAppointment,
  checkoutAppointment,
  createAppointment,
  updateAppointmentStatus,
} from '@/server/data/appointments';
import { listNotices } from '@/server/data/notifications';
import { setServiceSupplies } from '@/server/data/service-supplies';
import { createTestCompany, deleteTestCompany } from './helpers';

/** Serviço que consome estoque: baixa ao concluir, uma vez, e devolve ao desfazer. Dados fictícios. */
describe('serviço que consome estoque', () => {
  let f: Awaited<ReturnType<typeof createTestCompany>>;
  let other: Awaited<ReturnType<typeof createTestCompany>>;
  let productId: string;
  let slot = 0;

  const book = () =>
    createAppointment({
      companyId: f.company.id,
      clientId: f.client.id,
      professionalId: f.professional.id,
      serviceId: f.service.id,
      startAt: new Date(Date.UTC(2032, 0, 5 + slot++, 13, 0)),
      createdByUserId: 'user_test',
    });
  const stock = async () =>
    (await prisma.product.findUniqueOrThrow({ where: { id: productId } })).quantity;
  const finish = (id: string) =>
    checkoutAppointment({
      companyId: f.company.id,
      id,
      paymentMethod: 'PIX',
      updatedByUserId: 'u',
    });

  beforeAll(async () => {
    f = await createTestCompany('supply_a');
    other = await createTestCompany('supply_b');
    productId = (
      await prisma.product.create({
        data: {
          companyId: f.company.id,
          name: 'Luva (teste)',
          costPrice: 1,
          salePrice: 2,
          quantity: 5,
          minQuantity: 2,
        },
      })
    ).id;
    await setServiceSupplies(f.company.id, f.service.id, [{ productId, quantity: 2 }]);
  });

  afterAll(async () => {
    await deleteTestCompany(f.company.id);
    await deleteTestCompany(other.company.id);
  });

  it('valida: produto de outra empresa, repetido e quantidade inválida são recusados', async () => {
    const foreign = await prisma.product.create({
      data: {
        companyId: other.company.id,
        name: 'Alheio',
        costPrice: 1,
        salePrice: 2,
        quantity: 1,
      },
    });
    await expect(
      setServiceSupplies(f.company.id, f.service.id, [{ productId: foreign.id, quantity: 1 }]),
    ).rejects.toThrow(/não encontrado/);
    await expect(
      setServiceSupplies(f.company.id, f.service.id, [
        { productId, quantity: 1 },
        { productId, quantity: 1 },
      ]),
    ).rejects.toThrow(/repetido/);
    await expect(
      setServiceSupplies(f.company.id, f.service.id, [{ productId, quantity: 0 }]),
    ).rejects.toThrow(/inteiro maior que zero/);
    // A lista boa continua intacta.
    expect(await prisma.serviceSupply.count({ where: { serviceId: f.service.id } })).toBe(1);
  });

  it('agendar não baixa; concluir baixa uma vez; desfazer devolve', async () => {
    const appointment = await book();
    expect(await stock()).toBe(5);
    await finish(appointment.id);
    expect(await stock()).toBe(3);
    // Concluir de novo (clique duplo) não baixa outra vez.
    await expect(finish(appointment.id)).rejects.toThrow(/já foi concluído/);
    expect(await stock()).toBe(3);
    const movements = await prisma.stockMovement.findMany({
      where: { appointmentId: appointment.id },
    });
    expect(movements.map((m) => [m.type, m.quantity])).toEqual([['OUT', 2]]);

    await updateAppointmentStatus({
      companyId: f.company.id,
      id: appointment.id,
      status: 'SCHEDULED',
      updatedByUserId: 'u',
    });
    expect(await stock()).toBe(5);
    // Concluir pelo status simples e cancelar também fecham o ciclo.
    const second = await book();
    await updateAppointmentStatus({
      companyId: f.company.id,
      id: second.id,
      status: 'DONE',
      updatedByUserId: 'u',
    });
    expect(await stock()).toBe(3);
    await cancelAppointment({ companyId: f.company.id, id: second.id, canceledByUserId: 'u' });
    expect(await stock()).toBe(5);
    await cancelAppointment({
      companyId: f.company.id,
      id: second.id,
      canceledByUserId: 'u',
    }).catch(() => undefined);
    expect(await stock()).toBe(5);
  });

  it('estoque insuficiente: baixa só o que há (nunca negativo) e registra o que faltou', async () => {
    await prisma.product.update({ where: { id: productId }, data: { quantity: 1 } });
    const appointment = await book();
    await finish(appointment.id);
    expect(await stock()).toBe(0);
    const [movement] = await prisma.stockMovement.findMany({
      where: { appointmentId: appointment.id },
    });
    expect(movement).toMatchObject({ type: 'OUT', quantity: 1 });
    expect(movement.reason).toContain('faltaram 1');
    await cancelAppointment({ companyId: f.company.id, id: appointment.id, canceledByUserId: 'u' });
    expect(await stock()).toBe(1);
  });

  it('sino: avisa estoque baixo e falta de material para os próximos atendimentos', async () => {
    await prisma.product.update({ where: { id: productId }, data: { quantity: 2 } });
    // Dois atendimentos nos próximos dias pedem 4; há 2.
    for (const days of [1, 2]) {
      await createAppointment({
        companyId: f.company.id,
        clientId: f.client.id,
        professionalId: f.professional.id,
        serviceId: f.service.id,
        startAt: new Date(Date.now() + days * 86_400_000 + 3_600_000),
        createdByUserId: 'user_test',
      });
    }
    const notices = await listNotices(f.company.id, f.company.timezone);
    expect(notices.find((n) => n.kind === 'low_stock')?.body).toContain('Luva (teste): 2');
    const shortage = notices.find((n) => n.kind === 'supply_shortage');
    expect(shortage?.body).toBe('Luva (teste): precisa de 4, tem 2 em estoque');
    // Outra empresa não vê.
    expect(
      (await listNotices(other.company.id, other.company.timezone)).some(
        (n) => n.kind === 'supply_shortage',
      ),
    ).toBe(false);
  });
});
