import { prisma } from '@/lib/db';

/**
 * Retorno por serviço: cada serviço pode dizer em quantos dias o cliente costuma voltar
 * (Service.returnAfterDays). A partir do último atendimento concluído de cada serviço, sai a data
 * sugerida de retorno. Quem já tem horário marcado não entra — já está voltando.
 */

/** Quantos dias antes da data sugerida o cliente já aparece em "Hora de voltar". */
export const RETURN_AHEAD_DAYS = 3;
/** Atrasado há mais que isso vira "sumido" (o cartão Chame de volta, de 60 dias). */
export const RETURN_OVERDUE_LIMIT_DAYS = 60;

export type DueReturn = {
  clientId: string;
  name: string;
  phone: string | null;
  serviceId: string;
  serviceName: string;
  returnAfterDays: number;
  lastVisitAt: Date;
  dueAt: Date;
  /** Positivo = atrasado; negativo = faltam dias. */
  daysLate: number;
};

type Row = Omit<DueReturn, 'daysLate'>;

/**
 * Último atendimento concluído de cada (cliente, serviço) com retorno configurado. Conta o serviço
 * principal e os demais itens do atendimento (vários serviços no mesmo horário).
 */
async function lastVisitsWithReturn(companyId: string, clientId?: string): Promise<Row[]> {
  const clientFilter = clientId ?? null;
  return prisma.$queryRaw<Row[]>`
    WITH visits AS (
      SELECT a."clientId", a."serviceId", a."startAt"
      FROM "Appointment" a
      WHERE a."companyId" = ${companyId} AND a.status = 'DONE'
        AND (${clientFilter}::text IS NULL OR a."clientId" = ${clientFilter})
      UNION ALL
      SELECT a."clientId", i."serviceId", a."startAt"
      FROM "AppointmentItem" i
      JOIN "Appointment" a ON a.id = i."appointmentId"
      WHERE a."companyId" = ${companyId} AND a.status = 'DONE'
        AND (${clientFilter}::text IS NULL OR a."clientId" = ${clientFilter})
    ),
    last AS (
      SELECT "clientId", "serviceId", MAX("startAt") AS "lastVisitAt"
      FROM visits
      GROUP BY "clientId", "serviceId"
    )
    SELECT
      l."clientId",
      c.name,
      c.phone,
      s.id AS "serviceId",
      s.name AS "serviceName",
      s."returnAfterDays",
      l."lastVisitAt",
      l."lastVisitAt" + make_interval(days => s."returnAfterDays") AS "dueAt"
    FROM last l
    JOIN "Service" s
      ON s.id = l."serviceId" AND s."companyId" = ${companyId}
      AND s.active AND s."returnAfterDays" IS NOT NULL
    JOIN "Client" c ON c.id = l."clientId" AND c."companyId" = ${companyId} AND c.active
    WHERE NOT EXISTS (
      SELECT 1 FROM "Appointment" f
      WHERE f."companyId" = ${companyId} AND f."clientId" = l."clientId"
        AND f.status IN ('SCHEDULED', 'CONFIRMED') AND f."startAt" >= now()
    )
    ORDER BY "dueAt" ASC`;
}

function withDaysLate(row: Row, now: Date): DueReturn {
  return { ...row, daysLate: Math.floor((now.getTime() - row.dueAt.getTime()) / 86_400_000) };
}

/**
 * Quem está na hora de voltar: retorno sugerido entre daqui a poucos dias e até 60 dias atrás.
 * Um cliente aparece uma vez, pelo serviço cujo retorno vence primeiro.
 */
export async function listDueReturns(companyId: string, limit = 50): Promise<DueReturn[]> {
  const now = new Date();
  const until = now.getTime() + RETURN_AHEAD_DAYS * 86_400_000;
  const since = now.getTime() - RETURN_OVERDUE_LIMIT_DAYS * 86_400_000;
  const seen = new Set<string>();
  const due: DueReturn[] = [];
  for (const row of await lastVisitsWithReturn(companyId)) {
    const at = row.dueAt.getTime();
    if (at > until || at < since || seen.has(row.clientId)) continue;
    seen.add(row.clientId);
    due.push(withDaysLate(row, now));
  }
  return due.slice(0, limit);
}

/** Próximo retorno sugerido de um cliente (o que vence primeiro), para a ficha dele. */
export async function getClientReturnSuggestion(
  companyId: string,
  clientId: string,
): Promise<DueReturn | null> {
  const [first] = await lastVisitsWithReturn(companyId, clientId);
  return first ? withDaysLate(first, new Date()) : null;
}

/** Mensagem pronta de WhatsApp para chamar o cliente de volta. */
export function returnMessage(r: Pick<DueReturn, 'name' | 'serviceName' | 'lastVisitAt'>) {
  const first = r.name.trim().split(/\s+/)[0];
  const days = Math.max(1, Math.floor((Date.now() - r.lastVisitAt.getTime()) / 86_400_000));
  return `Oi, ${first}! Já faz ${days} dias do seu último ${r.serviceName}. Que tal agendar o próximo? É só responder aqui que eu vejo um horário para você.`;
}
