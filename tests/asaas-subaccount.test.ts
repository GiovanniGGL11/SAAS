import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { prisma } from '@/lib/db';
import { openSecret } from '@/server/secret-box';
import { companyAccountStatus, createCompanySubaccount } from '@/server/billing/subaccount';
import { createTestCompany, deleteTestCompany } from './helpers';

const input = {
  name: 'Studio X',
  email: 'dono@studio.com',
  cpfCnpj: '12345678909',
  birthDate: '1990-01-01',
  mobilePhone: '11999998888',
  incomeValue: 5000,
  postalCode: '01310100',
  address: 'Av. Paulista',
  addressNumber: '1000',
  province: 'Bela Vista',
};

describe('conta Asaas criada pelo Atendafy (subconta)', () => {
  let fixture: Awaited<ReturnType<typeof createTestCompany>>;
  const calls: { url: string; key: string; body: unknown }[] = [];

  beforeEach(async () => {
    fixture = await createTestCompany('subaccount');
    process.env.ASAAS_API_KEY = '$aact_hmlg_plataforma';
    calls.length = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit) => {
        const headers = init.headers as Record<string, string>;
        calls.push({
          url,
          key: headers.access_token,
          body: init.body ? JSON.parse(String(init.body)) : null,
        });
        if (url.endsWith('/accounts'))
          return Response.json({
            id: 'acc_1',
            walletId: 'wal_1',
            accessToken: { apiKey: '$aact_hmlg_subconta' },
          });
        if (url.endsWith('/myAccount/status')) return Response.json({ general: 'PENDING' });
        return Response.json({});
      }),
    );
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    delete process.env.ASAAS_API_KEY;
    await deleteTestCompany(fixture.company.id);
  });

  it('cria com a chave da plataforma, guarda a chave da subconta cifrada e não cria duas vezes', async () => {
    const id = fixture.company.id;
    await createCompanySubaccount(id, input);
    expect(calls[0].url).toBe('https://api-sandbox.asaas.com/v3/accounts');
    expect(calls[0].key).toBe('$aact_hmlg_plataforma');
    expect(calls[0].body).toMatchObject({ cpfCnpj: '12345678909', postalCode: '01310100' });

    const company = await prisma.company.findUniqueOrThrow({ where: { id } });
    expect(company.asaasAccountId).toBe('acc_1');
    expect(company.asaasWalletId).toBe('wal_1');
    expect(company.asaasApiKey).not.toContain('subconta'); // cifrada
    expect(openSecret(company.asaasApiKey!)).toBe('$aact_hmlg_subconta');

    expect(await companyAccountStatus(company.asaasApiKey)).toBe('PENDING');
    expect(calls.at(-1)!.key).toBe('$aact_hmlg_subconta');

    await expect(createCompanySubaccount(id, input)).rejects.toThrow(/já tem uma conta/);
  });

  it('sem a chave da plataforma não cria', async () => {
    delete process.env.ASAAS_API_KEY;
    await expect(createCompanySubaccount(fixture.company.id, input)).rejects.toThrow(
      /ainda não está disponível/,
    );
  });
});
