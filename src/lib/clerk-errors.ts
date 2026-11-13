type ClerkErrorItem = {
  message?: string;
  longMessage?: string;
  code?: string;
};

/**
 * O Clerk entrega o erro de dois jeitos: com o código no próprio objeto ou, na resposta da API
 * (`ClerkAPIResponseError`), numa lista `errors` — é nela que vem o código específico.
 */
type ClerkErrorLike = ClerkErrorItem & { errors?: ClerkErrorItem[] };

/**
 * Tamanho mínimo da senha exigido pela instância do Clerk (Dashboard → Configure → Password).
 * O formulário avisa antes de enviar; se mudar no Clerk, mude aqui também.
 */
export const PASSWORD_MIN_LENGTH = 15;

/** Quando o Clerk devolve um erro que não traduzimos: nunca mostrar o texto dele em inglês. */
export const GENERIC_AUTH_ERROR = 'Não foi possível concluir. Confira os dados e tente de novo.';

const MESSAGES: Record<string, string> = {
  form_password_length_too_short: `A senha precisa ter pelo menos ${PASSWORD_MIN_LENGTH} caracteres. Uma frase longa funciona bem.`,
  form_password_length_too_long: 'A senha é longa demais. Use uma mais curta.',
  form_password_size_in_bytes_exceeded: 'A senha é longa demais. Use uma mais curta.',
  form_password_pwned:
    'Essa senha apareceu em vazamentos de dados. Escolha outra, que você não use em outros sites.',
  form_password_not_strong_enough: 'Essa senha é fraca. Use uma frase mais longa e única.',
  form_password_validation_failed: 'Senha incorreta.',
  form_password_incorrect: 'Senha incorreta.',
  form_identifier_exists: 'Já existe uma conta com esse e-mail. Entre, ou recupere a senha.',
  form_identifier_not_found: 'Não encontramos uma conta com esse e-mail.',
  form_param_format_invalid: 'Confira o e-mail digitado.',
  form_param_nil: 'Preencha todos os campos.',
  form_param_missing: 'Preencha todos os campos.',
  form_conditional_param_missing: 'Preencha todos os campos.',
  form_code_incorrect: 'Código incorreto. Confira o código que chegou no seu e-mail.',
  verification_expired: 'O código venceu. Volte e peça um novo.',
  verification_failed: 'Não foi possível verificar o código. Peça um novo.',
  verification_already_verified: 'Esse código já foi usado. Continue para entrar.',
  strategy_for_user_invalid: 'Essa conta entra de outro jeito (por exemplo, com o Google).',
  session_exists: 'Você já está conectado. Recarregue a página.',
  identifier_already_signed_in: 'Você já está conectado. Recarregue a página.',
  user_locked: 'Conta bloqueada temporariamente por muitas tentativas. Tente mais tarde.',
  not_allowed_access: 'Esse e-mail não tem permissão para entrar.',
  captcha_invalid: 'Não conseguimos confirmar que você não é um robô. Recarregue a página.',
  captcha_missing_token: 'Não conseguimos confirmar que você não é um robô. Recarregue a página.',
  too_many_requests: 'Muitas tentativas. Aguarde alguns minutos e tente de novo.',
  rate_limit_exceeded: 'Muitas tentativas. Aguarde alguns minutos e tente de novo.',
};

/** Códigos do erro, do mais específico (lista `errors`) ao de cima. */
function codesOf(error: ClerkErrorLike): string[] {
  return [...(error.errors ?? []).map((e) => e.code), error.code].filter((c): c is string =>
    Boolean(c),
  );
}

export function getClerkErrorMessage(error: ClerkErrorLike | null | undefined): string | undefined {
  if (!error) return undefined;
  for (const code of codesOf(error)) if (MESSAGES[code]) return MESSAGES[code];
  return GENERIC_AUTH_ERROR;
}

/** O Clerk recusou um campo que a instância não tem ativo (ex.: nome e sobrenome). */
export function isUnknownParamError(error: ClerkErrorLike | null | undefined): boolean {
  return Boolean(error && codesOf(error).includes('form_param_unknown'));
}
