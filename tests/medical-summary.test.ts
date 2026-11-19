import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { prisma } from '@/lib/db';
import { buildSummaryPrompt, hasSummaryContent, normalizeSummary } from '@/lib/medical-summary';
import { summarizeMedicalRecord, SUMMARY_UNITS } from '@/server/ai/medical-summary';
import { ADMIN_DEFAULT, type FormAccess } from '@/server/data/form-permissions';
import { createTestCompany, deleteTestCompany } from './helpers';

/** Dados fictícios. Nenhuma chamada sai para a IA de verdade (fetch trocado por um falso). */

const base = {
  age: 42,
  clientNotes: 'Prefere horários pela manhã.',
  alerts: [{ label: 'Alergias', detail: 'Dipirona' }],
  nextAppointment: null,
  lastVisit: { startAt: '2026-11-10T13:00:00Z', serviceName: 'Limpeza' },
  returnSuggestion: { serviceName: 'Limpeza', dueAt: '2026-11-01T00:00:00Z', daysLate: 17 },
  notes: [
    {
      text: 'Texto antigo errado',
      createdAt: '2026-11-01T12:00:00Z',
      amendsId: null,
      amendedAt: '2026-11-02T12:00:00Z',
    },
    {
      text: 'Texto corrigido: sensibilidade no dente 36.',
      createdAt: '2026-11-02T12:00:00Z',
      amendsId: 'x',
      amendedAt: null,
    },
  ],
  plan: [{ title: 'Orçamento 7', items: [{ description: 'Clareamento', total: 3, done: 2 }] }],
};

describe('texto do resumo (sem IA)', () => {
  it('leva idade, alertas, plano e evoluções em vigor; a retificada fica de fora', () => {
    const text = buildSummaryPrompt(base, 'America/Sao_Paulo', new Date('2026-11-18T15:00:00Z'));
    expect(text).toContain('Data de hoje: 18/11/2026');
    expect(text).toContain('Idade: 42 anos');
    expect(text).toContain('- Alergias: Dipirona');
    expect(text).toContain('Clareamento (Orçamento 7): 2 de 3 sessões feitas');
    expect(text).toContain('(atrasado 17 dias)');
    expect(text).toContain('(retificação): Texto corrigido');
    expect(text).not.toContain('Texto antigo errado');
  });

  it('sem nada registrado, não chama a IA', () => {
    expect(hasSummaryContent({ ...base, clientNotes: null, alerts: [], notes: [], plan: [] })).toBe(
      false,
    );
    expect(hasSummaryContent(base)).toBe(true);
  });

  it('confere a resposta: sem visão geral é erro; listas limpas e com limite', () => {
    expect(() => normalizeSummary({ overview: ' ' })).toThrow('Não consegui');
    const s = normalizeSummary({
      overview: 'Paciente de 42 anos.',
      alerts: ['Alergia a dipirona', 3, ''],
      recent: ['a', 'b', 'c', 'd', 'e', 'f', 'g'],
    });
    expect(s.alerts).toEqual(['Alergia a dipirona']);
    expect(s.recent).toHaveLength(5);
    expect(s.treatment).toEqual([]);
  });
});

describe('resumo do prontuário com IA', () => {
  let f: Awaited<ReturnType<typeof createTestCompany>>;
  const previousKey = process.env.GEMINI_API_KEY;
  const access: FormAccess = {
    ...ADMIN_DEFAULT,
    userId: 'u_dona',
    isAdmin: true,
    canGrant: true,
    professionalId: null,
  };
  const company = () => prisma.company.findUniqueOrThrow({ where: { id: f.company.id } });

  beforeAll(async () => {
    f = await createTestCompany('resumo_ia');
    await prisma.company.update({
      where: { id: f.company.id },
      data: {
        plan: 'profissional',
        subscriptionStatus: 'ACTIVE',
        currentPeriodEnd: new Date(Date.now() + 20 * 86_400_000),
      },
    });
    await prisma.client.update({
      where: { id: f.client.id },
      data: { name: 'Maria Sigilosa', email: 'maria.sigilosa@example.com' },
    });
    process.env.GEMINI_API_KEY = 'chave-de-teste';
  }, 60_000);
  afterEach(() => {
    vi.unstubAllGlobals();
  });
  afterAll(async () => {
    process.env.GEMINI_API_KEY = previousKey;
    await deleteTestCompany(f.company.id);
  });

  it('sem nada registrado, avisa e não gasta crédito', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    await expect(
      summarizeMedicalRecord({ company: await company(), clientId: f.client.id, access }),
    ).rejects.toThrow('Ainda não há o que resumir');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('gera o resumo sem mandar nome, telefone nem e-mail; gasta os créditos uma vez', async () => {
    await prisma.clinicalNote.create({
      data: {
        companyId: f.company.id,
        clientId: f.client.id,
        text: 'Queixa de sensibilidade. Orientado a usar creme dental específico.',
        authorUserId: 'u_dona',
        authorName: 'Dona',
      },
    });
    let sent = '';
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: { body: string }) => {
        sent = init.body;
        return new Response(
          JSON.stringify({
            candidates: [
              {
                content: {
                  parts: [
                    {
                      text: JSON.stringify({
                        overview: 'Paciente com queixa de sensibilidade.',
                        alerts: [],
                        treatment: [],
                        recent: ['18/11/2026: sensibilidade, orientado creme dental.'],
                        attention: ['Ver se a sensibilidade melhorou.'],
                      }),
                    },
                  ],
                },
              },
            ],
            usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 50 },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }),
    );
    const summary = await summarizeMedicalRecord({
      company: await company(),
      clientId: f.client.id,
      access,
    });
    expect(summary.overview).toContain('sensibilidade');
    expect(summary.attention).toEqual(['Ver se a sensibilidade melhorou.']);
    expect(sent).toContain('Queixa de sensibilidade');
    expect(sent).not.toContain('Sigilosa');
    expect(sent).not.toContain('maria.sigilosa');
    expect(sent).not.toContain(f.client.phone!.slice(-7));

    const events = await prisma.aiUsageEvent.findMany({
      where: { companyId: f.company.id, feature: 'medical_record_summary' },
    });
    expect(events).toHaveLength(1);
    expect(events[0].units).toBe(SUMMARY_UNITS);
  });

  it('se a IA falhar, avisa e devolve os créditos', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('erro', { status: 500 })),
    );
    const before = await prisma.aiUsagePeriod.findMany({ where: { companyId: f.company.id } });
    await expect(
      summarizeMedicalRecord({ company: await company(), clientId: f.client.id, access }),
    ).rejects.toThrow('Não consegui gerar o resumo');
    const after = await prisma.aiUsagePeriod.findMany({ where: { companyId: f.company.id } });
    expect(after.map((p) => p.usedUnits)).toEqual(before.map((p) => p.usedUnits));
    const active = await prisma.aiUsageReservation.count({
      where: { companyId: f.company.id, status: 'ACTIVE' },
    });
    expect(active).toBe(0);
  });
});
