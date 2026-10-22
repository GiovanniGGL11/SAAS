import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { prisma } from '@/lib/db';
import { sealSecret } from '@/server/secret-box';
import { getTodayInTz } from '@/lib/time';
import {
  getOptOutContext,
  optOutUrl,
  setMarketingOptOut,
  setOptOutByToken,
  signOptOutToken,
  verifyOptOutToken,
} from '@/server/data/marketing-consent';
import {
  createCampaign,
  getCampaign,
  segmentAllClients,
  segmentClients,
} from '@/server/data/relationship';
import { runDailyWhatsapp } from '@/server/whatsapp/automation';
import { createTestCompany, deleteTestCompany } from './helpers';

const TZ = 'America/Sao_Paulo';

describe('marketing: quem pediu para sair não recebe promoções', () => {
  let f: Awaited<ReturnType<typeof createTestCompany>>;
  let other: { id: string };
  const sent: { phone: string; message: string }[] = [];

  beforeAll(async () => {
    f = await createTestCompany('marketing');
    await prisma.client.update({
      where: { id: f.client.id },
      data: { phone: '11988887777' },
    });
    other = await prisma.client.create({
      data: { companyId: f.company.id, name: 'Bruna Teste', phone: '11977776666' },
    });
  });
  afterAll(async () => {
    vi.unstubAllGlobals();
    await deleteTestCompany(f.company.id);
  });

  it('link assinado: só abre para o próprio cliente; adulterado não vale', async () => {
    const token = signOptOutToken(f.client.id);
    expect(verifyOptOutToken(token)).toBe(f.client.id);
    expect(verifyOptOutToken(`${other.id}.${token.split('.')[1]}`)).toBeNull();
    expect(optOutUrl('https://app.test/', f.client.id)).toBe(
      `https://app.test/descadastrar/${token}`,
    );
    expect(await getOptOutContext('x.y')).toBeNull();
  });

  it('segmento e campanha deixam de fora; pedir depois de criada também vale; o texto leva o link', async () => {
    await setOptOutByToken(signOptOutToken(other.id), true);
    expect(await getOptOutContext(signOptOutToken(other.id))).toMatchObject({
      clientFirstName: 'Bruna',
      optedOut: true,
    });
    const ids = (await segmentClients(f.company.id, 'all', TZ)).map((c) => c.id);
    expect(ids).toContain(f.client.id);
    expect(ids).not.toContain(other.id);
    expect((await segmentAllClients(f.company.id, 'all', TZ)).map((c) => c.id)).toContain(other.id);

    // Volta a aceitar, entra na campanha; depois sai de novo: a campanha já criada respeita.
    await setOptOutByToken(signOptOutToken(other.id), false);
    const campaign = await createCampaign({
      companyId: f.company.id,
      timezone: TZ,
      name: 'Promo (teste)',
      segment: 'all',
      message: 'Oi {nome}, 10% esta semana!',
      userId: 'u',
    });
    await setMarketingOptOut(f.company.id, other.id, true, 'user_staff');
    const detail = await getCampaign(f.company.id, campaign.id, 'https://app.test');
    const byId = Object.fromEntries(detail.recipients.map((r) => [r.clientId, r]));
    expect(byId[other.id].optedOut).toBe(true);
    expect(byId[f.client.id].optedOut).toBe(false);
    expect(byId[f.client.id].text).toContain(optOutUrl('https://app.test', f.client.id));

    const audit = await prisma.auditLog.findMany({
      where: { companyId: f.company.id, entityId: other.id, entityType: 'Client' },
      select: { userId: true },
      orderBy: { createdAt: 'asc' },
    });
    expect(audit.map((a) => a.userId)).toEqual(['client', 'client', 'user_staff']);
  });

  it('parabéns de aniversário: só para quem aceita, sempre com o link para sair', async () => {
    const today = getTodayInTz(TZ);
    const birthDate = new Date(Date.UTC(1990, today.month - 1, today.day));
    await prisma.client.updateMany({
      where: { id: { in: [f.client.id, other.id] } },
      data: { birthDate },
    });
    await prisma.company.update({
      where: { id: f.company.id },
      data: {
        zapiInstanceId: 'INSTANCIA-TESTE',
        zapiToken: sealSecret('TOKEN'),
        waAutoBirthday: true,
      },
    });
    // Nada sai de verdade: o envio é simulado.
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        sent.push(JSON.parse(String(init.body)));
        return new Response(JSON.stringify({ messageId: `m${sent.length}` }), { status: 200 });
      }),
    );
    const result = await runDailyWhatsapp('https://app.test', new Date(), f.company.id);
    expect(result.birthdays).toBe(1);
    expect(sent).toHaveLength(1);
    expect(sent[0].phone).toBe('5511988887777');
    expect(sent[0].message).toContain('/descadastrar/');
  });
});
