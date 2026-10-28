import { describe, expect, it } from 'vitest';

import { PASSWORD_MIN_LENGTH, getClerkErrorMessage, isUnknownParamError } from '@/lib/clerk-errors';

describe('erros do Clerk no cadastro', () => {
  it('traduz os erros que mais aparecem e avisa o mínimo da senha', () => {
    expect(
      getClerkErrorMessage({
        code: 'form_password_length_too_short',
        message: 'is too short',
        longMessage: 'Passwords must be 15 characters or more.',
      }),
    ).toContain(`${PASSWORD_MIN_LENGTH} caracteres`);
    expect(getClerkErrorMessage({ code: 'form_identifier_exists', message: 'taken' })).toMatch(
      /Já existe uma conta/,
    );
  });

  it('sem tradução, mostra a mensagem do Clerk; sem erro, nada', () => {
    expect(
      getClerkErrorMessage({ code: 'outro_erro', message: 'curta', longMessage: 'longa' }),
    ).toBe('longa');
    expect(getClerkErrorMessage({ message: 'só isso' })).toBe('só isso');
    expect(getClerkErrorMessage(null)).toBeUndefined();
  });

  it('reconhece o campo que a instância não aceita (nome e sobrenome desligados)', () => {
    expect(isUnknownParamError({ code: 'form_param_unknown', message: 'x' })).toBe(true);
    expect(isUnknownParamError({ code: 'form_password_pwned', message: 'x' })).toBe(false);
    expect(isUnknownParamError(null)).toBe(false);
  });
});
