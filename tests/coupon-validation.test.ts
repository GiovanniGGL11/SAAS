import { describe, expect, it } from 'vitest';

import { couponInput } from '@/lib/validations/coupon';

const base = { code: 'DEZ', discountType: 'PERCENTAGE', discountValue: 10 } as const;
const firstMessage = (input: unknown) => {
  const result = couponInput.safeParse(input);
  return result.success ? null : result.error.issues[0].message;
};

describe('validação de cupom', () => {
  it('mensagens em português, sem texto técnico do zod', () => {
    expect(firstMessage({ ...base, maxUses: -1 })).toBe('O limite de usos deve ser maior que zero');
    expect(firstMessage({ ...base, maxUses: 0 })).toBe('O limite de usos deve ser maior que zero');
    expect(firstMessage({ ...base, maxUses: 1.5 })).toBe(
      'O limite de usos deve ser um número inteiro',
    );
    expect(firstMessage({ ...base, discountValue: 0 })).toBe('O valor deve ser maior que zero');
    expect(firstMessage({ ...base, code: '' })).toBe('Informe o código');
  });

  it('porcentagem acima de 100% é recusada; valor fixo não tem esse teto', () => {
    expect(firstMessage({ ...base, discountValue: 150 })).toBe(
      'A porcentagem não pode passar de 100%',
    );
    expect(firstMessage({ ...base, discountType: 'FIXED', discountValue: 150 })).toBeNull();
  });

  it('cupom válido passa, sem limite de usos', () => {
    expect(couponInput.parse({ ...base, code: ' dez ', maxUses: null })).toMatchObject({
      code: 'DEZ',
      maxUses: null,
    });
  });
});
