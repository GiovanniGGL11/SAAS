import { describe, expect, it } from 'vitest';

import { professionalInput } from '@/lib/validations/professional';

const base = { name: 'Ana', color: '#007aff' };

describe('foto do profissional', () => {
  it('aceita foto reduzida (data URL de imagem), remover (null) ou não mexer (ausente)', () => {
    const photo = `data:image/webp;base64,${'A'.repeat(20_000)}`;
    expect(professionalInput.parse({ ...base, avatarUrl: photo }).avatarUrl).toBe(photo);
    expect(professionalInput.parse({ ...base, avatarUrl: null }).avatarUrl).toBeNull();
    expect(professionalInput.parse(base).avatarUrl).toBeUndefined();
  });

  it('recusa link externo, outro tipo de arquivo e foto grande demais', () => {
    for (const avatarUrl of [
      'https://exemplo.com/foto.jpg',
      'data:text/html;base64,PGgxPm9pPC9oMT4=',
      'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=',
      `data:image/jpeg;base64,${'A'.repeat(200_000)}`,
    ]) {
      expect(professionalInput.safeParse({ ...base, avatarUrl }).success).toBe(false);
    }
  });
});
