import { z } from 'zod';

import { prisma } from '@/lib/db';
import { QUOTE_STATUS_LABEL } from '@/lib/quotes';
import { preferencesLabel } from '@/lib/waitlist';
import { UserError } from '@/server/errors';
import { companyHasFeature } from '@/server/billing/features';
import { listWaitingEntries } from '@/server/data/waitlist';
import { computeDailySummary, summaryForViewer } from '@/server/automations/daily-summary';
import { declare, type AssistantTool } from './tools';
import { propose } from './write-tools';

/*
  Ferramentas de acompanhamento: orçamentos, tarefas e lista de espera. As de escrita só PROPÕEM
  (a pessoa confirma num cartão; o orçamento nasce como rascunho e nada é enviado ao cliente).
*/

const id = z.string().min(1).max(64);
const str = (description: string) => ({ type: 'string', description });
const localDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const clientQuotes: AssistantTool = {
  declaration: declare(
    'orcamentos_do_cliente',
    'Lista os orçamentos de um cliente (situação, total, validade). Use o id de buscar_clientes.',
    { clienteId: str('Id do cliente.') },
    ['clienteId'],
  ),
  async run(ctx, args) {
    const { clienteId } = z.object({ clienteId: id }).parse(args);
    if (!(await companyHasFeature(ctx.companyId, 'quotes'))) {
      return { response: { aviso: 'Orçamentos não estão no plano desta empresa.' } };
    }
    const quotes = await prisma.quote.findMany({
      where: { companyId: ctx.companyId, clientId: clienteId },
      select: { number: true, title: true, status: true, currentVersion: true, id: true },
      orderBy: { number: 'desc' },
      take: 10,
    });
    const versions = await prisma.quoteVersion.findMany({
      where: { OR: quotes.map((q) => ({ quoteId: q.id, version: q.currentVersion })) },
      select: { quoteId: true, total: true, validUntil: true },
    });
    const byQuote = new Map(versions.map((v) => [v.quoteId, v]));
    return {
      response: {
        orcamentos: quotes.map((q) => ({
          numero: q.number,
          nome: q.title,
          situacao: QUOTE_STATUS_LABEL[q.status],
          total: Number(byQuote.get(q.id)?.total ?? 0),
          validade: byQuote.get(q.id)?.validUntil?.toISOString().slice(0, 10) ?? null,
        })),
      },
    };
  },
};

const prepareQuote: AssistantTool = {
  declaration: declare(
    'preparar_orcamento',
    'Propõe um orçamento em RASCUNHO para um cliente (a pessoa confirma; nada é enviado ao cliente). ' +
      'Para pacote de sessões, use UM item de serviço com "sessoes" = número de sessões, quantidade 1 e valorUnitario = valor TOTAL do pacote. ' +
      'Ex.: "oito sessões por R$ 960" → sessoes 8, quantidade 1, valorUnitario 960. ' +
      'Se não estiver claro se o valor é por sessão ou o total, PERGUNTE. Use ids de buscar_clientes e servicos_e_profissionais.',
    {
      clienteId: str('Id do cliente.'),
      titulo: str('Nome do orçamento (ex.: "Tratamento facial — 8 sessões").'),
      servicoId: str('Id do serviço (para orçamento de um serviço/pacote).'),
      descricao: str('Descrição que o cliente vê (opcional; padrão: nome do serviço).'),
      sessoes: { type: 'integer', description: 'Número de sessões (1 = avulso).' },
      quantidade: { type: 'integer', description: 'Quantidade (padrão 1).' },
      valorUnitario: {
        type: 'number',
        description: 'Valor em reais por unidade (veja a regra acima).',
      },
      desconto: {
        type: 'number',
        description: 'Desconto em reais (opcional, só se a pessoa disse).',
      },
      condicoes: str('Condições de pagamento (opcional, só se a pessoa disse).'),
      validade: str('AAAA-MM-DD (opcional).'),
    },
    ['clienteId', 'titulo', 'servicoId', 'valorUnitario'],
  ),
  async run(ctx, args) {
    const parsed = z
      .object({
        clienteId: id,
        titulo: z.string().trim().min(1).max(120),
        servicoId: id,
        descricao: z.string().trim().max(200).optional(),
        sessoes: z.number().int().min(1).max(200).optional(),
        quantidade: z.number().int().min(1).max(100).optional(),
        valorUnitario: z.number().min(0).max(1_000_000),
        desconto: z.number().min(0).max(1_000_000).optional(),
        condicoes: z.string().max(500).optional(),
        validade: localDate.optional(),
      })
      .parse(args);
    const service = await prisma.service.findFirst({
      where: { id: parsed.servicoId, companyId: ctx.companyId },
      select: { name: true },
    });
    if (!service) throw new UserError('Serviço não encontrado.');
    return propose(ctx, {
      kind: 'create_quote',
      args: {
        clientId: parsed.clienteId,
        title: parsed.titulo,
        items: [
          {
            kind: 'service',
            refId: parsed.servicoId,
            description: parsed.descricao || service.name,
            quantity: parsed.quantidade ?? 1,
            sessions: parsed.sessoes ?? 1,
            unitPrice: parsed.valorUnitario,
            discount: parsed.desconto ?? 0,
          },
        ],
        discount: 0,
        paymentTerms: parsed.condicoes ?? null,
        notes: null,
        validUntil: parsed.validade ?? null,
      },
    });
  },
};

const createTaskTool: AssistantTool = {
  declaration: declare(
    'criar_tarefa',
    'Propõe uma tarefa de acompanhamento para a equipe (ex.: retornar um orçamento, ligar para um cliente). A pessoa confirma.',
    {
      titulo: str('O que fazer, curto.'),
      prazo: str('AAAA-MM-DD (opcional).'),
      clienteId: str('Id do cliente relacionado (opcional).'),
      detalhes: str('Detalhes (opcional).'),
    },
    ['titulo'],
  ),
  async run(ctx, args) {
    const parsed = z
      .object({
        titulo: z.string().trim().min(1).max(160),
        prazo: localDate.optional(),
        clienteId: id.optional(),
        detalhes: z.string().max(1000).optional(),
      })
      .parse(args);
    return propose(ctx, {
      kind: 'create_task',
      args: {
        title: parsed.titulo,
        dueDate: parsed.prazo,
        clientId: parsed.clienteId,
        details: parsed.detalhes,
      },
    });
  },
};

const waitlistTool: AssistantTool = {
  declaration: declare(
    'lista_de_espera',
    'Quem está na lista de espera agora (serviço, preferências e se já tem convite pendente).',
  ),
  async run(ctx) {
    const entries = await listWaitingEntries(ctx.companyId, ctx.timezone);
    return {
      response: {
        esperando: entries.slice(0, 30).map((e) => ({
          cliente: e.client.name,
          servico: e.service.name,
          preferencias: preferencesLabel(e, ctx.timezone),
          convitePendente: e.offers.length > 0,
        })),
        total: entries.length,
      },
    };
  },
};

const dailySummaryTool: AssistantTool = {
  declaration: declare(
    'resumo_do_dia',
    'Resumo de hoje já calculado pelo sistema (atendimentos, fichas pendentes, pacotes terminando, orçamentos, estoque, tarefas). Use para explicar o dia e sugerir prioridades; não invente itens que não estejam aqui.',
  ),
  async run(ctx) {
    if (!(await companyHasFeature(ctx.companyId, 'dailySummary'))) {
      return { response: { aviso: 'O resumo do dia não está no plano desta empresa.' } };
    }
    const content = summaryForViewer(
      await computeDailySummary(ctx.companyId, ctx.timezone),
      ctx.isAdmin,
    );
    return {
      response: {
        data: content.date,
        secoes: content.sections
          .filter((s) => s.count > 0)
          .map((s) => ({
            titulo: s.title,
            total: s.count,
            itens: s.items.map((i) => (i.detail ? `${i.label} — ${i.detail}` : i.label)),
          })),
      },
    };
  },
};

export const OPS_READ_TOOLS: AssistantTool[] = [clientQuotes, waitlistTool, dailySummaryTool];
export const OPS_WRITE_TOOLS: AssistantTool[] = [prepareQuote, createTaskTool];
