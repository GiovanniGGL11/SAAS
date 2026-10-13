import { randomUUID } from 'node:crypto';

import { z } from 'zod';

import { assistantActionSchema, type AssistantAction } from '@/lib/assistant';
import { declare, type AssistantContext, type AssistantTool, type ToolOutcome } from './tools';
import { describeAction } from './execute';
import { parseLocalDateTime } from './format';

/*
  Ferramentas de escrita: NENHUMA grava nada. Cada uma valida os argumentos, confere no banco e
  devolve uma proposta; a tela mostra o cartão e só o "Confirmar" da pessoa executa
  (confirmAssistantActionAction). Isso segura erro do modelo e instrução maliciosa escondida em
  dados de cliente.
*/

const id = z.string().min(1).max(64);
const str = (description: string) => ({ type: 'string', description });

async function propose(ctx: AssistantContext, raw: AssistantAction): Promise<ToolOutcome> {
  const action = assistantActionSchema.parse(raw);
  const { title, details } = await describeAction(ctx, action);
  return {
    response: {
      status: 'aguardando_confirmacao',
      resumo: `${title}: ${details.map((d) => `${d.label} ${d.value}`).join('; ')}`,
      aviso: 'Nada foi gravado ainda. A pessoa precisa confirmar no cartão da tela.',
    },
    proposal: { id: randomUUID(), title, details, action },
  };
}

const clientProps = {
  nome: str('Nome completo.'),
  telefone: str('Telefone com DDD (opcional).'),
  email: str('E-mail (opcional).'),
  aniversario: str('AAAA-MM-DD (opcional).'),
  observacoes: str('Observações (opcional).'),
};

const clientArgs = z.object({
  nome: z.string().optional(),
  telefone: z.string().optional(),
  email: z.string().optional(),
  aniversario: z.string().optional(),
  observacoes: z.string().optional(),
});

function toClientFields(args: z.infer<typeof clientArgs>) {
  return {
    name: args.nome,
    phone: args.telefone,
    email: args.email,
    birthDate: args.aniversario,
    notes: args.observacoes,
  };
}

const createClientTool: AssistantTool = {
  declaration: declare(
    'cadastrar_cliente',
    'Propõe cadastrar um cliente novo (a pessoa confirma na tela). Antes, confira com buscar_clientes se ele já existe.',
    clientProps,
    ['nome'],
  ),
  async run(ctx, args) {
    const parsed = clientArgs.parse(args);
    return propose(ctx, {
      kind: 'create_client',
      args: { ...toClientFields(parsed), name: parsed.nome ?? '' },
    });
  },
};

const updateClientTool: AssistantTool = {
  declaration: declare(
    'editar_cliente',
    'Propõe alterar dados de um cliente (a pessoa confirma na tela). Envie só os campos que mudam.',
    { clienteId: str('Id do cliente.'), ...clientProps },
    ['clienteId'],
  ),
  async run(ctx, args) {
    const parsed = clientArgs.extend({ clienteId: id }).parse(args);
    return propose(ctx, {
      kind: 'update_client',
      args: { clientId: parsed.clienteId, ...toClientFields(parsed) },
    });
  },
};

const createAppointmentTool: AssistantTool = {
  declaration: declare(
    'agendar',
    'Propõe um agendamento novo (a pessoa confirma na tela).',
    {
      clienteId: str('Id do cliente.'),
      servicoId: str('Id do serviço.'),
      profissionalId: str('Id do profissional.'),
      inicio: str('AAAA-MM-DDTHH:mm no horário local.'),
      observacoes: str('Observações (opcional).'),
    },
    ['clienteId', 'servicoId', 'profissionalId', 'inicio'],
  ),
  async run(ctx, args) {
    const parsed = z
      .object({
        clienteId: id,
        servicoId: id,
        profissionalId: id,
        inicio: z.string(),
        observacoes: z.string().optional(),
      })
      .parse(args);
    return propose(ctx, {
      kind: 'create_appointment',
      args: {
        clientId: parsed.clienteId,
        serviceId: parsed.servicoId,
        professionalId: parsed.profissionalId,
        startAt: parseLocalDateTime(parsed.inicio, ctx.timezone).toISOString(),
        notes: parsed.observacoes,
      },
    });
  },
};

const rescheduleTool: AssistantTool = {
  declaration: declare(
    'remarcar',
    'Propõe mudar o horário (e, se pedido, o profissional) de um agendamento (a pessoa confirma na tela).',
    {
      agendamentoId: str('Id do agendamento.'),
      inicio: str('Novo início, AAAA-MM-DDTHH:mm no horário local.'),
      profissionalId: str('Novo profissional (opcional).'),
    },
    ['agendamentoId', 'inicio'],
  ),
  async run(ctx, args) {
    const parsed = z
      .object({ agendamentoId: id, inicio: z.string(), profissionalId: id.optional() })
      .parse(args);
    return propose(ctx, {
      kind: 'reschedule_appointment',
      args: {
        appointmentId: parsed.agendamentoId,
        startAt: parseLocalDateTime(parsed.inicio, ctx.timezone).toISOString(),
        professionalId: parsed.profissionalId,
      },
    });
  },
};

const cancelTool: AssistantTool = {
  declaration: declare(
    'cancelar_agendamento',
    'Propõe cancelar um agendamento (a pessoa confirma na tela).',
    { agendamentoId: str('Id do agendamento.'), motivo: str('Motivo (opcional).') },
    ['agendamentoId'],
  ),
  async run(ctx, args) {
    const parsed = z
      .object({ agendamentoId: id, motivo: z.string().max(500).optional() })
      .parse(args);
    return propose(ctx, {
      kind: 'cancel_appointment',
      args: { appointmentId: parsed.agendamentoId, reason: parsed.motivo },
    });
  },
};

export const WRITE_TOOLS: AssistantTool[] = [
  createClientTool,
  updateClientTool,
  createAppointmentTool,
  rescheduleTool,
  cancelTool,
];
