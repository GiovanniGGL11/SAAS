import { prisma } from '@/lib/db';
import { phoneMatchKey } from '@/lib/phone';
import type { Client, Prisma } from '@/generated/prisma/client';

type Db = Prisma.TransactionClient | typeof prisma;

/**
 * Cliente da empresa com o mesmo celular, em qualquer formato (com ou sem 55, com ou sem o 9,
 * com máscara). Assim quem já tem cadastro e agenda pelo link fica no mesmo cadastro, em vez de
 * virar outro cliente. Havendo mais de um (cadastro duplicado antigo), fica o mais antigo ativo.
 */
export async function findClientByPhone(
  companyId: string,
  phone: string | null | undefined,
  db: Db = prisma,
): Promise<Client | null> {
  const key = phoneMatchKey(phone);
  if (!key) return null;
  // Pré-filtro pelos 8 últimos dígitos (iguais em todos os formatos); a chave decide.
  const candidates = await db.client.findMany({
    where: { companyId, phone: { endsWith: key.slice(-8) } },
    orderBy: [{ active: 'desc' }, { createdAt: 'asc' }],
    take: 20,
  });
  return candidates.find((c) => phoneMatchKey(c.phone) === key) ?? null;
}
