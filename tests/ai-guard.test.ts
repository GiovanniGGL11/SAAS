import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { prisma } from '@/lib/db';
import { resolveEntitlements } from '@/lib/billing/entitlements';
import { buildAiSession, type AiSession } from '@/server/ai/access';
import { handleAssistantMessage } from '@/server/ai/assistant-service';
import { cancelProposal, confirmProposal } from '@/server/ai/proposals';
import { reserveUnits, settleReservation } from '@/server/ai/quota';
import { readOnlyToolbox, assistantToolbox } from '@/server/assistant/run';
import { adjustStock } from '@/server/data/stock';
import { NO_GRANT, resolveFormAccess } from '@/server/data/form-permissions';
import { saveTemplate } from '@/server/data/forms';
import { createTestCompany, deleteTestCompany } from './helpers';

/*
  Controles da IA com o banco. Provedor falso (fetch trocado): nenhum dado sai do teste.
  Dados fictícios.
*/

type FakePart = { text?: string; functionCall?: { name: string; args: Record<string, unknown> } };

function installFakeGemini(replies: FakePart[][]) {
  const calls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (!url.startsWith('https://generativelanguage.googleapis.com/'))
        throw new Error(`Unexpected fetch: ${url}`);
      calls.push(String(init?.body));
      const parts = replies.shift() ?? [{ text: 'fim' }];
      return new Response(
        JSON.stringify({
          candidates: [{ content: { role: 'model', parts } }],
          usageMetadata: { promptTokenCount: 1000, candidatesTokenCount: 50 },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }),
  );
  return calls;
}

describe('IA: planos, franquia e execução segura', () => {
  let a: Awaited<ReturnType<typeof createTestCompany>>;
  let b: Awaited<ReturnType<typeof createTestCompany>>;
  let productId: string;
  const previousKey = process.env.GEMINI_API_KEY;

  const setPlan = (companyId: string, plan: string) =>
    prisma.company.update({
      where: { id: companyId },
      data: {
        plan,
        subscriptionStatus: 'ACTIVE',
        trialEndsAt: new Date(Date.now() - 86_400_000),
        currentPeriodEnd: new Date(Date.now() + 20 * 86_400_000),
        aiAutonomyMode: 'APPROVAL',
      },
    });

  const sessionFor = async (
    companyId: string,
    userId = 'user_dono',
    isAdmin = true,
  ): Promise<AiSession> => {
    const company = await prisma.company.findUniqueOrThrow({ where: { id: companyId } });
    return buildAiSession({ company, userId, isAdmin });
  };

  const stockReply = (args: Record<string, unknown>): FakePart[][] => [
    [{ functionCall: { name: 'preparar_entrada_estoque', args } }],
    [{ text: 'Preparei a entrada. Confira e confirme.' }],
  ];

  beforeAll(async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    a = await createTestCompany('ai_a');
    b = await createTestCompany('ai_b');
    productId = (
      await prisma.product.create({
        data: {
          companyId: a.company.id,
          name: 'Creme hidratante (teste)',
          costPrice: 15,
          salePrice: 40,
          quantity: 3,
        },
      })
    ).id;
  });

  afterEach(() => vi.unstubAllGlobals());

  afterAll(async () => {
    process.env.GEMINI_API_KEY = previousKey;
    await deleteTestCompany(a.company.id);
    await deleteTestCompany(b.company.id);
  });

  it('Básico não chega ao provedor, nem chamando o serviço direto; o uso manual continua', async () => {
    await setPlan(a.company.id, 'essencial');
    const calls = installFakeGemini([[{ text: 'não deveria' }]]);
    await expect(
      handleAssistantMessage({
        session: await sessionFor(a.company.id),
        messages: [{ role: 'user', text: 'oi' }],
      }),
    ).rejects.toThrow('O assistente de IA está disponível nos planos Profissional e Pro.');
    expect(calls).toHaveLength(0);
    expect(await prisma.aiUsageReservation.count({ where: { companyId: a.company.id } })).toBe(0);
    // Gestão manual sem IA segue funcionando.
    await adjustStock(
      a.company.id,
      { productId, type: 'IN', quantity: 1, reason: 'manual' },
      'user_dono',
    );
    expect((await prisma.product.findUniqueOrThrow({ where: { id: productId } })).quantity).toBe(4);
  });

  it('franquia não definida em produção bloqueia antes do provedor', async () => {
    await setPlan(a.company.id, 'profissional');
    const company = await prisma.company.findUniqueOrThrow({ where: { id: a.company.id } });
    const session = buildAiSession({ company, userId: 'user_dono', isAdmin: true });
    const production = {
      ...session,
      entitlements: resolveEntitlements(company, { production: true }),
    };
    const calls = installFakeGemini([[{ text: 'não deveria' }]]);
    await expect(
      handleAssistantMessage({ session: production, messages: [{ role: 'user', text: 'oi' }] }),
    ).rejects.toThrow(/franquia de IA do seu plano ainda não foi configurada/);
    expect(calls).toHaveLength(0);
  });

  it('Profissional: "12 cremes por R$ 240" vira prévia; confirmar duas vezes registra uma entrada, sem pagamento', async () => {
    await setPlan(a.company.id, 'profissional');
    const before = (await prisma.product.findUniqueOrThrow({ where: { id: productId } })).quantity;
    installFakeGemini(stockReply({ produtoId: productId, quantidade: 12, valorTotal: 240 }));
    const session = await sessionFor(a.company.id);
    const reply = await handleAssistantMessage({
      session,
      messages: [{ role: 'user', text: 'Comprei 12 cremes por R$ 240, coloca no estoque' }],
    });
    expect(reply.proposals).toHaveLength(1);
    const [proposal] = reply.proposals;
    expect(proposal.details.map((d) => `${d.label}: ${d.value}`).join(' | ')).toMatch(
      /Custo unitário: R\$\s20,00.*Total: R\$\s240,00.*Pagamento: Não lançado/,
    );
    // Nada mudou antes da confirmação.
    expect((await prisma.product.findUniqueOrThrow({ where: { id: productId } })).quantity).toBe(
      before,
    );

    const results = await Promise.allSettled([
      confirmProposal(session, proposal.id),
      confirmProposal(session, proposal.id),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).not.toHaveLength(0);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: productId } })).quantity).toBe(
      before + 12,
    );
    expect(await prisma.stockPurchase.count({ where: { companyId: a.company.id } })).toBe(1);
    expect(
      await prisma.transaction.count({ where: { companyId: a.company.id, type: 'EXPENSE' } }),
    ).toBe(0);
    // Tentar de novo depois: devolve o resultado, sem duplicar.
    const again = await confirmProposal(session, proposal.id);
    expect(again).toMatchObject({ status: 'COMPLETED', alreadyDone: true });
    expect(await prisma.stockPurchase.count({ where: { companyId: a.company.id } })).toBe(1);

    // Medição sem conteúdo: números, não o texto da conversa.
    const events = await prisma.aiUsageEvent.findMany({ where: { companyId: a.company.id } });
    expect(events.at(-1)).toMatchObject({
      feature: 'assistant_chat',
      calls: 2,
      inputTokens: 2000,
      outcome: 'SUCCEEDED',
    });
    expect(JSON.stringify(events)).not.toMatch(/cremes|Creme/);
    const period = await prisma.aiUsagePeriod.findFirstOrThrow({
      where: { companyId: a.company.id },
    });
    expect(period.usedUnits).toBeGreaterThanOrEqual(2);
  });

  it('se algo muda depois da prévia, pede aprovação de novo', async () => {
    installFakeGemini(stockReply({ produtoId: productId, quantidade: 2 }));
    const session = await sessionFor(a.company.id);
    const { proposals } = await handleAssistantMessage({
      session,
      messages: [{ role: 'user', text: 'entrou 2 cremes' }],
    });
    await prisma.product.update({ where: { id: productId }, data: { quantity: { increment: 5 } } });
    const first = await confirmProposal(session, proposals[0].id);
    expect(first.status).toBe('CHANGED');
    const second = await confirmProposal(session, proposals[0].id);
    expect(second.status).toBe('COMPLETED');
  });

  it('outra empresa, outra pessoa e pessoa sem permissão não executam', async () => {
    installFakeGemini(
      stockReply({ produtoId: productId, quantidade: 1, valorTotal: 20, pagamento: 'pago_pix' }),
    );
    const owner = await sessionFor(a.company.id);
    const { proposals } = await handleAssistantMessage({
      session: owner,
      messages: [{ role: 'user', text: 'paguei no pix' }],
    });
    await setPlan(b.company.id, 'profissional');
    await expect(confirmProposal(await sessionFor(b.company.id), proposals[0].id)).rejects.toThrow(
      'Proposta não encontrada.',
    );
    await expect(
      confirmProposal(await sessionFor(a.company.id, 'user_outro'), proposals[0].id),
    ).rejects.toThrow('Proposta não encontrada.');
    // Membro da equipe não lança pagamento no financeiro (mesma regra da tela).
    const member = await sessionFor(a.company.id, 'user_membro', false);
    const tool = await assistantToolbox.dispatch(
      {
        companyId: a.company.id,
        companyName: 'x',
        timezone: member.timezone,
        userId: 'user_membro',
        isAdmin: false,
      },
      'preparar_entrada_estoque',
      { produtoId: productId, quantidade: 1, valorTotal: 20, pagamento: 'pago_pix' },
    );
    expect(tool.response.erro).toMatch(/só para administradores/);
    await cancelProposal(owner, proposals[0].id);
  });

  it('downgrade para o Básico bloqueia a execução do que estava pendente e preserva os dados', async () => {
    installFakeGemini(stockReply({ produtoId: productId, quantidade: 3 }));
    const session = await sessionFor(a.company.id);
    const { proposals } = await handleAssistantMessage({
      session,
      messages: [{ role: 'user', text: 'entrou 3' }],
    });
    const quantity = (await prisma.product.findUniqueOrThrow({ where: { id: productId } }))
      .quantity;
    await setPlan(a.company.id, 'essencial');
    await expect(confirmProposal(await sessionFor(a.company.id), proposals[0].id)).rejects.toThrow(
      /Profissional e Pro/,
    );
    expect((await prisma.product.findUniqueOrThrow({ where: { id: productId } })).quantity).toBe(
      quantity,
    );
    expect(
      await prisma.aiActionProposal.count({ where: { companyId: a.company.id } }),
    ).toBeGreaterThan(0);
    await setPlan(a.company.id, 'profissional');
  });

  it('modo Sugerir: sem ferramentas de escrita e sem execução', async () => {
    expect(readOnlyToolbox.declarations.map((d) => d.name)).not.toContain('agendar');
    expect(readOnlyToolbox.declarations.map((d) => d.name)).not.toContain(
      'preparar_entrada_estoque',
    );
    await prisma.company.update({
      where: { id: a.company.id },
      data: { aiAutonomyMode: 'SUGGEST' },
    });
    const session = await sessionFor(a.company.id);
    expect(session.autonomy.effective).toBe('SUGGEST');
    await expect(confirmProposal(session, 'qualquer')).rejects.toThrow(/Sugerir/);
    await prisma.company.update({
      where: { id: a.company.id },
      data: { aiAutonomyMode: 'APPROVAL' },
    });
  });

  it('franquia: pedidos simultâneos não passam do limite', async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 8 }, () =>
        reserveUnits({
          companyId: b.company.id,
          timezone: 'America/Sao_Paulo',
          units: 1,
          limit: 3,
          feature: 'teste',
        }),
      ),
    );
    const ok = results.filter((r) => r.status === 'fulfilled');
    expect(ok).toHaveLength(3);
    expect(
      results
        .filter((r) => r.status === 'rejected')
        .every((r) =>
          /franquia de IA deste mês acabou/.test(String((r as PromiseRejectedResult).reason)),
        ),
    ).toBe(true);
    for (const r of ok)
      await settleReservation((r as PromiseFulfilledResult<{ id: string }>).value.id, 1);
    await expect(
      reserveUnits({
        companyId: b.company.id,
        timezone: 'America/Sao_Paulo',
        units: 1,
        limit: 3,
        feature: 'teste',
      }),
    ).rejects.toThrow(/acabou/);
  });

  it('fichas: modelo exige gerenciar; rascunho exige preencher e não envia nem guarda respostas depois', async () => {
    const template = await saveTemplate(
      a.company.id,
      null,
      {
        name: 'Anamnese teste',
        type: 'ANAMNESIS',
        fillableBy: 'BOTH',
        renewal: 'ONCE',
        requirement: 'NONE',
        schema: {
          sections: [
            {
              id: 's',
              title: 'S',
              audience: 'any',
              questions: [
                { id: 'q_objetivo', type: 'long_text', title: 'Objetivo', required: false },
              ],
            },
          ],
        },
        serviceIds: [],
      },
      'user_dono',
    );
    const noForms = resolveFormAccess({
      userId: 'user_dono',
      isAdmin: true,
      grant: null,
      professionalId: null,
    });
    const filler = resolveFormAccess({
      userId: 'user_dono',
      isAdmin: true,
      grant: { ...NO_GRANT, canRead: true, canFill: true },
      professionalId: null,
    });
    const reply = [
      [
        {
          functionCall: {
            name: 'preparar_rascunho_ficha',
            args: {
              clienteId: a.client.id,
              modeloId: template.id,
              respostas: [{ perguntaId: 'q_objetivo', valor: 'Relaxar (fictício)' }],
            },
          },
        },
      ],
      [{ text: 'Preparei o rascunho.' }],
    ];
    installFakeGemini(structuredClone(reply));
    const session = await sessionFor(a.company.id);
    const denied = await handleAssistantMessage({
      session,
      formAccess: noForms,
      messages: [{ role: 'user', text: 'preenche' }],
    });
    expect(denied.proposals).toHaveLength(0);

    vi.unstubAllGlobals();
    installFakeGemini(structuredClone(reply));
    const allowed = await handleAssistantMessage({
      session,
      formAccess: filler,
      messages: [{ role: 'user', text: 'preenche' }],
    });
    expect(allowed.proposals).toHaveLength(1);
    await confirmProposal(session, allowed.proposals[0].id, filler);
    const entry = await prisma.formEntry.findFirstOrThrow({
      where: { companyId: a.company.id, templateId: template.id },
    });
    expect(entry.status).toBe('DRAFT');
    expect(entry.answers).toEqual({ q_objetivo: 'Relaxar (fictício)' });
    const stored = await prisma.aiActionProposal.findUniqueOrThrow({
      where: { id: allowed.proposals[0].id },
    });
    expect(JSON.stringify(stored.payload)).not.toContain('Relaxar');
    expect(JSON.stringify(stored.summary)).not.toContain('Relaxar');
  });
});
