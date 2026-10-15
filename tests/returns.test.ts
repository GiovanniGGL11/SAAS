import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { prisma } from '@/lib/db';
import { getClientReturnSuggestion, listDueReturns, returnMessage } from '@/server/data/returns';
import { createTestCompany, deleteTestCompany } from './helpers';

type Fixture = Awaited<ReturnType<typeof createTestCompany>>;

const DAY = 86_400_000;

describe('retorno por serviço', () => {
  let fixture: Fixture;

  beforeEach(async () => {
    fixture = await createTestCompany('retorno');
    await prisma.service.update({
      where: { id: fixture.service.id },
      data: { returnAfterDays: 21 },
    });
  });

  afterEach(async () => {
    await deleteTestCompany(fixture.company.id);
  });

  /** Atendimento direto no banco (mais rápido que pela agenda), com o status que o teste pede. */
  const visit = (clientId: string, daysAgo: number, status: 'DONE' | 'SCHEDULED' = 'DONE') => {
    const startAt = new Date(Date.now() - daysAgo * DAY);
    return prisma.appointment.create({
      data: {
        companyId: fixture.company.id,
        clientId,
        professionalId: fixture.professional.id,
        serviceId: fixture.service.id,
        startAt,
        endAt: new Date(startAt.getTime() + 30 * 60_000),
        status,
        serviceNameSnapshot: fixture.service.name,
        durationMinutesSnapshot: 30,
        priceSnapshot: 50,
        createdByUserId: 'user_test',
      },
    });
  };
  const client = (name: string, phone: string) =>
    prisma.client.create({ data: { companyId: fixture.company.id, name, phone } });

  it('lista quem venceu o retorno e deixa de fora quem não precisa ser chamado', async () => {
    const [venceu, recente, marcado, sumido] = await Promise.all([
      client('Venceu Ontem', '11900000001'),
      client('Veio Agora', '11900000002'),
      client('Ja Marcou', '11900000003'),
      client('Sumiu Faz Tempo', '11900000004'),
    ]);
    await Promise.all([
      visit(venceu.id, 22), // retorno de 21 dias venceu ontem
      visit(recente.id, 5), // ainda faltam 16 dias
      visit(marcado.id, 30), // venceu, mas já tem horário marcado
      visit(marcado.id, -2, 'SCHEDULED'),
      visit(sumido.id, 120), // atrasado 99 dias: fica com o "Chame de volta"
    ]);

    const due = await listDueReturns(fixture.company.id);
    expect(due.map((d) => d.name)).toEqual(['Venceu Ontem']);
    expect(due[0].daysLate).toBe(1);
    expect(due[0].returnAfterDays).toBe(21);
    expect(returnMessage(due[0])).toContain('Oi, Venceu! Já faz 22 dias');
  });

  it('serviço sem retorno configurado não gera sugestão; na ficha aparece a data', async () => {
    await visit(fixture.client.id, 10);
    const suggestion = await getClientReturnSuggestion(fixture.company.id, fixture.client.id);
    expect(suggestion?.serviceName).toBe(fixture.service.name);
    expect(suggestion?.daysLate).toBe(-11); // faltam 11 dias

    await prisma.service.update({
      where: { id: fixture.service.id },
      data: { returnAfterDays: null },
    });
    expect(await getClientReturnSuggestion(fixture.company.id, fixture.client.id)).toBeNull();
    expect(await listDueReturns(fixture.company.id)).toEqual([]);
  });

  it('não mistura empresas', async () => {
    await visit(fixture.client.id, 22);
    expect(await listDueReturns('empresa-de-outra-pessoa')).toEqual([]);
    expect(
      await getClientReturnSuggestion('empresa-de-outra-pessoa', fixture.client.id),
    ).toBeNull();
  });
});
