import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';

import {
  packageAlerts,
  packageFinancial,
  packageFitsAppointment,
  progressLabel,
  sessionsDone,
} from '@/lib/packages';
import { buildEntryPdf, buildPackagePdf } from '@/server/pdf/forms-pdf';
import type { FormSchema } from '@/lib/forms/schema';

describe('pacote: progresso e financeiro (regras puras)', () => {
  it('progresso sai do livro: oito sessões, duas feitas, seis restantes', () => {
    const done = sessionsDone([
      { kind: 'CONSUME', quantity: 1 },
      { kind: 'CONSUME', quantity: 1 },
      { kind: 'CONSUME', quantity: 1 },
      { kind: 'RESTORE', quantity: -1 },
      { kind: 'EXTEND', quantity: 2 },
    ]);
    expect(done).toBe(2);
    expect(progressLabel(done, 8)).toBe('2 de 8');
  });

  it('saldo inicial conta como feito, sem criar sessões', () => {
    expect(sessionsDone([{ kind: 'OPENING_DONE', quantity: 3 }, { kind: 'CONSUME', quantity: 1 }])).toBe(4);
  });

  it('situação financeira separada da execução', () => {
    expect(packageFinancial({ price: 900, paid: 900, pending: 0 }).status).toBe('PAID');
    expect(packageFinancial({ price: 900, paid: 300, pending: 600 })).toMatchObject({
      status: 'PARTIAL',
      unbilled: 0,
    });
    expect(packageFinancial({ price: 900, paid: 0, pending: 900 }).status).toBe('TAB');
    expect(packageFinancial({ price: 900, paid: 0, pending: 0 })).toMatchObject({
      status: 'UNPAID',
      unbilled: 900,
    });
  });

  it('avisos: vencido, sem saldo, vencendo', () => {
    const now = new Date('2030-01-10T00:00:00Z');
    expect(packageAlerts({ done: 8, total: 8, validUntil: null, recurring: false, now })).toEqual(['exhausted']);
    expect(
      packageAlerts({ done: 1, total: 8, validUntil: new Date('2030-01-01T00:00:00Z'), recurring: false, now }),
    ).toEqual(['expired']);
    expect(
      packageAlerts({ done: 1, total: 8, validUntil: new Date('2030-01-15T00:00:00Z'), recurring: false, now }),
    ).toEqual(['expiring']);
  });

  it('pacote compatível com o agendamento', () => {
    const pkg = { serviceId: 's1', status: 'ACTIVE', done: 2, total: 8, validUntil: null, recurring: false };
    const at = new Date('2030-01-10T00:00:00Z');
    expect(packageFitsAppointment(pkg, ['s1', 's2'], at).ok).toBe(true);
    expect(packageFitsAppointment(pkg, ['s2'], at).ok).toBe(false);
    expect(packageFitsAppointment({ ...pkg, done: 8 }, ['s1'], at).ok).toBe(false);
    expect(
      packageFitsAppointment({ ...pkg, validUntil: new Date('2030-01-01T00:00:00Z') }, ['s1'], at).ok,
    ).toBe(false);
  });
});

describe('PDF', () => {
  const longText = 'Texto fictício de teste com acentuação: ação, coração, café. '.repeat(120);
  const schema: FormSchema = {
    sections: [
      {
        id: 's',
        title: 'Seção longa',
        audience: 'any',
        questions: Array.from({ length: 6 }, (_, i) => ({
          id: `q${i}`,
          type: 'long_text' as const,
          title: `Pergunta ${i + 1} — com travessão e “aspas”`,
          required: false,
        })),
      },
    ],
  };

  it('ficha com campos longos quebra em várias páginas numeradas', async () => {
    const bytes = await buildEntryPdf({
      companyName: 'Empresa Fictícia',
      timezone: 'America/Sao_Paulo',
      clientName: 'Cliente Fictício',
      formName: 'Avaliação de teste',
      templateType: 'ASSESSMENT',
      version: 2,
      status: 'REVIEWED',
      revision: 1,
      filledBy: 'CLIENT',
      filledByUserId: null,
      reviewedByUserId: 'user_x',
      filledByName: null,
      reviewedByName: 'Profissional Fictício',
      createdAt: new Date('2030-01-01T12:00:00Z'),
      submittedAt: new Date('2030-01-02T12:00:00Z'),
      reviewedAt: new Date('2030-01-03T12:00:00Z'),
      appointmentAt: null,
      packageName: null,
      schema,
      // Emoji não existe na fonte do PDF: vira "?" em vez de quebrar a exportação.
      answers: Object.fromEntries(schema.sections[0].questions.map((q) => [q.id, `${longText} 🙂`])),
    });
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBeGreaterThan(2);
  });

  it('pacote sem sessões gera o resumo', async () => {
    const bytes = await buildPackagePdf({
      companyName: 'Empresa Fictícia',
      timezone: 'America/Sao_Paulo',
      clientName: 'Cliente Fictício',
      package: {
        name: 'Pacote de teste',
        serviceName: 'Serviço',
        progress: '0 de 3',
        remaining: 3,
        contractedAt: new Date('2030-01-01T12:00:00Z'),
        validUntil: null,
        financial: { price: 300, paid: 300, pending: 0, unbilled: 0, status: 'PAID' },
      },
      initialEntry: null,
      sessions: [],
    });
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1);
  });
});
