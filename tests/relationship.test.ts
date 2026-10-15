import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { prisma } from '@/lib/db';
import { checkoutAppointment, createAppointment } from '@/server/data/appointments';
import { createClient, updateClient } from '@/server/data/clients';
import {
  createCampaign,
  getCampaign,
  getReviewContext,
  getReviewSummary,
  listCampaigns,
  listTopReferrers,
  markCampaignSent,
  signReviewToken,
  submitReview,
  verifyReviewToken,
} from '@/server/data/relationship';
import { signAppointmentToken } from '@/server/data/public-booking';
import { createTestCompany, deleteTestCompany } from './helpers';

const TZ = 'America/Sao_Paulo';

describe('avaliações, campanhas e indicações', () => {
  let fixture: Awaited<ReturnType<typeof createTestCompany>>;
  let companyId: string;
  let slot = 0;

  beforeEach(async () => {
    fixture = await createTestCompany('rel');
    companyId = fixture.company.id;
  });
  afterEach(async () => {
    await deleteTestCompany(companyId);
  });

  const done = async (clientId = fixture.client.id) => {
    const a = await createAppointment({
      companyId,
      clientId,
      professionalId: fixture.professional.id,
      serviceId: fixture.service.id,
      startAt: new Date(Date.UTC(2030, 9, 1, 12 + slot++)),
      createdByUserId: 'user_test',
    });
    await checkoutAppointment({
      companyId,
      id: a.id,
      paymentMethod: 'PIX',
      updatedByUserId: 'user_test',
    });
    return a;
  };

  it('avaliação: link próprio (não vale o de confirmação), uma por atendimento, entra no resumo', async () => {
    const a = await done();
    const token = signReviewToken(a.id);
    expect(verifyReviewToken(token)).toBe(a.id);
    expect(verifyReviewToken(signAppointmentToken(a.id))).toBeNull();
    expect((await getReviewContext(token))?.review).toBeNull();

    await submitReview(token, 5, 'Adorei');
    await expect(submitReview(token, 1)).rejects.toThrow(/já avaliou/);
    const summary = await getReviewSummary(companyId);
    expect(summary).toMatchObject({ average: 5, count: 1 });
    expect(summary.byProfessional[fixture.professional.id]).toEqual({ average: 5, count: 1 });
  });

  it('campanha: só quem tem WhatsApp, mensagem personalizada e retorno medido', async () => {
    await prisma.client.update({
      where: { id: fixture.client.id },
      data: { isVip: true, name: 'Maria Souza' },
    });
    await prisma.client.create({ data: { companyId, name: 'Sem Fone', isVip: true } });
    const campaign = await createCampaign({
      companyId,
      timezone: TZ,
      name: 'VIPs',
      segment: 'vip',
      message: 'Oi, {nome}! Use {cupom}.',
      couponCode: 'volta10',
      userId: 'user_test',
    });
    const detail = await getCampaign(companyId, campaign.id);
    expect(detail.recipients.map((r) => r.text)).toEqual(['Oi, Maria! Use VOLTA10.']);

    await markCampaignSent(companyId, campaign.id, fixture.client.id);
    await done(); // marcou horário depois da mensagem
    const [row] = await listCampaigns(companyId);
    expect(row).toMatchObject({ recipients: 1, sent: 1, returned: 1 });
  });

  it('indicação: não indica a si mesmo e aparece no ranking com o gasto do indicado', async () => {
    const friend = await createClient(companyId, {
      name: 'Amiga',
      phone: '11955554444',
      referredById: fixture.client.id,
    });
    await expect(
      updateClient(companyId, fixture.client.id, {
        name: 'Client rel',
        referredById: fixture.client.id,
      }),
    ).rejects.toThrow(/a si mesmo/);
    await done(friend.id);
    const [top] = await listTopReferrers(companyId);
    expect(top).toMatchObject({ id: fixture.client.id, count: 1, revenue: 50 });
  });
});
