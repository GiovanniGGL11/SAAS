import { describe, expect, it } from 'vitest';

import {
  type FormSchema,
  answerText,
  formSchemaValidator,
  isQuestionVisible,
  sectionsFor,
  validateAnswers,
} from '@/lib/forms/schema';
import { currentEntryFor, requestKeyFor, requirementMet } from '@/lib/forms/rules';
import { STARTER_ANAMNESIS_SCHEMA } from '@/lib/forms/starter';
import { resolveFormAccess, entryInScope, NO_GRANT } from '@/server/data/form-permissions';

/** Modelo fictício para os testes (nenhum dado real). */
const schema: FormSchema = {
  sections: [
    {
      id: 's1',
      title: 'Geral',
      audience: 'any',
      questions: [
        {
          id: 'nome_social',
          type: 'short_text',
          title: 'Como prefere ser chamado?',
          required: true,
        },
        { id: 'alergia', type: 'yes_no', title: 'Tem alergia?', required: true },
        {
          id: 'alergia_quais',
          type: 'long_text',
          title: 'Quais?',
          required: true,
          showIf: { questionId: 'alergia', optionId: 'yes' },
        },
        {
          id: 'cor',
          type: 'single_choice',
          title: 'Cor preferida',
          required: false,
          options: [
            { id: 'azul', label: 'Azul' },
            { id: 'verde', label: 'Verde' },
          ],
        },
        {
          id: 'dias',
          type: 'multi_choice',
          title: 'Dias',
          required: false,
          options: [
            { id: 'seg', label: 'Segunda' },
            { id: 'ter', label: 'Terça' },
          ],
        },
        { id: 'nasc', type: 'date', title: 'Data', required: false },
        { id: 'altura', type: 'number', title: 'Número', required: false },
      ],
    },
    {
      id: 's2',
      title: 'Equipe',
      audience: 'staff',
      questions: [{ id: 'obs', type: 'long_text', title: 'Observação interna', required: true }],
    },
  ],
};

describe('estrutura do modelo', () => {
  it('aceita o modelo de teste e o modelo inicial de anamnese', () => {
    expect(formSchemaValidator.safeParse(schema).success).toBe(true);
    expect(formSchemaValidator.safeParse(STARTER_ANAMNESIS_SCHEMA).success).toBe(true);
  });

  it('modelo inicial não obriga nenhuma pergunta de saúde (só a declaração)', () => {
    const required = STARTER_ANAMNESIS_SCHEMA.sections
      .flatMap((s) => s.questions)
      .filter((q) => q.required)
      .map((q) => q.id);
    expect(required).toEqual(['q_declaracao']);
  });

  it('recusa ids repetidos, escolha sem opções e condição para pergunta posterior', () => {
    const dupe = structuredClone(schema);
    dupe.sections[0].questions[1].id = 'nome_social';
    expect(formSchemaValidator.safeParse(dupe).success).toBe(false);

    const noOptions = structuredClone(schema);
    noOptions.sections[0].questions[3].options = [{ id: 'x', label: 'Só uma' }];
    expect(formSchemaValidator.safeParse(noOptions).success).toBe(false);

    const forward = structuredClone(schema);
    forward.sections[0].questions[0].showIf = { questionId: 'alergia', optionId: 'yes' };
    expect(formSchemaValidator.safeParse(forward).success).toBe(false);

    const badOption = structuredClone(schema);
    badOption.sections[0].questions[2].showIf = { questionId: 'alergia', optionId: 'talvez' };
    expect(formSchemaValidator.safeParse(badOption).success).toBe(false);
  });

  it('reordenar seções e perguntas mantém os ids (e as respostas antigas)', () => {
    const reordered = structuredClone(schema);
    reordered.sections.reverse();
    reordered.sections[1].questions.reverse();
    // "Quais?" agora vem antes de "Tem alergia?": condição para pergunta posterior é recusada.
    expect(formSchemaValidator.safeParse(reordered).success).toBe(false);
    reordered.sections[1].questions = schema.sections[0].questions.slice();
    expect(formSchemaValidator.safeParse(reordered).success).toBe(true);
    const answers = { nome_social: 'Ana Teste', alergia: 'no' };
    expect(
      validateAnswers(reordered, answers, { mode: 'submit', audience: 'client' }).answers,
    ).toEqual(answers);
  });
});

describe('respostas', () => {
  it('obrigatórias só no envio; rascunho salva incompleto', () => {
    const draft = validateAnswers(
      schema,
      { nome_social: 'Ana' },
      { mode: 'draft', audience: 'staff' },
    );
    expect(draft.errors).toEqual({});
    const submit = validateAnswers(
      schema,
      { nome_social: 'Ana' },
      { mode: 'submit', audience: 'staff' },
    );
    expect(Object.keys(submit.errors).sort()).toEqual(['alergia', 'obs']);
  });

  it('valida por tipo', () => {
    const { errors } = validateAnswers(
      schema,
      {
        nome_social: 'x'.repeat(501),
        alergia: 'talvez',
        cor: 'roxo',
        dias: ['seg', 'dom'],
        nasc: '2026-02-30',
        altura: 'alto',
      },
      { mode: 'draft', audience: 'client' },
    );
    expect(Object.keys(errors).sort()).toEqual([
      'alergia',
      'altura',
      'cor',
      'dias',
      'nasc',
      'nome_social',
    ]);
    const ok = validateAnswers(
      schema,
      { cor: 'azul', dias: ['seg'], nasc: '2026-02-28', altura: '1,75' },
      { mode: 'draft', audience: 'client' },
    );
    expect(ok.errors).toEqual({});
    expect(ok.answers.altura).toBe(1.75);
  });

  it('pergunta oculta pela condição não bloqueia o envio e a resposta antiga é descartada', () => {
    const answers = {
      nome_social: 'Ana',
      alergia: 'no',
      alergia_quais: 'resposta antiga',
      obs: 'ok',
    };
    const question = schema.sections[0].questions[2];
    expect(isQuestionVisible(schema, question, answers)).toBe(false);
    const result = validateAnswers(schema, answers, { mode: 'submit', audience: 'staff' });
    expect(result.errors).toEqual({});
    expect(result.answers).not.toHaveProperty('alergia_quais');

    const shown = validateAnswers(
      schema,
      { ...answers, alergia: 'yes', alergia_quais: '' },
      {
        mode: 'submit',
        audience: 'staff',
      },
    );
    expect(shown.errors).toHaveProperty('alergia_quais');
  });

  it('o link do cliente nunca vê nem grava a seção interna', () => {
    expect(sectionsFor(schema, 'client').map((s) => s.id)).toEqual(['s1']);
    const result = validateAnswers(
      schema,
      { nome_social: 'Ana', alergia: 'no', obs: 'tentativa' },
      { mode: 'submit', audience: 'client' },
    );
    expect(result.errors).toEqual({});
    expect(result.answers).not.toHaveProperty('obs');
  });

  it('texto legível das respostas', () => {
    const [, alergia, , cor, dias, nasc] = schema.sections[0].questions;
    expect(answerText(alergia, 'yes')).toBe('Sim');
    expect(answerText(cor, 'verde')).toBe('Verde');
    expect(answerText(dias, ['seg', 'ter'])).toBe('Segunda, Terça');
    expect(answerText(nasc, '2026-03-01')).toBe('01/03/2026');
    expect(answerText(cor, undefined)).toBe('—');
  });
});

describe('regras de renovação e exigência', () => {
  const day = 86_400_000;
  const base = new Date('2030-01-10T12:00:00Z');
  const entry = (over: Partial<Parameters<typeof currentEntryFor>[0][number]>) => ({
    id: 'e1',
    status: 'SUBMITTED' as const,
    appointmentId: 'a1',
    submittedAt: new Date(base.getTime() - 10 * day),
    createdAt: new Date(base.getTime() - 10 * day),
    ...over,
  });

  it('a cada atendimento: só a ficha deste atendimento vale', () => {
    const rule = { renewal: 'EACH_VISIT' as const, renewalDays: null };
    expect(currentEntryFor([entry({})], rule, { appointmentId: 'a2', at: base })).toBeNull();
    expect(currentEntryFor([entry({})], rule, { appointmentId: 'a1', at: base })?.id).toBe('e1');
  });

  it('depois de N dias: vencida pede outra; em aberto não duplica', () => {
    const rule = { renewal: 'AFTER_DAYS' as const, renewalDays: 7 };
    expect(currentEntryFor([entry({})], rule, { appointmentId: 'x', at: base })).toBeNull();
    expect(
      currentEntryFor([entry({ status: 'REQUESTED', submittedAt: null })], rule, {
        appointmentId: 'x',
        at: base,
      }),
    ).not.toBeNull();
    expect(
      currentEntryFor(
        [entry({})],
        { renewal: 'AFTER_DAYS', renewalDays: 30 },
        { appointmentId: 'x', at: base },
      ),
    ).not.toBeNull();
  });

  it('uma vez: qualquer ficha serve', () => {
    expect(
      currentEntryFor(
        [entry({ appointmentId: null })],
        { renewal: 'ONCE', renewalDays: null },
        {
          appointmentId: 'z',
          at: base,
        },
      ),
    ).not.toBeNull();
  });

  it('exigência: enviada ou revisada', () => {
    expect(requirementMet('NONE', null)).toBe(true);
    expect(requirementMet('SUBMITTED', 'DRAFT')).toBe(false);
    expect(requirementMet('SUBMITTED', 'SUBMITTED')).toBe(true);
    expect(requirementMet('REVIEWED', 'SUBMITTED')).toBe(false);
    expect(requirementMet('REVIEWED', 'REVIEWED')).toBe(true);
  });

  it('chave de idempotência só por atendimento quando a regra é por atendimento', () => {
    expect(
      requestKeyFor({ templateId: 't', clientId: 'c', renewal: 'EACH_VISIT', appointmentId: 'a' }),
    ).toBe('appt:a:t');
    expect(
      requestKeyFor({ templateId: 't', clientId: 'c', renewal: 'ONCE', appointmentId: 'a' }),
    ).toBeNull();
  });
});

describe('permissões', () => {
  it('administrador sem concessão vê status e gerencia modelos, mas não lê respostas', () => {
    const admin = resolveFormAccess({
      userId: 'u',
      isAdmin: true,
      grant: null,
      professionalId: null,
    });
    expect(admin.canManage).toBe(true);
    expect(admin.canAudit).toBe(true);
    expect(admin.canRead).toBe(false);
    expect(admin.canExport).toBe(false);
  });

  it('recepção: pede fichas e acompanha, sem ler', () => {
    const reception = resolveFormAccess({
      userId: 'u',
      isAdmin: false,
      grant: null,
      professionalId: null,
    });
    expect(reception.canRequest).toBe(true);
    expect(
      reception.canRead || reception.canFill || reception.canReview || reception.canExport,
    ).toBe(false);
  });

  it('preencher, revisar e exportar dependem de poder ler', () => {
    const access = resolveFormAccess({
      userId: 'u',
      isAdmin: false,
      grant: { ...NO_GRANT, canFill: true, canReview: true, canExport: true },
      professionalId: null,
    });
    expect(access.canFill || access.canReview || access.canExport).toBe(false);
  });

  it('escopo "só os meus" usa o profissional ligado', () => {
    const scope = { scope: 'OWN' as const, professionalId: 'p1' };
    expect(
      entryInScope(scope, {
        appointmentProfessionalId: 'p1',
        packageProfessionalId: null,
        sessionProfessionalId: null,
      }),
    ).toBe(true);
    expect(
      entryInScope(scope, {
        appointmentProfessionalId: 'p2',
        packageProfessionalId: null,
        sessionProfessionalId: null,
      }),
    ).toBe(false);
    expect(
      entryInScope(
        { scope: 'OWN', professionalId: null },
        {
          appointmentProfessionalId: null,
          packageProfessionalId: null,
          sessionProfessionalId: null,
        },
      ),
    ).toBe(false);
  });
});
