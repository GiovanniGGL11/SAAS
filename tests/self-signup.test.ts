import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { prisma } from '@/lib/db';
import { DEFAULT_SIGNUP_CONFIG, parseSignupConfig, validateSignup } from '@/lib/self-signup';
import {
  SignupValidationError,
  getSignupCompany,
  submitSelfSignup,
} from '@/server/data/self-signup';
import { createTestCompany, deleteTestCompany } from './helpers';

const all = {
  email: 'required',
  birthDate: 'required',
  cpf: 'required',
  address: 'required',
  notes: 'optional',
} as const;

describe('cadastro pelo link: regras do formulário', () => {
  it('nome e WhatsApp sempre; o resto conforme o negócio pede', () => {
    expect(validateSignup({ name: '', phone: '' }, DEFAULT_SIGNUP_CONFIG).errors).toMatchObject({
      name: expect.any(String),
      phone: expect.any(String),
    });
    const r = validateSignup({ name: 'Ana Teste', phone: '(11) 91234-5678' }, all);
    expect(Object.keys(r.errors).sort()).toEqual(['address', 'birthDate', 'cpf', 'email']);
  });

  it('confere e-mail, data e CPF; campo desligado é ignorado mesmo preenchido', () => {
    const bad = validateSignup(
      {
        name: 'Ana Teste',
        phone: '11912345678',
        email: 'ana@',
        birthDate: '31/02/1990',
        cpf: '111.111.111-11',
      },
      all,
    );
    expect(bad.errors).toMatchObject({
      email: expect.stringMatching(/e-mail/),
      birthDate: expect.stringMatching(/data/),
      cpf: expect.stringMatching(/CPF/),
    });
    const ok = validateSignup(
      {
        name: '  Ana Teste ',
        phone: '11912345678',
        email: 'Ana@Exemplo.com',
        birthDate: '1990-03-15',
        cpf: '529.982.247-25',
        notes: 'ignorado',
      },
      { ...DEFAULT_SIGNUP_CONFIG, cpf: 'optional' },
    );
    expect(ok.errors).toEqual({});
    expect(ok.values).toMatchObject({
      name: 'Ana Teste',
      email: 'ana@exemplo.com',
      cpf: '52998224725',
      notes: null,
    });
    expect(ok.values.birthDate?.toISOString().slice(0, 10)).toBe('1990-03-15');
  });

  it('configuração gravada incompleta ou errada cai no padrão', () => {
    expect(parseSignupConfig(null)).toEqual(DEFAULT_SIGNUP_CONFIG);
    expect(parseSignupConfig({ cpf: 'required', email: 'talvez' })).toEqual({
      ...DEFAULT_SIGNUP_CONFIG,
      cpf: 'required',
    });
  });
});

describe('cadastro pelo link: gravação', () => {
  let f: Awaited<ReturnType<typeof createTestCompany>>;
  beforeAll(async () => {
    f = await createTestCompany('signup');
  });
  afterAll(async () => {
    await deleteTestCompany(f.company.id);
  });

  it('desligado: a página não acha a empresa', async () => {
    expect(await getSignupCompany(f.company.slug)).toBeNull();
    await prisma.company.update({
      where: { id: f.company.id },
      data: { selfSignupEnabled: true },
    });
    expect((await getSignupCompany(f.company.slug))?.config).toEqual(DEFAULT_SIGNUP_CONFIG);
  });

  it('cria o cliente; sem o "sim", fica fora das promoções', async () => {
    const r = await submitSelfSignup(f.company.id, DEFAULT_SIGNUP_CONFIG, {
      name: 'Cliente Novo Teste',
      phone: '(11) 97777-0001',
      email: 'novo@exemplo.com',
    });
    expect(r.created).toBe(true);
    const c = await prisma.client.findUniqueOrThrow({ where: { id: r.clientId } });
    expect([c.phone, c.email, c.marketingOptOutBy]).toEqual([
      '11977770001',
      'novo@exemplo.com',
      'client',
    ]);
  });

  it('mesmo WhatsApp não duplica e só completa o que está em branco', async () => {
    const existing = await prisma.client.create({
      data: {
        companyId: f.company.id,
        name: 'Nome do Cadastro',
        phone: '11977770002',
        email: 'original@exemplo.com',
      },
    });
    const r = await submitSelfSignup(f.company.id, DEFAULT_SIGNUP_CONFIG, {
      name: 'Outro Nome',
      phone: '11 97777-0002',
      email: 'trocado@exemplo.com',
      birthDate: '1991-07-20',
      marketingOptIn: true,
    });
    expect(r).toEqual({ created: false, clientId: existing.id });
    const c = await prisma.client.findUniqueOrThrow({ where: { id: existing.id } });
    expect([c.name, c.email]).toEqual(['Nome do Cadastro', 'original@exemplo.com']);
    expect(c.birthDate?.toISOString().slice(0, 10)).toBe('1991-07-20');
    expect(
      await prisma.client.count({ where: { companyId: f.company.id, phone: '11977770002' } }),
    ).toBe(1);
  });

  it('obrigatório faltando é recusado com o erro do campo', async () => {
    await expect(
      submitSelfSignup(
        f.company.id,
        { ...DEFAULT_SIGNUP_CONFIG, cpf: 'required' },
        {
          name: 'Sem CPF',
          phone: '11977770003',
        },
      ),
    ).rejects.toBeInstanceOf(SignupValidationError);
  });
});
