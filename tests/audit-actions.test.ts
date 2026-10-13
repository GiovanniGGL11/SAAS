import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { prisma } from '@/lib/db';
import { createTestCompany, deleteTestCompany } from './helpers';

type Fixture = Awaited<ReturnType<typeof createTestCompany>>;

let fixture: Fixture;

// As ações pegam a empresa da sessão do Clerk; aqui a sessão aponta para a empresa de teste.
vi.mock('@/server/auth/require-current-company', () => {
  const session = () => ({
    userId: 'user_audit',
    orgId: 'org',
    orgRole: 'org:admin',
    company: fixture.company,
  });
  return {
    requireCurrentCompany: async () => session(),
    requireCompanyAdmin: async () => session(),
  };
});
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

const { createClientAction, setClientActiveAction, setClientVipAction, updateClientAction } =
  await import('@/server/actions/client-actions');
const { createServiceAction, setServiceActiveAction } =
  await import('@/server/actions/service-actions');
const { createProductAction, setProductActiveAction } =
  await import('@/server/actions/stock-actions');

function logsFor(entityType: string, entityId: string) {
  return prisma.auditLog.findMany({
    where: { companyId: fixture.company.id, entityType, entityId },
    orderBy: { createdAt: 'asc' },
  });
}

describe('auditoria das telas de cadastro', () => {
  beforeAll(async () => {
    fixture = await createTestCompany('audit_actions');
  });
  afterAll(async () => {
    await deleteTestCompany(fixture.company.id);
  });

  it('grava criação, edição, VIP e arquivamento de cliente', async () => {
    const created = await createClientAction({ name: 'Ana Auditada', phone: '' });
    expect(created.ok).toBe(true);
    const id = (created as { ok: true; data: { id: string } }).data.id;

    await updateClientAction(id, { name: 'Ana Auditada Silva', phone: '' });
    await setClientVipAction({ id, isVip: true });
    await setClientActiveAction({ id, active: false });

    const logs = await logsFor('Client', id);
    expect(logs.map((l) => l.action)).toEqual(['created', 'updated', 'updated', 'updated']);
    expect(logs.every((l) => l.userId === 'user_audit')).toBe(true);
    expect(logs[2].metadata).toMatchObject({ source: 'app', isVip: true });
    expect(logs[3].metadata).toMatchObject({ source: 'app', active: false });
  });

  it('grava serviço e produto', async () => {
    const service = await createServiceAction({
      name: 'Serviço Auditado',
      durationMinutes: 30,
      price: 40,
      color: '#22c55e',
    });
    expect(service.ok).toBe(true);
    const serviceId = (service as { ok: true; data: { id: string } }).data.id;
    await setServiceActiveAction({ id: serviceId, active: false });
    expect((await logsFor('Service', serviceId)).map((l) => l.action)).toEqual([
      'created',
      'updated',
    ]);

    const product = await createProductAction({
      name: 'Produto Auditado',
      costPrice: 5,
      salePrice: 10,
      quantity: 3,
      minQuantity: 1,
    });
    expect(product.ok).toBe(true);
    const productId = (product as { ok: true; data: { id: string } }).data.id;
    await setProductActiveAction({ id: productId, active: false });
    expect((await logsFor('Product', productId)).map((l) => l.action)).toEqual([
      'created',
      'updated',
    ]);
  });
});
