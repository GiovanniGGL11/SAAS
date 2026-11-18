import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { prisma } from '@/lib/db';
import { createAppointment } from '@/server/data/appointments';
import {
  createStarterAnamnesis,
  listWhatsappFormOptions,
  prepareFormForWhatsapp,
  getPublicForm,
} from '@/server/data/forms';
import { resolveFormAccess } from '@/server/data/form-permissions';
import {
  SIGNUP_INVITE_DAYS,
  completeSignupInvite,
  readSignupInvite,
  signSignupInvite,
} from '@/server/data/signup-invite';
import { createTestCompany, deleteTestCompany } from './helpers';

const prevSecret = process.env.BOOKING_LINK_SECRET;
process.env.BOOKING_LINK_SECRET = prevSecret || 'segredo-de-teste';

describe('convite "cadastro + ficha" (link assinado)', () => {
  const now = new Date('2030-03-01T12:00:00Z');

  it('vale 7 dias para a empresa e a ficha do convite', () => {
    const { token, expiresAt } = signSignupInvite('empresa1', 'ficha1', now);
    expect(SIGNUP_INVITE_DAYS).toBe(7);
    expect(expiresAt.toISOString()).toBe('2030-03-08T12:00:00.000Z');
    expect(readSignupInvite(token, now)).toMatchObject({
      companyId: 'empresa1',
      templateId: 'ficha1',
    });
  });

  it('link adulterado, de outra ficha ou vencido não vale', () => {
    const { token } = signSignupInvite('empresa1', 'ficha1', now);
    const [company, , exp, sig] = token.split('.');
    expect(readSignupInvite(`${company}.outraficha.${exp}.${sig}`, now)).toBeNull();
    expect(readSignupInvite(`${company}.ficha1.${Number(exp) + 999}.${sig}`, now)).toBeNull();
    expect(readSignupInvite(token, new Date('2030-03-09T00:00:00Z'))).toBeNull();
    expect(readSignupInvite('lixo', now)).toBeNull();
    expect(readSignupInvite(null, now)).toBeNull();
  });
});

describe('anamnese pelo WhatsApp (agenda e cadastro novo)', () => {
  let f: Awaited<ReturnType<typeof createTestCompany>>;
  let templateId: string;
  let appointmentId: string;
  const access = () =>
    resolveFormAccess({ userId: 'user_dono', isAdmin: true, grant: null, professionalId: null });

  beforeAll(async () => {
    f = await createTestCompany('form_wa');
    await prisma.company.update({
      where: { id: f.company.id },
      data: {
        plan: 'profissional',
        subscriptionStatus: 'ACTIVE',
        currentPeriodEnd: new Date(Date.now() + 20 * 86_400_000),
      },
    });
    await prisma.client.update({ where: { id: f.client.id }, data: { phone: '11988887777' } });
    const template = await createStarterAnamnesis(f.company.id, 'user_dono');
    templateId = template.id;
    const appointment = await createAppointment({
      companyId: f.company.id,
      clientId: f.client.id,
      professionalId: f.professional.id,
      serviceId: f.service.id,
      startAt: new Date(Date.now() + 2 * 86_400_000),
      createdByUserId: 'u',
    });
    appointmentId = appointment.id;
  }, 120_000);
  afterAll(async () => {
    process.env.BOOKING_LINK_SECRET = prevSecret;
    await deleteTestCompany(f.company.id);
  });

  it('a anamnese aparece no agendamento mesmo sem o serviço exigir', async () => {
    const { options } = await listWhatsappFormOptions(f.company.id, appointmentId);
    expect(options).toEqual([
      expect.objectContaining({ templateId, required: false, state: 'new' }),
    ]);
  });

  it('enviar pede a ficha uma vez só e gera o link; mandar de novo não duplica', async () => {
    const first = await prepareFormForWhatsapp(f.company.id, access(), appointmentId, templateId);
    expect(first.alreadyAnswered).toBe(false);
    const again = await prepareFormForWhatsapp(f.company.id, access(), appointmentId, templateId);
    expect(again.alreadyAnswered).toBe(false);
    if (first.alreadyAnswered || again.alreadyAnswered) throw new Error('inesperado');
    expect(again.entryId).toBe(first.entryId);
    expect(await prisma.formEntry.count({ where: { companyId: f.company.id, templateId } })).toBe(
      1,
    );
    // Só o link mais novo vale.
    expect((await getPublicForm(first.token)).ok).toBe(false);
    expect((await getPublicForm(again.token)).ok).toBe(true);
    const { options } = await listWhatsappFormOptions(f.company.id, appointmentId);
    expect(options[0].state).toBe('open');
  });

  it('cliente novo pelo convite: cadastra, pede a ficha e não duplica quem já é cliente', async () => {
    const { token } = signSignupInvite(f.company.id, templateId);
    const done = await completeSignupInvite(f.company.slug, token, {
      name: 'Paciente Nova (teste)',
      phone: '(21) 97777-6666',
    });
    expect(done.formToken).toBeTruthy();
    const created = await prisma.client.findFirstOrThrow({
      where: { companyId: f.company.id, name: 'Paciente Nova (teste)' },
    });
    expect(
      await prisma.formEntry.count({
        where: { companyId: f.company.id, clientId: created.id, templateId },
      }),
    ).toBe(1);
    const form = await getPublicForm(done.formToken!);
    expect(form.ok).toBe(true);

    // O mesmo número de novo (outro formato): não cria outro cliente.
    await completeSignupInvite(f.company.slug, token, {
      name: 'Outro nome',
      phone: '21977776666',
    });
    expect(
      await prisma.client.count({
        where: { companyId: f.company.id, phone: { endsWith: '77776666' } },
      }),
    ).toBe(1);

    // Convite com o endereço de outra empresa não vale.
    await expect(
      completeSignupInvite('outra-empresa', token, { name: 'X', phone: '21900000000' }),
    ).rejects.toThrow(/venceu ou não vale/);
  });

  it('não exige o "cadastro pelo link" ligado: o convite é a autorização', async () => {
    const company = await prisma.company.findUniqueOrThrow({ where: { id: f.company.id } });
    expect(company.selfSignupEnabled).toBe(false);
  });
});
