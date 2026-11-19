import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { prisma } from '@/lib/db';
import {
  ageOn,
  evolutionTemplates,
  isMedicalSegment,
  medicalRecordsEnabled,
} from '@/lib/medical-records';
import { parseFormSchema } from '@/lib/forms/schema';
import { STARTER_ANAMNESIS_SCHEMA } from '@/lib/forms/starter';
import {
  createStarterAnamnesis,
  requestEntry,
  saveEntryDraft,
  submitEntry,
} from '@/server/data/forms';
import { resolveFormAccess } from '@/server/data/form-permissions';
import {
  createClinicalNote,
  getMedicalRecordHeader,
  getRecordAlerts,
  listClinicalNotes,
} from '@/server/data/medical-records';
import { createTestCompany, deleteTestCompany } from './helpers';

describe('prontuário por ramo (regras)', () => {
  it('liga sozinho em saúde, estética e odonto; Configurações manda', () => {
    expect(isMedicalSegment('odonto')).toBe(true);
    expect(isMedicalSegment('estetica')).toBe(true);
    expect(isMedicalSegment('barbearia')).toBe(false);
    expect(medicalRecordsEnabled({ segment: 'barbearia' })).toBe(false);
    expect(medicalRecordsEnabled({ segment: 'barbearia', medicalRecordsMode: 'on' })).toBe(true);
    expect(medicalRecordsEnabled({ segment: 'odonto', medicalRecordsMode: 'off' })).toBe(false);
    expect(medicalRecordsEnabled({ segment: null })).toBe(false);
  });

  it('modelos de evolução por ramo, sempre com a evolução geral', () => {
    expect(evolutionTemplates('odonto').map((t) => t.key)).toEqual(['odonto', 'geral']);
    expect(evolutionTemplates('cilios')[0].key).toBe('estetica');
    expect(evolutionTemplates('barbearia').map((t) => t.key)).toEqual(['geral']);
  });

  it('idade em anos completos', () => {
    const now = new Date('2030-06-10T12:00:00Z');
    expect(ageOn('2000-06-10', now)).toBe(30);
    expect(ageOn('2000-06-11', now)).toBe(29);
    expect(ageOn(null, now)).toBeNull();
  });

  it('a anamnese inicial marca alergia, medicamentos e condições como alerta', () => {
    const schema = parseFormSchema(STARTER_ANAMNESIS_SCHEMA);
    const flagged = schema.sections.flatMap((s) =>
      s.questions.filter((q) => q.alert).map((q) => q.id),
    );
    expect(flagged).toEqual(['q_alergia', 'q_medicamentos', 'q_condicoes']);
  });
});

describe('prontuário no banco', () => {
  let f: Awaited<ReturnType<typeof createTestCompany>>;
  const admin = () =>
    resolveFormAccess({ userId: 'user_dono', isAdmin: true, grant: null, professionalId: null });

  beforeAll(async () => {
    f = await createTestCompany('prontuario');
    await prisma.company.update({
      where: { id: f.company.id },
      data: {
        segment: 'estetica',
        plan: 'profissional',
        subscriptionStatus: 'ACTIVE',
        currentPeriodEnd: new Date(Date.now() + 20 * 86_400_000),
      },
    });
    await prisma.client.update({
      where: { id: f.client.id },
      data: { birthDate: new Date('1990-01-15T00:00:00Z') },
    });
  }, 120_000);
  afterAll(async () => {
    await deleteTestCompany(f.company.id);
  });

  it('alertas da anamnese respondida: alergia com o "Quais?", medicamento e condição', async () => {
    const template = await createStarterAnamnesis(f.company.id, 'user_dono');
    const { entry } = await requestEntry(
      {
        companyId: f.company.id,
        userId: 'user_dono',
        clientId: f.client.id,
        templateId: template.id,
        source: 'manual',
      },
      admin(),
    );
    const answers = {
      q_alergia: 'yes',
      q_alergia_quais: 'Dipirona e látex',
      q_medicamentos: 'no',
      q_condicoes: 'Hipertensão controlada',
      q_adicionais: 'nada',
      q_declaracao: 'yes',
    };
    await saveEntryDraft(f.company.id, admin(), entry.id, answers as never);
    await submitEntry(f.company.id, admin(), entry.id, answers as never);

    const alerts = await getRecordAlerts(f.company.id, f.client.id);
    expect(alerts.map((a) => a.detail)).toEqual(['Dipirona e látex', 'Hipertensão controlada']);
    expect(alerts[0].label).toBe('Alergias e reações relatadas');
  });

  it('evolução não se apaga: retificar cria outra e marca a anterior; não retifica duas vezes', async () => {
    const first = await createClinicalNote({
      companyId: f.company.id,
      clientId: f.client.id,
      text: 'Limpeza de pele. Pele oleosa na zona T.',
      authorUserId: 'user_dono',
      authorName: 'Dona',
    });
    const fixed = await createClinicalNote({
      companyId: f.company.id,
      clientId: f.client.id,
      text: 'Limpeza de pele. Pele mista, oleosa na zona T.',
      authorUserId: 'user_dono',
      authorName: 'Dona',
      amendsId: first.id,
    });
    await expect(
      createClinicalNote({
        companyId: f.company.id,
        clientId: f.client.id,
        text: 'Outra correção',
        authorUserId: 'user_dono',
        authorName: 'Dona',
        amendsId: first.id,
      }),
    ).rejects.toThrow(/já foi retificada/);

    const notes = await listClinicalNotes(f.company.id, f.client.id, admin());
    expect(notes).toHaveLength(2);
    const original = notes.find((n) => n.id === first.id)!;
    expect(original.amendedAt).not.toBeNull();
    expect(notes.find((n) => n.id === fixed.id)!.amendsId).toBe(first.id);

    const header = await getMedicalRecordHeader(f.company.id, f.client.id);
    expect(header.notesCount).toBe(2);
    expect(header.alerts.length).toBeGreaterThan(0);
  });

  it('não aceita evolução de paciente de outra empresa', async () => {
    const other = await createTestCompany('prontuario_outra');
    try {
      await expect(
        createClinicalNote({
          companyId: other.company.id,
          clientId: f.client.id,
          text: 'Tentativa',
          authorUserId: 'x',
          authorName: 'X',
        }),
      ).rejects.toThrow(/não encontrado/);
    } finally {
      await deleteTestCompany(other.company.id);
    }
  });
});
