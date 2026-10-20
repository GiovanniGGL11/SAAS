import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { prisma } from '@/lib/db';
import { calendarDateToUtc } from '@/lib/time';
import { featureAccessFor } from '@/server/billing/features';
import {
  addTaskComment,
  createTask,
  dueReminders,
  getTaskDetail,
  nextOccurrence,
  setTaskStatus,
  updateTask,
} from '@/server/data/tasks';
import {
  addInteraction,
  createOpportunity,
  listStages,
  moveOpportunity,
  saveStages,
} from '@/server/data/crm';
import {
  approveQuote,
  convertQuoteToSale,
  createQuote,
  getQuoteDetail,
} from '@/server/data/quotes';
import { getMyDay } from '@/server/data/my-day';
import { getValues, saveField, setValues } from '@/server/data/custom-fields';
import { createTestCompany, deleteTestCompany } from './helpers';

const tz = 'America/Sao_Paulo';

describe('planos: o que cada um inclui', () => {
  it('tarefas no Básico; CRM e campos no Profissional; serviços em andamento e automações no Pro', () => {
    const plan = (p: string) =>
      featureAccessFor({
        plan: p,
        subscriptionStatus: 'ACTIVE',
        trialEndsAt: null,
        currentPeriodEnd: new Date(Date.now() + 9e8),
      }).features;
    expect(plan('essencial')).toMatchObject({ tasks: true, crm: false, customFields: false });
    expect(plan('profissional')).toMatchObject({
      crm: true,
      customFields: true,
      surveys: true,
      referrals: true,
      serviceTracking: false,
      automationRules: false,
    });
    expect(plan('pro')).toMatchObject({
      serviceTracking: true,
      automationRules: true,
      advancedKpis: true,
    });
  });
});

describe('tarefas, CRM, venda por orçamento, Meu dia e campos personalizados', () => {
  let f: Awaited<ReturnType<typeof createTestCompany>>;
  let other: Awaited<ReturnType<typeof createTestCompany>>;
  const admin = { userId: 'user_admin', isAdmin: true };
  const member = { userId: 'user_member', isAdmin: false };

  beforeAll(async () => {
    f = await createTestCompany('fund_a');
    other = await createTestCompany('fund_b');
  });
  afterAll(async () => {
    await deleteTestCompany(f.company.id);
    await deleteTestCompany(other.company.id);
  });

  it('recorrência no fuso da empresa: 31/01 mensal vira 28/02 no mesmo horário local', () => {
    const due = calendarDateToUtc({ year: 2031, month: 1, day: 31 }, 18 * 60, tz);
    const next = nextOccurrence(due, 'monthly', tz);
    expect(next.toISOString()).toBe(
      calendarDateToUtc({ year: 2031, month: 2, day: 28 }, 18 * 60, tz).toISOString(),
    );
    expect(nextOccurrence(due, 'weekly', tz).toISOString()).toBe(
      calendarDateToUtc({ year: 2031, month: 2, day: 7 }, 18 * 60, tz).toISOString(),
    );
  });

  it('tarefa: concluir ≠ cancelar; repetir gera a próxima uma vez; histórico e comentários; lembrete só para a pessoa', async () => {
    const dueAt = calendarDateToUtc({ year: 2031, month: 3, day: 10 }, 9 * 60, tz);
    const { task } = await createTask(f.company.id, 'user_admin', {
      title: 'Ligar para fornecedor',
      dueAt,
      recurrence: 'weekly',
      assignedUserId: 'user_member',
      remindAt: new Date(Date.now() - 60_000),
      checklist: [{ text: 'Pedir orçamento' }],
    });
    expect(await dueReminders(f.company.id, 'user_member')).toHaveLength(1);
    expect(await dueReminders(f.company.id, 'user_admin')).toHaveLength(0);
    await updateTask(f.company.id, 'user_admin', task.id, { priority: 'HIGH' });
    await addTaskComment(f.company.id, 'user_member', task.id, 'Já liguei, aguardando.');
    const first = await setTaskStatus(f.company.id, 'user_member', task.id, 'DONE', tz);
    expect(first.next).not.toBeNull();
    // Concluir de novo não duplica a série.
    await expect(setTaskStatus(f.company.id, 'user_member', task.id, 'DONE', tz)).rejects.toThrow(
      /já foi atualizada/,
    );
    const series = await prisma.task.findMany({
      where: { companyId: f.company.id, recurrenceSourceId: task.id },
    });
    expect(series).toHaveLength(1);
    expect(series[0].dueAt?.toISOString()).toBe(
      calendarDateToUtc({ year: 2031, month: 3, day: 17 }, 9 * 60, tz).toISOString(),
    );
    const closed = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
    expect(closed).toMatchObject({ status: 'DONE', canceledAt: null });
    expect(closed.completedAt).not.toBeNull();
    const { history, task: detail } = await getTaskDetail(f.company.id, task.id);
    expect(detail.comments).toHaveLength(1);
    expect(history.map((h) => h.action)).toEqual(
      expect.arrayContaining(['created', 'updated', 'completed']),
    );
    // Outra empresa não enxerga.
    await expect(getTaskDetail(other.company.id, task.id)).rejects.toThrow(/não encontrada/);
  });

  it('CRM: contato com telefone de cliente liga ao cliente; perder exige motivo; kanban desatualizado e não-dono são recusados', async () => {
    const opp = await createOpportunity(f.company.id, 'user_admin', {
      title: 'Plano anual (teste)',
      contactName: 'Outro nome',
      contactPhone: f.client.phone,
      ownerUserId: 'user_admin',
      estimatedValue: 1200,
    });
    // Phone do cliente de teste tem "+", não é só dígitos → o contato fica como contato.
    const stages = await listStages(f.company.id);
    const lost = stages.find((s) => s.kind === 'LOST')!;
    const won = stages.find((s) => s.kind === 'WON')!;
    const second = stages.filter((s) => s.kind === 'OPEN')[1];
    await expect(
      moveOpportunity(f.company.id, member, opp.id, {
        toStageId: second.id,
        fromStageId: opp.stageId,
      }),
    ).rejects.toThrow(/responsável/);
    await expect(
      moveOpportunity(f.company.id, admin, opp.id, {
        toStageId: lost.id,
        fromStageId: opp.stageId,
      }),
    ).rejects.toThrow(/motivo/);
    await moveOpportunity(f.company.id, admin, opp.id, {
      toStageId: second.id,
      fromStageId: opp.stageId,
    });
    // Tela antiga (ainda via a etapa inicial) não passa por cima.
    await expect(
      moveOpportunity(f.company.id, admin, opp.id, { toStageId: won.id, fromStageId: opp.stageId }),
    ).rejects.toThrow(/movida por outra pessoa/);
    await moveOpportunity(f.company.id, admin, opp.id, {
      toStageId: won.id,
      fromStageId: second.id,
    });
    await addInteraction(f.company.id, member, opp.id, 'call', 'Fechou por telefone.');
    const saved = await prisma.opportunity.findUniqueOrThrow({
      where: { id: opp.id },
      include: { events: true },
    });
    expect(saved.status).toBe('WON');
    expect(saved.events.map((e) => e.kind)).toEqual(
      expect.arrayContaining(['created', 'stage_change', 'won', 'call']),
    );
    // Valor estimado não vira receita.
    expect(await prisma.transaction.count({ where: { companyId: f.company.id } })).toBe(0);
    // Etapa com oportunidade não muda de tipo; funil sem etapa de perda é recusado.
    await expect(
      saveStages(
        f.company.id,
        'user_admin',
        stages.map((s) => ({ id: s.id, name: s.name, kind: s.kind === 'LOST' ? 'OPEN' : s.kind })),
      ),
    ).rejects.toThrow(/perda/);
  });

  it('orçamento → venda: uma conta a receber pendente, uma vez só, com baixa de produto', async () => {
    const product = await prisma.product.create({
      data: {
        companyId: f.company.id,
        name: 'Kit (teste)',
        costPrice: 10,
        salePrice: 30,
        quantity: 5,
      },
    });
    const quote = await createQuote({
      companyId: f.company.id,
      timezone: tz,
      userId: 'u',
      input: {
        clientId: f.client.id,
        title: 'Kit e instalação',
        items: [
          {
            kind: 'product',
            refId: product.id,
            description: 'Kit',
            quantity: 2,
            sessions: 1,
            unitPrice: 30,
            discount: 0,
          },
          {
            kind: 'custom',
            description: 'Instalação',
            quantity: 1,
            sessions: 1,
            unitPrice: 100,
            discount: 0,
          },
        ],
        discount: 0,
      },
    });
    const detail = await getQuoteDetail(f.company.id, quote.id, tz);
    await approveQuote({
      companyId: f.company.id,
      userId: 'u',
      id: quote.id,
      version: 1,
      contentHash: detail.current.contentHash,
    });
    const results = await Promise.allSettled([
      convertQuoteToSale({ companyId: f.company.id, timezone: tz, userId: 'u', id: quote.id }),
      convertQuoteToSale({ companyId: f.company.id, timezone: tz, userId: 'u', id: quote.id }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const receivables = await prisma.transaction.findMany({
      where: { companyId: f.company.id, category: 'Orçamento' },
    });
    expect(receivables).toHaveLength(1);
    expect(receivables[0]).toMatchObject({ status: 'PENDING', type: 'INCOME' });
    expect(Number(receivables[0].amount)).toBe(160);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: product.id } })).quantity).toBe(
      3,
    );
  });

  it('Meu dia: tarefa ligada a orçamento substitui o item do orçamento; contas só para administrador', async () => {
    const quote = await prisma.quote.findFirstOrThrow({ where: { companyId: f.company.id } });
    await prisma.quote.update({
      where: { id: quote.id },
      data: { status: 'SENT', sentAt: new Date(Date.now() - 5 * 86_400_000), convertedAt: null },
    });
    // Conta com vencimento hoje (a venda nasce sem vencimento; aqui a equipe define a data).
    await prisma.transaction.updateMany({
      where: { companyId: f.company.id, category: 'Orçamento' },
      data: { dueDate: new Date() },
    });
    const viewer = (isAdmin: boolean) => ({
      userId: 'user_admin',
      isAdmin,
      features: { quotes: true, crm: true, forms: true },
    });
    let day = await getMyDay(f.company.id, tz, viewer(true), { days: 7 });
    expect(day.items.some((i) => i.key === `quote:${quote.id}`)).toBe(true);
    expect(day.items.some((i) => i.kind === 'bill')).toBe(true);
    await createTask(f.company.id, 'user_admin', {
      title: 'Retornar orçamento',
      quoteId: quote.id,
      dueAt: new Date(),
    });
    day = await getMyDay(f.company.id, tz, viewer(false), { days: 7 });
    expect(day.items.some((i) => i.key === `quote:${quote.id}`)).toBe(false);
    expect(day.items.some((i) => i.kind === 'bill')).toBe(false);
    const keys = day.items.map((i) => i.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('campos personalizados: tipo fixo, opção arquivada mantém a resposta, validação e permissão no servidor', async () => {
    const field = await saveField(f.company.id, 'user_admin', {
      entity: 'client',
      label: 'Como conheceu',
      type: 'single_select',
      required: false,
      options: [{ label: 'Instagram' }, { label: 'Indicação' }],
      viewRole: 'all',
      editRole: 'all',
    });
    const opts = field.options as { id: string; label: string }[];
    await setValues(f.company.id, 'client', f.client.id, member, { [field.id]: opts[0].id });
    await expect(
      setValues(f.company.id, 'client', f.client.id, member, { [field.id]: 'inventada' }),
    ).rejects.toThrow(/opção inválida/);
    await expect(
      saveField(f.company.id, 'user_admin', {
        id: field.id,
        entity: 'client',
        label: 'x',
        type: 'short_text',
        required: false,
        viewRole: 'all',
        editRole: 'all',
      }),
    ).rejects.toThrow(/tipo/);
    // Remove a opção usada: ela é arquivada e a resposta continua legível.
    await saveField(f.company.id, 'user_admin', {
      id: field.id,
      entity: 'client',
      label: 'Origem do cliente',
      type: 'single_select',
      required: false,
      options: [{ id: opts[1].id, label: 'Indicação' }],
      viewRole: 'all',
      editRole: 'all',
    });
    const [value] = await getValues(f.company.id, 'client', f.client.id, member);
    expect(value.label).toBe('Origem do cliente');
    expect(value.value).toBe(opts[0].id);
    expect(value.options.find((o) => o.id === opts[0].id)?.archived).toBe(true);
    // Campo só de administrador: a equipe não vê nem altera.
    const secret = await saveField(f.company.id, 'user_admin', {
      entity: 'client',
      label: 'Limite de crédito',
      type: 'number',
      required: false,
      viewRole: 'admin',
      editRole: 'admin',
    });
    expect(
      (await getValues(f.company.id, 'client', f.client.id, member)).some(
        (v) => v.id === secret.id,
      ),
    ).toBe(false);
    await expect(
      setValues(f.company.id, 'client', f.client.id, member, { [secret.id]: 10 }),
    ).rejects.toThrow(/sem permissão/);
    // Registro de outra empresa não recebe resposta.
    await expect(
      setValues(f.company.id, 'client', other.client.id, admin, { [field.id]: opts[1].id }),
    ).rejects.toThrow(/não encontrado/);
  });
});
