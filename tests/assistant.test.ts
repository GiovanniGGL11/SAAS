import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { prisma } from '@/lib/db';
import type { AssistantAction } from '@/lib/assistant';
import { createAppointment } from '@/server/data/appointments';
import { describeAction, executeAction } from '@/server/assistant/execute';
import { assistantToolbox, runAssistant } from '@/server/assistant/run';
import type { AssistantContext } from '@/server/assistant/tools';
import { createTestCompany, deleteTestCompany } from './helpers';

type Fixture = Awaited<ReturnType<typeof createTestCompany>>;
type FakePart = { text?: string; functionCall?: { name: string; args: Record<string, unknown> } };

/** Gemini falso: devolve as respostas da fila, na ordem, e guarda o que recebeu. */
function installFakeGemini(replies: FakePart[][]) {
  const requests: { url: string; body: Record<string, unknown> }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (!url.startsWith('https://generativelanguage.googleapis.com/')) {
        throw new Error(`Unexpected fetch: ${url}`);
      }
      requests.push({ url, body: JSON.parse(String(init?.body)) });
      const parts = replies.shift() ?? [{ text: 'fim' }];
      return new Response(JSON.stringify({ candidates: [{ content: { role: 'model', parts } }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }),
  );
  return { requests };
}

function contextFor(fixture: Fixture, overrides: Partial<AssistantContext> = {}): AssistantContext {
  return {
    companyId: fixture.company.id,
    companyName: fixture.company.name,
    timezone: fixture.company.timezone,
    userId: 'user_assistant',
    isAdmin: true,
    ...overrides,
  };
}

// Bem no futuro, para nunca cair em "esse horário já passou".
const LOCAL_START = '2031-03-11T10:00';

describe('assistant', () => {
  let a: Fixture;
  let b: Fixture;

  beforeEach(async () => {
    a = await createTestCompany('assist_a');
    b = await createTestCompany('assist_b');
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    await deleteTestCompany(a.company.id);
    await deleteTestCompany(b.company.id);
  });

  it('read tools only see the session company', async () => {
    const ctx = contextFor(a);

    const search = await assistantToolbox.dispatch(ctx, 'buscar_clientes', { nome: 'Client' });
    const names = (search.response.clientes as { nome: string }[]).map((c) => c.nome);
    expect(names).toContain(a.client.name);
    expect(names).not.toContain(b.client.name);

    // Id de outra empresa: não vaza nada, só um erro para o modelo.
    const foreign = await assistantToolbox.dispatch(ctx, 'ficha_do_cliente', {
      clienteId: b.client.id,
    });
    expect(foreign.response).toEqual({ erro: 'Cliente não encontrado.' });

    // Mesmo que o modelo invente um companyId, a ferramenta usa o da sessão.
    const sneaky = await assistantToolbox.dispatch(ctx, 'buscar_clientes', {
      nome: 'Client',
      companyId: b.company.id,
    });
    expect(JSON.stringify(sneaky.response)).not.toContain(b.client.id);
  });

  it('keeps finance and reports for admins', async () => {
    const member = contextFor(a, { isAdmin: false });
    const period = { dataInicial: '2031-03-01', dataFinal: '2031-03-31' };
    expect((await assistantToolbox.dispatch(member, 'resumo_financeiro', period)).response).toEqual(
      {
        erro: 'Somente administradores da empresa podem ver isso.',
      },
    );
    const admin = await assistantToolbox.dispatch(contextFor(a), 'resumo_financeiro', period);
    expect(admin.response).toMatchObject({ entradas: 0, saidas: 0, saldo: 0 });
  });

  it('turns unknown tools and bad arguments into errors for the model', async () => {
    const ctx = contextFor(a);
    expect((await assistantToolbox.dispatch(ctx, 'apagar_tudo', {})).response).toEqual({
      erro: 'Ferramenta desconhecida: apagar_tudo.',
    });
    const bad = await assistantToolbox.dispatch(ctx, 'agenda_do_periodo', { dataInicial: 'ontem' });
    expect(bad.response.erro).toMatch(/Data inválida/);
  });

  it('proposes a booking without writing, then books it on confirmation', async () => {
    const gemini = installFakeGemini([
      [
        {
          functionCall: {
            name: 'agendar',
            args: {
              clienteId: a.client.id,
              servicoId: a.service.id,
              profissionalId: a.professional.id,
              inicio: LOCAL_START,
            },
          },
        },
      ],
      [{ text: 'Preparei o agendamento. Confirme no cartão.' }],
    ]);

    const result = await runAssistant({
      ctx: contextFor(a),
      apiKey: 'test-key',
      model: 'gemini-test',
      messages: [{ role: 'user', text: 'Marca o cliente amanhã às 10h' }],
    });

    expect(result.reply).toBe('Preparei o agendamento. Confirme no cartão.');
    expect(result.proposals).toHaveLength(1);
    const [proposal] = result.proposals;
    expect(proposal.title).toBe('Novo agendamento');
    expect(proposal.details.find((d) => d.label === 'Cliente')?.value).toBe(a.client.name);

    // Nada foi gravado só por o modelo pedir.
    expect(await prisma.appointment.count({ where: { companyId: a.company.id } })).toBe(0);

    // O modelo recebeu o resultado da ferramenta e o system prompt com empresa e fuso.
    expect(gemini.requests).toHaveLength(2);
    const first = gemini.requests[0].body as {
      systemInstruction: { parts: { text: string }[] };
      tools: { functionDeclarations: { name: string }[] }[];
    };
    expect(first.systemInstruction.parts[0].text).toContain(a.company.name);
    expect(first.systemInstruction.parts[0].text).toContain(a.company.timezone);
    expect(JSON.stringify(first.tools)).not.toMatch(/companyId|userId/);
    expect(JSON.stringify(gemini.requests[1].body)).toContain('aguardando_confirmacao');
    expect(gemini.requests[0].url).toContain('gemini-test:generateContent');

    const executed = await executeAction(contextFor(a), proposal.action);
    expect(executed.appointmentIds).toHaveLength(1);
    expect(executed.paths).toContain('/agenda');

    const appointment = await prisma.appointment.findFirstOrThrow({
      where: { id: executed.appointmentIds[0] },
    });
    expect(appointment.companyId).toBe(a.company.id);
    expect(appointment.createdByUserId).toBe('user_assistant');
    const audit = await prisma.auditLog.findFirst({
      where: { companyId: a.company.id, entityId: appointment.id, action: 'created' },
    });
    expect(audit?.userId).toBe('user_assistant');
  });

  it('refuses to propose with ids from another company', async () => {
    installFakeGemini([
      [
        {
          functionCall: {
            name: 'agendar',
            args: {
              clienteId: b.client.id,
              servicoId: a.service.id,
              profissionalId: a.professional.id,
              inicio: LOCAL_START,
            },
          },
        },
      ],
      [{ text: 'Não encontrei esse cliente.' }],
    ]);
    const result = await runAssistant({
      ctx: contextFor(a),
      apiKey: 'test-key',
      model: 'gemini-test',
      messages: [{ role: 'user', text: 'Agenda o cliente da outra empresa' }],
    });
    expect(result.proposals).toHaveLength(0);
  });

  it('revalidates on confirmation: foreign ids, past times and taken slots fail', async () => {
    const ctxA = contextFor(a);
    const foreignAppointment = await createAppointment({
      companyId: b.company.id,
      clientId: b.client.id,
      professionalId: b.professional.id,
      serviceId: b.service.id,
      startAt: new Date('2031-03-11T13:00:00Z'),
      createdByUserId: 'user_b',
    });

    // Um navegador adulterado mandando a ação direto para a confirmação.
    const cancelForeign: AssistantAction = {
      kind: 'cancel_appointment',
      args: { appointmentId: foreignAppointment.id },
    };
    await expect(executeAction(ctxA, cancelForeign)).rejects.toThrow();
    const untouched = await prisma.appointment.findUniqueOrThrow({
      where: { id: foreignAppointment.id },
    });
    expect(untouched.status).toBe('SCHEDULED');

    const updateForeign: AssistantAction = {
      kind: 'update_client',
      args: { clientId: b.client.id, name: 'Invadido' },
    };
    await expect(executeAction(ctxA, updateForeign)).rejects.toThrow('Cliente não encontrado.');
    expect((await prisma.client.findUniqueOrThrow({ where: { id: b.client.id } })).name).toBe(
      b.client.name,
    );

    const past: AssistantAction = {
      kind: 'create_appointment',
      args: {
        clientId: a.client.id,
        professionalId: a.professional.id,
        serviceId: a.service.id,
        startAt: new Date(Date.now() - 86_400_000).toISOString(),
      },
    };
    await expect(describeAction(ctxA, past)).rejects.toThrow('Esse horário já passou.');

    // O horário foi ocupado entre a proposta e o clique em "Confirmar".
    const slot: AssistantAction = {
      kind: 'create_appointment',
      args: {
        clientId: a.client.id,
        professionalId: a.professional.id,
        serviceId: a.service.id,
        startAt: '2031-03-12T13:00:00.000Z',
      },
    };
    await describeAction(ctxA, slot);
    await executeAction(ctxA, slot);
    await expect(executeAction(ctxA, slot)).rejects.toThrow();
  });

  it('edits only the requested client fields and audits who did it', async () => {
    const ctx = contextFor(a);
    await prisma.client.update({
      where: { id: a.client.id },
      data: { email: 'antes@example.com', city: 'Campinas' },
    });

    const action: AssistantAction = {
      kind: 'update_client',
      args: { clientId: a.client.id, notes: 'Prefere tesoura' },
    };
    const { details } = await describeAction(ctx, action);
    expect(details).toEqual([{ label: 'Observações', value: 'Prefere tesoura' }]);
    await executeAction(ctx, action);

    const client = await prisma.client.findUniqueOrThrow({ where: { id: a.client.id } });
    expect(client.notes).toBe('Prefere tesoura');
    expect(client.email).toBe('antes@example.com');
    expect(client.city).toBe('Campinas');
    expect(client.phone).toBe(a.client.phone?.replace(/\D/g, ''));

    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { companyId: a.company.id, entityType: 'Client', entityId: client.id },
    });
    expect(audit.action).toBe('updated');
    expect(audit.userId).toBe('user_assistant');
  });

  it('creates a client on confirmation and blocks duplicate phones', async () => {
    const ctx = contextFor(a);
    const create: AssistantAction = {
      kind: 'create_client',
      args: { name: 'Maria Teste', phone: '(11) 98888-7777' },
    };
    const proposal = await assistantToolbox.dispatch(ctx, 'cadastrar_cliente', {
      nome: 'Maria Teste',
      telefone: '(11) 98888-7777',
    });
    expect(proposal.proposal?.action).toEqual(create);
    expect(await prisma.client.count({ where: { companyId: a.company.id } })).toBe(1);

    await executeAction(ctx, create);
    expect(
      await prisma.client.count({ where: { companyId: a.company.id, phone: '11988887777' } }),
    ).toBe(1);

    const again = await assistantToolbox.dispatch(ctx, 'cadastrar_cliente', {
      nome: 'Maria de Novo',
      telefone: '11988887777',
    });
    expect(again.proposal).toBeUndefined();
    expect(again.response.erro).toMatch(/Já existe um cliente com este telefone/);

    // A outra empresa pode ter o mesmo telefone: o cadastro é por empresa.
    await executeAction(contextFor(b), create);
  });

  it('stops after the step limit', async () => {
    const loop = Array.from({ length: 10 }, () => [
      { functionCall: { name: 'servicos_e_profissionais', args: {} } },
    ]);
    const gemini = installFakeGemini(loop);
    const result = await runAssistant({
      ctx: contextFor(a),
      apiKey: 'test-key',
      model: 'gemini-test',
      messages: [{ role: 'user', text: 'oi' }],
    });
    expect(gemini.requests).toHaveLength(6);
    expect(result.reply).toMatch(/passos demais/);
  });
});
