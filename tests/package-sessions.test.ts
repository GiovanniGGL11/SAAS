import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { prisma } from '@/lib/db';
import {
  cancelAppointment,
  checkoutAppointment,
  createAppointment,
  updateAppointmentStatus,
} from '@/server/data/appointments';
import { NO_GRANT, resolveFormAccess } from '@/server/data/form-permissions';
import { requestEntry, saveTemplate } from '@/server/data/forms';
import {
  PackageUnavailableError,
  adjustPackage,
  createClientPackage,
  finalizeSessionRecord,
  getClientPackagesDetail,
  getSessionRecord,
  getSessionRecordForExport,
  listClientSessions,
  receivePackagePayment,
  saveSessionRecord,
  sessionContentHash,
  signSessionRecord,
} from '@/server/data/package-sessions';
import { createTestCompany, deleteTestCompany } from './helpers';

/*
  Aceitação dos pacotes de sessões. Cenários e nomes fictícios ("Alberto", "clareamento" são só
  rótulos de teste); a assinatura é uma imagem de mentira — o servidor não decodifica a figura.
*/

const FAKE_SIGNATURE = `data:image/png;base64,${'iVBORw0KGgo'.padEnd(2400, 'A')}`;
const professionalAccess = resolveFormAccess({
  userId: 'user_prof',
  isAdmin: false,
  grant: { ...NO_GRANT, canRead: true, canFill: true, canExport: true },
  professionalId: null,
});
const reception = resolveFormAccess({
  userId: 'user_rec',
  isAdmin: false,
  grant: null,
  professionalId: null,
});

describe('pacotes de sessões e registro por sessão', () => {
  let f: Awaited<ReturnType<typeof createTestCompany>>;
  let other: Awaited<ReturnType<typeof createTestCompany>>;
  let slot = 0;

  /** Um horário livre novo a cada chamada (2031, dias seguidos). */
  const nextStart = () => new Date(Date.UTC(2031, 0, 5 + slot++, 13, 0));

  const book = (clientPackageId: string | null) =>
    createAppointment({
      companyId: f.company.id,
      clientId: f.client.id,
      professionalId: f.professional.id,
      serviceId: f.service.id,
      startAt: nextStart(),
      clientPackageId,
      createdByUserId: 'user_rec',
    });

  const finish = (appointmentId: string, packageId?: string) =>
    checkoutAppointment({
      companyId: f.company.id,
      id: appointmentId,
      paymentMethod: 'PIX',
      packageId,
      updatedByUserId: 'user_prof',
    });

  const newPackage = (over: Partial<Parameters<typeof createClientPackage>[0]> = {}) =>
    createClientPackage({
      companyId: f.company.id,
      clientId: f.client.id,
      userId: 'user_admin',
      name: 'Pacote de teste',
      serviceId: f.service.id,
      sessionsTotal: 8,
      price: 800,
      contractedAt: new Date('2031-01-01T12:00:00Z'),
      requireSignature: true,
      payment: { kind: 'full', method: 'PIX' },
      ...over,
    });

  const detailOf = async (id: string) =>
    (await getClientPackagesDetail(f.company.id, f.client.id)).find((p) => p.id === id)!;

  beforeAll(async () => {
    f = await createTestCompany('pkg_a');
    other = await createTestCompany('pkg_b');
  });

  afterAll(async () => {
    await deleteTestCompany(f.company.id);
    await deleteTestCompany(other.company.id);
  });

  it('1/3: oito sessões, duas realizadas com registro e assinatura próprios → seis restantes', async () => {
    const pkg = await newPackage({ name: 'Tratamento Alberto (teste)' });
    const first = await book(pkg.id);
    const second = await book(pkg.id);
    // Agendar não consome.
    expect((await detailOf(pkg.id)).done).toBe(0);

    for (const [i, appointment] of [first, second].entries()) {
      await updateAppointmentStatus({
        companyId: f.company.id,
        id: appointment.id,
        status: 'IN_PROGRESS',
        updatedByUserId: 'user_prof',
      });
      // Iniciar também não consome.
      expect((await detailOf(pkg.id)).done).toBe(i);
      await finish(appointment.id, pkg.id);
      const content = { procedure: `Procedimento fictício da sessão ${i + 1}` };
      await saveSessionRecord({
        companyId: f.company.id,
        access: professionalAccess,
        appointmentId: appointment.id,
        content,
      });
      await signSessionRecord({
        companyId: f.company.id,
        access: professionalAccess,
        appointmentId: appointment.id,
        version: 1,
        contentHash: sessionContentHash(content),
        signerName: 'Alberto Teste',
        image: FAKE_SIGNATURE,
        strokes: 3,
      });
      await finalizeSessionRecord({
        companyId: f.company.id,
        access: professionalAccess,
        appointmentId: appointment.id,
      });
    }

    const detail = await detailOf(pkg.id);
    expect(detail).toMatchObject({ done: 2, remaining: 6, progress: '2 de 8' });
    expect(
      detail.movements.filter((m) => m.kind === 'CONSUME').map((m) => m.sessionNumber),
    ).toEqual([1, 2]);
    expect(
      detail.movements.every((m) => m.kind !== 'CONSUME' || m.record?.signature === 'signed'),
    ).toBe(true);

    const sessions = await listClientSessions(f.company.id, professionalAccess, f.client.id, {
      packageId: pkg.id,
    });
    expect(sessions.map((s) => s.package?.sessionNumber).sort()).toEqual([1, 2]);
    const signatures = await prisma.sessionSignature.findMany({
      where: { companyId: f.company.id },
    });
    expect(new Set(signatures.map((s) => s.recordId)).size).toBe(signatures.length);
  });

  it('2: três sessões pagas na contratação não geram cobranças novas a cada sessão', async () => {
    const pkg = await newPackage({
      name: 'Clareamento (teste)',
      sessionsTotal: 3,
      price: 900,
      requireSignature: false,
    });
    for (let i = 0; i < 3; i++) {
      const appointment = await book(pkg.id);
      await finish(appointment.id, pkg.id);
    }
    const detail = await detailOf(pkg.id);
    expect(detail.financial).toMatchObject({ status: 'PAID', paid: 900, pending: 0 });
    expect(detail).toMatchObject({ done: 3, remaining: 0 });
    // O único dinheiro do pacote é a venda; as sessões entram com valor zero.
    const income = await prisma.transaction.aggregate({
      where: { companyId: f.company.id, clientPackageId: pkg.id, status: 'PAID' },
      _sum: { amount: true },
    });
    expect(Number(income._sum.amount)).toBe(900);
    const sessionCharges = await prisma.transaction.findMany({
      where: {
        companyId: f.company.id,
        category: 'Atendimento',
        appointment: { packageMovements: { some: { clientPackageId: pkg.id } } },
      },
    });
    expect(sessionCharges.reduce((sum, t) => sum + Number(t.amount), 0)).toBe(0);
    await expect(
      receivePackagePayment({
        companyId: f.company.id,
        clientPackageId: pkg.id,
        amount: 10,
        method: 'PIX',
        userId: 'u',
      }),
    ).rejects.toThrow(/já está pago/);
    // Sem saldo: aviso e recusa.
    expect(detail.alerts).toContain('exhausted');
    await expect(book(pkg.id)).rejects.toBeInstanceOf(PackageUnavailableError);
  });

  it('4/5/6: cancelamento e falta não consomem; conclusão repetida e concorrente respeitam o saldo', async () => {
    const pkg = await newPackage({ sessionsTotal: 2, price: 200, requireSignature: false });
    const canceled = await book(pkg.id);
    await cancelAppointment({ companyId: f.company.id, id: canceled.id, canceledByUserId: 'u' });
    const noShow = await book(pkg.id);
    await updateAppointmentStatus({
      companyId: f.company.id,
      id: noShow.id,
      status: 'NO_SHOW',
      updatedByUserId: 'u',
    });
    expect((await detailOf(pkg.id)).done).toBe(0);

    const once = await book(pkg.id);
    await finish(once.id, pkg.id);
    await expect(finish(once.id, pkg.id)).rejects.toThrow(/já foi concluído/);
    expect((await detailOf(pkg.id)).done).toBe(1);

    // Última sessão disputada por dois atendimentos ao mesmo tempo: só um leva.
    const a = await book(pkg.id);
    const b = await book(null);
    const results = await Promise.allSettled([finish(a.id, pkg.id), finish(b.id, pkg.id)]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const detail = await detailOf(pkg.id);
    expect(detail.done).toBe(2);
    expect(detail.movements.filter((m) => m.kind === 'CONSUME')).toHaveLength(2);
    expect(
      (await prisma.clientPackage.findUniqueOrThrow({ where: { id: pkg.id } })).sessionsUsed,
    ).toBe(2);

    // Desfazer a conclusão devolve a sessão, e o livro registra o estorno.
    await updateAppointmentStatus({
      companyId: f.company.id,
      id: once.id,
      status: 'SCHEDULED',
      updatedByUserId: 'u',
    });
    const after = await detailOf(pkg.id);
    expect(after.done).toBe(1);
    expect(after.movements.map((m) => m.kind)).toEqual(['CONSUME', 'CONSUME', 'RESTORE']);
  });

  it('7: alteração depois de assinar preserva a versão assinada e pede nova assinatura', async () => {
    const pkg = await newPackage({ sessionsTotal: 4, price: 400 });
    const appointment = await book(pkg.id);
    await finish(appointment.id, pkg.id);
    const v1 = { procedure: 'Conteúdo original fictício', orientations: 'Orientação A' };
    await saveSessionRecord({
      companyId: f.company.id,
      access: professionalAccess,
      appointmentId: appointment.id,
      content: { ...v1, internalNotes: 'nota interna fictícia' },
    });
    // Assinatura exigida: não finaliza sem ela; vazia é recusada.
    await expect(
      finalizeSessionRecord({
        companyId: f.company.id,
        access: professionalAccess,
        appointmentId: appointment.id,
      }),
    ).rejects.toThrow(/assinatura/);
    await expect(
      signSessionRecord({
        companyId: f.company.id,
        access: professionalAccess,
        appointmentId: appointment.id,
        version: 1,
        contentHash: sessionContentHash(v1),
        signerName: 'Cliente Teste',
        image: 'data:image/png;base64,AAAA',
        strokes: 0,
      }),
    ).rejects.toThrow(/vazia/);
    // Observação interna fica fora do que o cliente confirma.
    const record = await getSessionRecord(f.company.id, professionalAccess, appointment.id);
    expect(record.record!.versions[0].contentHash).toBe(sessionContentHash(v1));

    await signSessionRecord({
      companyId: f.company.id,
      access: professionalAccess,
      appointmentId: appointment.id,
      version: 1,
      contentHash: sessionContentHash(v1),
      signerName: 'Cliente Teste',
      image: FAKE_SIGNATURE,
      strokes: 2,
    });
    await finalizeSessionRecord({
      companyId: f.company.id,
      access: professionalAccess,
      appointmentId: appointment.id,
    });

    await expect(
      saveSessionRecord({
        companyId: f.company.id,
        access: professionalAccess,
        appointmentId: appointment.id,
        content: { procedure: 'Conteúdo corrigido' },
      }),
    ).rejects.toThrow(/adendo/);
    await saveSessionRecord({
      companyId: f.company.id,
      access: professionalAccess,
      appointmentId: appointment.id,
      content: { procedure: 'Conteúdo corrigido' },
      amendmentReason: 'Correção de digitação',
    });
    const amended = await getSessionRecord(f.company.id, professionalAccess, appointment.id);
    expect(amended.record).toMatchObject({
      status: 'AMENDED',
      currentVersion: 2,
      signature: 'pending',
    });
    const original = amended.record!.versions.find((v) => v.version === 1)!;
    expect(original.content?.procedure).toBe('Conteúdo original fictício');
    expect(original.signature?.signerName).toBe('Cliente Teste');
    // A assinatura antiga não vale para a versão nova.
    await expect(
      signSessionRecord({
        companyId: f.company.id,
        access: professionalAccess,
        appointmentId: appointment.id,
        version: 2,
        contentHash: sessionContentHash(v1),
        signerName: 'Cliente Teste',
        image: FAKE_SIGNATURE,
        strokes: 2,
      }),
    ).rejects.toThrow(/mudou/);
  });

  it('8: pacote vencido não serve para agendar nem concluir', async () => {
    const pkg = await newPackage({
      sessionsTotal: 5,
      price: 500,
      contractedAt: new Date('2025-01-01T12:00:00Z'),
      validUntil: new Date('2025-06-01T12:00:00Z'),
    });
    expect((await detailOf(pkg.id)).alerts).toContain('expired');
    await expect(book(pkg.id)).rejects.toThrow(/vencido/);
    const loose = await book(null);
    await expect(finish(loose.id, pkg.id)).rejects.toThrow(/venceu/);
  });

  it('9: sem permissão não lê registro nem exporta; outra empresa não acessa', async () => {
    const pkg = await newPackage({ sessionsTotal: 2, price: 200, requireSignature: false });
    const appointment = await book(pkg.id);
    await finish(appointment.id, pkg.id);
    await saveSessionRecord({
      companyId: f.company.id,
      access: professionalAccess,
      appointmentId: appointment.id,
      content: { procedure: 'Texto sensível fictício' },
    });
    const asReception = await getSessionRecord(f.company.id, reception, appointment.id);
    expect(asReception.canSeeContent).toBe(false);
    expect(asReception.record!.versions[0].content).toBeNull();
    expect(JSON.stringify(asReception)).not.toContain('Texto sensível');
    await expect(
      getSessionRecordForExport(f.company.id, reception, appointment.id),
    ).rejects.toThrow(/permissão/);
    await expect(
      saveSessionRecord({
        companyId: f.company.id,
        access: reception,
        appointmentId: appointment.id,
        content: { procedure: 'x' },
      }),
    ).rejects.toThrow(/permissão/);
    await expect(
      getSessionRecord(other.company.id, professionalAccess, appointment.id),
    ).rejects.toThrow(/não encontrado/);
    expect(await getClientPackagesDetail(other.company.id, f.client.id)).toEqual([]);
  });

  it('11: saldo inicial não cria atendimentos, assinaturas nem lançamentos do passado', async () => {
    const appointmentsBefore = await prisma.appointment.count({
      where: { companyId: f.company.id },
    });
    const signaturesBefore = await prisma.sessionSignature.count({
      where: { companyId: f.company.id },
    });
    const pkg = await newPackage({
      name: 'Pacote anterior ao sistema',
      sessionsTotal: 10,
      price: 1000,
      opening: { sessionsDone: 4, paidAmount: 600 },
      payment: { kind: 'tab' },
    });
    const detail = await detailOf(pkg.id);
    expect(detail).toMatchObject({ done: 4, remaining: 6 });
    expect(detail.financial).toMatchObject({ paid: 600, pending: 400, status: 'PARTIAL' });
    expect(detail.movements.map((m) => m.kind)).toEqual(['OPENING_DONE']);
    expect(await prisma.appointment.count({ where: { companyId: f.company.id } })).toBe(
      appointmentsBefore,
    );
    expect(await prisma.sessionSignature.count({ where: { companyId: f.company.id } })).toBe(
      signaturesBefore,
    );
    const linked = await prisma.transaction.findMany({ where: { clientPackageId: pkg.id } });
    expect(linked.map((t) => [t.status, Number(t.amount)])).toEqual([['PENDING', 400]]);

    // Correção manual fica no livro, com motivo, sem passar do total.
    await adjustPackage({
      companyId: f.company.id,
      clientPackageId: pkg.id,
      delta: 1,
      reason: 'Sessão feita fora do sistema',
      userId: 'u',
    });
    await expect(
      adjustPackage({
        companyId: f.company.id,
        clientPackageId: pkg.id,
        delta: 20,
        reason: 'erro',
        userId: 'u',
      }),
    ).rejects.toThrow(/acima do total/);
    expect((await detailOf(pkg.id)).done).toBe(5);
  });

  it('12: fichas direto no cliente, com ou sem pacote', async () => {
    const tpl = await saveTemplate(
      f.company.id,
      null,
      {
        name: 'Acompanhamento (teste)',
        type: 'SERVICE_RECORD',
        fillableBy: 'PROFESSIONAL',
        renewal: 'EACH_VISIT',
        requirement: 'NONE',
        schema: {
          sections: [
            {
              id: 's',
              title: 'Sessão',
              audience: 'staff',
              questions: [{ id: 'q', type: 'long_text', title: 'Evolução', required: false }],
            },
          ],
        },
        serviceIds: [],
      },
      'user_admin',
    );
    const pkg = await newPackage({
      sessionsTotal: 2,
      price: 200,
      sessionFormTemplateId: tpl.id,
      requireSignature: false,
    });
    const loose = await requestEntry({
      companyId: f.company.id,
      userId: 'u',
      clientId: f.client.id,
      templateId: tpl.id,
      source: 'manual',
    });
    const withPackage = await requestEntry({
      companyId: f.company.id,
      userId: 'u',
      clientId: f.client.id,
      templateId: tpl.id,
      clientPackageId: pkg.id,
      source: 'manual',
      requestKey: `pkg:${pkg.id}:${tpl.id}`,
    });
    expect(loose.entry.clientPackageId).toBeNull();
    expect(withPackage.entry.clientPackageId).toBe(pkg.id);
    await expect(
      requestEntry({
        companyId: f.company.id,
        userId: 'u',
        clientId: f.client.id,
        templateId: tpl.id,
        clientPackageId: 'outro',
        source: 'manual',
      }),
    ).rejects.toThrow(/Pacote não encontrado/);
  });
});
