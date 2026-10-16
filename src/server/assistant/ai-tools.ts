import { z } from 'zod';

import { prisma } from '@/lib/db';
import { UserError } from '@/server/errors';
import {
  QUESTION_TYPES,
  allQuestions,
  newId,
  optionsOf,
  type FormSchema,
  type Question,
} from '@/lib/forms/schema';
import { declare, type AssistantTool } from './tools';
import { propose } from './write-tools';

/*
  Ferramentas do plano com IA: estoque, modelos de ficha e rascunhos de ficha. As de escrita só
  PROPÕEM (a pessoa confirma). Nada aqui inventa dado: o que não foi dito pela pessoa fica fora.
*/

const id = z.string().min(1).max(64);
const str = (description: string) => ({ type: 'string', description });

const searchProducts: AssistantTool = {
  declaration: declare(
    'buscar_produtos',
    'Procura produtos ativos do estoque pelo nome. Use antes de propor uma entrada no estoque.',
    { nome: str('Parte do nome do produto.') },
    ['nome'],
  ),
  async run(ctx, args) {
    const { nome } = z.object({ nome: z.string().min(1).max(100) }).parse(args);
    const products = await prisma.product.findMany({
      where: {
        companyId: ctx.companyId,
        active: true,
        name: { contains: nome.trim(), mode: 'insensitive' },
      },
      select: { id: true, name: true, quantity: true, costPrice: true },
      orderBy: { name: 'asc' },
      take: 15,
    });
    return {
      response: {
        produtos: products.map((p) => ({
          id: p.id,
          nome: p.name,
          quantidade: p.quantity,
          custoMedio: Number(p.costPrice),
        })),
        ...(products.length > 1
          ? { aviso: 'Mais de um produto encontrado: pergunte à pessoa qual é antes de propor.' }
          : products.length === 0
            ? {
                aviso:
                  'Nenhum produto com esse nome. Não invente: diga que precisa cadastrar o produto em Estoque.',
              }
            : {}),
      },
    };
  },
};

const stockEntry: AssistantTool = {
  declaration: declare(
    'preparar_entrada_estoque',
    'Propõe uma entrada no estoque (a pessoa confirma). Use o id de buscar_produtos. Informe o custo SÓ se a pessoa disse o valor: total da compra (valorTotal) ou por unidade (valorUnitario). Por padrão o pagamento NÃO é lançado; só lance se a pessoa disser como pagou.',
    {
      produtoId: str('Id do produto.'),
      quantidade: { type: 'integer', description: 'Quantidade que entrou.' },
      valorTotal: {
        type: 'number',
        description: 'Valor total pago pela quantidade, em reais (opcional).',
      },
      valorUnitario: { type: 'number', description: 'Valor por unidade, em reais (opcional).' },
      pagamento: {
        type: 'string',
        description:
          'nao_lancar (padrão), pago_pix, pago_dinheiro, pago_credito, pago_debito, pago_transferencia ou a_pagar.',
      },
      vencimento: str('AAAA-MM-DD, só para a_pagar.'),
      fornecedor: str('Fornecedor (opcional).'),
    },
    ['produtoId', 'quantidade'],
  ),
  async run(ctx, args) {
    const parsed = z
      .object({
        produtoId: id,
        quantidade: z.number().int().min(1).max(100_000),
        valorTotal: z.number().min(0).max(10_000_000).optional(),
        valorUnitario: z.number().min(0).max(1_000_000).optional(),
        pagamento: z
          .enum([
            'nao_lancar',
            'pago_pix',
            'pago_dinheiro',
            'pago_credito',
            'pago_debito',
            'pago_transferencia',
            'a_pagar',
          ])
          .optional(),
        vencimento: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional(),
        fornecedor: z.string().max(120).optional(),
      })
      .parse(args);
    if (parsed.valorTotal !== undefined && parsed.valorUnitario !== undefined) {
      const expected = Math.round(parsed.valorUnitario * parsed.quantidade * 100);
      if (Math.abs(expected - Math.round(parsed.valorTotal * 100)) > 1) {
        throw new UserError('Valor total e valor por unidade não batem. Pergunte qual está certo.');
      }
    }
    const unitCostCents =
      parsed.valorUnitario !== undefined
        ? Math.round(parsed.valorUnitario * 100)
        : parsed.valorTotal !== undefined
          ? Math.round((parsed.valorTotal * 100) / parsed.quantidade)
          : undefined;
    const methods = {
      pago_pix: 'PIX',
      pago_dinheiro: 'CASH',
      pago_credito: 'CREDIT_CARD',
      pago_debito: 'DEBIT_CARD',
      pago_transferencia: 'BANK_TRANSFER',
    } as const;
    const pagamento = parsed.pagamento ?? 'nao_lancar';
    if (pagamento === 'a_pagar' && !parsed.vencimento)
      throw new UserError('Para conta a pagar, informe o vencimento.');
    return propose(ctx, {
      kind: 'stock_entry',
      args: {
        productId: parsed.produtoId,
        quantity: parsed.quantidade,
        unitCostCents,
        supplier: parsed.fornecedor,
        payment:
          pagamento === 'nao_lancar'
            ? { kind: 'not_recorded' }
            : pagamento === 'a_pagar'
              ? { kind: 'payable', dueDate: parsed.vencimento! }
              : { kind: 'paid', method: methods[pagamento] },
      },
    });
  },
};

const listFormTemplates: AssistantTool = {
  declaration: declare(
    'modelos_de_ficha',
    'Modelos de ficha ativos com as perguntas (ids, tipos e opções). Use antes de preparar um rascunho de ficha. Não traz respostas de clientes.',
  ),
  async run(ctx) {
    const templates = await prisma.formTemplate.findMany({
      where: { companyId: ctx.companyId, status: 'ACTIVE' },
      include: { versions: { orderBy: { version: 'desc' }, take: 1 } },
      orderBy: { name: 'asc' },
      take: 20,
    });
    return {
      response: {
        modelos: templates.map((t) => ({
          id: t.id,
          nome: t.name,
          perguntas: allQuestions(
            (t.versions[0]?.schema ?? { sections: [] }) as unknown as FormSchema,
          ).map((q: Question) => ({
            id: q.id,
            pergunta: q.title,
            tipo: q.type,
            opcoes:
              q.type === 'yes_no' || q.options
                ? optionsOf(q).map((o) => ({ id: o.id, texto: o.label }))
                : undefined,
          })),
        })),
      },
    };
  },
};

const templateQuestion = z.object({
  titulo: z.string().trim().min(1).max(300),
  tipo: z.enum(QUESTION_TYPES),
  obrigatoria: z.boolean().optional(),
  ajuda: z.string().max(500).optional(),
  opcoes: z.array(z.string().trim().min(1).max(200)).max(30).optional(),
});

const createTemplate: AssistantTool = {
  declaration: declare(
    'preparar_modelo_ficha',
    'Propõe criar um MODELO de ficha/formulário (estrutura de perguntas, sem respostas). A pessoa confirma e depois revisa no editor. Não crie perguntas de diagnóstico nem classificações de risco.',
    {
      nome: str('Nome do modelo.'),
      tipo: str('ANAMNESIS, ASSESSMENT, SERVICE_RECORD ou CUSTOM.'),
      descricao: str('Descrição curta (opcional).'),
      secoes: {
        type: 'array',
        description: 'Seções em ordem.',
        items: {
          type: 'object',
          properties: {
            titulo: str('Título da seção.'),
            soEquipe: {
              type: 'boolean',
              description: 'Seção interna (não aparece para o cliente).',
            },
            perguntas: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  titulo: str('Pergunta.'),
                  tipo: str(`Um de: ${QUESTION_TYPES.join(', ')}.`),
                  obrigatoria: { type: 'boolean' },
                  ajuda: str('Texto de ajuda (opcional).'),
                  opcoes: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Para escolha única/múltipla.',
                  },
                },
                required: ['titulo', 'tipo'],
              },
            },
          },
          required: ['titulo', 'perguntas'],
        },
      },
    },
    ['nome', 'tipo', 'secoes'],
  ),
  async run(ctx, args) {
    const parsed = z
      .object({
        nome: z.string().trim().min(1).max(120),
        tipo: z.enum(['ANAMNESIS', 'ASSESSMENT', 'SERVICE_RECORD', 'CUSTOM']),
        descricao: z.string().max(1000).optional(),
        secoes: z
          .array(
            z.object({
              titulo: z.string().trim().min(1).max(200),
              soEquipe: z.boolean().optional(),
              perguntas: z.array(templateQuestion).min(1).max(60),
            }),
          )
          .min(1)
          .max(20),
      })
      .parse(args);
    // Ids estáveis gerados aqui (o modelo de IA nunca escolhe ids).
    const schema: FormSchema = {
      sections: parsed.secoes.map((sec) => ({
        id: newId('s'),
        title: sec.titulo,
        audience: sec.soEquipe ? 'staff' : 'any',
        questions: sec.perguntas.map((q) => ({
          id: newId('q'),
          type: q.tipo,
          title: q.titulo,
          help: q.ajuda,
          required: q.obrigatoria ?? false,
          options:
            q.tipo === 'single_choice' || q.tipo === 'multi_choice'
              ? (q.opcoes ?? []).map((label) => ({ id: newId('o'), label }))
              : undefined,
        })),
      })),
    };
    return propose(ctx, {
      kind: 'create_form_template',
      args: { name: parsed.nome, type: parsed.tipo, description: parsed.descricao, schema },
    });
  },
};

const fillDraft: AssistantTool = {
  declaration: declare(
    'preparar_rascunho_ficha',
    'Propõe preencher um RASCUNHO de ficha de um cliente só com o que a pessoa disse explicitamente (a pessoa confirma). Nunca deduza respostas: se não foi dito, deixe sem resposta. Não envia, não revisa e não assina.',
    {
      clienteId: str('Id do cliente (confirme qual se houver nomes parecidos).'),
      modeloId: str('Id do modelo (use modelos_de_ficha).'),
      respostas: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            perguntaId: str('Id da pergunta.'),
            valor: str(
              'Texto, número, AAAA-MM-DD ou id da opção. Para múltipla escolha, ids separados por vírgula.',
            ),
          },
          required: ['perguntaId', 'valor'],
        },
      },
    },
    ['clienteId', 'modeloId', 'respostas'],
  ),
  async run(ctx, args) {
    const parsed = z
      .object({
        clienteId: id,
        modeloId: id,
        respostas: z
          .array(z.object({ perguntaId: z.string().max(60), valor: z.string().max(5000) }))
          .min(1)
          .max(100),
      })
      .parse(args);
    const template = await prisma.formTemplate.findFirst({
      where: { id: parsed.modeloId, companyId: ctx.companyId, status: 'ACTIVE' },
      include: { versions: { orderBy: { version: 'desc' }, take: 1 } },
    });
    if (!template?.versions[0]) throw new UserError('Modelo de ficha não encontrado.');
    const byId = new Map(
      allQuestions(template.versions[0].schema as unknown as FormSchema).map((q) => [q.id, q]),
    );
    const answers: Record<string, unknown> = {};
    for (const { perguntaId, valor } of parsed.respostas) {
      const question = byId.get(perguntaId);
      if (!question) continue;
      answers[perguntaId] =
        question.type === 'multi_choice'
          ? valor
              .split(',')
              .map((v) => v.trim())
              .filter(Boolean)
          : question.type === 'number'
            ? Number(valor.replace(',', '.'))
            : valor;
    }
    return propose(ctx, {
      kind: 'fill_form_draft',
      args: { clientId: parsed.clienteId, templateId: template.id, answers },
    });
  },
};

export const AI_READ_TOOLS: AssistantTool[] = [searchProducts, listFormTemplates];
export const AI_WRITE_TOOLS: AssistantTool[] = [stockEntry, createTemplate, fillDraft];
