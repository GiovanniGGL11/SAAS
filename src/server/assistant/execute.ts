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
import { adjustStock } from '@/server/data/stock';
import { createPurchase } from '@/server/data/purchases';
import { requestEntry, saveEntryDraft, saveTemplate } from '@/server/data/forms';
import { requireAccess } from '@/server/data/form-permissions';
import {
  FORM_TYPE_LABEL,
  allQuestions,
  answerText,
  parseFormSchema,
  validateAnswers,
  type FormSchema,
} from '@/lib/forms/schema';
import { formatBRL, toHumanDateTime } from './format';
import { quoteTotals, discountPercent } from '@/lib/quotes';
import { createQuote } from '@/server/data/quotes';
import { createTask } from '@/server/data/tasks';
import { assertQuoteDiscountAllowed } from '@/server/data/business-preferences';
import { companyHasFeature } from '@/server/billing/features';
import { calendarDateToUtc } from '@/lib/time';

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
  kind: 'cliente' | 'profissional' | 'serviço' | 'produto',
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
    case 'stock_entry': {
      const { args } = action;
      const product = await findActive(
        'produto',
        prisma.product.findFirst({
          where: { id: args.productId, companyId: ctx.companyId, active: true },
        }),
      );
      const payment = args.payment ?? { kind: 'not_recorded' as const };
      if (payment.kind !== 'not_recorded') {
        // Lançar no financeiro segue a regra das telas: só administrador.
        if (!ctx.isAdmin) {
          throw new UserError(
            'Lançar pagamento no financeiro é só para administradores. Posso registrar só a entrada.',
          );
        }
        if (args.unitCostCents === undefined)
          throw new UserError('Para lançar o pagamento, informe o valor da compra.');
      }
      const unit = args.unitCostCents === undefined ? null : args.unitCostCents / 100;
      return {
        title: `Entrada no estoque: ${product.name}`,
        details: [
          ...detail('Produto', product.name),
          ...detail(
            'Quantidade',
            `${args.quantity} (estoque ${product.quantity} → ${product.quantity + args.quantity})`,
          ),
          ...detail(
            'Custo unitário',
            unit === null ? 'Não informado (custo médio não muda)' : formatBRL(unit),
          ),
          ...detail('Total', unit === null ? '' : formatBRL(unit * args.quantity)),
          ...detail('Fornecedor', args.supplier),
          ...detail(
            'Pagamento',
            payment.kind === 'not_recorded'
              ? 'Não lançado no financeiro'
              : payment.kind === 'paid'
                ? `Lançar como pago (${payment.method})`
                : `Lançar conta a pagar em ${brDate(payment.dueDate)}`,
          ),
        ],
      };
    }
    case 'create_form_template': {
      const access = ctx.formAccess;
      if (!access) throw new UserError('Permissões de fichas indisponíveis.');
      requireAccess(access, 'canManage', 'criar modelos de ficha');
      const schema = parseFormSchema(action.args.schema);
      const questions = allQuestions(schema);
      return {
        title: `Novo modelo de ficha: ${action.args.name}`,
        details: [
          ...detail('Tipo', FORM_TYPE_LABEL[action.args.type]),
          ...detail('Seções', schema.sections.map((sec) => sec.title).join(' · ')),
          ...detail(
            'Perguntas',
            `${questions.length}: ${questions
              .slice(0, 8)
              .map((q) => q.title + (q.required ? '*' : ''))
              .join('; ')}${questions.length > 8 ? '…' : ''}`,
          ),
          ...detail(
            'Depois',
            'Fica sem serviço vinculado e sem exigência; revise no editor antes de usar.',
          ),
        ],
      };
    }
    case 'create_quote': {
      if (!(await companyHasFeature(ctx.companyId, 'quotes'))) {
        throw new UserError('Orçamentos não estão incluídos no plano desta empresa.');
      }
      const client = await findActive(
        'cliente',
        prisma.client.findFirst({ where: { id: action.args.clientId, companyId: ctx.companyId } }),
      );
      const serviceIds = action.args.items.filter((i) => i.kind === 'service').map((i) => i.refId!);
      if (serviceIds.some((sid) => !sid)) throw new UserError('Escolha o serviço de cada item.');
      if (serviceIds.length) {
        const found = await prisma.service.count({
          where: { companyId: ctx.companyId, id: { in: [...new Set(serviceIds)] } },
        });
        if (found !== new Set(serviceIds).size) throw new UserError('Serviço não encontrado.');
      }
      await assertQuoteDiscountAllowed(ctx.companyId, action.args);
      const totals = quoteTotals(action.args);
      const percent = discountPercent(action.args);
      return {
        title: 'Preparar orçamento (rascunho)',
        details: [
          { label: 'Cliente', value: client.name },
          { label: 'Nome', value: action.args.title },
          ...action.args.items.map((i, n) => ({
            label: `Item ${n + 1}`,
            value: `${i.description} — ${i.quantity} × ${formatBRL(i.unitPrice)}${
              (i.sessions ?? 1) > 1 ? ` (${i.sessions} sessões)` : ''
            }${i.discount ? `, desconto ${formatBRL(i.discount)}` : ''}`,
          })),
          ...(totals.discount
            ? [{ label: 'Desconto geral', value: formatBRL(totals.discount) }]
            : []),
          { label: 'Total', value: formatBRL(totals.total) },
          ...(percent > 0 ? [{ label: 'Desconto sobre o valor cheio', value: `${percent}%` }] : []),
          ...detail('Pagamento', action.args.paymentTerms ?? undefined),
          ...detail(
            'Válido até',
            action.args.validUntil ? brDate(action.args.validUntil) : undefined,
          ),
          {
            label: 'Depois de confirmar',
            value: 'Fica como rascunho. Nada é enviado ao cliente nem lançado no financeiro.',
          },
        ],
      };
    }
    case 'create_task': {
      const client = action.args.clientId
        ? await findActive(
            'cliente',
            prisma.client.findFirst({
              where: { id: action.args.clientId, companyId: ctx.companyId },
            }),
          )
        : null;
      return {
        title: 'Criar tarefa',
        details: [
          { label: 'Tarefa', value: action.args.title },
          ...detail('Cliente', client?.name),
          ...detail('Prazo', action.args.dueDate ? brDate(action.args.dueDate) : undefined),
          ...detail('Detalhes', action.args.details),
        ],
      };
    }
    case 'fill_form_draft': {
      const access = ctx.formAccess;
      if (!access) throw new UserError('Permissões de fichas indisponíveis.');
      requireAccess(access, 'canFill', 'preencher fichas');
      requireAccess(access, 'canRequest', 'pedir fichas');
      const [client, template] = await Promise.all([
        findActive(
          'cliente',
          prisma.client.findFirst({
            where: { id: action.args.clientId, companyId: ctx.companyId },
          }),
        ),
        prisma.formTemplate.findFirst({
          where: { id: action.args.templateId, companyId: ctx.companyId, status: 'ACTIVE' },
          include: { versions: { orderBy: { version: 'desc' }, take: 1 } },
        }),
      ]);
      if (!template?.versions[0])
        throw new UserError('Modelo de ficha não encontrado ou arquivado.');
      const schema = template.versions[0].schema as unknown as FormSchema;
      const { answers, errors } = validateAnswers(schema, action.args.answers, {
        mode: 'draft',
        audience: 'staff',
      });
      const firstError = Object.entries(errors)[0];
      if (firstError) throw new UserError(`Resposta inválida em uma pergunta: ${firstError[1]}`);
      if (Object.keys(answers).length === 0)
        throw new UserError('Nenhuma resposta informada para preencher.');
      const byId = new Map(allQuestions(schema).map((q) => [q.id, q]));
      return {
        title: `Rascunho da ficha "${template.name}" — ${client.name}`,
        details: [
          ...Object.entries(answers).map(([id, value]) => ({
            label: byId.get(id)!.title.slice(0, 60),
            value: answerText(byId.get(id)!, value),
          })),
          ...detail(
            'Depois',
            'Fica como rascunho para conferir. Nada é enviado, revisado nem assinado.',
          ),
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
  /** Onde ver o resultado (opcional). */
  link?: string;
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
    case 'stock_entry': {
      const { args } = action;
      const payment = args.payment ?? { kind: 'not_recorded' as const };
      if (args.unitCostCents === undefined) {
        await adjustStock(
          ctx.companyId,
          {
            productId: args.productId,
            type: 'IN',
            quantity: args.quantity,
            reason: 'Entrada pelo assistente',
          },
          ctx.userId,
        );
      } else {
        await createPurchase({
          companyId: ctx.companyId,
          supplier: args.supplier ?? null,
          items: [
            {
              productId: args.productId,
              quantity: args.quantity,
              unitCost: args.unitCostCents / 100,
            },
          ],
          payment:
            payment.kind === 'paid'
              ? { method: payment.method }
              : payment.kind === 'payable'
                ? { dueDate: new Date(`${payment.dueDate}T12:00:00`) }
                : { notRecorded: true },
          userId: ctx.userId,
        });
      }
      const product = await prisma.product.findFirst({
        where: { id: args.productId, companyId: ctx.companyId },
        select: { name: true, quantity: true },
      });
      return {
        message: `Entrada registrada: ${args.quantity} × ${product?.name ?? 'produto'}. Estoque agora: ${product?.quantity ?? '—'}.`,
        appointmentIds: [],
        paths: ['/estoque', ...(payment.kind === 'not_recorded' ? [] : ['/financeiro'])],
      };
    }
    case 'create_form_template': {
      const template = await saveTemplate(
        ctx.companyId,
        null,
        {
          name: action.args.name,
          type: action.args.type,
          description: action.args.description ?? null,
          instructions: null,
          fillableBy: 'BOTH',
          renewal: 'ONCE',
          requirement: 'NONE',
          schema: action.args.schema,
          serviceIds: [],
        },
        ctx.userId,
      );
      return {
        message: `Modelo "${action.args.name}" criado. Revise em Fichas antes de usar.`,
        appointmentIds: [],
        paths: ['/fichas'],
        link: `/fichas/modelos/${template.id}`,
      };
    }
    case 'create_quote': {
      const quote = await createQuote({
        companyId: ctx.companyId,
        timezone: ctx.timezone,
        userId: ctx.userId,
        input: action.args,
        origin: 'ai',
      });
      return {
        message: `Orçamento #${quote.number} salvo como rascunho. Confira e envie pela tela de orçamentos — nada foi enviado ao cliente.`,
        appointmentIds: [],
        paths: ['/clientes/orcamentos'],
        link: `/clientes/orcamentos?id=${quote.id}`,
      };
    }
    case 'create_task': {
      const [y, m, d] = (action.args.dueDate ?? '').split('-').map(Number);
      const { task } = await createTask(ctx.companyId, ctx.userId, {
        title: action.args.title,
        details: action.args.details,
        dueAt: action.args.dueDate
          ? calendarDateToUtc({ year: y, month: m, day: d }, 12 * 60, ctx.timezone)
          : null,
        clientId: action.args.clientId ?? null,
        origin: 'ai',
      });
      return {
        message: `Tarefa "${task.title}" criada.`,
        appointmentIds: [],
        paths: ['/dashboard'],
        link: '/dashboard',
      };
    }
    case 'fill_form_draft': {
      const access = ctx.formAccess!;
      const { entry } = await requestEntry(
        {
          companyId: ctx.companyId,
          userId: ctx.userId,
          clientId: action.args.clientId,
          templateId: action.args.templateId,
          source: 'manual',
        },
        access,
      );
      // Complementa o rascunho em aberto: o que já estava preenchido continua, o informado entra.
      const current = await prisma.formEntry.findFirst({
        where: { id: entry.id, companyId: ctx.companyId },
        select: { answers: true },
      });
      const existing =
        current?.answers && typeof current.answers === 'object' && !Array.isArray(current.answers)
          ? (current.answers as Record<string, unknown>)
          : {};
      await saveEntryDraft(ctx.companyId, access, entry.id, {
        ...existing,
        ...action.args.answers,
      });
      return {
        message:
          'Rascunho da ficha salvo. Confira com o cliente e envie pela aba Fichas do cliente.',
        appointmentIds: [],
        paths: [`/clientes/${action.args.clientId}`],
        link: `/clientes/${action.args.clientId}?aba=fichas`,
      };
    }
  }
}
