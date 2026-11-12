import { afterAll, describe, expect, it } from 'vitest';

import { prisma } from '@/lib/db';
import {
  isDisposableEmail,
  normalizeDocument,
  normalizeEmail,
  normalizeMobile,
} from '@/lib/trial-identity';
import { TRIAL_IP_LIMIT, claimTrial } from '@/server/billing/trial-claim';
import { getSubscriptionState } from '@/server/billing/subscription';
import { createTestCompany, deleteTestCompany } from './helpers';

// CPFs e CNPJ fictícios, gerados só para teste (dígitos verificadores válidos).
const CPF_A = '529.982.247-25';
const CPF_B = '111.444.777-35';
const CPF_C = '935.411.347-80';
const CNPJ = '11.222.333/0001-81';

describe('dados que identificam quem pede o mês grátis', () => {
  it('e-mail: variações do mesmo endereço contam como um só', () => {
    expect(normalizeEmail('Fu.La.No+teste@GMAIL.com')).toBe('fulano@gmail.com');
    expect(normalizeEmail('fulano@googlemail.com')).toBe('fulano@gmail.com');
    expect(normalizeEmail('fu.lano+x@empresa.com.br')).toBe('fu.lano@empresa.com.br');
    expect(isDisposableEmail('a@mailinator.com')).toBe(true);
    expect(isDisposableEmail('a@gmail.com')).toBe(false);
  });

  it('CPF/CNPJ: confere os dígitos verificadores', () => {
    expect(normalizeDocument(CPF_A)).toBe('52998224725');
    expect(normalizeDocument(CNPJ)).toBe('11222333000181');
    expect(normalizeDocument('529.982.247-26')).toBeNull();
    expect(normalizeDocument('111.111.111-11')).toBeNull();
    expect(normalizeDocument('123')).toBeNull();
  });

  it('celular: com DDD, aceita +55, recusa fixo e número repetido', () => {
    expect(normalizeMobile('(11) 91234-5678')).toBe('11912345678');
    expect(normalizeMobile('+55 11 91234-5678')).toBe('11912345678');
    expect(normalizeMobile('(11) 3234-5678')).toBeNull();
    expect(normalizeMobile('(11) 99999-9999')).toBeNull();
  });
});

describe('1º mês grátis: um por pessoa', () => {
  const companies: Awaited<ReturnType<typeof createTestCompany>>[] = [];
  const fresh = async (tag: string) => {
    const f = await createTestCompany(`trial_${tag}`);
    await prisma.company.update({
      where: { id: f.company.id },
      data: { trialPending: true, trialEndsAt: new Date() },
    });
    companies.push(f);
    return f.company.id;
  };
  const run = Date.now().toString(36);
  const user = (n: string) => `user_teste_${run}_${n}`;
  const mail = (n: string) => `teste.${run}.${n}@exemplo.com`;
  // IPs de documentação (RFC 5737), um por cenário: não colidem com nada real.
  const ip = (n: number) => `192.0.2.${n}`;

  // Apaga 9 empresas: numa conexão lenta passa dos 30 s padrão.
  afterAll(async () => {
    for (const f of companies) await deleteTestCompany(f.company.id);
  }, 180_000);

  it('libera 30 dias na primeira vez e não deixa liberar de novo na mesma empresa', async () => {
    const companyId = await fresh('ok');
    const r = await claimTrial({
      companyId,
      userId: user('a'),
      emails: [mail('a')],
      document: CPF_A,
      phone: '(11) 91234-5670',
      ip: ip(10),
    });
    expect(r.granted).toBe(true);
    const company = await prisma.company.findUniqueOrThrow({ where: { id: companyId } });
    expect(company.trialPending).toBe(false);
    expect(getSubscriptionState(company).trialDaysLeft).toBe(30);
    await expect(
      claimTrial({
        companyId,
        userId: user('a'),
        emails: [mail('a')],
        document: CPF_A,
        phone: '(11) 91234-5670',
        ip: ip(10),
      }),
    ).rejects.toThrow(/já foi definido/);
  });

  it('a mesma conta numa segunda empresa não ganha outro teste (definitivo)', async () => {
    const companyId = await fresh('user');
    const r = await claimTrial({
      companyId,
      userId: user('a'),
      emails: [mail('outro')],
      document: CPF_B,
      phone: '(21) 98765-4321',
      ip: ip(11),
    });
    expect(r).toMatchObject({ granted: false, final: true });
    const company = await prisma.company.findUniqueOrThrow({ where: { id: companyId } });
    expect(company.trialPending).toBe(false);
    expect(getSubscriptionState(company).trialDaysLeft).toBe(0);
  });

  it('e-mail com pontos/+algo de quem já usou não passa', async () => {
    const companyId = await fresh('email');
    const r = await claimTrial({
      companyId,
      userId: user('b'),
      emails: [`teste.${run}.a+novo@exemplo.com`],
      document: CPF_B,
      phone: '(21) 98765-4321',
      ip: ip(12),
    });
    expect(r).toMatchObject({
      granted: false,
      final: true,
      reason: expect.stringMatching(/e-mail/),
    });
  });

  it('CPF ou celular já usados recusam, mas dá para corrigir (não é definitivo)', async () => {
    const companyId = await fresh('doc');
    const base = { companyId, userId: user('c'), emails: [mail('c')], ip: ip(13) };
    expect(await claimTrial({ ...base, document: CPF_A, phone: '(31) 99876-1234' })).toMatchObject({
      granted: false,
      final: false,
      reason: expect.stringMatching(/CPF/),
    });
    expect(
      await claimTrial({ ...base, document: CPF_B, phone: '+55 (11) 91234-5670' }),
    ).toMatchObject({ granted: false, final: false, reason: expect.stringMatching(/celular/) });
    expect(
      (await prisma.company.findUniqueOrThrow({ where: { id: companyId } })).trialPending,
    ).toBe(true);
    expect(await claimTrial({ ...base, document: CNPJ, phone: '(31) 99876-1234' })).toMatchObject({
      granted: true,
    });
  });

  it('e-mail temporário não libera; dados inválidos são recusados antes de tudo', async () => {
    const companyId = await fresh('temp');
    await expect(
      claimTrial({
        companyId,
        userId: user('d'),
        emails: [mail('d')],
        document: '123.456.789-00',
        phone: '(11) 91111-2222',
        ip: ip(14),
      }),
    ).rejects.toThrow(/CPF ou CNPJ inválido/);
    expect(
      await claimTrial({
        companyId,
        userId: user('d'),
        emails: ['alguem@mailinator.com'],
        document: CPF_C,
        phone: '(11) 91111-2222',
        ip: ip(14),
      }),
    ).toMatchObject({ granted: false, final: true, reason: expect.stringMatching(/temporário/) });
  });

  it(`a mesma rede libera no máximo ${TRIAL_IP_LIMIT} testes em 30 dias`, async () => {
    const sameIp = ip(20);
    const results = [];
    for (let i = 0; i <= TRIAL_IP_LIMIT; i++) {
      const companyId = await fresh(`ip${i}`);
      const cpf = ['390.533.447-05', '286.255.878-87', '714.602.380-01'][i];
      results.push(
        await claimTrial({
          companyId,
          userId: user(`ip${i}`),
          emails: [mail(`ip${i}`)],
          document: cpf,
          phone: `(41) 9${i}234-5678`,
          ip: sameIp,
        }),
      );
    }
    expect(results.slice(0, TRIAL_IP_LIMIT).every((r) => r.granted)).toBe(true);
    expect(results[TRIAL_IP_LIMIT]).toMatchObject({
      granted: false,
      final: true,
      reason: expect.stringMatching(/rede/),
    });
  });
});
