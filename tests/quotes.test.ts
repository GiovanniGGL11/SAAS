import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { prisma } from '@/lib/db';
import { discountPercent, packageShape, quoteTotals } from '@/lib/quotes';
import {
  approveQuote,
  cancelQuote,
  convertQuoteToPackage,
  createQuote,
  createQuoteFollowUp,
  createQuoteShareLink,
  duplicateQuote,
  getQuoteByToken,
  getQuoteDetail,
  listClientQuotes,
  respondQuoteByToken,
  revokeQuoteLinks,
  updateQuote,
} from '@/server/data/quotes';
import { createTestCompany, deleteTestCompany } from './helpers';

/** Orçamentos: versões, aprovação presa ao conteúdo, link protegido e conversão única. Dados fictícios. */
describe('orçamentos', () => {
  let f: Awaited<ReturnType<typeof createTestCompany>>;
  let other: Awaited<ReturnType<typeof createTestCompany>>;
  const tz = 'America/Sao_Paulo';

  const eight = (price = 960) => ({
    clientId: f.client.id,
    title: 'Pacote 8 sessões (teste)',
    items: [
      {
        kind: 'service' as const,
        refId: f.service.id,
        description: 'Sessão (teste)',
        quantity: 1,
        sessions: 8,
        unitPrice: price,
        discount: 0,
      },
    ],
    discount: 0,
  });

  beforeAll(async () => {
    f = await createTestCompany('quote_a');
    other = await createTestCompany('quote_b');
  });

  afterAll(async () => {
    await deleteTestCompany(f.company.id);
    await deleteTestCompany(other.company.id);
  });

  it('cálculo: desconto por item e geral, nunca negativo; pacote precisa de um serviço só', () => {
    const totals = quoteTotals({
      items: [
        {
          kind: 'custom',
          description: 'a',
          quantity: 2,
          sessions: 1,
          unitPrice: 100,
          discount: 10,
        },
        { kind: 'custom', description: 'b', quantity: 1, sessions: 1, unitPrice: 50, discount: 80 },
      ],
      discount: 20,
    });
    expect(totals).toEqual({ subtotal: 190, discount: 20, total: 170 });
    expect(discountPercent({ items: eightItems(), discount: 96 })).toBe(10);
    expect(packageShape({ items: eightItems() })).toMatchObject({ ok: true, sessions: 8 });
    expect(packageShape({ items: [...eightItems(), ...eightItems()] }).ok).toBe(false);
  });

  it('numera por empresa e isola: outra empresa não vê nem aprova', async () => {
    const a = await createQuote({
      companyId: f.company.id,
      timezone: tz,
      userId: 'u',
      input: eight(),
    });
    const b = await createQuote({
      companyId: f.company.id,
      timezone: tz,
      userId: 'u',
      input: eight(),
    });
    expect(b.number).toBe(a.number + 1);
    await expect(getQuoteDetail(other.company.id, a.id, tz)).rejects.toThrow(/não encontrado/);
    const detail = await getQuoteDetail(f.company.id, a.id, tz);
    await expect(
      approveQuote({
        companyId: other.company.id,
        userId: 'x',
        id: a.id,
        version: 1,
        contentHash: detail.current.contentHash,
      }),
    ).rejects.toThrow(/não encontrado/);
    // Cliente de outra empresa não entra num orçamento.
    await expect(
      createQuote({
        companyId: f.company.id,
        timezone: tz,
        userId: 'u',
        input: { ...eight(), clientId: other.client.id },
      }),
    ).rejects.toThrow(/Cliente não encontrado/);
  });

  it('rascunho corrige no lugar; depois de enviado, mudar cria versão nova e pede nova aprovação', async () => {
    const quote = await createQuote({
      companyId: f.company.id,
      timezone: tz,
      userId: 'u',
      input: eight(),
    });
    expect(
      (
        await updateQuote({
          companyId: f.company.id,
          timezone: tz,
          userId: 'u',
          id: quote.id,
          expectedVersion: 1,
          input: eight(900),
        })
      ).newVersion,
    ).toBe(false);
    const token = await createQuoteShareLink(f.company.id, 'u', quote.id);
    const before = await getQuoteDetail(f.company.id, quote.id, tz);
    expect(before.status).toBe('SENT');

    await updateQuote({
      companyId: f.company.id,
      timezone: tz,
      userId: 'u',
      id: quote.id,
      expectedVersion: 1,
      input: eight(960),
    });
    const after = await getQuoteDetail(f.company.id, quote.id, tz);
    expect(after.currentVersion).toBe(2);
    expect(after.status).toBe('DRAFT');
    expect(after.history.map((v) => v.total)).toEqual([960, 900]);
    // O link enviado antes da mudança caiu.
    expect(await getQuoteByToken(token)).toEqual({ problem: 'revoked' });
    // Aprovação com o hash da versão antiga é recusada.
    await expect(
      approveQuote({
        companyId: f.company.id,
        userId: 'u',
        id: quote.id,
        version: 1,
        contentHash: before.current.contentHash,
      }),
    ).rejects.toThrow(/alterado/);
    // Edição concorrente com versão desatualizada é recusada.
    await expect(
      updateQuote({
        companyId: f.company.id,
        timezone: tz,
        userId: 'u',
        id: quote.id,
        expectedVersion: 1,
        input: eight(700),
      }),
    ).rejects.toThrow(/outra pessoa/);
  });

  it('link protegido: cliente aprova a versão que vê; link revogado e adulterado não valem', async () => {
    const quote = await createQuote({
      companyId: f.company.id,
      timezone: tz,
      userId: 'u',
      input: eight(),
    });
    const token = await createQuoteShareLink(f.company.id, 'u', quote.id);
    expect(token).not.toContain(f.client.id);
    const view = await getQuoteByToken(token);
    if (!('quote' in view)) throw new Error('link deveria valer');
    expect(view.quote.total).toBe(960);
    expect(JSON.stringify(view.quote)).not.toMatch(/costPrice|commission|createdByUserId/);
    expect(await getQuoteByToken(token.slice(0, -2) + 'xx')).toEqual({ problem: 'invalid' });

    await respondQuoteByToken(token, {
      approve: true,
      version: view.quote.version,
      contentHash: view.quote.contentHash,
    });
    const detail = await getQuoteDetail(f.company.id, quote.id, tz);
    expect(detail.status).toBe('APPROVED');
    expect(detail.approved).toMatchObject({ version: 1, via: 'client_link', isCurrent: true });
    // Aprovar não lança nada no financeiro.
    expect(await prisma.transaction.count({ where: { companyId: f.company.id } })).toBe(0);

    await revokeQuoteLinks(f.company.id, 'u', quote.id);
    expect(await getQuoteByToken(token)).toEqual({ problem: 'revoked' });
    // Aparece na área do cliente (só do próprio cliente).
    expect((await listClientQuotes(f.company.id, f.client.id)).some((q) => q.id === quote.id)).toBe(
      true,
    );
  });

  it('converte a versão aprovada em pacote uma vez só, mesmo com dois cliques ao mesmo tempo', async () => {
    const quote = await createQuote({
      companyId: f.company.id,
      timezone: tz,
      userId: 'u',
      input: eight(),
    });
    const detail = await getQuoteDetail(f.company.id, quote.id, tz);
    await expect(
      convertQuoteToPackage({ companyId: f.company.id, timezone: tz, userId: 'u', id: quote.id }),
    ).rejects.toThrow(/aprovada/);
    await approveQuote({
      companyId: f.company.id,
      userId: 'u',
      id: quote.id,
      version: 1,
      contentHash: detail.current.contentHash,
    });

    const results = await Promise.allSettled([
      convertQuoteToPackage({ companyId: f.company.id, timezone: tz, userId: 'u', id: quote.id }),
      convertQuoteToPackage({ companyId: f.company.id, timezone: tz, userId: 'u', id: quote.id }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const packages = await prisma.clientPackage.findMany({
      where: { companyId: f.company.id, notes: { contains: `#${quote.number} ` } },
    });
    expect(packages).toHaveLength(1);
    expect(packages[0]).toMatchObject({ sessionsTotal: 8, sessionsUsed: 0 });
    expect(Number(packages[0].price)).toBe(960);
    // Pacote "a lançar": nenhuma cobrança nem fiado criado.
    expect(await prisma.transaction.count({ where: { clientPackageId: packages[0].id } })).toBe(0);
    // Convertido não muda nem cancela.
    await expect(
      updateQuote({
        companyId: f.company.id,
        timezone: tz,
        userId: 'u',
        id: quote.id,
        expectedVersion: 1,
        input: eight(10),
      }),
    ).rejects.toThrow(/já foi convertido/);
    await expect(cancelQuote(f.company.id, 'u', quote.id)).rejects.toThrow(/convertido/);
  });

  it('duplica, cancela e cria tarefa de acompanhamento', async () => {
    const quote = await createQuote({
      companyId: f.company.id,
      timezone: tz,
      userId: 'u',
      input: eight(),
    });
    const copy = await duplicateQuote({
      companyId: f.company.id,
      timezone: tz,
      userId: 'u',
      id: quote.id,
    });
    expect(copy.status).toBe('DRAFT');
    expect(copy.title).toContain('(cópia)');
    const { task, created } = await createQuoteFollowUp({
      companyId: f.company.id,
      userId: 'u',
      id: quote.id,
      dueAt: null,
    });
    expect(created).toBe(true);
    expect(task.quoteId).toBe(quote.id);
    await cancelQuote(f.company.id, 'u', quote.id);
    expect((await getQuoteDetail(f.company.id, quote.id, tz)).status).toBe('CANCELED');
  });
});

function eightItems() {
  return [
    {
      kind: 'service' as const,
      refId: 'svc',
      description: 'x',
      quantity: 1,
      sessions: 8,
      unitPrice: 960,
      discount: 0,
    },
  ];
}
