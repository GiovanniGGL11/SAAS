import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { prisma } from '@/lib/db';
import { matchesFieldFilter, type FieldDefinition } from '@/lib/custom-fields';
import { findRecordsByField, saveField, setValues } from '@/server/data/custom-fields';
import { createTestCompany, deleteTestCompany } from './helpers';

const def = (type: FieldDefinition['type'], options: FieldDefinition['options'] = []) => ({
  id: 'f',
  label: 'Campo',
  type,
  required: false,
  options,
});

describe('filtro por campo personalizado: regra', () => {
  it('texto contém, sem diferenciar maiúscula e acento', () => {
    expect(
      matchesFieldFilter(def('short_text'), 'Indicação da Ana', {
        kind: 'text',
        text: 'indicacao',
      }),
    ).toBe(true);
    expect(
      matchesFieldFilter(def('short_text'), 'Instagram', { kind: 'text', text: 'indica' }),
    ).toBe(false);
  });

  it('número e data em faixa, com ponta aberta', () => {
    expect(matchesFieldFilter(def('number'), 7, { kind: 'number', min: 5 })).toBe(true);
    expect(matchesFieldFilter(def('number'), 7, { kind: 'number', min: 5, max: 6 })).toBe(false);
    expect(matchesFieldFilter(def('date'), '2026-03-10', { kind: 'date', to: '2026-03-10' })).toBe(
      true,
    );
    expect(matchesFieldFilter(def('date'), '2026-03-11', { kind: 'date', to: '2026-03-10' })).toBe(
      false,
    );
  });

  it('opção em seleção única e múltipla; sim/não; preenchido e vazio', () => {
    expect(matchesFieldFilter(def('single_select'), 'a', { kind: 'option', optionId: 'a' })).toBe(
      true,
    );
    expect(
      matchesFieldFilter(def('multi_select'), ['b', 'a'], { kind: 'option', optionId: 'a' }),
    ).toBe(true);
    expect(matchesFieldFilter(def('multi_select'), ['b'], { kind: 'option', optionId: 'a' })).toBe(
      false,
    );
    expect(matchesFieldFilter(def('boolean'), false, { kind: 'boolean', value: false })).toBe(true);
    expect(matchesFieldFilter(def('boolean'), null, { kind: 'filled' })).toBe(false);
    expect(matchesFieldFilter(def('multi_select'), [], { kind: 'empty' })).toBe(true);
  });

  it('filtro de outro tipo nunca casa por acidente', () => {
    expect(matchesFieldFilter(def('number'), '7', { kind: 'text', text: '7' })).toBe(false);
  });
});

describe('filtro por campo personalizado: servidor', () => {
  let f: Awaited<ReturnType<typeof createTestCompany>>;
  let other: { id: string };
  const admin = { userId: 'user_admin', isAdmin: true };
  const member = { userId: 'user_member', isAdmin: false };

  beforeAll(async () => {
    f = await createTestCompany('cf_filter');
    other = await prisma.client.create({
      data: {
        companyId: f.company.id,
        name: 'Outro Cliente (teste)',
        phone: `+1666${Date.now().toString().slice(-7)}`,
      },
    });
  });
  afterAll(async () => {
    await deleteTestCompany(f.company.id);
  });

  it('devolve quem atende, "sem resposta" pela exclusão e respeita quem pode ver o campo', async () => {
    const origin = await saveField(f.company.id, 'user_admin', {
      entity: 'client',
      label: 'Como conheceu',
      type: 'single_select',
      required: false,
      options: [{ label: 'Instagram' }, { label: 'Indicação' }],
      viewRole: 'all',
      editRole: 'all',
    });
    const [instagram] = origin.options as { id: string }[];
    await setValues(f.company.id, 'client', f.client.id, member, { [origin.id]: instagram.id });

    expect(
      await findRecordsByField(f.company.id, 'client', member, origin.id, {
        kind: 'option',
        optionId: instagram.id,
      }),
    ).toEqual({ ids: [f.client.id], exclude: false });
    // "Sem resposta": quem respondeu sai da lista (o outro cliente fica).
    expect(
      await findRecordsByField(f.company.id, 'client', member, origin.id, { kind: 'empty' }),
    ).toEqual({ ids: [f.client.id], exclude: true });
    expect(other.id).not.toBe(f.client.id);

    const secret = await saveField(f.company.id, 'user_admin', {
      entity: 'client',
      label: 'Observação interna',
      type: 'short_text',
      required: false,
      viewRole: 'admin',
      editRole: 'admin',
    });
    await setValues(f.company.id, 'client', other.id, admin, { [secret.id]: 'Paga sempre em dia' });
    expect(
      await findRecordsByField(f.company.id, 'client', admin, secret.id, {
        kind: 'text',
        text: 'em dia',
      }),
    ).toEqual({ ids: [other.id], exclude: false });
    // Quem não vê o campo não consegue usá-lo para descobrir respostas.
    await expect(
      findRecordsByField(f.company.id, 'client', member, secret.id, { kind: 'filled' }),
    ).rejects.toThrow(/não encontrado/);
  });
});
