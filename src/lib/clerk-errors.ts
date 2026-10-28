type ClerkErrorLike = {
  message: string;
  longMessage?: string;
  code?: string;
};

/**
 * Tamanho mínimo da senha exigido pela instância do Clerk (Dashboard → Configure → Password).
 * O formulário avisa antes de enviar; se mudar no Clerk, mude aqui também.
 */
export const PASSWORD_MIN_LENGTH = 15;

const MESSAGES: Record<string, string> = {
  form_password_length_too_short: `A senha precisa ter pelo menos ${PASSWORD_MIN_LENGTH} caracteres. Uma frase longa funciona bem.`,
  form_password_pwned:
    'Essa senha apareceu em vazamentos de dados. Escolha outra, que você não use em outros sites.',
  form_password_not_strong_enough: 'Essa senha é fraca. Use uma frase mais longa e única.',
  form_password_incorrect: 'Senha incorreta.',
  form_identifier_exists: 'Já existe uma conta com esse e-mail. Entre, ou recupere a senha.',
  form_identifier_not_found: 'Não encontramos uma conta com esse e-mail.',
  form_param_format_invalid: 'Confira o e-mail digitado.',
  form_code_incorrect: 'Código incorreto. Confira o código que chegou no seu e-mail.',
  verification_expired: 'O código venceu. Volte e peça um novo.',
  verification_failed: 'Não foi possível verificar o código. Peça um novo.',
  too_many_requests: 'Muitas tentativas. Aguarde alguns minutos e tente de novo.',
  rate_limit_exceeded: 'Muitas tentativas. Aguarde alguns minutos e tente de novo.',
};

export function getClerkErrorMessage(error: ClerkErrorLike | null | undefined): string | undefined {
  if (!error) return undefined;
  return (error.code && MESSAGES[error.code]) || error.longMessage || error.message;
}

/** O Clerk recusou um campo que a instância não tem ativo (ex.: nome e sobrenome). */
export function isUnknownParamError(error: ClerkErrorLike | null | undefined): boolean {
  return error?.code === 'form_param_unknown';
}
