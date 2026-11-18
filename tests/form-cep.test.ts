import { describe, expect, it } from 'vitest';

import {
  QUESTION_TYPES,
  parseFormSchema,
  validateAnswers,
  type FormSchema,
} from '@/lib/forms/schema';

/** Pergunta de CEP na ficha (ex.: anamnese com endereço). Dados fictícios. */
const schema: FormSchema = parseFormSchema({
  sections: [
    {
      id: 's1',
      title: 'Dados',
      audience: 'any',
      questions: [{ id: 'q_cep', type: 'cep', title: 'CEP', required: true }],
    },
  ],
});
const check = (value: unknown) =>
  validateAnswers(schema, { q_cep: value }, { mode: 'submit', audience: 'client' }).errors.q_cep ??
  null;

describe('pergunta de CEP', () => {
  it('existe como tipo de pergunta', () => {
    expect(QUESTION_TYPES).toContain('cep');
  });

  it('aceita CEP com o endereço encontrado, ou só o CEP quando a consulta não respondeu', () => {
    expect(check('01310-100 · Avenida Paulista, Bela Vista, São Paulo/SP')).toBeNull();
    expect(check('01310-100')).toBeNull();
  });

  it('recusa CEP incompleto, sem formato ou que não existe (fica só com os números)', () => {
    expect(check('0131010')).toMatch(/CEP inválido/);
    expect(check('01310100')).toMatch(/CEP inválido/); // não encontrado: o campo guarda só os dígitos
    expect(check('abc')).toMatch(/CEP inválido/);
    expect(check(12345678)).toMatch(/CEP inválido/);
  });

  it('obrigatório em branco pede a resposta', () => {
    expect(check('')).toBe('Obrigatória.');
  });
});
