import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { prisma } from '@/lib/db';
import { featureAccessFor } from '@/server/billing/features';
import { resolveFormAccess } from '@/server/data/form-permissions';
import { createAppointment, cancelAppointment } from '@/server/data/appointments';
import { createClientPackage } from '@/server/data/package-sessions';
import {
  getAppointmentOverview,
  recordExtraMaterial,
  setChecklistItem,
} from '@/server/data/appointment-overview';
import { getPortalExtras, updateOwnProfile } from '@/server/data/client-portal';
import { createTestCompany, deleteTestCompany } from './helpers';

const active = (plan: string) => ({
  plan,
  subscriptionStatus: 'ACTIVE' as const,
  trialEndsAt: null,
  currentPeriodEnd: new Date(Date.now() + 20 * 86_400_000),
});

describe('plano: direito comercial das funcionalidades novas', () => {
  it('Básico não tem orçamentos, área ampliada, convites nem rotinas; Profissional tem o manual; Pro tem as rotinas', () => {
    const basic = featureAccessFor(active('essencial')).features;
    const pro = featureAccessFor(active('profissional')).features;
    const top = featureAccessFor(active('pro')).features;
    for (const key of ['quotes', 'clientPortal', 'waitlistInvites', 'checklists'] as const) {
      expect(basic[key]).toBe(false);
      expect(pro[key]).toBe(true);
    }
    for (const key of ['waitlistAutomation', 'packageRenewal', 'automationResults'] as const) {
      expect(pro[key]).toBe(false);
      expect(top[key]).toBe(true);
    }
    // Básico mantém o que já tinha (agenda, caixa, estoque).
    expect(basic.agenda && basic.cashier && basic.stock).toBe(true);
  });
});

describe('visão do atendimento e área do cliente', () => {
  let f: Awaited<ReturnType<typeof createTestCompany>>;
  let other: Awaited<ReturnType<typeof createTestCompany>>;
  let appointmentId: string;
  let packageId: string;
  const noGrant = resolveFormAccess({
    userId: 'm',
    isAdmin: false,
    grant: null,
    professionalId: null,
  });
  const reader = resolveFormAccess({
    userId: 'r',
    isAdmin: false,
    grant: {
      canManage: false,
      canRequest: false,
      canRead: true,
      canFill: false,
      canReview: false,
      canExport: false,
      canAudit: false,
      scope: 'ALL',
    },
    professionalId: null,
  });
  const features = { checklists: true, quotes: true };

  beforeAll(async () => {
    f = await createTestCompany('e1_a');
    other = await createTestCompany('e1_b');
    await prisma.company.update({
      where: { id: f.company.id },
      data: {
        plan: 'profissional',
        subscriptionStatus: 'ACTIVE',
        currentPeriodEnd: new Date(Date.now() + 20 * 86_400_000),
      },
    });
    await prisma.company.update({
      where: { id: other.company.id },
      data: {
        plan: 'essencial',
        subscriptionStatus: 'ACTIVE',
        currentPeriodEnd: new Date(Date.now() + 20 * 86_400_000),
      },
    });
    await prisma.service.update({
      where: { id: f.service.id },
      data: { checklistItems: ['Conferir alergias', 'Higienizar'] },
    });
    packageId = (
      await createClientPackage({
        companyId: f.company.id,
        clientId: f.client.id,
        userId: 'u',
        name: 'Pacote (teste)',
        serviceId: f.service.id,
        sessionsTotal: 4,
        price: 400,
        contractedAt: new Date(),
        requireSignature: false,
        payment: { kind: 'later' },
      })
    ).id;
    appointmentId = (
      await createAppointment({
        companyId: f.company.id,
        clientId: f.client.id,
        professionalId: f.professional.id,
        serviceId: f.service.id,
        startAt: new Date(Date.UTC(2033, 2, 10, 13)),
        clientPackageId: packageId,
        createdByUserId: 'u',
      })
    ).id;
  });

  afterAll(async () => {
    await deleteTestCompany(f.company.id);
    await deleteTestCompany(other.company.id);
  });

  it('agendar não consome sessão; clínico e financeiro dependem de permissões separadas', async () => {
    const member = await getAppointmentOverview(f.company.id, appointmentId, {
      isAdmin: false,
      access: noGrant,
      features,
    });
    expect(member.package).toMatchObject({ done: 0, remaining: 4, sessionNumber: null });
    expect(member.package?.financial).toBeNull();
    expect(member.financial).toBeNull();
    expect(member.clinical).toBeNull();

    const clinician = await getAppointmentOverview(f.company.id, appointmentId, {
      isAdmin: false,
      access: reader,
      features,
    });
    expect(clinician.clinical).not.toBeNull();
    expect(clinician.financial).toBeNull();

    const admin = await getAppointmentOverview(f.company.id, appointmentId, {
      isAdmin: true,
      access: noGrant,
      features,
    });
    expect(admin.financial).not.toBeNull();
    expect(admin.package?.financial).toMatchObject({ unbilled: 400 });
    expect(admin.clinical).toBeNull();

    await expect(
      getAppointmentOverview(other.company.id, appointmentId, {
        isAdmin: true,
        access: reader,
        features,
      }),
    ).rejects.toThrow(/não encontrado/);
  });

  it('checklist: só itens do serviço, sem duplicar; material extra baixa e não volta ao cancelar', async () => {
    await setChecklistItem({
      companyId: f.company.id,
      userId: 'u',
      appointmentId,
      item: 'Higienizar',
      checked: true,
    });
    await setChecklistItem({
      companyId: f.company.id,
      userId: 'u',
      appointmentId,
      item: 'Higienizar',
      checked: true,
    });
    await expect(
      setChecklistItem({
        companyId: f.company.id,
        userId: 'u',
        appointmentId,
        item: 'Outro',
        checked: true,
      }),
    ).rejects.toThrow(/não está no checklist/);
    const view = await getAppointmentOverview(f.company.id, appointmentId, {
      isAdmin: false,
      access: noGrant,
      features,
    });
    expect(view.checklist?.checked).toEqual(['Higienizar']);

    const product = await prisma.product.create({
      data: {
        companyId: f.company.id,
        name: 'Algodão (teste)',
        costPrice: 1,
        salePrice: 2,
        quantity: 3,
      },
    });
    await recordExtraMaterial({
      companyId: f.company.id,
      userId: 'u',
      appointmentId,
      productId: product.id,
      quantity: 2,
    });
    await expect(
      recordExtraMaterial({
        companyId: f.company.id,
        userId: 'u',
        appointmentId,
        productId: product.id,
        quantity: 5,
      }),
    ).rejects.toThrow(/insuficiente/);
    const extra = await createAppointment({
      companyId: f.company.id,
      clientId: f.client.id,
      professionalId: f.professional.id,
      serviceId: f.service.id,
      startAt: new Date(Date.UTC(2033, 2, 11, 13)),
      createdByUserId: 'u',
    });
    await recordExtraMaterial({
      companyId: f.company.id,
      userId: 'u',
      appointmentId: extra.id,
      productId: product.id,
      quantity: 1,
    });
    await cancelAppointment({ companyId: f.company.id, id: extra.id, canceledByUserId: 'u' });
    expect((await prisma.product.findUniqueOrThrow({ where: { id: product.id } })).quantity).toBe(
      0,
    );
  });

  it('área do cliente: só no plano que inclui, só os dados do próprio cliente; telefone não muda', async () => {
    const session = { id: f.client.id, name: f.client.name, company: { ...f.company } };
    const extras = await getPortalExtras(session as never);
    expect(extras?.packages.map((p) => p.id)).toEqual([packageId]);
    expect(JSON.stringify(extras)).not.toMatch(/price|sessionValue|commission/);

    const basicSession = {
      id: other.client.id,
      name: other.client.name,
      company: { ...other.company },
    };
    expect(await getPortalExtras(basicSession as never)).toBeNull();
    await expect(updateOwnProfile(basicSession as never, { email: 'a@b.co' })).rejects.toThrow(
      /não está disponível/,
    );

    await updateOwnProfile(session as never, {
      email: 'cliente@exemplo.com',
      city: 'Cidade Teste',
      // Campo fora da lista permitida é ignorado.
      ...({ phone: '+5511999999999' } as object),
    });
    const client = await prisma.client.findUniqueOrThrow({ where: { id: f.client.id } });
    expect(client.email).toBe('cliente@exemplo.com');
    expect(client.phone).toBe(f.client.phone);
    await expect(updateOwnProfile(session as never, { email: 'inválido' })).rejects.toThrow(
      /E-mail/,
    );
  });
});
