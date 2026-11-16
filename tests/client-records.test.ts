import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { prisma } from '@/lib/db';
import {
  addRecordPhoto,
  createRecordBlock,
  createRecordEntry,
  deleteRecordEntry,
  listClientRecords,
} from '@/server/data/client-records';
import { createTestCompany, deleteTestCompany } from './helpers';

describe('registros de evolução do cliente', () => {
  let a: Awaited<ReturnType<typeof createTestCompany>>;
  let b: Awaited<ReturnType<typeof createTestCompany>>;
  beforeAll(async () => {
    a = await createTestCompany('records');
    b = await createTestCompany('records-other');
  });
  afterAll(async () => {
    await deleteTestCompany(a.company.id);
    await deleteTestCompany(b.company.id);
  });

  it('cliente vê os dias e as fotos, mas não a anotação interna nem a foto "só equipe"', async () => {
    const block = await createRecordBlock(
      a.company.id,
      a.client.id,
      'Limpeza de pele',
      'user_test',
    );
    const entry = await createRecordEntry(
      a.company.id,
      block.id,
      { date: '2030-03-10', notes: 'Pele hidratada.', internalNotes: 'Sensível na testa.' },
      'user_test',
    );
    const photo = { contentType: 'image/jpeg', sizeBytes: 1000 };
    await addRecordPhoto(
      a.company.id,
      entry.id,
      { ...photo, storagePath: 'x/antes.jpg', staffOnly: false },
      'user_test',
    );
    await addRecordPhoto(
      a.company.id,
      entry.id,
      { ...photo, storagePath: 'x/interna.jpg', staffOnly: true },
      'user_test',
    );

    const staff = await listClientRecords(a.company.id, a.client.id, 'staff');
    expect(staff[0]).toMatchObject({ title: 'Limpeza de pele' });
    expect(staff[0].entries[0]).toMatchObject({
      date: '2030-03-10',
      notes: 'Pele hidratada.',
      internalNotes: 'Sensível na testa.',
    });
    expect(staff[0].entries[0].photos).toHaveLength(2);

    const client = await listClientRecords(a.company.id, a.client.id, 'client');
    expect(client[0].entries[0].internalNotes).toBeNull();
    expect(client[0].entries[0].photos).toHaveLength(1);
    expect(client[0].entries[0].photos[0].staffOnly).toBe(false);

    // Apagar o dia leva as fotos junto.
    await deleteRecordEntry(a.company.id, entry.id);
    expect(await prisma.clientRecordPhoto.count({ where: { companyId: a.company.id } })).toBe(0);
  });

  it('outra empresa não cria registro nem dia nos clientes daqui', async () => {
    await expect(
      createRecordBlock(b.company.id, a.client.id, 'Invasão', 'user_test'),
    ).rejects.toThrow(/Cliente não encontrado/);
    const block = await createRecordBlock(a.company.id, a.client.id, 'Depilação', 'user_test');
    await expect(
      createRecordEntry(b.company.id, block.id, { date: '2030-03-11' }, 'user_test'),
    ).rejects.toThrow(/não encontrado/);
  });
});
