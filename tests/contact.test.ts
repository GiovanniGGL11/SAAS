import { afterEach, describe, expect, it } from 'vitest';

import { CONTACT_EMAIL, instagramProfile } from '@/lib/contact';

describe('contato do Atendafy', () => {
  const previous = process.env.NEXT_PUBLIC_CONTACT_INSTAGRAM;
  afterEach(() => {
    process.env.NEXT_PUBLIC_CONTACT_INSTAGRAM = previous;
  });

  it('e-mail de contato', () => {
    expect(CONTACT_EMAIL).toBe('contato@atendafy.com');
  });

  it('Instagram aceita @, nome ou link; vazio ou inválido não aparece', () => {
    const url = 'https://www.instagram.com/atendafy/';
    for (const value of [
      '@atendafy',
      'atendafy',
      'https://instagram.com/atendafy',
      `${url}?hl=pt`,
    ]) {
      process.env.NEXT_PUBLIC_CONTACT_INSTAGRAM = value;
      expect(instagramProfile()).toEqual({ handle: 'atendafy', url });
    }
    process.env.NEXT_PUBLIC_CONTACT_INSTAGRAM = '';
    expect(instagramProfile()).toBeNull();
    process.env.NEXT_PUBLIC_CONTACT_INSTAGRAM = 'nome com espaço';
    expect(instagramProfile()).toBeNull();
  });
});
