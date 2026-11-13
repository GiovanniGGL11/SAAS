import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { prisma } from '@/lib/db';
import { sendBillingNotices } from '@/server/billing/notices';
import { assertProfessionalSlots } from '@/server/billing/features';
import type { EmailMessage } from '@/server/email';
import { createTestCompany, deleteTestCompany } from './helpers';

vi.mock('@/server/team', () => ({
  listTeamMembers: async () => [
    { userId: 'u1', name: 'Dona', email: 'dona@studio.com', role: 'admin' },
    { userId: 'u2', name: 'Equipe', email: 'equipe@studio.com', role: 'member' },
  ],
}));

const day = 86_400_000;

describe('avisos de cobrança e limite de profissionais', () => {
  let fixture: Awaited<ReturnType<typeof createTestCompany>>;
  const sent: EmailMessage[] = [];
  const send = async (m: EmailMessage) => void sent.push(m);

  beforeEach(async () => {
    fixture = await createTestCompany('notices');
    process.env.ASAAS_API_KEY = '$aact_hmlg_chave_de_teste';
    sent.length = 0;
  });

  afterEach(async () => {
    delete process.env.ASAAS_API_KEY;
    delete process.env.BILLING_ENFORCE;
    await prisma.billingNotice.deleteMany({ where: { companyId: fixture.company.id } });
    await deleteTestCompany(fixture.company.id);
  });

  it('avisa o fim do teste uma vez só, só para administradores', async () => {
    const id = fixture.company.id;
    const now = new Date('2030-06-10T12:00:00Z');
    const run = (at: Date) => sendBillingNotices(send, 'https://app.test', at, [id]);
    await prisma.company.update({
      where: { id },
      data: { trialEndsAt: new Date(now.getTime() + 10 * day) },
    });
    expect(await run(now)).toEqual({ sent: 0, failed: 0 });

    await prisma.company.update({
      where: { id },
      data: { trialEndsAt: new Date(now.getTime() + 2 * day) },
    });
    expect(await run(now)).toEqual({ sent: 1, failed: 0 });
    expect(await run(now)).toEqual({ sent: 0, failed: 0 }); // repetido: não reenvia
    expect(sent.map((m) => m.to)).toEqual(['dona@studio.com']);
    expect(sent[0].text).toContain('https://app.test/assinatura');

    expect(await run(new Date(now.getTime() + 3 * day))).toEqual({ sent: 1, failed: 0 });
    expect(sent[1].subject).toBe('Seu teste do Atendafy terminou');

    // Sem a cobrança configurada, nada sai.
    delete process.env.ASAAS_API_KEY;
    expect(await run(now)).toEqual({ skipped: 'Cobrança não configurada.' });
  });

  it('avisa o atraso uma vez por período', async () => {
    const id = fixture.company.id;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ data: [] })),
    );
    await prisma.company.update({
      where: { id },
      data: {
        subscriptionStatus: 'PAST_DUE',
        asaasSubscriptionId: `sub_${id}`,
        currentPeriodEnd: new Date('2030-06-01T03:00:00Z'),
      },
    });
    const now = new Date('2030-06-03T12:00:00Z');
    expect(await sendBillingNotices(send, 'https://app.test', now, [id])).toEqual({
      sent: 1,
      failed: 0,
    });
    expect(await sendBillingNotices(send, 'https://app.test', now, [id])).toEqual({
      sent: 0,
      failed: 0,
    });
    expect(sent[0].subject).toBe('Pagamento do Atendafy em atraso');
    vi.unstubAllGlobals();
  });

  it('não deixa passar do limite de profissionais do plano', async () => {
    const id = fixture.company.id; // a empresa de teste já tem 1 profissional
    await prisma.company.update({
      where: { id },
      data: { plan: 'essencial', trialEndsAt: new Date(Date.now() + 5 * day) },
    });
    let company = await prisma.company.findUniqueOrThrow({ where: { id } });
    // Básico: só 1 — o 2º já não cabe, e a mensagem indica o Profissional.
    await expect(assertProfessionalSlots(company)).rejects.toThrow(
      /permite 1 profissional.*plano Profissional/,
    );
    await prisma.company.update({ where: { id }, data: { plan: 'profissional' } });
    company = await prisma.company.findUniqueOrThrow({ where: { id } });
    await assertProfessionalSlots(company, 2); // 3 no Profissional
    await expect(assertProfessionalSlots(company, 3)).rejects.toThrow(/até 3.*plano Pro/);
    await prisma.company.update({ where: { id }, data: { plan: 'pro' } });
    company = await prisma.company.findUniqueOrThrow({ where: { id } });
    await assertProfessionalSlots(company, 3); // 4 no Pro
    await expect(assertProfessionalSlots(company, 4)).rejects.toThrow(/até 4 profissionais\.$/);
  });
});
