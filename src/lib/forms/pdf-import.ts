import {
  QUESTION_TYPES,
  formSchemaValidator,
  newId,
  type FormSchema,
  type Question,
  type QuestionType,
  type Section,
} from '@/lib/forms/schema';

/*
  Importação de ficha em PDF: a IA lê o arquivo e devolve a estrutura (seções e perguntas na
  ordem do papel). Aqui ela vira um modelo válido do Atendafy — com ids próprios, limites de
  tamanho e as regras do editor —, para o dono só conferir e ajustar.
*/

export const IMPORT_FORM_TYPES = ['ANAMNESIS', 'ASSESSMENT', 'SERVICE_RECORD', 'CUSTOM'] as const;
export type ImportFormType = (typeof IMPORT_FORM_TYPES)[number];

/** O que pedimos à IA (formato de resposta do Gemini). */
export const IMPORT_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    name: { type: 'STRING' },
    type: { type: 'STRING', enum: [...IMPORT_FORM_TYPES] },
    description: { type: 'STRING' },
    sections: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          title: { type: 'STRING' },
          description: { type: 'STRING' },
          audience: { type: 'STRING', enum: ['any', 'client', 'staff'] },
          questions: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              properties: {
                title: { type: 'STRING' },
                type: { type: 'STRING', enum: [...QUESTION_TYPES] },
                required: { type: 'BOOLEAN' },
                help: { type: 'STRING' },
                options: { type: 'ARRAY', items: { type: 'STRING' } },
              },
              required: ['title', 'type'],
            },
          },
        },
        required: ['title', 'questions'],
      },
    },
  },
  required: ['name', 'sections'],
} as const;

export const IMPORT_INSTRUCTIONS = `Você recebe, em PDF, a ficha (normalmente de anamnese) que um estabelecimento de beleza, estética ou saúde usa com os clientes. Reproduza a ficha como formulário digital, em português do Brasil.

Regras:
- Mantenha a MESMA ORDEM do papel, de cima para baixo: se o nome vem antes do CPF, a pergunta do nome vem antes.
- Cada campo a preencher vira uma pergunta, com o mesmo texto do papel (sem dois-pontos no final, sem sublinhados).
- Tipos: nome, CPF, RG, telefone, e-mail, endereço, profissão e respostas curtas → short_text; CEP → cep; observações, descrições e respostas longas → long_text; datas (inclusive nascimento) → date; idade, peso, altura e medidas → number; perguntas de Sim/Não → yes_no; listas de marcar várias opções → multi_choice (liste as opções); escolha de uma opção só → single_choice (liste as opções); linha de assinatura do cliente → signature.
- Depois de uma pergunta Sim/Não com "Qual?", "Quais?" ou "Se sim, ..." no papel, crie em seguida uma pergunta short_text com esse texto (ex.: "Se sim, qual?").
- Títulos e blocos do papel viram seções. Texto de termo, declaração ou consentimento vai na descrição da seção (até 1000 caracteres), e a assinatura do cliente fica nessa mesma seção.
- Partes que só o profissional preenche (avaliação, procedimento realizado, assinatura do profissional) ficam numa seção com audience "staff". As demais usam "any".
- Marque required só no nome do cliente, na assinatura do cliente e no que o papel indicar como obrigatório (ex.: asterisco).
- Ignore logotipo, cabeçalho e rodapé com dados da empresa (nome, endereço, telefone, redes sociais).
- name: o título da ficha. type: ANAMNESIS para anamnese, ASSESSMENT para avaliação, SERVICE_RECORD para ficha de atendimento, CUSTOM para outros.`;

const clip = (value: unknown, max: number) =>
  typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';

const CHOICE: QuestionType[] = ['single_choice', 'multi_choice'];

/** Pergunta de acompanhamento ("Se sim, qual?") que só faz sentido depois de um "Sim". */
const FOLLOW_UP = /^(se sim|caso sim|em caso afirmativo|qual|quais|especifique|descreva)\b/i;

export type ImportedTemplate = {
  name: string;
  type: ImportFormType;
  description: string;
  schema: FormSchema;
};

/** Converte a resposta da IA num modelo válido (lança erro se não sobrar nenhuma pergunta). */
export function normalizeImportedTemplate(raw: unknown): ImportedTemplate {
  const data = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const sections: Section[] = [];
  const rawSections = Array.isArray(data.sections) ? data.sections.slice(0, 30) : [];
  for (const rawSection of rawSections) {
    const s = (rawSection ?? {}) as Record<string, unknown>;
    const questions: Question[] = [];
    let previous: Question | null = null;
    for (const rawQuestion of Array.isArray(s.questions) ? s.questions.slice(0, 100) : []) {
      const q = (rawQuestion ?? {}) as Record<string, unknown>;
      const title = clip(q.title, 300).replace(/[:_.\s]+$/, '');
      if (!title) continue;
      let type: QuestionType = (QUESTION_TYPES as readonly string[]).includes(String(q.type))
        ? (q.type as QuestionType)
        : 'short_text';
      const labels = (Array.isArray(q.options) ? q.options : [])
        .map((o) => clip(o, 200))
        .filter(Boolean);
      const unique = [...new Set(labels)].slice(0, 50);
      // Escolha com menos de duas opções não é escolha: vira texto curto.
      if (CHOICE.includes(type) && unique.length < 2) type = 'short_text';
      const question: Question = {
        id: newId('q'),
        type,
        title,
        required: q.required === true || type === 'signature',
        ...(clip(q.help, 500) ? { help: clip(q.help, 500) } : {}),
        ...(CHOICE.includes(type)
          ? { options: unique.map((label) => ({ id: newId('o'), label })) }
          : {}),
      };
      // "Se sim, qual?" logo depois de um Sim/Não: só aparece quando a resposta for Sim.
      if (previous?.type === 'yes_no' && FOLLOW_UP.test(title) && type !== 'signature') {
        question.showIf = { questionId: previous.id, optionId: 'yes' };
        question.required = false;
      }
      questions.push(question);
      previous = question;
    }
    if (questions.length === 0) continue;
    const audience = s.audience === 'staff' || s.audience === 'client' ? s.audience : 'any';
    sections.push({
      id: newId('s'),
      title: clip(s.title, 200) || 'Perguntas',
      ...(clip(s.description, 1000) ? { description: clip(s.description, 1000) } : {}),
      audience,
      questions,
    });
  }
  if (sections.length === 0) {
    throw new Error('Não encontrei perguntas nesse PDF. Confira se é a ficha certa.');
  }
  const schema = formSchemaValidator.parse({ sections }) as FormSchema;
  const type = (IMPORT_FORM_TYPES as readonly string[]).includes(String(data.type))
    ? (data.type as ImportFormType)
    : 'ANAMNESIS';
  return {
    name: clip(data.name, 120) || 'Ficha importada',
    type,
    description: clip(data.description, 500),
    schema,
  };
}
