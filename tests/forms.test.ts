import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { prisma } from '@/lib/db';
import type { FormSchema } from '@/lib/forms/schema';
import { createAppointment, updateAppointmentStatus } from '@/server/data/appointments';
import { NO_GRANT, resolveFormAccess } from '@/server/data/form-permissions';
import {
  createEntryLink,
  createStarterAnamnesis,
  duplicateTemplate,
  getAppointmentForms,
  getEntryDetail,
  getEntryForExport,
  getPublicForm,
  getTemplate,
  listEntries,
  requestEntry,
  requestEntryUpdate,
  reviewEntry,
  revokeEntryLinks,
  saveEntryDraft,
  saveTemplate,
  setTemplateArchived,
  submitEntry,
  submitPublicForm,
} from '@/server/data/forms';
import { createTestCompany, deleteTestCompany } from './helpers';

/*
  Fichas e formulários com o banco. Tudo fictício: empresa, cliente e respostas de teste.
*/

const schema: FormSchema = {
  sections: [
    {
      id: 's1',
      title: 'Perguntas de teste',
      audience: 'any',
      questions: [
        { id: 'q_nome', type: 'short_text', title: 'Apelido', required: true },
        { id: 'q_sim', type: 'yes_no', title: 'Algo a relatar?', required: true },
        {
          id: 'q_qual',
          type: 'long_text',
          title: 'O quê?',
          required: true,
          showIf: { questionId: 'q_sim', optionId: 'yes' },
        },
      ],
    },
    {
      id: 's2',
      title: 'Interno',
      audience: 'staff',
      questions: [{ id: 'q_interno', type: 'long_text', title: 'Nota interna', required: false }],
    },
  ],
};

const reader = (userId: string) =>
  resolveFormAccess({
    userId,
    isAdmin: false,
    grant: {
      ...NO_GRANT,
      canRead: true,
      canFill: true,
      canReview: true,
      canExport: true,
      canAudit: true,
    },
    professionalId: null,
  });
const reception = resolveFormAccess({
  userId: 'user_recepcao',
  isAdmin: false,
  grant: null,
  professionalId: null,
});
const adminNoGrant = resolveFormAccess({
  userId: 'user_admin',
  isAdmin: true,
  grant: null,
  professionalId: null,
});

describe('fichas e formulários', () => {
  let a: Awaited<ReturnType<typeof createTestCompany>>;
  let b: Awaited<ReturnType<typeof createTestCompany>>;
  let secondServiceId: string;
  const staff = reader('user_profissional');

  const templateInput = (over: Partial<Parameters<typeof saveTemplate>[2]> = {}) => ({
    name: 'Avaliação de teste',
    type: 'ASSESSMENT' as const,
    fillableBy: 'BOTH' as const,
    renewal: 'ONCE' as const,
    requirement: 'NONE' as const,
    schema,
    serviceIds: [] as string[],
    ...over,
  });

  beforeAll(async () => {
    a = await createTestCompany('forms_a');
    b = await createTestCompany('forms_b');
    secondServiceId = (
      await prisma.service.create({
        data: {
          companyId: a.company.id,
          name: 'Serviço 2',
          durationMinutes: 30,
          price: 40,
          color: '#000000',
        },
      })
    ).id;
  });

  afterAll(async () => {
    await deleteTestCompany(a.company.id);
    await deleteTestCompany(b.company.id);
  });

  it('1/7: cria, edita (versão nova só quando muda o conteúdo), duplica e arquiva; ficha fica na versão dela', async () => {
    const created = await saveTemplate(a.company.id, null, templateInput(), 'user_admin');
    expect(created.version).toBe(1);
    const entry = await requestEntry({
      companyId: a.company.id,
      userId: 'user_admin',
      clientId: a.client.id,
      templateId: created.id,
      source: 'manual',
    });

    const renamed = await saveTemplate(
      a.company.id,
      created.id,
      templateInput({ name: 'Avaliação renomeada' }),
      'user_admin',
    );
    expect(renamed).toMatchObject({ version: 1, newVersion: false });

    const changedSchema = structuredClone(schema);
    changedSchema.sections[0].questions.push({
      id: 'q_novo',
      type: 'number',
      title: 'Número',
      required: false,
    });
    const edited = await saveTemplate(
      a.company.id,
      created.id,
      templateInput({ name: 'Avaliação renomeada', schema: changedSchema }),
      'user_admin',
    );
    expect(edited).toMatchObject({ version: 2, newVersion: true });

    const detail = await getEntryDetail(a.company.id, staff, entry.entry.id);
    expect(detail.version.number).toBe(1);
    expect(detail.version.isCurrent).toBe(false);
    expect(detail.version.schema.sections[0].questions.map((q) => q.id)).not.toContain('q_novo');
    expect(
      (await getTemplate(a.company.id, created.id, 1)).schema.sections[0].questions,
    ).toHaveLength(3);

    const copy = await duplicateTemplate(a.company.id, created.id, 'user_admin');
    const copied = await getTemplate(a.company.id, copy.id);
    expect(copied.name).toBe('Cópia de Avaliação renomeada');
    expect(copied.serviceIds).toEqual([]);

    await setTemplateArchived(a.company.id, created.id, true, 'user_admin');
    await expect(
      requestEntry({
        companyId: a.company.id,
        userId: 'u',
        clientId: a.client.id,
        templateId: created.id,
        source: 'manual',
      }),
    ).rejects.toThrow(/arquivado/);
    // As fichas do modelo arquivado continuam lá.
    expect((await getEntryDetail(a.company.id, staff, entry.entry.id)).id).toBe(entry.entry.id);
    await setTemplateArchived(a.company.id, created.id, false, 'user_admin');
  });

  it('modelo inicial de anamnese é criado sem serviços e sem exigência', async () => {
    const starter = await createStarterAnamnesis(a.company.id, 'user_admin');
    const tpl = await getTemplate(a.company.id, starter.id);
    expect(tpl).toMatchObject({ type: 'ANAMNESIS', requirement: 'NONE', serviceIds: [] });
  });

  it('5/6/8: rascunho, envio com revisão, correção com motivo, pedido de atualização com conferência', async () => {
    const tpl = await saveTemplate(
      a.company.id,
      null,
      templateInput({ name: 'Fluxo' }),
      'user_admin',
    );
    const { entry } = await requestEntry({
      companyId: a.company.id,
      userId: 'user_admin',
      clientId: a.client.id,
      templateId: tpl.id,
      source: 'manual',
    });
    // Rascunho: incompleto pode.
    await saveEntryDraft(a.company.id, staff, entry.id, { q_nome: 'Teste' });
    let detail = await getEntryDetail(a.company.id, staff, entry.id);
    expect(detail).toMatchObject({ status: 'DRAFT', answers: { q_nome: 'Teste' } });

    await expect(submitEntry(a.company.id, staff, entry.id, { q_nome: 'Teste' })).rejects.toThrow(
      /obrigat/,
    );
    await submitEntry(a.company.id, staff, entry.id, {
      q_nome: 'Teste',
      q_sim: 'no',
      q_qual: 'resposta escondida',
      q_interno: 'nota da equipe',
    });
    detail = await getEntryDetail(a.company.id, staff, entry.id);
    expect(detail.status).toBe('SUBMITTED');
    expect(detail.answers).not.toHaveProperty('q_qual');

    await reviewEntry(a.company.id, staff, entry.id, 'Observação interna fictícia');
    detail = await getEntryDetail(a.company.id, staff, entry.id);
    expect(detail).toMatchObject({
      status: 'REVIEWED',
      reviewNotes: 'Observação interna fictícia',
    });

    // Correção: precisa de motivo, cria revisão nova e guarda a anterior.
    await expect(
      submitEntry(a.company.id, staff, entry.id, { q_nome: 'Outro', q_sim: 'no' }),
    ).rejects.toThrow(/motivo/);
    await submitEntry(
      a.company.id,
      staff,
      entry.id,
      { q_nome: 'Outro', q_sim: 'no' },
      { reason: 'Digitação errada' },
    );
    const revisions = await prisma.formEntryRevision.findMany({
      where: { entryId: entry.id },
      orderBy: { revision: 'asc' },
    });
    expect(revisions.map((r) => (r.answers as Record<string, unknown>).q_nome)).toEqual([
      'Teste',
      'Outro',
    ]);
    expect((await getEntryDetail(a.company.id, staff, entry.id)).status).toBe('SUBMITTED');

    // Atualização: ficha nova com as respostas copiadas, que precisam ser conferidas.
    const update = await requestEntryUpdate(a.company.id, staff, entry.id);
    expect(update.created).toBe(true);
    const again = await requestEntryUpdate(a.company.id, staff, entry.id);
    expect(again.entry.id).toBe(update.entry.id);
    const updated = await getEntryDetail(a.company.id, staff, update.entry.id);
    expect(updated).toMatchObject({
      status: 'DRAFT',
      needsCheck: true,
      answers: { q_nome: 'Outro' },
    });
    await expect(
      submitEntry(a.company.id, staff, update.entry.id, { q_nome: 'Outro', q_sim: 'no' }),
    ).rejects.toThrow(/Confira/);
    await submitEntry(
      a.company.id,
      staff,
      update.entry.id,
      { q_nome: 'Outro', q_sim: 'no' },
      { confirmCopied: true },
    );
    // A anterior não foi tocada.
    expect((await getEntryDetail(a.company.id, staff, entry.id)).revision).toBe(2);

    // O histórico registra quem fez, sem o conteúdo das respostas.
    const logs = await prisma.auditLog.findMany({
      where: { companyId: a.company.id, entityType: 'FormEntry' },
    });
    const dump = JSON.stringify(logs.map((l) => l.metadata));
    expect(dump).not.toContain('Observação interna fictícia');
    expect(dump).not.toContain('nota da equipe');
    expect(dump).not.toContain('"Outro"');
  });

  it('9/10: modelo em dois serviços do mesmo atendimento vira uma ficha só; exigência no servidor', async () => {
    const tpl = await saveTemplate(
      a.company.id,
      null,
      templateInput({
        name: 'Exigida',
        renewal: 'EACH_VISIT',
        requirement: 'SUBMITTED',
        serviceIds: [a.service.id, secondServiceId],
      }),
      'user_admin',
    );
    const appointment = await createAppointment({
      companyId: a.company.id,
      clientId: a.client.id,
      professionalId: a.professional.id,
      serviceId: a.service.id,
      extraServiceIds: [secondServiceId],
      startAt: new Date('2031-03-03T13:00:00Z'),
      createdByUserId: 'user_admin',
    });
    let items = await getAppointmentForms(a.company.id, appointment.id, {
      ensure: false,
      userId: 'u',
    });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ templateId: tpl.id, entry: null, met: false });

    await expect(
      updateAppointmentStatus({
        companyId: a.company.id,
        id: appointment.id,
        status: 'IN_PROGRESS',
        updatedByUserId: 'u',
      }),
    ).rejects.toThrow(
      /Antes de iniciar o atendimento: a ficha "Exigida" precisa ser preenchida e enviada/,
    );

    // Pedir várias vezes (recarregar, dois cliques ao mesmo tempo) cria uma ficha só.
    await Promise.all([
      getAppointmentForms(a.company.id, appointment.id, { ensure: true, userId: 'u' }),
      getAppointmentForms(a.company.id, appointment.id, { ensure: true, userId: 'u' }),
    ]);
    items = await getAppointmentForms(a.company.id, appointment.id, { ensure: true, userId: 'u' });
    expect(await prisma.formEntry.count({ where: { templateId: tpl.id } })).toBe(1);

    await submitEntry(a.company.id, staff, items[0].entry!.id, { q_nome: 'Teste', q_sim: 'no' });
    const started = await updateAppointmentStatus({
      companyId: a.company.id,
      id: appointment.id,
      status: 'IN_PROGRESS',
      updatedByUserId: 'u',
    });
    expect(started.status).toBe('IN_PROGRESS');
    await setTemplateArchived(a.company.id, tpl.id, true, 'user_admin');
  });

  it('10/11: link do cliente — expira, é revogado, aceita um envio só e não mostra a parte interna', async () => {
    const tpl = await saveTemplate(
      a.company.id,
      null,
      templateInput({ name: 'Pelo link' }),
      'user_admin',
    );
    const { entry } = await requestEntry({
      companyId: a.company.id,
      userId: 'u',
      clientId: a.client.id,
      templateId: tpl.id,
      source: 'manual',
    });
    expect(await getPublicForm('curto')).toEqual({ ok: false, problem: 'invalid' });
    expect(await getPublicForm('x'.repeat(43))).toEqual({ ok: false, problem: 'invalid' });

    const first = await createEntryLink(a.company.id, reception, entry.id);
    const page = await getPublicForm(first.token);
    expect(page.ok).toBe(true);
    if (page.ok) expect(page.schema.sections.map((s) => s.id)).toEqual(['s1']);
    // Só o hash fica no banco.
    expect(await prisma.formAccessToken.count({ where: { tokenHash: first.token } })).toBe(0);

    const second = await createEntryLink(a.company.id, reception, entry.id);
    expect(await getPublicForm(first.token)).toEqual({ ok: false, problem: 'revoked' });
    await revokeEntryLinks(a.company.id, reception, entry.id);
    expect(await getPublicForm(second.token)).toEqual({ ok: false, problem: 'revoked' });

    const third = await createEntryLink(a.company.id, reception, entry.id);
    await prisma.formAccessToken.updateMany({
      where: { entryId: entry.id, revokedAt: null },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect(await getPublicForm(third.token)).toEqual({ ok: false, problem: 'expired' });

    const fourth = await createEntryLink(a.company.id, reception, entry.id);
    const invalid = await submitPublicForm(fourth.token, { q_nome: '' });
    expect(invalid.ok).toBe(false);
    const answers = {
      q_nome: 'Teste',
      q_sim: 'yes',
      q_qual: 'Relato fictício',
      q_interno: 'tentativa',
    };
    const results = await Promise.allSettled([
      submitPublicForm(fourth.token, answers),
      submitPublicForm(fourth.token, answers),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled' && r.value.ok)).toHaveLength(1);
    expect(await prisma.formEntryRevision.count({ where: { entryId: entry.id } })).toBe(1);
    expect(await getPublicForm(fourth.token)).toEqual({ ok: false, problem: 'used' });
    const sent = await getEntryDetail(a.company.id, staff, entry.id);
    expect(sent).toMatchObject({ status: 'SUBMITTED', filledBy: 'CLIENT' });
    expect(sent.answers).not.toHaveProperty('q_interno');
    await expect(createEntryLink(a.company.id, reception, entry.id)).rejects.toThrow(
      /já foi enviada/,
    );
  });

  it('12/13/14: outra empresa não acessa; sem permissão não lê nem exporta; recepção vê só status', async () => {
    const tpl = await saveTemplate(
      a.company.id,
      null,
      templateInput({ name: 'Isolada' }),
      'user_admin',
    );
    const { entry } = await requestEntry({
      companyId: a.company.id,
      userId: 'u',
      clientId: a.client.id,
      templateId: tpl.id,
      source: 'manual',
    });
    await submitEntry(a.company.id, staff, entry.id, { q_nome: 'Teste', q_sim: 'no' });

    await expect(getEntryDetail(b.company.id, staff, entry.id)).rejects.toThrow(
      'Ficha não encontrada.',
    );
    await expect(createEntryLink(b.company.id, staff, entry.id)).rejects.toThrow(
      'Ficha não encontrada.',
    );
    await expect(saveTemplate(b.company.id, tpl.id, templateInput(), 'user_b')).rejects.toThrow(
      /não encontrado/,
    );
    await expect(
      requestEntry({
        companyId: b.company.id,
        userId: 'u',
        clientId: a.client.id,
        templateId: tpl.id,
        source: 'manual',
      }),
    ).rejects.toThrow(/não encontrado/);

    for (const access of [reception, adminNoGrant]) {
      await expect(getEntryDetail(a.company.id, access, entry.id)).rejects.toThrow(/permissão/);
      await expect(getEntryForExport(a.company.id, access, entry.id)).rejects.toThrow(/permissão/);
      await expect(saveEntryDraft(a.company.id, access, entry.id, {})).rejects.toThrow(/permissão/);
    }
    const ownOther = resolveFormAccess({
      userId: 'user_outro',
      isAdmin: false,
      grant: { ...NO_GRANT, canRead: true, scope: 'OWN' },
      professionalId: 'outro_profissional',
    });
    await expect(getEntryDetail(a.company.id, ownOther, entry.id)).rejects.toThrow(/próprios/);

    const list = await listEntries(a.company.id, { clientId: a.client.id });
    const row = list.entries.find((e) => e.id === entry.id)!;
    expect(row.status).toBe('SUBMITTED');
    expect(JSON.stringify(row)).not.toContain('Teste');
    expect((await listEntries(b.company.id, {})).total).toBe(0);
  });
});
