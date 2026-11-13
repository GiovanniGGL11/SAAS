import { describe, expect, it } from 'vitest';

import {
  PLATFORM_SESSION_MAX_MINUTES,
  describeDevice,
  isFreshSignIn,
} from '@/lib/platform-security';

describe('segurança do painel da plataforma', () => {
  it('só abre com login de menos de 1 hora', () => {
    expect(PLATFORM_SESSION_MAX_MINUTES).toBe(60);
    expect(isFreshSignIn([0, -1])).toBe(true);
    expect(isFreshSignIn([59, -1])).toBe(true);
    expect(isFreshSignIn([60, -1])).toBe(false);
    expect(isFreshSignIn([600, 5])).toBe(false);
    // Sem a informação do Clerk: não arrisca.
    expect(isFreshSignIn([-1, -1])).toBe(false);
    expect(isFreshSignIn(null)).toBe(false);
    expect(isFreshSignIn(undefined)).toBe(false);
  });

  it('descreve o aparelho pelo navegador', () => {
    expect(
      describeDevice(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36',
      ),
    ).toBe('Chrome no Windows');
    expect(
      describeDevice(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
      ),
    ).toBe('Safari no iPhone');
    expect(
      describeDevice(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36 Edg/131.0',
      ),
    ).toBe('Edge no Windows');
    expect(describeDevice(null)).toBe('Aparelho desconhecido');
  });
});
