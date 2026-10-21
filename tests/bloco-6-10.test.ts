import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { prisma } from '@/lib/db';
import { createAppointment, updateAppointmentStatus } from '@/server/data/appointments';
import {
  cancelReferral,
  createReferral,
  evaluateReferrals,
  grantReward,
  listReferrals,
} from '@/server/data/referrals';
import {
  convertQuoteToJob,
  createJob,
  listClientJobs,
  listJobStages,
  moveJob,
  updateJob,
} from '@/server/data/jobs';
import { approveQuote, createQuote, getQuoteDetail } from '@/server/data/quotes';
import { previewRule, runRule, saveRule, setRuleActive } from '@/server/automations/rules';
import { getAdvancedKpis } from '@/server/data/kpis';
import { createStarterTemplate } from '@/server/data/forms';
import { createReviewFollowUp } from '@/server/data/relationship';
import { createTestCompany, deleteTestCompany } from './helpers';

const tz = 'America/Sao_Paulo';
const PRO = {
  plan: 'pro',
  subscriptionStatus: 'ACTIVE' as const,
  currentPeriodEnd: new Date(Date.now() + 20 * 86_400_000),
};

describe('indicações, serviços em andamento, regras, indicadores, modelos e avaliações', () => {
  let f: Awaited<ReturnType<typeof createTestCompany>>;
  let other: Awaited<ReturnType<typeof createTestCompany>>;
  let referred: { id: string };
  const admin = { userId: 'user_admin', isAdmin: true };
  const member = { userId: 'user_member', isAdmin: false };

  beforeAll(async () => {
    f = await createTestCompany('b610_a');
    other = await createTestCompany('b610_b');
    await prisma.company.update({ where: { id: f.company.id }, data: PRO });
    referred = await prisma.client.create({
      data: {
        companyId: f.company.id,
        name: 'Indicado (teste)',
        phone: `+1777${Date.now().toString().slice(-7)}`,
      },
    });
  });
  afterAll(async () => {
    await deleteTestCompany(f.company.id);
    await deleteTestCompany(other.company.id);
  });

  it('indicação: sem autoindicação, sem duplicar; recompensa só depois da condição; desfazer volta a pendente', async () => {
    await expect(
      createReferral(f.company.id, 'u', {
        referrerId: f.client.id,
        referredId: f.client.id,
        condition: 'first_appointment_done',
      }),
    ).rejects.toThrow(/si mesmo/);
    const ref = await createReferral(f.company.id, 'u', {
      referrerId: f.client.id,
      referredId: referred.id,
      condition: 'first_appointment_done',
      rewardDescription: '10% no próximo',
    });
    await expect(
      createReferral(f.company.id, 'u', {
        referrerId: f.client.id,
        referredId: referred.id,
        condition: 'first_payment',
      }),
    ).rejects.toThrow(/já tem uma indicação/);
    await expect(
      createReferral(f.company.id, 'u', {
        referrerId: referred.id,
        referredId: f.client.id,
        condition: 'first_payment',
      }),
    ).rejects.toThrow(/cruzada/);
    await expect(grantReward(f.company.id, 'u', ref.id, 'cupom')).rejects.toThrow(/condição/);

    const appt = await createAppointment({
      companyId: f.company.id,
      clientId: referred.id,
      professionalId: f.professional.id,
      serviceId: f.service.id,
      startAt: new Date(Date.now() + 3_600_000),
      createdByUserId: 'u',
    });
    await updateAppointmentStatus({
      companyId: f.company.id,
      id: appt.id,
      status: 'DONE',
      updatedByUserId: 'u',
    });
    await evaluateReferrals(f.company.id);
    expect((await listReferrals(f.company.id))[0].status).toBe('QUALIFIED');
    // Conclusão desfeita antes da recompensa: volta a aguardar.
    await updateAppointmentStatus({
      companyId: f.company.id,
      id: appt.id,
      status: 'SCHEDULED',
      updatedByUserId: 'u',
    });
    await evaluateReferrals(f.company.id);
    expect((await listReferrals(f.company.id))[0].status).toBe('PENDING');
    await updateAppointmentStatus({
      companyId: f.company.id,
      id: appt.id,
      status: 'DONE',
      updatedByUserId: 'u',
    });
    await grantReward(f.company.id, 'u', ref.id, 'Cupom AMIGO10 criado');
    await expect(grantReward(f.company.id, 'u', ref.id, 'de novo')).rejects.toThrow();
    await expect(cancelReferral(f.company.id, 'u', ref.id, 'x')).rejects.toThrow(/não pode mais/);
    expect(
      await prisma.transaction.count({ where: { companyId: f.company.id, clientId: f.client.id } }),
    ).toBe(0);
  });

  it('serviço em andamento: do orçamento uma vez só; mover confere a etapa vista e o responsável; portal só o liberado', async () => {
    const quote = await createQuote({
      companyId: f.company.id,
      timezone: tz,
      userId: 'u',
      input: {
        clientId: f.client.id,
        title: 'Reforma (teste)',
        items: [
          {
            kind: 'custom',
            description: 'Demolição',
            quantity: 1,
            sessions: 1,
            unitPrice: 500,
            discount: 0,
          },
        ],
        discount: 0,
      },
    });
    const d = await getQuoteDetail(f.company.id, quote.id, tz);
    await approveQuote({
      companyId: f.company.id,
      userId: 'u',
      id: quote.id,
      version: 1,
      contentHash: d.current.contentHash,
    });
    const results = await Promise.allSettled([
      convertQuoteToJob(f.company.id, 'u', quote.id),
      convertQuoteToJob(f.company.id, 'u', quote.id),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const job = await prisma.job.findFirstOrThrow({
      where: { companyId: f.company.id, quoteId: quote.id },
    });
    expect(job.checklist).toEqual([expect.objectContaining({ text: 'Demolição', done: false })]);

    const stages = await listJobStages(f.company.id);
    const done = stages.find((s) => s.kind === 'DONE')!;
    await updateJob(f.company.id, admin, job.id, { ownerUserId: 'user_admin' });
    await expect(
      moveJob(f.company.id, member, job.id, { toStageId: done.id, fromStageId: job.stageId }),
    ).rejects.toThrow(/responsável/);
    await moveJob(f.company.id, admin, job.id, { toStageId: done.id, fromStageId: job.stageId });
    await expect(
      moveJob(f.company.id, admin, job.id, { toStageId: stages[0].id, fromStageId: job.stageId }),
    ).rejects.toThrow(/movido por outra pessoa/);
    // Concluir não lança nada no financeiro.
    expect(
      await prisma.transaction.count({
        where: { companyId: f.company.id, category: { not: 'x' } },
      }),
    ).toBe(0);

    expect(await listClientJobs(f.company.id, f.client.id)).toHaveLength(0);
    await updateJob(f.company.id, admin, job.id, {
      portalVisible: true,
      portalNote: 'Entrega na sexta',
    });
    const portal = await listClientJobs(f.company.id, f.client.id);
    expect(portal[0]).toEqual({
      id: job.id,
      title: 'Reforma (teste)',
      stage: 'Concluído',
      note: 'Entrega na sexta',
      dueAt: null,
      done: true,
    });
    expect(JSON.stringify(portal)).not.toMatch(/Do orçamento|ownerUserId|collaborator/);
    await expect(
      createJob(f.company.id, 'u', { clientId: other.client.id, title: 'x' }),
    ).rejects.toThrow(/Cliente não encontrado/);
  });

  it('regra: prévia não cria nada; executar não duplica; limite diário; pausa e plano bloqueiam', async () => {
    await prisma.quote.create({
      data: {
        companyId: f.company.id,
        clientId: f.client.id,
        number: 900,
        title: 'Antigo enviado',
        status: 'SENT',
        sentAt: new Date(Date.now() - 6 * 86_400_000),
        createdByUserId: 'u',
      },
    });
    const rule = await saveRule(f.company.id, 'u', {
      name: 'Sem resposta',
      trigger: 'quote_no_response',
      days: 5,
      action: 'create_task',
      maxPerDay: 1,
    });
    const preview = await previewRule(f.company.id, {
      id: rule.id,
      trigger: 'quote_no_response',
      days: 5,
    });
    expect(preview.length).toBeGreaterThan(0);
    const before = await prisma.task.count({ where: { companyId: f.company.id } });
    expect(await prisma.task.count({ where: { companyId: f.company.id } })).toBe(before);
    const first = await runRule(f.company.id, rule.id, 'manual');
    expect(first).toMatchObject({ status: 'COMPLETED' });
    expect(
      await prisma.task.count({
        where: { companyId: f.company.id, dedupeKey: { startsWith: `rule:${rule.id}:` } },
      }),
    ).toBe(1);
    expect(await runRule(f.company.id, rule.id, 'manual')).toMatchObject({
      status: 'SKIPPED',
      reason: /Limite diário/,
    });
    await setRuleActive(f.company.id, 'u', rule.id, false);
    expect(await runRule(f.company.id, rule.id, 'manual')).toMatchObject({
      status: 'SKIPPED',
      reason: /pausada/,
    });
    await setRuleActive(f.company.id, 'u', rule.id, true);
    await prisma.company.update({ where: { id: f.company.id }, data: { plan: 'profissional' } });
    expect(await runRule(f.company.id, rule.id, 'manual')).toMatchObject({
      status: 'SKIPPED',
      reason: /plano/,
    });
    await prisma.company.update({ where: { id: f.company.id }, data: PRO });
  });

  it('indicadores: fórmula e denominador; modelos genéricos; avaliação ruim vira uma tarefa só', async () => {
    const kpis = await getAdvancedKpis(f.company.id, 90);
    const quoteApproval = kpis.kpis.find((k) => k.key === 'quoteApproval')!;
    expect(quoteApproval.formula).toMatch(/÷/);
    expect(quoteApproval.denominator).toBeGreaterThanOrEqual(1);
    expect(quoteApproval.smallSample).toBe(true);
    expect(kpis.kpis.find((k) => k.key === 'pipeline')?.formula).toMatch(/não é receita/);

    const template = await createStarterTemplate(f.company.id, 'u', 'termo');
    expect((await prisma.formTemplate.findUniqueOrThrow({ where: { id: template.id } })).name).toBe(
      'Termo de ciência',
    );
    await expect(createStarterTemplate(f.company.id, 'u', 'inexistente')).rejects.toThrow(
      /não encontrado/,
    );

    const appt = await prisma.appointment.findFirstOrThrow({
      where: { companyId: f.company.id, status: 'DONE' },
    });
    const review = await prisma.review.create({
      data: {
        companyId: f.company.id,
        appointmentId: appt.id,
        clientId: appt.clientId,
        professionalId: appt.professionalId,
        rating: 2,
        comment: 'Demorou',
      },
    });
    expect(review.publicConsent).toBe(false);
    const t1 = await createReviewFollowUp(f.company.id, 'u', review.id);
    const t2 = await createReviewFollowUp(f.company.id, 'u', review.id);
    expect(t1.id).toBe(t2.id);
    expect(t1.priority).toBe('HIGH');
  });
});
