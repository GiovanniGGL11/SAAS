import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { prisma } from '@/lib/db';
import {
  checkoutAppointment,
  createAppointment,
  updateAppointmentStatus,
} from '@/server/data/appointments';
import { createProduct } from '@/server/data/stock';
import { listServiceSupplies, setServiceSupplies } from '@/server/data/service-supplies';
import { formatQty } from '@/lib/stock-units';
import { createTestCompany, deleteTestCompany } from './helpers';

/**
 * Fluxo de uma clínica de estética: limpeza de pele gasta 1 par de luvas, 1 máscara, 1 touca e
 * 20 ml de sérum. Concluir baixa tudo na unidade de cada produto; desfazer devolve. Dados fictícios.
 */
describe('estoque de clínica: materiais por serviço, com unidade', () => {
  let f: Awaited<ReturnType<typeof createTestCompany>>;
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    f = await createTestCompany('stock_clinic');
    const items = [
      { key: 'luva', name: 'Luva descartável', unit: 'par', quantity: 50, use: 1, cost: 0.6 },
      { key: 'mascara', name: 'Máscara', unit: 'un', quantity: 40, use: 1, cost: 0.35 },
      { key: 'touca', name: 'Touca', unit: 'un', quantity: 40, use: 1, cost: 0.2 },
      { key: 'serum', name: 'Sérum vitamina C', unit: 'ml', quantity: 500, use: 20, cost: 0.3 },
    ];
    for (const item of items) {
      const product = await createProduct(f.company.id, {
        name: item.name,
        unit: item.unit,
        quantity: item.quantity,
        minQuantity: 0,
        costPrice: item.cost,
        salePrice: 0,
      });
      ids[item.key] = product.id;
    }
    await setServiceSupplies(
      f.company.id,
      f.service.id,
      items.map((i) => ({ productId: ids[i.key], quantity: i.use })),
    );
  });
  afterAll(async () => {
    await deleteTestCompany(f.company.id);
  });

  const qty = async (key: string) =>
    (await prisma.product.findUniqueOrThrow({ where: { id: ids[key] } })).quantity;

  it('produto guarda a unidade; sem unidade vira "un"', async () => {
    expect((await prisma.product.findUniqueOrThrow({ where: { id: ids.serum } })).unit).toBe('ml');
    const plain = await createProduct(f.company.id, {
      name: 'Algodão',
      quantity: 10,
      minQuantity: 0,
      costPrice: 0,
      salePrice: 0,
    });
    expect(plain.unit).toBe('un');
    expect(formatQty(480, 'ml')).toBe('480 ml');
    const supplies = await listServiceSupplies(f.company.id, f.service.id);
    expect(supplies).toHaveLength(4);
  });

  it('concluir a limpeza de pele baixa cada material na unidade dele; desfazer devolve', async () => {
    const appointment = await createAppointment({
      companyId: f.company.id,
      clientId: f.client.id,
      professionalId: f.professional.id,
      serviceId: f.service.id,
      startAt: new Date(Date.UTC(2032, 2, 3, 13, 0)),
      createdByUserId: 'user_test',
    });
    // Agendar não mexe no estoque.
    expect(await qty('serum')).toBe(500);
    await checkoutAppointment({
      companyId: f.company.id,
      id: appointment.id,
      paymentMethod: 'PIX',
      updatedByUserId: 'u',
    });
    expect(await qty('serum')).toBe(480);
    expect(await qty('luva')).toBe(49);
    expect(await qty('mascara')).toBe(39);
    expect(await qty('touca')).toBe(39);
    const movements = await prisma.stockMovement.findMany({
      where: { appointmentId: appointment.id },
      select: { type: true, quantity: true, reason: true },
    });
    expect(movements).toHaveLength(4);
    expect(movements.every((m) => m.type === 'OUT' && m.reason?.startsWith('Consumo'))).toBe(true);

    await updateAppointmentStatus({
      companyId: f.company.id,
      id: appointment.id,
      status: 'SCHEDULED',
      updatedByUserId: 'u',
    });
    expect(await qty('serum')).toBe(500);
    expect(await qty('luva')).toBe(50);
  });
});
