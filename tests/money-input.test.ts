import { describe, expect, it } from 'vitest';

import { maskMoneyInput, moneyToInput, parseMoneyInput } from '@/lib/money-input';

describe('máscara de dinheiro', () => {
  it('os dígitos entram pela direita e viram casas decimais', () => {
    expect(maskMoneyInput('')).toBe('');
    expect(maskMoneyInput('2')).toBe('0,02');
    expect(maskMoneyInput('20')).toBe('0,20');
    expect(maskMoneyInput('200')).toBe('2,00');
    expect(maskMoneyInput('2000')).toBe('20,00');
    expect(maskMoneyInput('200000')).toBe('2.000,00');
    expect(maskMoneyInput('2000000')).toBe('20.000,00');
    expect(maskMoneyInput('123456789')).toBe('1.234.567,89');
  });

  it('continua certo ao digitar sobre o valor já formatado e ao apagar', () => {
    // O campo devolve o texto inteiro a cada tecla: "20.000,00" + "5".
    expect(maskMoneyInput('20.000,005')).toBe('200.000,05');
    // Backspace remove o último dígito do texto formatado.
    expect(maskMoneyInput('20.000,0')).toBe('2.000,00');
    expect(maskMoneyInput('0,0')).toBe('');
  });

  it('ignora letras e zeros à esquerda', () => {
    expect(maskMoneyInput('R$ 12a3')).toBe('1,23');
    expect(maskMoneyInput('0001')).toBe('0,01');
    expect(maskMoneyInput('000')).toBe('');
  });

  it('converte o valor salvo para o campo e de volta', () => {
    expect(moneyToInput(20000)).toBe('20.000,00');
    expect(moneyToInput(1234.5)).toBe('1.234,50');
    expect(moneyToInput(null)).toBe('');
    expect(moneyToInput(0)).toBe('');
    expect(parseMoneyInput('20.000,00')).toBe(20000);
    expect(parseMoneyInput('1.234,50')).toBe(1234.5);
    expect(parseMoneyInput('')).toBe(0);
  });
});
