import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { prisma } from '@/lib/db';
import { cancelAppointment, createAppointment } from '@/server/data/appointments';
import { saveField, setValues } from '@/server/data/custom-fields';
import { ANONYMIZED_NAME, anonymizeClient, exportClientData } from '@/server/data/client-privacy';
import { createTestCompany, deleteTestCompany } from './helpers';

describe('LGPD: exportar e anonimizar a pedido do titular', () => {
  let f: Awaited<ReturnType<typeof createTestCompany>>;
  const admin = { userId: 'user_admin', isAdmin: true };

  beforeAll(async () => {
    f = await createTestCompany('privacy');
    await prisma.client.update({
      where: { id: f.client.id },
      data: {
        name: 'Carla Fictícia',
        phone: '11955551234',
        email: 'carla@exemplo.test',
        cpf: '12345678909',
        notes: 'Prefere horário da manhã',
      },
    });
  });
  afterAll(async () => {
    await deleteTestCompany(f.company.id);
  });

  it('exporta o que o sistema guarda, com o registro na auditoria', async () => {
    await prisma.transaction.create({
      data: {
        companyId: f.company.id,
        clientId: f.client.id,
        type: 'INCOME',
        status: 'PAID',
        description: 'Atendimento (teste)',
        amount: 80,
        paidAt: new Date(),
        createdByUserId: 'u',
      },
    });
    const field = await saveField(f.company.id, 'user_admin', {
      entity: 'client',
      label: 'Como conheceu',
      type: 'short_text',
      required: false,
      viewRole: 'all',
      editRole: 'all',
    });
    await setValues(f.company.id, 'client', f.client.id, admin, { [field.id]: 'Instagram' });

    const data = await exportClientData(f.company.id, f.client.id, 'user_admin');
    expect(data.titular).toMatchObject({
      nome: 'Carla Fictícia',
      email: 'carla@exemplo.test',
      recebePromocoes: true,
    });
    expect(data.financeiro).toEqual([expect.objectContaining({ valor: 80, status: 'PAID' })]);
    expect(data.camposPersonalizados).toEqual([{ campo: 'Como conheceu', valor: 'Instagram' }]);
    expect(
      await prisma.auditLog.count({
        where: { companyId: f.company.id, entityId: f.client.id, action: 'exported' },
      }),
    ).toBe(1);
    await expect(exportClientData(f.company.id, 'outro-id', 'user_admin')).rejects.toThrow(
      /não encontrado/,
    );
  });

  it('anonimiza: recusa com horário futuro; apaga identificação, mantém o financeiro; não repete', async () => {
    const future = await createAppointment({
      companyId: f.company.id,
      clientId: f.client.id,
      professionalId: f.professional.id,
      serviceId: f.service.id,
      startAt: new Date(Date.now() + 3 * 86_400_000),
      notes: 'Traz o filho junto',
      createdByUserId: 'u',
    });
    await expect(
      anonymizeClient(f.company.id, 'user_admin', f.client.id, { deleteForms: false }),
    ).rejects.toThrow(/Cancele antes/);
    await cancelAppointment({ companyId: f.company.id, id: future.id, canceledByUserId: 'u' });

    const before = await prisma.client.findUniqueOrThrow({ where: { id: f.client.id } });
    await anonymizeClient(f.company.id, 'user_admin', f.client.id, { deleteForms: false });
    const after = await prisma.client.findUniqueOrThrow({ where: { id: f.client.id } });
    expect(after).toMatchObject({
      name: ANONYMIZED_NAME,
      phone: null,
      email: null,
      cpf: null,
      notes: null,
      active: false,
    });
    expect(after.marketingOptOutAt).not.toBeNull();
    expect(after.portalVersion).toBe(before.portalVersion + 1);
    expect(await prisma.customFieldValue.count({ where: { recordId: f.client.id } })).toBe(0);
    expect(
      (await prisma.appointment.findUniqueOrThrow({ where: { id: future.id } })).notes,
    ).toBeNull();
    // Financeiro fica (obrigação fiscal).
    expect(await prisma.transaction.count({ where: { clientId: f.client.id } })).toBe(1);
    // A auditoria não guarda o nome apagado.
    const log = await prisma.auditLog.findFirstOrThrow({
      where: { companyId: f.company.id, entityId: f.client.id, action: 'deleted' },
    });
    expect(JSON.stringify(log)).not.toContain('Carla');

    await expect(
      anonymizeClient(f.company.id, 'user_admin', f.client.id, { deleteForms: false }),
    ).rejects.toThrow(/já foi anonimizado/);
  });
});
