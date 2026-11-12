import { describe, expect, it } from 'vitest';

import { buildPixPayload, normalizePixKey } from '@/lib/pix';

describe('PIX copia e cola (BR Code)', () => {
  it('reproduz o exemplo do manual do Banco Central', () => {
    expect(
      buildPixPayload({
        key: '123e4567-e12b-12d1-a456-426655440000',
        name: 'Fulano de Tal',
        city: 'BRASILIA',
      }),
    ).toBe(
      '00020126580014br.gov.bcb.pix0136123e4567-e12b-12d1-a456-4266554400005204000053039865802BR5913Fulano de Tal6008BRASILIA62070503***63041D3D',
    );
  });

  it('inclui valor, limpa nome/cidade e txid', () => {
    const code = buildPixPayload({
      key: '+5511999998888',
      name: 'Salão da Conceição & Cia Beleza Ltda',
      city: 'São José dos Campos',
      amount: 25,
      txid: 'cmv-4pcv36_000',
    });
    expect(code).toContain('540525.00');
    expect(code).toContain('5925Salao da Conceicao Cia Be');
    expect(code).toContain('6015Sao Jose dos Ca');
    expect(code).toContain('62160512cmv4pcv36000');
    expect(code).toMatch(/6304[0-9A-F]{4}$/);
  });

  it('normaliza e valida chaves', () => {
    expect(normalizePixKey('CPF', '123.456.789-09')).toBe('12345678909');
    expect(normalizePixKey('CPF', '123')).toBeNull();
    expect(normalizePixKey('CNPJ', '12.345.678/0001-90')).toBe('12345678000190');
    expect(normalizePixKey('PHONE', '(11) 99999-8888')).toBe('+5511999998888');
    expect(normalizePixKey('PHONE', '+55 11 99999-8888')).toBe('+5511999998888');
    expect(normalizePixKey('EMAIL', ' Dono@Studio.com ')).toBe('dono@studio.com');
    expect(normalizePixKey('EMAIL', 'sem-arroba')).toBeNull();
    expect(normalizePixKey('EVP', '123E4567-E12B-12D1-A456-426655440000')).toBe(
      '123e4567-e12b-12d1-a456-426655440000',
    );
  });
});
