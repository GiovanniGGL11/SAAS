import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { prisma } from '@/lib/db';
import { phoneMatchKey } from '@/lib/phone';
import { findClientByPhone } from '@/server/data/client-match';
import { createTestCompany, deleteTestCompany } from './helpers';

describe('mesmo celular em qualquer formato', () => {
  it('com ou sem 55, zero, máscara ou o 9 dos números antigos: mesma chave', () => {
    const key = '11988887777';
    for (const v of [
      '(11) 98888-7777',
      '11988887777',
      '+55 11 98888-7777',
      '5511988887777',
      '011988887777',
      '(11) 8888-7777',
      '551188887777',
    ]) {
      expect(phoneMatchKey(v)).toBe(key);
    }
    expect(phoneMatchKey('(11) 3333-4444')).toBe('1133334444'); // fixo não ganha o 9
    expect(phoneMatchKey('(21) 98888-7777')).not.toBe(key); // outro DDD é outro número
    expect(phoneMatchKey('123')).toBeUndefined();
  });
});

describe('agendar pelo link liga ao cadastro que já existe', () => {
  let f: Awaited<ReturnType<typeof createTestCompany>>;
  let original: { id: string };

  beforeAll(async () => {
    f = await createTestCompany('phone_match');
    original = await prisma.client.create({
      data: { companyId: f.company.id, name: 'Cliente Antigo', phone: '5511977776666' },
    });
    // Duplicado mais novo (como os que o formato diferente criava): o antigo é que vale.
    await prisma.client.create({
      data: { companyId: f.company.id, name: 'Duplicado', phone: '11977776666' },
    });
  });
  afterAll(async () => {
    await deleteTestCompany(f.company.id);
  });

  it('acha o cadastro antigo pelo número escrito de outro jeito', async () => {
    for (const typed of ['(11) 97777-6666', '+55 11 97777-6666', '1177776666']) {
      expect((await findClientByPhone(f.company.id, typed))?.id).toBe(original.id);
    }
    expect(await findClientByPhone(f.company.id, '(11) 97777-0000')).toBeNull();
  });
});
