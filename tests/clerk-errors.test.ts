import { describe, expect, it } from 'vitest';

import {
  GENERIC_AUTH_ERROR,
  PASSWORD_MIN_LENGTH,
  getClerkErrorMessage,
  isUnknownParamError,
} from '@/lib/clerk-errors';

describe('erros do Clerk no cadastro', () => {
  it('traduz os erros que mais aparecem e avisa o mínimo da senha', () => {
    expect(
      getClerkErrorMessage({
        code: 'form_password_length_too_short',
        message: 'is too short',
        longMessage: 'Passwords must be 8 characters or more.',
      }),
    ).toBe('A senha precisa ter pelo menos 8 caracteres.');
    // Se o Clerk estiver com outro mínimo, a mensagem usa o número dele.
    expect(
      getClerkErrorMessage({
        code: 'api_response_error',
        errors: [
          {
            code: 'form_password_length_too_short',
            longMessage: 'Passwords must be 15 characters or more.',
          },
        ],
      }),
    ).toContain('15 caracteres');
    // Sem número no texto: usa o mínimo do site.
    expect(getClerkErrorMessage({ code: 'form_password_length_too_short' })).toContain(
      `${PASSWORD_MIN_LENGTH} caracteres`,
    );
    expect(PASSWORD_MIN_LENGTH).toBe(8);
    expect(getClerkErrorMessage({ code: 'form_identifier_exists', message: 'taken' })).toMatch(
      /Já existe uma conta/,
    );
  });

  it('lê o código de dentro da lista errors (resposta da API do Clerk)', () => {
    expect(
      getClerkErrorMessage({
        code: 'api_response_error',
        message: 'That email address is taken. Please try another.',
        errors: [
          {
            code: 'form_identifier_exists',
            message: 'That email address is taken. Please try another.',
          },
        ],
      }),
    ).toMatch(/Já existe uma conta/);
  });

  it('sem tradução, nunca mostra o inglês do Clerk; sem erro, nada', () => {
    expect(
      getClerkErrorMessage({ code: 'outro_erro', message: 'curta', longMessage: 'longa' }),
    ).toBe(GENERIC_AUTH_ERROR);
    expect(getClerkErrorMessage({ message: 'Something went wrong' })).toBe(GENERIC_AUTH_ERROR);
    expect(getClerkErrorMessage(null)).toBeUndefined();
  });

  it('reconhece o campo que a instância não aceita (nome e sobrenome desligados)', () => {
    expect(isUnknownParamError({ code: 'form_param_unknown', message: 'x' })).toBe(true);
    expect(
      isUnknownParamError({ message: 'x', errors: [{ code: 'form_param_unknown', message: 'x' }] }),
    ).toBe(true);
    expect(isUnknownParamError({ code: 'form_password_pwned', message: 'x' })).toBe(false);
    expect(isUnknownParamError(null)).toBe(false);
  });
});
