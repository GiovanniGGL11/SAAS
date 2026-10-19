import { z, ZodError } from 'zod';

import { prisma } from '@/lib/db';
import type { AssistantProposal } from '@/lib/assistant';
import { UserError } from '@/server/errors';
import {
  AppointmentNotFoundError,
  ForeignEntityMismatchError,
  findNextAvailableSlot,
  listAppointmentsInRange,
} from '@/server/data/appointments';
import {
  getClientById,
  getClientStats,
  listLapsedClients,
  searchClientsByName,
} from '@/server/data/clients';
import { getCashFlowSummary } from '@/server/data/finance';
import { listLowStockProducts } from '@/server/data/stock';
import { listActiveServices } from '@/server/data/services';
import { listActiveProfessionals } from '@/server/data/professionals';
import {
  getCancellationStats,
  getRevenueByProfessional,
  getRevenueByService,
} from '@/server/data/reports';
import type { GeminiFunctionDeclaration } from './gemini';
import type { FormAccess } from '@/server/data/form-permissions';
import { localDayRange, parseLocalDateTime, toLocalDateTime } from './format';

/**
 * Quem está usando o assistente. Vem SEMPRE da sessão (requireCurrentCompany), nunca do modelo:
 * nenhuma ferramenta aceita companyId ou userId como argumento.
 */
export type AssistantContext = {
  companyId: string;
  companyName: string;
  timezone: string;
  userId: string;
  isAdmin: boolean;
  /** Permissões de fichas da pessoa (para modelos e rascunhos). */
  formAccess?: FormAccess;
  /** Preferências de linguagem do negócio (dado delimitado no prompt; nunca regra). */
  languagePreferences?: string;
};

export type ToolOutcome = { response: Record<string, unknown>; proposal?: AssistantProposal };

export type AssistantTool = {
  declaration: GeminiFunctionDeclaration;
  /** Financeiro e relatórios seguem a mesma regra das telas: só admin. */
  adminOnly?: boolean;
  run: (ctx: AssistantContext, args: unknown) => Promise<ToolOutcome>;
};

const id = z.string().min(1).max(64);
const str = (description: string) => ({ type: 'string', description });

/** Declaração no formato do Gemini (subconjunto do OpenAPI). */
export function declare(
  name: string,
  description: string,
  properties: Record<string, unknown> = {},
  required: string[] = [],
): GeminiFunctionDeclaration {
  return {
    name,
    description,
    parameters: { type: 'object', properties, ...(required.length ? { required } : {}) },
  };
}

const ok = (response: Record<string, unknown>): ToolOutcome => ({ response });

// Observações são dados digitados por terceiros: vão cortadas e o prompt avisa que não são ordens.
const clip = (value: string | null | undefined, max = 300) =>
  value ? (value.length > max ? `${value.slice(0, max)}…` : value) : undefined;

// ---- Leitura ------------------------------------------------------------------------------------

const searchClients: AssistantTool = {
  declaration: declare(
    'buscar_clientes',
    'Procura clientes ativos pelo nome. Use para descobrir o id de um cliente.',
    { nome: str('Parte do nome do cliente.') },
    ['nome'],
  ),
  async run(ctx, args) {
    const { nome } = z.object({ nome: z.string().max(100) }).parse(args);
    const clients = await searchClientsByName(ctx.companyId, nome);
    return ok({
      clientes: clients.slice(0, 15).map((c) => ({
        id: c.id,
        nome: c.name,
        telefone: c.phone ?? undefined,
        vip: c.isVip || undefined,
      })),
    });
  },
};

const getClient: AssistantTool = {
  declaration: declare(
    'ficha_do_cliente',
    'Ficha de um cliente: contato, aniversário, observações, totais e últimos/próximos horários.',
    { clienteId: str('Id do cliente.') },
    ['clienteId'],
  ),
  async run(ctx, args) {
    const { clienteId } = z.object({ clienteId: id }).parse(args);
    const client = await getClientById(ctx.companyId, clienteId);
    if (!client) throw new UserError('Cliente não encontrado.');
    const [stats, appointments] = await Promise.all([
      getClientStats(ctx.companyId, client.id),
      prisma.appointment.findMany({
        where: { companyId: ctx.companyId, clientId: client.id },
        select: {
          id: true,
          startAt: true,
          status: true,
          serviceNameSnapshot: true,
          professional: { select: { name: true } },
        },
        orderBy: { startAt: 'desc' },
        take: 8,
      }),
    ]);
    return ok({
      cliente: {
        id: client.id,
        nome: client.name,
        telefone: client.phone ?? undefined,
        email: client.email ?? undefined,
        aniversario: client.birthDate?.toISOString().slice(0, 10),
        cidade: client.city ?? undefined,
        vip: client.isVip,
        ativo: client.active,
        observacoes: clip(client.notes),
      },
      totais: {
        gastoTotal: stats.totalSpent,
        atendimentosConcluidos: stats.appointmentCount,
        ticketMedio: stats.averageTicket,
        ultimaVisita: stats.lastVisitAt
          ? toLocalDateTime(stats.lastVisitAt, ctx.timezone)
          : undefined,
      },
      agendamentosRecentes: appointments.map((a) => ({
        id: a.id,
        inicio: toLocalDateTime(a.startAt, ctx.timezone),
        status: a.status,
        servico: a.serviceNameSnapshot,
        profissional: a.professional.name,
      })),
    });
  },
};

const listAgenda: AssistantTool = {
  declaration: declare(
    'agenda_do_periodo',
    'Agendamentos de um dia ou período (horário local da empresa), opcionalmente de um profissional.',
    {
      dataInicial: str('AAAA-MM-DD'),
      dataFinal: str('AAAA-MM-DD, inclusive. Omita para um dia só.'),
      profissionalId: str('Filtra por profissional (opcional).'),
    },
    ['dataInicial'],
  ),
  async run(ctx, args) {
    const parsed = z
      .object({
        dataInicial: z.string(),
        dataFinal: z.string().optional(),
        profissionalId: id.optional(),
      })
      .parse(args);
    const range = localDayRange(parsed.dataInicial, parsed.dataFinal, ctx.timezone);
    if (range.endAt.getTime() - range.startAt.getTime() > 32 * 86_400_000) {
      throw new UserError('Consulte no máximo 31 dias por vez.');
    }
    const appointments = await listAppointmentsInRange(ctx.companyId, range, {
      professionalId: parsed.profissionalId,
    });
    const LIMIT = 80;
    return ok({
      total: appointments.length,
      ...(appointments.length > LIMIT ? { aviso: `Mostrando só os ${LIMIT} primeiros.` } : {}),
      agendamentos: appointments.slice(0, LIMIT).map((a) => ({
        id: a.id,
        inicio: toLocalDateTime(a.startAt, ctx.timezone),
        fim: toLocalDateTime(a.endAt, ctx.timezone).slice(11),
        status: a.status,
        cliente: { id: a.client.id, nome: a.client.name },
        servico: a.serviceNameSnapshot,
        profissional: { id: a.professional.id, nome: a.professional.name },
        valor: Number(a.priceSnapshot),
      })),
    });
  },
};

const catalog: AssistantTool = {
  declaration: declare(
    'servicos_e_profissionais',
    'Lista os serviços (com duração e preço) e os profissionais ativos, com seus ids.',
  ),
  async run(ctx) {
    const [services, professionals] = await Promise.all([
      listActiveServices(ctx.companyId),
      listActiveProfessionals(ctx.companyId),
    ]);
    return ok({
      servicos: services.map((s) => ({
        id: s.id,
        nome: s.name,
        duracaoMinutos: s.durationMinutes,
        preco: Number(s.price),
      })),
      profissionais: professionals.map((p) => ({ id: p.id, nome: p.name })),
    });
  },
};

const freeSlots: AssistantTool = {
  declaration: declare(
    'proximos_horarios_livres',
    'Próximos horários livres para um serviço (até 3), respeitando expediente, bloqueios e a agenda.',
    {
      servicoId: str('Id do serviço.'),
      profissionalId: str('Id do profissional (opcional; sem ele, procura em todos).'),
      aPartirDe: str('AAAA-MM-DDTHH:mm no horário local (opcional; padrão: agora).'),
    },
    ['servicoId'],
  ),
  async run(ctx, args) {
    const parsed = z
      .object({ servicoId: id, profissionalId: id.optional(), aPartirDe: z.string().optional() })
      .parse(args);
    let from = parsed.aPartirDe ? parseLocalDateTime(parsed.aPartirDe, ctx.timezone) : new Date();
    if (from.getTime() < Date.now()) from = new Date();

    const professionals = new Map(
      (await listActiveProfessionals(ctx.companyId)).map((p) => [p.id, p.name]),
    );
    const slots: { inicio: string; profissional: { id: string; nome: string } }[] = [];
    for (let i = 0; i < 3; i++) {
      const slot = await findNextAvailableSlot({
        companyId: ctx.companyId,
        timezone: ctx.timezone,
        serviceId: parsed.servicoId,
        professionalId: parsed.profissionalId,
        from,
      });
      if (!slot) break;
      slots.push({
        inicio: toLocalDateTime(slot.startAt, ctx.timezone),
        profissional: {
          id: slot.professionalId,
          nome: professionals.get(slot.professionalId) ?? '',
        },
      });
      from = new Date(slot.startAt.getTime() + 15 * 60_000);
    }
    return ok(
      slots.length
        ? { horarios: slots }
        : { horarios: [], aviso: 'Nada livre nos próximos 14 dias.' },
    );
  },
};

const lapsedClients: AssistantTool = {
  declaration: declare(
    'clientes_sumidos',
    'Clientes que não voltam há X dias (última visita concluída) e não têm nada marcado.',
    { dias: { type: 'integer', description: 'Dias sem voltar (padrão 60).' } },
  ),
  async run(ctx, args) {
    const { dias } = z
      .object({ dias: z.number().int().min(1).max(3650).optional() })
      .parse(args ?? {});
    const clients = await listLapsedClients(ctx.companyId, dias ?? 60, 30);
    return ok({
      clientes: clients.map((c) => ({
        id: c.id,
        nome: c.name,
        telefone: c.phone ?? undefined,
        ultimaVisita: toLocalDateTime(c.lastVisitAt, ctx.timezone).slice(0, 10),
      })),
    });
  },
};

const lowStock: AssistantTool = {
  declaration: declare(
    'estoque_baixo',
    'Produtos ativos com quantidade no estoque mínimo ou abaixo dele.',
  ),
  async run(ctx) {
    const products = await listLowStockProducts(ctx.companyId, 30);
    return ok({
      produtos: products.map((p) => ({
        nome: p.name,
        quantidade: p.quantity,
        minimo: p.minQuantity,
      })),
    });
  },
};

const periodArgs = {
  dataInicial: str('AAAA-MM-DD'),
  dataFinal: str('AAAA-MM-DD, inclusive.'),
};
const periodSchema = z.object({ dataInicial: z.string(), dataFinal: z.string() });

const financeSummary: AssistantTool = {
  adminOnly: true,
  declaration: declare(
    'resumo_financeiro',
    'Caixa do período: entradas e saídas pagas, saldo, a receber e a pagar.',
    periodArgs,
    ['dataInicial', 'dataFinal'],
  ),
  async run(ctx, args) {
    const parsed = periodSchema.parse(args);
    const range = localDayRange(parsed.dataInicial, parsed.dataFinal, ctx.timezone);
    const s = await getCashFlowSummary(ctx.companyId, range);
    return ok({
      entradas: s.income,
      saidas: s.expense,
      saldo: s.balance,
      aReceber: s.pendingReceivables,
      aPagar: s.pendingPayables,
    });
  },
};

const report: AssistantTool = {
  adminOnly: true,
  declaration: declare(
    'relatorio',
    'Relatório do período: faturamento por profissional e por serviço, cancelamentos e faltas.',
    periodArgs,
    ['dataInicial', 'dataFinal'],
  ),
  async run(ctx, args) {
    const parsed = periodSchema.parse(args);
    const range = localDayRange(parsed.dataInicial, parsed.dataFinal, ctx.timezone);
    // Os relatórios comparam com `lte`: um milissegundo antes da meia-noite do dia seguinte.
    const inclusive = { startAt: range.startAt, endAt: new Date(range.endAt.getTime() - 1) };
    const [byProfessional, byService, cancellations] = await Promise.all([
      getRevenueByProfessional(ctx.companyId, inclusive),
      getRevenueByService(ctx.companyId, inclusive),
      getCancellationStats(ctx.companyId, inclusive),
    ]);
    return ok({
      porProfissional: byProfessional.map((p) => ({
        nome: p.name,
        faturamento: p.revenue,
        atendimentos: p.count,
        ticketMedio: p.averageTicket,
        comissao: p.commission ?? undefined,
      })),
      porServico: byService.slice(0, 15).map((s) => ({
        nome: s.name,
        faturamento: s.revenue,
        atendimentos: s.count,
      })),
      cancelamentos: {
        total: cancellations.total,
        concluidos: cancellations.completed,
        cancelados: cancellations.canceled,
        faltas: cancellations.noShow,
        taxaCancelamento: Math.round(cancellations.cancellationRate * 10) / 10,
        taxaFalta: Math.round(cancellations.noShowRate * 10) / 10,
      },
    });
  },
};

export const READ_TOOLS: AssistantTool[] = [
  searchClients,
  getClient,
  listAgenda,
  catalog,
  freeSlots,
  lapsedClients,
  lowStock,
  financeSummary,
  report,
];

// ---- Despacho -----------------------------------------------------------------------------------

const EXPECTED = [UserError, AppointmentNotFoundError, ForeignEntityMismatchError];

export function createToolbox(tools: AssistantTool[]) {
  const byName = new Map(tools.map((t) => [t.declaration.name, t]));
  return {
    declarations: tools.map((t) => t.declaration),
    /**
     * Executa uma chamada do modelo. Erros esperados viram resposta para o modelo corrigir o
     * pedido; nada daqui derruba a conversa.
     */
    async dispatch(ctx: AssistantContext, name: string, args: unknown): Promise<ToolOutcome> {
      const tool = byName.get(name);
      if (!tool) return ok({ erro: `Ferramenta desconhecida: ${name}.` });
      if (tool.adminOnly && !ctx.isAdmin) {
        return ok({ erro: 'Somente administradores da empresa podem ver isso.' });
      }
      try {
        return await tool.run(ctx, args ?? {});
      } catch (error) {
        if (error instanceof ZodError) {
          return ok({ erro: `Argumentos inválidos: ${error.issues[0]?.message ?? ''}` });
        }
        if (EXPECTED.some((Expected) => error instanceof Expected)) {
          return ok({ erro: (error as Error).message });
        }
        console.error('[assistant] falha na ferramenta', name, error);
        return ok({ erro: 'Falha interna ao consultar os dados.' });
      }
    },
  };
}
