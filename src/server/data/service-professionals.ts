import { prisma } from '@/lib/db';
import { Prisma } from '@/generated/prisma/client';
import { UserError } from '@/server/errors';

/*
  Quem faz cada serviço e por quanto. Serviço sem nenhuma linha = todos os profissionais fazem,
  pelo preço do serviço (o comportamento de sempre). Com linhas = só esses fazem; preço vazio =
  preço do serviço. O preço vale no momento de marcar (vira o snapshot do atendimento).
*/

type Db = Prisma.TransactionClient | typeof prisma;

export type Staffing = {
  /** `null` = todos fazem. */
  professionalIds: string[] | null;
  /** Só os preços próprios (quem não tem usa o do serviço). */
  prices: Record<string, number>;
};

export class ProfessionalNotForServiceError extends UserError {
  constructor(serviceName: string, professionalName?: string) {
    super(
      professionalName
        ? `${professionalName} não faz o serviço "${serviceName}".`
        : `Este profissional não faz o serviço "${serviceName}".`,
    );
    this.name = 'ProfessionalNotForServiceError';
  }
}

/** Quem faz e por quanto, para vários serviços de uma vez. */
export async function getStaffing(
  db: Db,
  companyId: string,
  serviceIds: string[],
): Promise<Map<string, Staffing>> {
  const rows = serviceIds.length
    ? await db.serviceProfessional.findMany({
        where: { companyId, serviceId: { in: [...new Set(serviceIds)] } },
        select: { serviceId: true, professionalId: true, price: true },
      })
    : [];
  const result = new Map<string, Staffing>();
  for (const id of serviceIds) result.set(id, { professionalIds: null, prices: {} });
  for (const r of rows) {
    const s = result.get(r.serviceId)!;
    s.professionalIds = [...(s.professionalIds ?? []), r.professionalId];
    if (r.price !== null) s.prices[r.professionalId] = Number(r.price);
  }
  return result;
}

export function doesService(staffing: Staffing | undefined, professionalId: string): boolean {
  return !staffing?.professionalIds || staffing.professionalIds.includes(professionalId);
}

/** Preço do serviço com este profissional (o próprio, se houver; senão o do serviço). */
export function priceWith(
  servicePrice: Prisma.Decimal | number,
  staffing: Staffing | undefined,
  professionalId: string | null | undefined,
): Prisma.Decimal {
  const own = professionalId ? staffing?.prices[professionalId] : undefined;
  return new Prisma.Decimal(own ?? servicePrice);
}

export async function listServiceStaffing(companyId: string, serviceId: string) {
  return (await getStaffing(prisma, companyId, [serviceId])).get(serviceId)!;
}

/** Confere a lista antes de gravar: sem repetidos, só profissionais da empresa, preços válidos. */
export async function assertStaffing(
  companyId: string,
  entries: { professionalId: string; price: number | null }[],
  db: Db = prisma,
) {
  const ids = [...new Set(entries.map((e) => e.professionalId))];
  if (ids.length !== entries.length) throw new UserError('Profissional repetido na lista.');
  if (ids.length) {
    const found = await db.professional.count({ where: { companyId, id: { in: ids } } });
    if (found !== ids.length) throw new UserError('Profissional não encontrado.');
  }
  for (const e of entries) {
    if (e.price !== null && (!(e.price >= 0) || e.price > 1_000_000)) {
      throw new UserError('Preço do profissional inválido.');
    }
  }
}

/** Grava quem faz o serviço (substitui tudo). Lista vazia = todos fazem pelo preço do serviço. */
export async function saveServiceStaffing(
  companyId: string,
  serviceId: string,
  entries: { professionalId: string; price: number | null }[],
  db: Db = prisma,
) {
  await assertStaffing(companyId, entries, db);
  await db.serviceProfessional.deleteMany({ where: { companyId, serviceId } });
  if (entries.length) {
    await db.serviceProfessional.createMany({
      data: entries.map((e) => ({
        companyId,
        serviceId,
        professionalId: e.professionalId,
        price: e.price,
      })),
    });
  }
}
