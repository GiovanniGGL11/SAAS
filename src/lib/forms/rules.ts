/**
 * Regras puras de "quando pedir uma ficha" e "a ficha libera o atendimento?". Ficam fora do
 * banco para serem testadas sem rede e para o servidor e a tela concordarem.
 */

export type Renewal = 'EACH_VISIT' | 'ONCE' | 'AFTER_DAYS';
export type Requirement = 'NONE' | 'SUBMITTED' | 'REVIEWED';
export type EntryStatus = 'REQUESTED' | 'DRAFT' | 'SUBMITTED' | 'REVIEWED';

export type EntrySummary = {
  id: string;
  status: EntryStatus;
  appointmentId: string | null;
  submittedAt: Date | null;
  createdAt: Date;
};

const DAY = 86_400_000;

/**
 * A ficha existente ainda vale para este atendimento?
 * - a cada atendimento: só a ficha deste atendimento;
 * - uma vez: qualquer ficha do cliente com este modelo;
 * - depois de N dias: a última enviada há menos de N dias (ou uma ainda em aberto).
 */
export function entryCoversVisit(
  entry: EntrySummary,
  rule: { renewal: Renewal; renewalDays: number | null },
  visit: { appointmentId: string; at: Date },
): boolean {
  if (rule.renewal === 'EACH_VISIT') return entry.appointmentId === visit.appointmentId;
  if (rule.renewal === 'ONCE') return true;
  // Em aberto (pedida, rascunho) ainda vai ser preenchida: não pede outra por cima.
  if (!entry.submittedAt) return true;
  const days = rule.renewalDays ?? 365;
  return visit.at.getTime() - entry.submittedAt.getTime() < days * DAY;
}

/** Entre as fichas do cliente para um modelo, a que vale para a visita (a mais recente). */
export function currentEntryFor(
  entries: EntrySummary[],
  rule: { renewal: Renewal; renewalDays: number | null },
  visit: { appointmentId: string; at: Date },
): EntrySummary | null {
  const sorted = [...entries].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  return sorted.find((e) => entryCoversVisit(e, rule, visit)) ?? null;
}

const STATUS_RANK: Record<EntryStatus, number> = {
  REQUESTED: 0,
  DRAFT: 1,
  SUBMITTED: 2,
  REVIEWED: 3,
};

/** A exigência do modelo está cumprida pela ficha? Sem ficha, só se não houver exigência. */
export function requirementMet(requirement: Requirement, status: EntryStatus | null): boolean {
  if (requirement === 'NONE') return true;
  if (!status) return false;
  return STATUS_RANK[status] >= STATUS_RANK[requirement];
}

/** Texto do que falta, para a mensagem ao iniciar o atendimento. */
export function missingRequirementText(requirement: Requirement, status: EntryStatus | null) {
  if (requirement === 'REVIEWED') {
    return status === 'SUBMITTED' ? 'precisa ser revisada' : 'precisa ser preenchida e revisada';
  }
  return 'precisa ser preenchida e enviada';
}

/** Chave que impede pedir a mesma ficha duas vezes (recarregar, vários serviços, dois cliques). */
export function requestKeyFor(params: {
  templateId: string;
  clientId: string;
  renewal: Renewal;
  appointmentId: string | null;
}) {
  // "Uma vez" e "a cada N dias" são por cliente; "a cada atendimento", por atendimento.
  if (params.renewal === 'EACH_VISIT' && params.appointmentId) {
    return `appt:${params.appointmentId}:${params.templateId}`;
  }
  return null;
}
