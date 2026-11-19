import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { prisma } from '@/lib/db';
import {
  approveQuote,
  convertQuoteToPackage,
  createQuote,
  getQuoteDetail,
} from '@/server/data/quotes';
import {
  getTreatmentPlan,
  markProcedureDone,
  pendingSessions,
  undoProcedureDone,
} from '@/server/data/treatment-plan';
import { createTestCompany, deleteTestCompany } from './helpers';

/**
 * Plano de tratamento a partir de orçamentos aprovados (dados fictícios): harmonização com
 * preenchimento labial (2 sessões) + avaliação (item livre) + um produto (não é procedimento);
 * e outro orçamento de 4 limpezas convertido em pacote.
 */
describe('plano de tratamento', () => {
  let f: Awaited<ReturnType<typeof createTestCompany>>;
  let quoteId: string;
  let packageQuoteId: string;
  const tz = 'America/Sao_Paulo';

  async function approved(input: Parameters<typeof createQuote>[0]['input']) {
    const quote = await createQuote({ companyId: f.company.id, timezone: tz, userId: 'u', input });
    const detail = await getQuoteDetail(f.company.id, quote.id, tz);
    await approveQuote({
      companyId: f.company.id,
      userId: 'u',
      id: quote.id,
      version: 1,
      contentHash: detail.current.contentHash,
    });
    return quote.id;
  }

  beforeAll(async () => {
    f = await createTestCompany('plano');
    const product = await prisma.product.create({
      data: {
        companyId: f.company.id,
        name: 'Protetor',
        costPrice: 10,
        salePrice: 50,
        quantity: 5,
      },
    });
    quoteId = await approved({
      clientId: f.client.id,
      title: 'Harmonização (teste)',
      items: [
        {
          kind: 'service',
          refId: f.service.id,
          description: 'Preenchimento labial',
          quantity: 1,
          sessions: 2,
          unitPrice: 900,
          discount: 0,
        },
        {
          kind: 'custom',
          description: 'Avaliação de retorno',
          quantity: 1,
          sessions: 1,
          unitPrice: 0,
          discount: 0,
        },
        {
          kind: 'product',
          refId: product.id,
          description: 'Protetor',
          quantity: 1,
          sessions: 1,
          unitPrice: 50,
          discount: 0,
        },
      ],
      discount: 0,
    } as never);
    packageQuoteId = await approved({
      clientId: f.client.id,
      title: 'Limpezas (teste)',
      items: [
        {
          kind: 'service',
          refId: f.service.id,
          description: 'Limpeza de pele',
          quantity: 1,
          sessions: 4,
          unitPrice: 400,
          discount: 0,
        },
      ],
      discount: 0,
    } as never);
    await convertQuoteToPackage({
      companyId: f.company.id,
      timezone: tz,
      userId: 'u',
      id: packageQuoteId,
    });
  }, 120_000);
  afterAll(async () => {
    await deleteTestCompany(f.company.id);
  });

  it('mostra os procedimentos aprovados (sem o produto) com as sessões', async () => {
    const plan = await getTreatmentPlan(f.company.id, f.client.id);
    const harmonizacao = plan.find((q) => q.quoteId === quoteId)!;
    expect(harmonizacao.items.map((i) => [i.description, i.total, i.done])).toEqual([
      ['Preenchimento labial', 2, 0],
      ['Avaliação de retorno', 1, 0],
    ]);
    const pacote = plan.find((q) => q.quoteId === packageQuoteId)!;
    expect(pacote.packageName).toBeTruthy();
    expect(pacote.items[0]).toMatchObject({ viaPackage: true, total: 4, done: 0 });
    expect(pendingSessions(plan)).toBe(7);
  });

  it('marca sessão até o total, desfaz, e não deixa marcar o que virou pacote', async () => {
    const base = { companyId: f.company.id, clientId: f.client.id, userId: 'u', userName: 'Dona' };
    const first = await markProcedureDone({
      ...base,
      quoteId,
      itemIndex: 0,
      note: 'Lábio superior',
    });
    expect(first).toMatchObject({ done: 1, total: 2 });
    await markProcedureDone({ ...base, quoteId, itemIndex: 0 });
    await expect(markProcedureDone({ ...base, quoteId, itemIndex: 0 })).rejects.toThrow(
      /já foram feitas/,
    );
    await expect(markProcedureDone({ ...base, quoteId, itemIndex: 2 })).rejects.toThrow(
      /não encontrado/,
    );
    await expect(
      markProcedureDone({ ...base, quoteId: packageQuoteId, itemIndex: 0 }),
    ).rejects.toThrow(/virou pacote/);

    let plan = await getTreatmentPlan(f.company.id, f.client.id);
    const item = plan.find((q) => q.quoteId === quoteId)!.items[0];
    expect(item.done).toBe(2);
    expect(item.history.map((h) => h.note)).toContain('Lábio superior');

    await undoProcedureDone(f.company.id, f.client.id, first.id, 'u');
    plan = await getTreatmentPlan(f.company.id, f.client.id);
    expect(plan.find((q) => q.quoteId === quoteId)!.items[0].done).toBe(1);
  });

  it('não marca procedimento de orçamento de outra empresa', async () => {
    const other = await createTestCompany('plano_outra');
    try {
      await expect(
        markProcedureDone({
          companyId: other.company.id,
          clientId: f.client.id,
          quoteId,
          itemIndex: 0,
          userId: 'x',
          userName: 'X',
        }),
      ).rejects.toThrow(/não encontrado/);
    } finally {
      await deleteTestCompany(other.company.id);
    }
  });
});
