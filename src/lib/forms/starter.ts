import type { FormSchema } from '@/lib/forms/schema';

/**
 * Modelo inicial de anamnese: ponto de partida editável, criado só quando a empresa pede (nunca
 * ativado sozinho). Perguntas genéricas de autorrelato — não diagnostica, não classifica risco,
 * não aprova procedimento e não substitui a avaliação do profissional responsável, que deve
 * adaptar o modelo à sua área antes de usar. Nenhuma pergunta de saúde é obrigatória.
 */
export const STARTER_ANAMNESIS_NAME = 'Anamnese (modelo inicial)';

export const STARTER_ANAMNESIS_DESCRIPTION =
  'Ponto de partida: o profissional responsável deve revisar e adaptar as perguntas à sua área antes de usar.';

export const STARTER_ANAMNESIS_INSTRUCTIONS =
  'As informações ajudam o profissional a preparar o seu atendimento. Responda o que souber; ' +
  'perguntas sem asterisco podem ficar em branco e ser conversadas no dia.';

export const STARTER_ANAMNESIS_SCHEMA: FormSchema = {
  sections: [
    {
      id: 'sec_objetivo',
      title: 'Objetivo do atendimento',
      audience: 'any',
      questions: [
        {
          id: 'q_objetivo',
          type: 'long_text',
          title: 'O que você espera deste atendimento?',
          required: false,
        },
      ],
    },
    {
      id: 'sec_procedimentos',
      title: 'Procedimentos anteriores relatados',
      audience: 'any',
      questions: [
        {
          id: 'q_procedimento_anterior',
          type: 'yes_no',
          title: 'Já fez algum procedimento parecido antes?',
          required: false,
        },
        {
          id: 'q_procedimento_quais',
          type: 'long_text',
          title: 'Qual e quando, aproximadamente?',
          required: false,
          showIf: { questionId: 'q_procedimento_anterior', optionId: 'yes' },
        },
      ],
    },
    {
      id: 'sec_alergias',
      title: 'Alergias e reações relatadas',
      audience: 'any',
      questions: [
        {
          id: 'q_alergia',
          type: 'yes_no',
          title: 'Tem alguma alergia ou já teve reação a algum produto?',
          required: false,
        },
        {
          id: 'q_alergia_quais',
          type: 'long_text',
          title: 'Quais?',
          help: 'Produtos, materiais, medicamentos ou alimentos.',
          required: false,
          showIf: { questionId: 'q_alergia', optionId: 'yes' },
        },
      ],
    },
    {
      id: 'sec_medicamentos',
      title: 'Medicamentos em uso informados pelo cliente',
      audience: 'any',
      questions: [
        {
          id: 'q_medicamentos',
          type: 'yes_no',
          title: 'Usa algum medicamento de forma contínua?',
          required: false,
        },
        {
          id: 'q_medicamentos_quais',
          type: 'long_text',
          title: 'Quais?',
          required: false,
          showIf: { questionId: 'q_medicamentos', optionId: 'yes' },
        },
      ],
    },
    {
      id: 'sec_condicoes',
      title: 'Condições de saúde informadas',
      description: 'Informações que você relata. Nada aqui é um diagnóstico.',
      audience: 'any',
      questions: [
        {
          id: 'q_condicoes',
          type: 'long_text',
          title: 'Há alguma condição de saúde que o profissional deva saber?',
          required: false,
        },
      ],
    },
    {
      id: 'sec_adicionais',
      title: 'Informações adicionais',
      audience: 'any',
      questions: [
        {
          id: 'q_adicionais',
          type: 'long_text',
          title: 'Quer contar mais alguma coisa?',
          required: false,
        },
        {
          id: 'q_declaracao',
          type: 'yes_no',
          title: 'As informações acima foram dadas por mim e vou avisar se algo mudar.',
          required: true,
        },
      ],
    },
    {
      id: 'sec_profissional',
      title: 'Observações do profissional',
      description: 'Preenchido pela equipe. Não aparece para o cliente.',
      audience: 'staff',
      questions: [
        {
          id: 'q_observacoes_profissional',
          type: 'long_text',
          title: 'Observações',
          required: false,
        },
      ],
    },
  ],
};
