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

// ---- Modelos genéricos (qualquer tipo de negócio) ----------------------------------------------

export type StarterTemplate = {
  key: string;
  name: string;
  type: 'ANAMNESIS' | 'ASSESSMENT' | 'SERVICE_RECORD' | 'CUSTOM';
  description: string;
  instructions: string;
  fillableBy: 'CLIENT' | 'PROFESSIONAL' | 'BOTH';
  schema: FormSchema;
};

const yesNo = (id: string, title: string, required = false) => ({
  id,
  type: 'yes_no' as const,
  title,
  required,
});
const text = (id: string, title: string, long = false, required = false) => ({
  id,
  type: long ? ('long_text' as const) : ('short_text' as const),
  title,
  required,
});

/**
 * Pontos de partida editáveis, criados só quando a empresa pede. Nenhum texto aqui é validado
 * juridicamente ou tecnicamente: termos e autorizações precisam ser revisados pela empresa.
 */
export const STARTER_TEMPLATES: StarterTemplate[] = [
  {
    key: 'cadastro',
    name: 'Cadastro complementar',
    type: 'CUSTOM',
    description: 'Informações extras do cliente para atender melhor.',
    instructions: 'Preencha o que quiser compartilhar. Nada aqui é obrigatório.',
    fillableBy: 'BOTH',
    schema: {
      sections: [
        {
          id: 'sec_dados',
          title: 'Sobre você',
          audience: 'any',
          questions: [
            text('q_apelido', 'Como prefere ser chamado(a)?'),
            text('q_profissao', 'Profissão'),
            {
              id: 'q_contato',
              type: 'single_choice',
              title: 'Melhor forma de contato',
              required: false,
              options: [
                { id: 'whatsapp', label: 'WhatsApp' },
                { id: 'ligacao', label: 'Ligação' },
                { id: 'email', label: 'E-mail' },
              ],
            },
            text('q_conheceu', 'Como conheceu a gente?'),
            text('q_obs', 'Algo mais que devemos saber?', true),
          ],
        },
      ],
    },
  },
  {
    key: 'questionario',
    name: 'Questionário inicial',
    type: 'ASSESSMENT',
    description: 'Entender a necessidade antes do primeiro atendimento ou orçamento.',
    instructions: 'Suas respostas ajudam a preparar o atendimento.',
    fillableBy: 'BOTH',
    schema: {
      sections: [
        {
          id: 'sec_necessidade',
          title: 'Sua necessidade',
          audience: 'any',
          questions: [
            text('q_objetivo', 'O que você precisa?', true, true),
            text('q_prazo', 'Para quando?'),
            text('q_expectativa', 'O que seria um ótimo resultado para você?', true),
          ],
        },
        {
          id: 'sec_equipe',
          title: 'Observações da equipe',
          audience: 'staff',
          questions: [text('q_equipe', 'Anotações internas', true)],
        },
      ],
    },
  },
  {
    key: 'autorizacao',
    name: 'Autorização',
    type: 'CUSTOM',
    description: 'Autorizações do cliente (contato, uso de imagem). Revise o texto antes de usar.',
    instructions: 'Marque o que você autoriza. Você pode mudar de ideia a qualquer momento.',
    fillableBy: 'CLIENT',
    schema: {
      sections: [
        {
          id: 'sec_autoriza',
          title: 'Autorizações',
          audience: 'client',
          questions: [
            yesNo(
              'q_whatsapp',
              'Autorizo receber mensagens pelo WhatsApp sobre meus atendimentos.',
            ),
            yesNo(
              'q_imagem',
              'Autorizo o uso de fotos do resultado do serviço (sem identificar meu rosto).',
            ),
          ],
        },
      ],
    },
  },
  {
    key: 'checklist',
    name: 'Checklist do atendimento',
    type: 'SERVICE_RECORD',
    description: 'Conferência feita pela equipe antes e depois do serviço.',
    instructions: 'Preenchido pela equipe.',
    fillableBy: 'PROFESSIONAL',
    schema: {
      sections: [
        {
          id: 'sec_check',
          title: 'Conferência',
          audience: 'staff',
          questions: [
            yesNo('q_material', 'Material e equipamento conferidos'),
            yesNo('q_combinado', 'O que foi combinado com o cliente foi conferido'),
            yesNo('q_entrega', 'Resultado conferido com o cliente na entrega'),
            text('q_ocorrencias', 'Ocorrências', true),
          ],
        },
      ],
    },
  },
  {
    key: 'termo',
    name: 'Termo de ciência',
    type: 'CUSTOM',
    description:
      'Modelo em branco: escreva o seu termo nas instruções. O sistema não valida textos jurídicos.',
    instructions:
      'ESCREVA AQUI O TEXTO DO SEU TERMO (condições, cuidados, prazos). Este texto não é revisado juridicamente pelo sistema.',
    fillableBy: 'CLIENT',
    schema: {
      sections: [
        {
          id: 'sec_ciencia',
          title: 'Ciência',
          audience: 'client',
          questions: [
            yesNo('q_li', 'Li as informações acima e estou de acordo.', true),
            text('q_duvidas', 'Ficou alguma dúvida?', true),
          ],
        },
      ],
    },
  },
  {
    key: 'pesquisa',
    name: 'Pesquisa rápida',
    type: 'CUSTOM',
    description: 'Opinião do cliente sobre um serviço ou etapa (além da avaliação por estrelas).',
    instructions: 'Leva menos de um minuto. Obrigado!',
    fillableBy: 'CLIENT',
    schema: {
      sections: [
        {
          id: 'sec_pesquisa',
          title: 'Sua opinião',
          audience: 'client',
          questions: [
            {
              id: 'q_nota',
              type: 'single_choice',
              title: 'Como foi a sua experiência?',
              required: true,
              options: [
                { id: '5', label: 'Excelente' },
                { id: '4', label: 'Boa' },
                { id: '3', label: 'Regular' },
                { id: '2', label: 'Ruim' },
                { id: '1', label: 'Péssima' },
              ],
            },
            text('q_melhorar', 'O que podemos melhorar?', true),
          ],
        },
      ],
    },
  },
];
