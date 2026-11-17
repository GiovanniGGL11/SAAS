import { describe, expect, it } from 'vitest';

import { normalizeImportedTemplate } from '@/lib/forms/pdf-import';
import { answerText, validateAnswers, type FormSchema } from '@/lib/forms/schema';

describe('importar ficha em PDF', () => {
  const raw = {
    name: 'Ficha de Anamnese Facial',
    type: 'ANAMNESIS',
    sections: [
      {
        title: 'Dados pessoais',
        questions: [
          { title: 'Nome completo:', type: 'short_text', required: true },
          { title: 'CPF', type: 'short_text' },
          { title: 'Data de nascimento', type: 'date' },
        ],
      },
      {
        title: 'Histórico de saúde',
        questions: [
          { title: 'Possui alergia?', type: 'yes_no' },
          { title: 'Se sim, qual?', type: 'short_text', required: true },
          {
            title: 'Doenças',
            type: 'multi_choice',
            options: ['Diabetes', 'Hipertensão', 'Diabetes'],
          },
          { title: 'Tipo de pele', type: 'single_choice', options: ['Oleosa'] },
          { title: '', type: 'short_text' },
        ],
      },
      {
        title: 'Termo de consentimento',
        description: 'Declaro que as informações são verdadeiras.',
        questions: [{ title: 'Assinatura do cliente', type: 'signature' }],
      },
      {
        title: 'Avaliação do profissional',
        audience: 'staff',
        questions: [{ title: 'Procedimento', type: 'long_text' }],
      },
      { title: 'Vazia', questions: [] },
    ],
  };

  it('mantém a ordem, ajusta tipos e liga o "Se sim, qual?" ao Sim', () => {
    const t = normalizeImportedTemplate(raw);
    expect(t).toMatchObject({ name: 'Ficha de Anamnese Facial', type: 'ANAMNESIS' });
    const [dados, saude, termo, equipe] = t.schema.sections;
    expect(t.schema.sections).toHaveLength(4); // a seção vazia some
    expect(dados.questions.map((q) => q.title)).toEqual([
      'Nome completo',
      'CPF',
      'Data de nascimento',
    ]);
    const [alergia, qual, doencas, pele] = saude.questions;
    expect(qual.showIf).toEqual({ questionId: alergia.id, optionId: 'yes' });
    expect(qual.required).toBe(false);
    expect(doencas.options?.map((o) => o.label)).toEqual(['Diabetes', 'Hipertensão']);
    expect(pele.type).toBe('short_text'); // escolha com uma opção só vira texto
    expect(saude.questions).toHaveLength(4); // pergunta sem título some
    expect(termo.description).toBe('Declaro que as informações são verdadeiras.');
    expect(termo.questions[0]).toMatchObject({ type: 'signature', required: true });
    expect(equipe.audience).toBe('staff');
  });

  it('PDF sem perguntas dá erro claro', () => {
    expect(() => normalizeImportedTemplate({ name: 'x', sections: [] })).toThrow(/Não encontrei/);
  });

  it('assinatura: exige o traço (imagem PNG) e aparece como "Assinado"', () => {
    const schema: FormSchema = {
      sections: [
        {
          id: 's1',
          title: 'Termo',
          audience: 'any',
          questions: [{ id: 'sig', type: 'signature', title: 'Assinatura', required: true }],
        },
      ],
    };
    const png = 'data:image/png;base64,iVBORw0KGgo=';
    expect(validateAnswers(schema, {}, { mode: 'submit', audience: 'client' }).errors.sig).toBe(
      'Obrigatória.',
    );
    expect(
      validateAnswers(schema, { sig: 'texto qualquer' }, { mode: 'submit', audience: 'client' })
        .errors.sig,
    ).toBe('Assine no quadro.');
    const ok = validateAnswers(schema, { sig: png }, { mode: 'submit', audience: 'client' });
    expect(ok.errors).toEqual({});
    expect(answerText(schema.sections[0].questions[0], png)).toBe('Assinado');
  });
});
