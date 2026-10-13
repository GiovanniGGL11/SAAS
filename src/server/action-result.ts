import { ZodError } from 'zod';

import { Prisma } from '@/generated/prisma/client';
import { UserError } from '@/server/errors';

import {
  AppointmentConflictError,
  AppointmentNotFoundError,
  ForeignEntityMismatchError,
  InvalidBlockRangeError,
  InvalidDurationError,
} from '@/server/data/appointments';

/**
 * Resultado de uma Server Action que pode falhar por um motivo esperado.
 *
 * Erro lançado de dentro de uma Server Action tem a mensagem escondida pelo Next.js em produção
 * — o usuário via um aviso genérico em inglês em vez de "este profissional já tem um agendamento
 * nesse horário". A documentação do Next manda modelar erro esperado como valor de retorno
 * (node_modules/next/dist/docs, "Handling expected errors"). Erros inesperados continuam
 * sendo lançados.
 */
export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

const EXPECTED_ERRORS = [
  AppointmentConflictError,
  AppointmentNotFoundError,
  ForeignEntityMismatchError,
  InvalidBlockRangeError,
  InvalidDurationError,
];

export async function toActionResult<T>(run: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await run() };
  } catch (error) {
    if (error instanceof ZodError) {
      return { ok: false, error: error.issues[0]?.message || 'Confira os dados informados.' };
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return { ok: false, error: 'Já existe um registro com esses dados.' };
    }
    if (
      error instanceof UserError ||
      EXPECTED_ERRORS.some((Expected) => error instanceof Expected)
    ) {
      return { ok: false, error: (error as Error).message };
    }
    throw error;
  }
}
