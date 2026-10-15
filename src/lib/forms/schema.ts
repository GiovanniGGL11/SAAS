import { z } from 'zod';

/**
 * Estrutura de um modelo de ficha e a validação das respostas — o mesmo código no navegador e no
 * servidor. Perguntas e opções têm id estável: renomear o título não perde respostas antigas, e
 * cada ficha guarda a versão do modelo que usou.
 */

export const QUESTION_TYPES = [
  'short_text',
  'long_text',
  'yes_no',
  'single_choice',
  'multi_choice',
  'date',
  'number',
] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

export const QUESTION_TYPE_LABEL: Record<QuestionType, string> = {
  short_text: 'Texto curto',
  long_text: 'Texto longo',
  yes_no: 'Sim/não',
  single_choice: 'Escolha única',
  multi_choice: 'Múltipla escolha',
  date: 'Data',
  number: 'Número',
};

/** Quem responde a seção: o cliente (aparece no link), a equipe (nunca no link) ou ambos. */
export const SECTION_AUDIENCES = ['any', 'client', 'staff'] as const;
export type SectionAudience = (typeof SECTION_AUDIENCES)[number];

export type ChoiceOption = { id: string; label: string };
/** Mostra a pergunta quando a resposta da pergunta `questionId` for a opção `optionId`. */
export type ShowIf = { questionId: string; optionId: string };

export type Question = {
  id: string;
  type: QuestionType;
  title: string;
  help?: string;
  required: boolean;
  options?: ChoiceOption[];
  showIf?: ShowIf | null;
};

export type Section = {
  id: string;
  title: string;
  description?: string;
  audience: SectionAudience;
  questions: Question[];
};

export type FormSchema = { sections: Section[] };
export type Answers = Record<string, unknown>;

/** Sim/não tem opções fixas, com ids estáveis, para poderem servir de condição. */
export const YES_NO_OPTIONS: ChoiceOption[] = [
  { id: 'yes', label: 'Sim' },
  { id: 'no', label: 'Não' },
];

export function optionsOf(question: Question): ChoiceOption[] {
  if (question.type === 'yes_no') return YES_NO_OPTIONS;
  return question.options ?? [];
}

const isChoice = (type: QuestionType) =>
  type === 'yes_no' || type === 'single_choice' || type === 'multi_choice';

const idString = z
  .string()
  .min(1)
  .max(60)
  .regex(/^[A-Za-z0-9_-]+$/, 'Identificador inválido');

const optionSchema = z.object({
  id: idString,
  label: z.string().trim().min(1, 'Opção sem texto').max(200),
});

const questionSchema = z.object({
  id: idString,
  type: z.enum(QUESTION_TYPES),
  title: z.string().trim().min(1, 'Pergunta sem título').max(300),
  help: z.string().trim().max(500).optional(),
  required: z.boolean(),
  options: z.array(optionSchema).max(50).optional(),
  showIf: z.object({ questionId: idString, optionId: idString }).nullable().optional(),
});

const sectionSchema = z.object({
  id: idString,
  title: z.string().trim().min(1, 'Seção sem título').max(200),
  description: z.string().trim().max(1000).optional(),
  audience: z.enum(SECTION_AUDIENCES),
  questions: z.array(questionSchema).max(100),
});

/**
 * Valida a estrutura do modelo: ids únicos, opções nas perguntas de escolha e condições que
 * apontam para uma pergunta de escolha anterior (sem ciclos, sem referência ao vazio).
 */
export const formSchemaValidator = z
  .object({ sections: z.array(sectionSchema).min(1, 'Adicione pelo menos uma seção.').max(30) })
  .superRefine((schema, ctx) => {
    const seen = new Map<string, Question>();
    const sectionIds = new Set<string>();
    schema.sections.forEach((section, si) => {
      if (sectionIds.has(section.id)) {
        ctx.addIssue({ code: 'custom', message: 'Seção repetida.', path: ['sections', si] });
      }
      sectionIds.add(section.id);
      section.questions.forEach((question, qi) => {
        const path = ['sections', si, 'questions', qi];
        if (seen.has(question.id)) {
          ctx.addIssue({ code: 'custom', message: 'Pergunta repetida.', path });
        }
        if ((question.type === 'single_choice' || question.type === 'multi_choice') &&
          (question.options?.length ?? 0) < 2) {
          ctx.addIssue({
            code: 'custom',
            message: `"${question.title}" precisa de pelo menos duas opções.`,
            path,
          });
        }
        const optionIds = new Set((question.options ?? []).map((o) => o.id));
        if (optionIds.size !== (question.options ?? []).length) {
          ctx.addIssue({ code: 'custom', message: 'Opção repetida.', path });
        }
        if (question.showIf) {
          const target = seen.get(question.showIf.questionId);
          if (!target || !isChoice(target.type)) {
            ctx.addIssue({
              code: 'custom',
              message: `A condição de "${question.title}" precisa apontar para uma pergunta de escolha anterior.`,
              path,
            });
          } else if (!optionsOf(target).some((o) => o.id === question.showIf!.optionId)) {
            ctx.addIssue({
              code: 'custom',
              message: `A condição de "${question.title}" aponta para uma opção que não existe.`,
              path,
            });
          }
        }
        seen.set(question.id, question);
      });
    });
    if (seen.size === 0) {
      ctx.addIssue({ code: 'custom', message: 'Adicione pelo menos uma pergunta.', path: [] });
    }
  });

export function parseFormSchema(value: unknown): FormSchema {
  return formSchemaValidator.parse(value) as FormSchema;
}

export function allQuestions(schema: FormSchema): Question[] {
  return schema.sections.flatMap((s) => s.questions);
}

/** A pergunta aparece? Sem condição, sim; com condição, só se a resposta bater (e a pergunta da
 * condição também estiver visível — uma condição sobre pergunta oculta esconde em cascata). */
export function isQuestionVisible(schema: FormSchema, question: Question, answers: Answers): boolean {
  if (!question.showIf) return true;
  const target = allQuestions(schema).find((q) => q.id === question.showIf!.questionId);
  if (!target || !isQuestionVisible(schema, target, answers)) return false;
  const answer = answers[target.id];
  return Array.isArray(answer)
    ? answer.includes(question.showIf.optionId)
    : answer === question.showIf.optionId;
}

/** Seções que o público vê: as de equipe nunca vão para o link do cliente. */
export function sectionsFor(schema: FormSchema, audience: 'client' | 'staff'): Section[] {
  return audience === 'client'
    ? schema.sections.filter((s) => s.audience !== 'staff')
    : schema.sections;
}

function isEmpty(value: unknown) {
  return (
    value === undefined ||
    value === null ||
    (typeof value === 'string' && value.trim() === '') ||
    (Array.isArray(value) && value.length === 0)
  );
}

function checkValue(question: Question, value: unknown): string | null {
  switch (question.type) {
    case 'short_text':
      if (typeof value !== 'string') return 'Resposta inválida.';
      return value.length > 500 ? 'Use até 500 caracteres.' : null;
    case 'long_text':
      if (typeof value !== 'string') return 'Resposta inválida.';
      return value.length > 5000 ? 'Use até 5.000 caracteres.' : null;
    case 'yes_no':
    case 'single_choice':
      return typeof value === 'string' && optionsOf(question).some((o) => o.id === value)
        ? null
        : 'Escolha uma das opções.';
    case 'multi_choice': {
      const ids = new Set(optionsOf(question).map((o) => o.id));
      return Array.isArray(value) && value.every((v) => typeof v === 'string' && ids.has(v))
        ? null
        : 'Escolha entre as opções.';
    }
    case 'date': {
      if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return 'Data inválida.';
      const [y, m, d] = value.split('-').map(Number);
      const date = new Date(Date.UTC(y, m - 1, d));
      return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d
        ? null
        : 'Data inválida.';
    }
    case 'number': {
      const n = typeof value === 'number' ? value : Number(String(value).replace(',', '.'));
      return Number.isFinite(n) ? null : 'Informe um número.';
    }
  }
}

export type AnswerValidation = { answers: Answers; errors: Record<string, string> };

/**
 * Confere as respostas contra a versão do modelo. Só ficam respostas de perguntas que existem, que
 * estão visíveis e que esse público pode responder — resposta de pergunta que a condição escondeu
 * é descartada, nunca tratada como atual. No envio, obrigatórias visíveis precisam de resposta;
 * no rascunho, não.
 */
export function validateAnswers(
  schema: FormSchema,
  raw: Answers,
  options: { mode: 'draft' | 'submit'; audience: 'client' | 'staff' },
): AnswerValidation {
  const answers: Answers = {};
  const errors: Record<string, string> = {};
  for (const section of sectionsFor(schema, options.audience)) {
    for (const question of section.questions) {
      if (!isQuestionVisible(schema, question, raw)) continue;
      const value = raw[question.id];
      if (isEmpty(value)) {
        if (options.mode === 'submit' && question.required) errors[question.id] = 'Obrigatória.';
        continue;
      }
      const error = checkValue(question, value);
      if (error) {
        errors[question.id] = error;
        continue;
      }
      answers[question.id] =
        question.type === 'number'
          ? typeof value === 'number'
            ? value
            : Number(String(value).replace(',', '.'))
          : typeof value === 'string'
            ? value.trim()
            : value;
    }
  }
  return { answers, errors };
}

/** Texto da resposta para leitura e PDF. */
export function answerText(question: Question, value: unknown): string {
  if (isEmpty(value)) return '—';
  const label = (id: unknown) => optionsOf(question).find((o) => o.id === id)?.label ?? String(id);
  if (question.type === 'multi_choice' && Array.isArray(value)) return value.map(label).join(', ');
  if (question.type === 'yes_no' || question.type === 'single_choice') return label(value);
  if (question.type === 'date' && typeof value === 'string') {
    const [y, m, d] = value.split('-');
    return `${d}/${m}/${y}`;
  }
  return String(value);
}

export const FORM_TYPE_LABEL = {
  ANAMNESIS: 'Anamnese',
  ASSESSMENT: 'Avaliação',
  SERVICE_RECORD: 'Ficha de atendimento',
  CUSTOM: 'Formulário personalizado',
} as const;

export const ENTRY_STATUS_LABEL = {
  REQUESTED: 'Não preenchida',
  DRAFT: 'Rascunho',
  SUBMITTED: 'Enviada — aguardando revisão',
  REVIEWED: 'Revisada',
} as const;

/** Id curto e imprevisível para perguntas, seções e opções novas (no editor). */
export function newId(prefix: string): string {
  const random =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 10)
      : Math.random().toString(36).slice(2, 12);
  return `${prefix}_${random}`;
}
