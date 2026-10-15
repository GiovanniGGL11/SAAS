import { formatCurrencyBRL } from '@/lib/serialize';

/**
 * Transforma um registro do histórico (AuditLog) em frase: "Horário alterado", "de 10:00 para
 * 14:00". Função pura — o mesmo texto serve à tela de histórico e ao histórico do agendamento.
 */

export type AuditEntry = {
  entityType: string;
  action: string;
  userId: string;
  metadata: unknown;
};

const STATUS: Record<string, string> = {
  SCHEDULED: 'Agendado',
  CONFIRMED: 'Confirmado',
  IN_PROGRESS: 'Em atendimento',
  DONE: 'Concluído',
  CANCELED: 'Cancelado',
  NO_SHOW: 'Não compareceu',
};

/** Autores que não são pessoas da equipe. */
const SYSTEM_ACTORS: Record<string, string> = {
  'online-booking': 'Cliente (agendamento online)',
  'client-portal': 'Cliente (área do cliente)',
  'client-link': 'Cliente (link de confirmação)',
  'demo-seed': 'Dados de demonstração',
  system: 'Sistema',
};

export function systemActorLabel(userId: string): string | null {
  return SYSTEM_ACTORS[userId] ?? null;
}

type Meta = Record<string, unknown>;
const asMeta = (value: unknown): Meta =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Meta) : {};
const num = (value: unknown) => (value === null || value === undefined ? null : Number(value));

/** "01/05 às 14:00" no fuso da empresa (o Intl em português põe vírgula entre data e hora). */
export function formatDateTimeAt(date: Date, timezone: string): string {
  const day = new Intl.DateTimeFormat('pt-BR', {
    timeZone: timezone,
    day: '2-digit',
    month: '2-digit',
  }).format(date);
  const time = new Intl.DateTimeFormat('pt-BR', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(date);
  return `${day} às ${time}`;
}

function dateTime(iso: unknown, timezone: string): string | null {
  if (typeof iso !== 'string') return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : formatDateTimeAt(date, timezone);
}

export function describeAudit(
  entry: AuditEntry,
  timezone: string,
): { title: string; detail: string | null } {
  const m = asMeta(entry.metadata);
  const fromAssistant = m.source === 'assistant' ? ' (pelo assistente)' : '';

  if (entry.entityType === 'Appointment') {
    switch (entry.action) {
      case 'created':
        return { title: `Agendamento criado${fromAssistant}`, detail: null };
      case 'moved': {
        // A edição de detalhes (cliente, serviços) também é gravada como "moved", com edited.
        if (m.edited) {
          const parts = [
            m.clientId ? 'cliente' : null,
            Array.isArray(m.serviceIds) ? 'serviços' : null,
          ].filter(Boolean);
          return {
            title: 'Detalhes alterados',
            detail: parts.length ? `mudou: ${parts.join(', ')}` : null,
          };
        }
        if (m.resized) {
          const end = dateTime(m.endAt, timezone);
          return { title: 'Duração alterada', detail: end ? `termina ${end}` : null };
        }
        const to = dateTime(m.startAt, timezone);
        const from = dateTime(m.fromStartAt, timezone);
        const parts = [
          from && to ? `de ${from} para ${to}` : to ? `para ${to}` : null,
          m.toProfessionalId ? 'outro profissional' : null,
        ].filter(Boolean);
        return { title: 'Horário alterado', detail: parts.join(' · ') || null };
      }
      case 'status_changed': {
        const status = typeof m.status === 'string' ? m.status : '';
        const from = typeof m.from === 'string' ? STATUS[m.from] : null;
        if (status === 'DONE' && m.total !== undefined) {
          const parts = [
            `Total ${formatCurrencyBRL(num(m.total) ?? 0)}`,
            typeof m.coupon === 'string' && m.coupon ? `cupom ${m.coupon}` : null,
            num(m.tip) ? `gorjeta ${formatCurrencyBRL(num(m.tip)!)}` : null,
            typeof m.paymentMethod === 'string' ? paymentLabel(m.paymentMethod) : null,
          ].filter(Boolean);
          return { title: 'Concluído e cobrado', detail: parts.join(' · ') };
        }
        return {
          title: `Status: ${STATUS[status] ?? status}`,
          detail: from ? `antes: ${from}` : null,
        };
      }
      case 'canceled':
        return {
          title: `Agendamento cancelado${fromAssistant}`,
          detail: typeof m.reason === 'string' && m.reason ? `motivo: ${m.reason}` : null,
        };
      case 'updated':
        return { title: 'Detalhes alterados', detail: changedFields(m) };
      case 'deleted':
        return { title: 'Agendamento excluído', detail: null };
    }
  }

  const name = typeof m.name === 'string' ? m.name : null;
  const entity = ENTITY[entry.entityType] ?? entry.entityType;
  if (entry.action === 'created') {
    if (entry.entityType === 'ScheduleBlock') {
      const count = num(m.count);
      return {
        title: 'Horário bloqueado',
        detail: count && count > 1 ? `${count} bloqueios${m.weekly ? ', toda semana' : ''}` : null,
      };
    }
    return { title: `${entity} cadastrado${fromAssistant}`, detail: name };
  }
  if (entry.action === 'updated') {
    if (m.active === false) return { title: `${entity} arquivado`, detail: name };
    if (m.active === true) return { title: `${entity} reativado`, detail: name };
    if (m.isVip === true) return { title: 'Marcado como VIP', detail: name };
    if (m.isVip === false) return { title: 'VIP removido', detail: name };
    if (typeof m.status === 'string')
      return { title: `${entity}: ${m.status.toLowerCase()}`, detail: name };
    return { title: `${entity} alterado${fromAssistant}`, detail: name ?? changedFields(m) };
  }
  if (entry.action === 'canceled' || entry.action === 'deleted') {
    return {
      title: entry.entityType === 'ScheduleBlock' ? 'Bloqueio removido' : `${entity} removido`,
      detail: name,
    };
  }
  return { title: `${entity}: ${entry.action}`, detail: null };
}

const ENTITY: Record<string, string> = {
  Client: 'Cliente',
  Service: 'Serviço',
  Product: 'Produto',
  ScheduleBlock: 'Bloqueio',
  WaitlistEntry: 'Lista de espera',
  Appointment: 'Agendamento',
};

function paymentLabel(method: string): string {
  return (
    {
      PIX: 'PIX',
      CASH: 'dinheiro',
      CREDIT_CARD: 'crédito',
      DEBIT_CARD: 'débito',
      BANK_TRANSFER: 'transferência',
      OTHER: 'outro',
    }[method] ?? method
  );
}

const FIELD: Record<string, string> = {
  clientId: 'cliente',
  serviceId: 'serviço',
  notes: 'observações',
  price: 'preço',
  items: 'serviços',
};

function changedFields(m: Meta): string | null {
  const fields = Array.isArray(m.fields)
    ? (m.fields as unknown[]).filter((f): f is string => typeof f === 'string')
    : Object.keys(m).filter((k) => k in FIELD);
  const labels = fields.map((f) => FIELD[f] ?? f);
  return labels.length ? `mudou: ${labels.join(', ')}` : null;
}
