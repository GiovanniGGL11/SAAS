import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { prisma } from '@/lib/db';
import { buildAiSession } from '@/server/ai/access';
import {
  confirmProposal,
  createProposal,
  listApprovals,
  rejectProposal,
} from '@/server/ai/proposals';
import { describeAction } from '@/server/assistant/execute';
import type { AssistantAction } from '@/lib/assistant';
import {
  assertQuoteDiscountAllowed,
  savePreferences,
  setAutomationPause,
  withinContactWindow,
} from '@/server/data/business-preferences';
import { createAuthorization } from '@/server/ai/autonomy';
import { renewalTrigger, runPackageRenewal } from '@/server/automations/package-renewal';
import { computeDailySummary, summaryForViewer } from '@/server/automations/daily-summary';
import { createClientPackage } from '@/server/data/package-sessions';
import { createTestCompany, deleteTestCompany } from './helpers';

const PERIOD_END = new Date(Date.now() + 20 * 86_400_000);

async function setPlan(
  companyId: string,
  plan: string,
  mode: 'APPROVAL' | 'AUTO_RULES' = 'APPROVAL',
) {
  return prisma.company.update({
    where: { id: companyId },
    data: {
      plan,
      subscriptionStatus: 'ACTIVE',
      currentPeriodEnd: PERIOD_END,
      aiAutonomyMode: mode,
    },
  });
}

const basePrefs = {
  tone: 'cordial' as const,
  escalateOnComplaint: true,
  escalateOnHealth: true,
  contactStartMinutes: 8 * 60,
  contactEndMinutes: 20 * 60,
  contactWeekdays: [1, 2, 3, 4, 5],
  dailySummaryAuto: false,
  dailySummaryHour: 7,
  notifyQuotes: true,
  notifyTasks: true,
  notifyApprovals: true,
};

describe('central de aprovações e preferências', () => {
  let f: Awaited<ReturnType<typeof createTestCompany>>;
  let other: Awaited<ReturnType<typeof createTestCompany>>;

  beforeAll(async () => {
    f = await createTestCompany('e2_a');
    other = await createTestCompany('e2_b');
    await setPlan(f.company.id, 'profissional');
  });
  afterAll(async () => {
    await deleteTestCompany(f.company.id);
    await deleteTestCompany(other.company.id);
  });

  const sessionFor = async (userId: string, isAdmin: boolean, companyId = f.company.id) =>
    buildAiSession({
      company: await prisma.company.findUniqueOrThrow({ where: { id: companyId } }),
      userId,
      isAdmin,
    });

  const quoteAction = (price: number): AssistantAction => ({
    kind: 'create_quote',
    args: {
      clientId: f.client.id,
      title: 'Oito sessões (teste)',
      items: [
        {
          kind: 'service',
          refId: f.service.id,
          description: 'Sessão',
          quantity: 1,
          sessions: 8,
          unitPrice: price,
          discount: 0,
        },
      ],
      discount: 0,
      paymentTerms: null,
      notes: null,
      validUntil: null,
    },
  });

  const withDiscount = (action: AssistantAction, discount: number): AssistantAction =>
    action.kind === 'create_quote' ? { ...action, args: { ...action.args, discount } } : action;

  async function propose(userId: string, action: AssistantAction) {
    const ctx = {
      companyId: f.company.id,
      companyName: 'x',
      timezone: f.company.timezone,
      userId,
      isAdmin: false,
    };
    return createProposal(ctx, action, await describeAction(ctx, action));
  }

  it('"oito sessões por R$ 960" vira proposta; só executa com aprovação, uma vez, e cria rascunho', async () => {
    const proposal = await propose('user_member', quoteAction(960));
    expect(proposal.status).toBe('AWAITING_APPROVAL');
    expect(proposal.details.find((d) => d.label === 'Total')?.value).toContain('960');
    expect(await prisma.quote.count({ where: { companyId: f.company.id } })).toBe(0);

    // Outra pessoa da equipe (não admin) não aprova a proposta de alguém.
    await expect(
      confirmProposal(await sessionFor('user_other', false), proposal.id),
    ).rejects.toThrow(/não encontrada/);
    // Administrador vê e aprova; a execução revalida e cria o orçamento como rascunho.
    const admin = await sessionFor('user_admin', true);
    expect((await listApprovals(admin, { pending: true })).map((p) => p.id)).toContain(proposal.id);
    const outcome = await confirmProposal(admin, proposal.id);
    expect(outcome.status).toBe('COMPLETED');
    const quotes = await prisma.quote.findMany({ where: { companyId: f.company.id } });
    expect(quotes).toHaveLength(1);
    expect(quotes[0]).toMatchObject({ status: 'DRAFT', origin: 'ai' });
    // Aprovar de novo não executa duas vezes.
    const again = await confirmProposal(admin, proposal.id);
    expect(again).toMatchObject({ status: 'COMPLETED', alreadyDone: true });
    expect(await prisma.quote.count({ where: { companyId: f.company.id } })).toBe(1);
    const row = await prisma.aiActionProposal.findUniqueOrThrow({ where: { id: proposal.id } });
    expect(row.decidedByUserId).toBe('user_admin');
  });

  it('recusar registra quem decidiu e nada é executado; outra empresa não enxerga', async () => {
    const proposal = await propose('user_member', quoteAction(500));
    const member = await sessionFor('user_member', false);
    expect((await listApprovals(await sessionFor('user_x', false, other.company.id))).length).toBe(
      0,
    );
    await rejectProposal(member, proposal.id, 'valor errado');
    const row = await prisma.aiActionProposal.findUniqueOrThrow({ where: { id: proposal.id } });
    expect(row).toMatchObject({
      status: 'REJECTED',
      decidedByUserId: 'user_member',
      decisionNote: 'valor errado',
    });
    await expect(confirmProposal(member, proposal.id)).rejects.toThrow(/recusada/);
  });

  it('preferências: limite de desconto vale no servidor; janela de contato respeita dia e hora', async () => {
    await savePreferences(f.company.id, 'user_admin', { ...basePrefs, maxDiscountPercent: 10 });
    const items = [
      {
        kind: 'custom' as const,
        description: 'x',
        quantity: 1,
        sessions: 1,
        unitPrice: 100,
        discount: 0,
      },
    ];
    await expect(
      assertQuoteDiscountAllowed(f.company.id, { items, discount: 10 }),
    ).resolves.toBeUndefined();
    await expect(assertQuoteDiscountAllowed(f.company.id, { items, discount: 20 })).rejects.toThrow(
      /limite de 10%/,
    );
    // A proposta da IA também respeita o limite (a IA não contorna regra do servidor).
    await expect(propose('user_member', withDiscount(quoteAction(960), 200))).rejects.toThrow(
      /limite/,
    );
    // Segunda 10:00 em São Paulo (13:00 UTC) dentro; domingo fora.
    const monday = new Date('2026-10-19T13:00:00Z');
    const sunday = new Date('2026-10-18T13:00:00Z');
    const prefs = {
      contactStartMinutes: 480,
      contactEndMinutes: 1200,
      contactWeekdays: [1, 2, 3, 4, 5],
    };
    expect(withinContactWindow(prefs, 'America/Sao_Paulo', monday)).toBe(true);
    expect(withinContactWindow(prefs, 'America/Sao_Paulo', sunday)).toBe(false);
  });
});

describe('rotinas automáticas: renovação, pausa, plano e resumo do dia', () => {
  let f: Awaited<ReturnType<typeof createTestCompany>>;
  let pkgId: string;

  beforeAll(async () => {
    f = await createTestCompany('e3_a');
    const pkg = await createClientPackage({
      companyId: f.company.id,
      clientId: f.client.id,
      userId: 'u',
      name: 'Pacote 2 sessões (teste)',
      serviceId: f.service.id,
      sessionsTotal: 2,
      price: 200,
      contractedAt: new Date(),
      requireSignature: false,
      payment: { kind: 'later' },
      opening: { sessionsDone: 1, paidAmount: 0 },
    });
    pkgId = pkg.id;
  });
  afterAll(async () => {
    await deleteTestCompany(f.company.id);
  });

  it('gatilhos de renovação', () => {
    const now = new Date();
    expect(
      renewalTrigger({ done: 7, total: 8, validUntil: null, hasNextBooking: false, now }),
    ).toBe('penultimate');
    expect(
      renewalTrigger({ done: 8, total: 8, validUntil: null, hasNextBooking: false, now }),
    ).toBe('finished_no_booking');
    expect(
      renewalTrigger({ done: 8, total: 8, validUntil: null, hasNextBooking: true, now }),
    ).toBeNull();
    expect(
      renewalTrigger({ done: 6, total: 8, validUntil: null, hasNextBooking: false, now }),
    ).toBe('low_balance');
    expect(
      renewalTrigger({
        done: 1,
        total: 8,
        validUntil: new Date(now.getTime() + 5 * 86_400_000),
        hasNextBooking: false,
        now,
      }),
    ).toBe('expiring');
    expect(
      renewalTrigger({ done: 1, total: 8, validUntil: null, hasNextBooking: false, now }),
    ).toBeNull();
  });

  it('Profissional nunca roda rotina; Pro sem modo/autorização também não', async () => {
    await setPlan(f.company.id, 'profissional', 'AUTO_RULES');
    expect((await runPackageRenewal(f.company.id, 'manual')).status).toBe('SKIPPED');
    await setPlan(f.company.id, 'pro', 'APPROVAL');
    expect((await runPackageRenewal(f.company.id, 'manual')).status).toBe('SKIPPED');
    await setPlan(f.company.id, 'pro', 'AUTO_RULES');
    const skipped = await runPackageRenewal(f.company.id, 'manual');
    expect(skipped).toMatchObject({ status: 'SKIPPED' });
    expect(await prisma.task.count({ where: { companyId: f.company.id } })).toBe(0);
    const runs = await prisma.automationRun.findMany({ where: { companyId: f.company.id } });
    expect(runs.every((r) => r.status === 'SKIPPED' && r.note)).toBe(true);
  });

  it('Pro autorizado: cria tarefa e orçamento rascunho uma vez; nunca cobra nem renova', async () => {
    const company = await prisma.company.findUniqueOrThrow({ where: { id: f.company.id } });
    await createAuthorization(buildAiSession({ company, userId: 'user_admin', isAdmin: true }), {
      taskType: 'package_renewal',
      limits: { maxPerDay: 10, allowedHours: { from: 0, to: 24 } },
    });
    const first = await runPackageRenewal(f.company.id, 'manual');
    expect(first.status).toBe('COMPLETED');
    const tasks = await prisma.task.findMany({ where: { companyId: f.company.id } });
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({
      clientPackageId: pkgId,
      origin: 'automation:package_renewal',
    });
    const quotes = await prisma.quote.findMany({ where: { companyId: f.company.id } });
    expect(quotes).toHaveLength(1);
    expect(quotes[0]).toMatchObject({ status: 'DRAFT', origin: 'automation:package_renewal' });
    // Repetir não duplica (dedupe por pacote + gatilho).
    await runPackageRenewal(f.company.id, 'manual');
    expect(await prisma.task.count({ where: { companyId: f.company.id } })).toBe(1);
    expect(await prisma.quote.count({ where: { companyId: f.company.id } })).toBe(1);
    // Nada financeiro, nenhum pacote novo.
    expect(await prisma.transaction.count({ where: { companyId: f.company.id } })).toBe(0);
    expect(await prisma.clientPackage.count({ where: { companyId: f.company.id } })).toBe(1);
  });

  it('pausa bloqueia novas execuções; downgrade pausa sem apagar; retomar não dispara atraso', async () => {
    await setAutomationPause({
      companyId: f.company.id,
      userId: 'user_admin',
      routine: 'all',
      paused: true,
    });
    expect(await runPackageRenewal(f.company.id, 'manual')).toMatchObject({
      status: 'SKIPPED',
      reason: /Pausada/,
    });
    await setAutomationPause({
      companyId: f.company.id,
      userId: 'user_admin',
      routine: 'all',
      paused: false,
    });
    // Downgrade para Profissional: a rotina para, a autorização e o histórico continuam guardados.
    await setPlan(f.company.id, 'profissional', 'AUTO_RULES');
    expect((await runPackageRenewal(f.company.id, 'manual')).status).toBe('SKIPPED');
    expect(await prisma.aiTaskAuthorization.count({ where: { companyId: f.company.id } })).toBe(1);
    expect(await prisma.task.count({ where: { companyId: f.company.id } })).toBe(1);
  });

  it('resumo do dia: determinístico, com links; financeiro só para administrador', async () => {
    await prisma.transaction.create({
      data: {
        companyId: f.company.id,
        type: 'INCOME',
        status: 'PENDING',
        amount: 50,
        description: 'Fiado (teste)',
        category: 'Serviços',
        createdByUserId: 'u',
      },
    });
    const content = await computeDailySummary(f.company.id, f.company.timezone);
    const packages = content.sections.find((s) => s.key === 'packages');
    expect(packages?.count).toBe(1);
    expect(packages?.items[0].href).toContain('?aba=pacotes');
    expect(content.sections.find((s) => s.key === 'tasks')?.count).toBe(1);
    expect(summaryForViewer(content, true).sections.some((s) => s.key === 'receivables')).toBe(
      true,
    );
    expect(summaryForViewer(content, false).sections.some((s) => s.key === 'receivables')).toBe(
      false,
    );
    expect(JSON.stringify(content)).not.toMatch(/answers|anamnese/i);
  });
});
