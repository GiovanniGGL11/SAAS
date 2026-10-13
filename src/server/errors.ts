import { z } from 'zod';

/**
 * Erro esperado, com mensagem pronta para o usuário (em português).
 *
 * Server Actions devolvem esses erros como resultado (`toActionResult`) em vez de lançá-los: o
 * Next.js esconde a mensagem de erro lançado em produção, e o usuário veria um aviso genérico em
 * inglês no lugar de "Estoque insuficiente".
 */
export class UserError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UserError';
  }
}

/**
 * Id recebido do navegador. Server Actions aceitam qualquer valor serializável, então um `id`
 * declarado como string pode chegar como objeto (`{ not: '' }`) e virar filtro do Prisma —
 * um `updateMany` passaria a alterar todos os registros da empresa. Validar o tipo fecha isso.
 */
export const idSchema = z.string().min(1).max(64);

export function parseId(value: unknown): string {
  return idSchema.parse(value);
}
