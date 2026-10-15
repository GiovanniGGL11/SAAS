import { describe, expect, it } from 'vitest';

import { normalizeInstagram, publicProfileInput } from '@/lib/validations/public-profile';

describe('perfil público da empresa', () => {
  it('aceita o Instagram em qualquer formato e guarda só o usuário', () => {
    expect(normalizeInstagram('@meusalao')).toBe('meusalao');
    expect(normalizeInstagram('https://www.instagram.com/meu.salao/?hl=pt')).toBe('meu.salao');
    expect(normalizeInstagram('instagram.com/meusalao')).toBe('meusalao');
    expect(normalizeInstagram('  ')).toBeNull();
  });

  it('limpa CEP e UF, e transforma vazio em nada', () => {
    const parsed = publicProfileInput.parse({
      zipCode: '01310-100',
      state: 'sp',
      street: '  ',
      instagram: '@meusalao',
      cancellationPolicy: '',
    });
    expect(parsed).toMatchObject({
      zipCode: '01310100',
      state: 'SP',
      street: null,
      instagram: 'meusalao',
      cancellationPolicy: null,
    });
    expect(() => publicProfileInput.parse({ zipCode: '123' })).toThrow();
    expect(() => publicProfileInput.parse({ state: 'São Paulo' })).toThrow();
    expect(() => publicProfileInput.parse({ instagram: 'tem espaço' })).toThrow();
  });
});
