import { prisma } from '@/lib/db';
import { formatPhone } from '@/lib/phone';
import { clientInput } from '@/lib/validations/client';
import type { AssistantAction, AssistantProposal } from '@/lib/assistant';
import type { Client } from '@/generated/prisma/client';
import { UserError } from '@/server/errors';
import { recordAuditLog } from '@/server/data/audit';
import { createClient, getClientById, updateClient } from '@/server/data/clients';
import {
  AppointmentNotFoundError,
  cancelAppointment,
  createAppointment,
  moveAppointment,
} from '@/server/data/appointments';
import type { AssistantContext } from './tools';
import { formatBRL, toHumanDateTime } from './format';

/*
  Validação e execução das ações propostas pelo assistente. A mesma `describeAction` roda ao
  propor (para o cartão mostrar nomes reais e o modelo saber de cara se algo não existe) e de
  novo ao confirmar — entre um e outro o horário pode ter sido ocupado ou o cliente desativado.
*/

// Pelo assistente só se mexe no que ainda vai acontecer; concluído ou cancelado fica para a agenda.
const CHANGEABLE = ['SCHEDULED', 'CONFIRMED'];
// Uma folga para o tempo entre propor e confirmar.
const PAST_TOLERANCE_MS = 5 * 60_000;

type Description = Pick<AssistantProposal, 'title' | 'details'>;
type Detail = { label: string; value: string };

function detail(label: string, value: string | null | undefined): Detail[] {
  return value ? [{ label, value }] : [];
}

const brDate = (iso: string) => iso.split('-').reverse().join('/');

function assertFuture(startAt: Date) {
  if (startAt.getTime() < Date.now() - PAST_TOLERANCE_MS) {
    throw new UserError('Esse horário já passou.');
  }
}

async function findActive<T>(
  kind: 'cliente' | 'profissional' | 'serviço',
  find: Promise<T | null>,
): Promise<T> {
  const found = await find;
  if (!found) throw new UserError(`${kind[0].toUpperCase()}${kind.slice(1)} não encontrado.`);
  return found;
}

async function assertPhoneFree(
  ctx: AssistantContext,
  phone: string | undefined,
  exceptId?: string,
) {
  if (!phone) return;
  const other = await prisma.client.findFirst({
    where: { companyId: ctx.companyId, phone, ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { name: true },
  });
  if (other) throw new UserError(`Já existe um cliente com este telefone (${other.name}).`);
}

async function findChangeableAppointment(ctx: AssistantContext, id: string) {
  const appointment = await prisma.appointment.findFirst({
    where: { id, companyId: ctx.companyId },
    include: {
      client: { select: { name: true } },
      professional: { select: { id: true, name: true } },
    },
  });
  if (!appointment) throw new AppointmentNotFoundError();
  if (!CHANGEABLE.includes(appointment.status)) {
    throw new UserError('Só dá para mudar agendamentos marcados ou confirmados.');
  }
  return appointment;
}

/** O cadastro atual no formato do formulário, para a edição mudar só o que foi pedido. */
function clientToInput(client: Client) {
  return {
    name: client.name,
    phone: client.phone ?? undefined,
    email: client.email ?? '',
    cpf: client.cpf ?? undefined,
    birthDate: client.birthDate ?? undefined,
    notes: client.notes ?? undefined,
    zipCode: client.zipCode ?? undefined,
    street: client.street ?? undefined,
    number: client.number ?? undefined,
    complement: client.complement ?? undefined,
    district: client.district ?? undefined,
    city: client.city ?? undefined,
    state: client.state ?? undefined,
  };
}

function definedOnly<T extends Record<string, unknown>>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as Partial<T>;
}

/** Valida contra o banco (sempre filtrando pela empresa da sessão) e monta o resumo do cartão. */
export async function describeAction(
  ctx: AssistantContext,
  action: AssistantAction,
): Promise<Description> {
  switch (action.kind) {
    case 'create_client': {
      const parsed = clientInput.parse(action.args);
      await assertPhoneFree(ctx, parsed.phone);
      return {
        title: 'Cadastrar cliente',
        details: [
          ...detail('Nome', parsed.name),
          ...detail('Telefone', parsed.phone && formatPhone(parsed.phone)),
          ...detail('E-mail', parsed.email),
          ...detail('Aniversário', action.args.birthDate && brDate(action.args.birthDate)),
          ...detail('Observações', parsed.notes),
        ],
      };
    }
    case 'update_client': {
      const { clientId, ...changes } = action.args;
      const client = await findActive('cliente', getClientById(ctx.companyId, clientId));
      const fields = definedOnly(changes);
      if (Object.keys(fields).length === 0) throw new UserError('Nada para alterar.');
      const parsed = clientInput.parse({ ...clientToInput(client), ...fields });
      await assertPhoneFree(ctx, parsed.phone, client.id);
      return {
        title: `Editar ${client.name}`,
        details: [
          ...detail('Nome', fields.name && parsed.name),
          ...detail('Telefone', fields.phone !== undefined ? formatPhone(parsed.phone) || '—' : ''),
          ...detail('E-mail', fields.email !== undefined ? parsed.email || '—' : ''),
          ...detail('Aniversário', fields.birthDate && brDate(fields.birthDate)),
          ...detail('Observações', fields.notes !== undefined ? parsed.notes || '—' : ''),
        ],
      };
    }
    case 'create_appointment': {
      const { args } = action;
      const startAt = new Date(args.startAt);
      assertFuture(startAt);
      const [client, professional, service] = await Promise.all([
        findActive(
          'cliente',
          prisma.client.findFirst({
            where: { id: args.clientId, companyId: ctx.companyId, active: true },
          }),
        ),
        findActive(
          'profissional',
          prisma.professional.findFirst({
            where: { id: args.professionalId, companyId: ctx.companyId, active: true },
          }),
        ),
        findActive(
          'serviço',
          prisma.service.findFirst({
            where: { id: args.serviceId, companyId: ctx.companyId, active: true },
          }),
        ),
      ]);
      return {
        title: 'Novo agendamento',
        details: [
          ...detail('Cliente', client.name),
          ...detail(
            'Serviço',
            `${service.name} · ${service.durationMinutes} min · ${formatBRL(Number(service.price))}`,
          ),
          ...detail('Profissional', professional.name),
          ...detail('Quando', toHumanDateTime(startAt, ctx.timezone)),
          ...detail('Observações', args.notes),
        ],
      };
    }
    case 'reschedule_appointment': {
      const { args } = action;
      const appointment = await findChangeableAppointment(ctx, args.appointmentId);
      const startAt = new Date(args.startAt);
      assertFuture(startAt);
      const professional =
        args.professionalId && args.professionalId !== appointment.professionalId
          ? await findActive(
              'profissional',
              prisma.professional.findFirst({
                where: { id: args.professionalId, companyId: ctx.companyId, active: true },
              }),
            )
          : null;
      return {
        title: 'Remarcar agendamento',
        details: [
          ...detail('Cliente', appointment.client.name),
          ...detail('Serviço', appointment.serviceNameSnapshot),
          ...detail('De', toHumanDateTime(appointment.startAt, ctx.timezone)),
          ...detail('Para', toHumanDateTime(startAt, ctx.timezone)),
          ...detail(
            'Profissional',
            professional
              ? `${appointment.professional.name} → ${professional.name}`
              : appointment.professional.name,
          ),
        ],
      };
    }
    case 'cancel_appointment': {
      const appointment = await findChangeableAppointment(ctx, action.args.appointmentId);
      return {
        title: 'Cancelar agendamento',
        details: [
          ...detail('Cliente', appointment.client.name),
          ...detail('Serviço', appointment.serviceNameSnapshot),
          ...detail('Quando', toHumanDateTime(appointment.startAt, ctx.timezone)),
          ...detail('Profissional', appointment.professional.name),
          ...detail('Motivo', action.args.reason),
        ],
      };
    }
  }
}

export type ExecutedAction = {
  message: string;
  /** Agendamentos que mudaram, para o servidor sincronizar com o Google Agenda. */
  appointmentIds: string[];
  /** Telas a revalidar — os mesmos efeitos das ações normais. */
  paths: string[];
};

/** Só roda depois do clique em "Confirmar"; revalida tudo antes de gravar. */
export async function executeAction(
  ctx: AssistantContext,
  action: AssistantAction,
): Promise<ExecutedAction> {
  await describeAction(ctx, action);

  switch (action.kind) {
    case 'create_client': {
      const parsed = clientInput.parse(action.args);
      const client = await createClient(ctx.companyId, {
        ...parsed,
        email: parsed.email || null,
        birthDate: parsed.birthDate ?? null,
      });
      await recordAuditLog({
        companyId: ctx.companyId,
        entityType: 'Client',
        entityId: client.id,
        action: 'created',
        userId: ctx.userId,
        metadata: { source: 'assistant' },
      });
      return {
        message: `${client.name} cadastrado.`,
        appointmentIds: [],
        paths: ['/clientes', '/agenda'],
      };
    }
    case 'update_client': {
      const { clientId, ...changes } = action.args;
      const existing = (await getClientById(ctx.companyId, clientId))!;
      const fields = definedOnly(changes);
      const parsed = clientInput.parse({ ...clientToInput(existing), ...fields });
      const client = await updateClient(ctx.companyId, clientId, {
        ...parsed,
        email: parsed.email || null,
        birthDate: parsed.birthDate ?? null,
      });
      await recordAuditLog({
        companyId: ctx.companyId,
        entityType: 'Client',
        entityId: client.id,
        action: 'updated',
        userId: ctx.userId,
        metadata: { source: 'assistant', fields: Object.keys(fields) },
      });
      return {
        message: `${client.name} atualizado.`,
        appointmentIds: [],
        paths: ['/clientes', '/agenda'],
      };
    }
    case 'create_appointment': {
      const { args } = action;
      const appointment = await createAppointment({
        companyId: ctx.companyId,
        clientId: args.clientId,
        professionalId: args.professionalId,
        serviceId: args.serviceId,
        startAt: new Date(args.startAt),
        notes: args.notes,
        createdByUserId: ctx.userId,
      });
      return {
        message: 'Agendamento criado.',
        appointmentIds: [appointment.id],
        paths: ['/agenda'],
      };
    }
    case 'reschedule_appointment': {
      const { args } = action;
      const appointment = await moveAppointment({
        companyId: ctx.companyId,
        id: args.appointmentId,
        startAt: new Date(args.startAt),
        professionalId: args.professionalId,
        updatedByUserId: ctx.userId,
      });
      return {
        message: 'Agendamento remarcado.',
        appointmentIds: [appointment.id],
        paths: ['/agenda'],
      };
    }
    case 'cancel_appointment': {
      const appointment = await cancelAppointment({
        companyId: ctx.companyId,
        id: action.args.appointmentId,
        canceledByUserId: ctx.userId,
        reason: action.args.reason,
      });
      return {
        message: 'Agendamento cancelado.',
        appointmentIds: [appointment.id],
        paths: ['/agenda'],
      };
    }
  }
}
