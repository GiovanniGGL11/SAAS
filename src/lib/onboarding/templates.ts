/*
  Serviços sugeridos por tipo de negócio no primeiro acesso. Preços de referência de mercado
  (capitais, 2026) — o dono ajusta antes de salvar.
*/

export type ServiceTemplate = { name: string; durationMinutes: number; price: number };

/** Tipos de negócio do primeiro acesso, nos mesmos grupos da página inicial. */
export const SEGMENT_GROUPS = [
  {
    title: 'Beleza e estética',
    items: [
      { value: 'barbearia', label: 'Barbearia' },
      { value: 'salao', label: 'Salão de beleza' },
      { value: 'estetica', label: 'Clínica de estética' },
      { value: 'unhas', label: 'Manicure e pedicure' },
      { value: 'cilios', label: 'Lash e sobrancelhas' },
      { value: 'tatuagem', label: 'Tatuagem e piercing' },
      { value: 'depilacao', label: 'Depilação e bronzeamento' },
    ],
  },
  {
    title: 'Saúde e bem-estar',
    items: [
      { value: 'consultorio', label: 'Consultório ou clínica' },
      { value: 'odonto', label: 'Odontologia' },
      { value: 'psicologia', label: 'Psicologia e terapias' },
      { value: 'nutricao', label: 'Nutrição' },
      { value: 'fisio', label: 'Fisioterapia e pilates' },
      { value: 'massoterapia', label: 'Massoterapia e spa' },
      { value: 'personal', label: 'Personal trainer e estúdio' },
    ],
  },
  {
    title: 'Pets',
    items: [
      { value: 'banho_tosa', label: 'Banho e tosa' },
      { value: 'veterinaria', label: 'Veterinária' },
    ],
  },
  {
    title: 'Aulas, serviços e consultoria',
    items: [
      { value: 'aulas', label: 'Aulas particulares e idiomas' },
      { value: 'musica', label: 'Música e artes' },
      { value: 'fotografia', label: 'Fotografia e estúdio' },
      { value: 'consultoria', label: 'Advocacia e contabilidade' },
      { value: 'automotivo', label: 'Estética automotiva e oficina' },
    ],
  },
  { title: '', items: [{ value: 'outro', label: 'Outro' }] },
] as const;

export type Segment = (typeof SEGMENT_GROUPS)[number]['items'][number]['value'];

const t = (name: string, durationMinutes: number, price: number): ServiceTemplate => ({
  name,
  durationMinutes,
  price,
});

export const SERVICE_TEMPLATES: Record<Segment, ServiceTemplate[]> = {
  barbearia: [
    t('Corte', 40, 50),
    t('Barba', 30, 35),
    t('Corte + barba', 60, 80),
    t('Sobrancelha', 15, 20),
    t('Pezinho', 15, 15),
  ],
  salao: [
    t('Corte feminino', 60, 90),
    t('Escova', 45, 60),
    t('Coloração', 120, 180),
    t('Hidratação', 45, 80),
    t('Corte masculino', 30, 50),
  ],
  estetica: [
    t('Limpeza de pele', 60, 150),
    t('Drenagem linfática', 60, 130),
    t('Massagem relaxante', 60, 140),
    t('Depilação a laser (sessão)', 30, 120),
    t('Avaliação', 30, 0),
  ],
  unhas: [
    t('Mão', 45, 35),
    t('Pé', 45, 40),
    t('Pé e mão', 90, 70),
    t('Alongamento em gel', 120, 150),
    t('Esmaltação em gel', 60, 70),
  ],
  cilios: [
    t('Extensão de cílios (fio a fio)', 120, 160),
    t('Manutenção de cílios', 60, 100),
    t('Design de sobrancelhas', 30, 45),
    t('Design com henna', 45, 60),
    t('Lash lifting', 60, 120),
  ],
  tatuagem: [
    t('Orçamento e avaliação', 30, 0),
    t('Tatuagem pequena', 60, 250),
    t('Sessão de tatuagem (até 3 h)', 180, 600),
    t('Retoque', 60, 100),
    t('Piercing (com joia)', 30, 120),
  ],
  depilacao: [
    t('Pernas inteiras', 40, 70),
    t('Virilha completa', 30, 60),
    t('Axilas', 15, 25),
    t('Buço', 10, 20),
    t('Bronzeamento natural', 60, 120),
  ],
  consultorio: [
    t('Primeira consulta', 45, 300),
    t('Consulta', 30, 250),
    t('Retorno', 20, 0),
    t('Teleconsulta', 30, 200),
  ],
  odonto: [
    t('Avaliação', 30, 0),
    t('Limpeza (profilaxia)', 45, 200),
    t('Restauração', 60, 250),
    t('Extração simples', 45, 300),
    t('Clareamento (sessão)', 60, 500),
  ],
  psicologia: [
    t('Primeira sessão', 50, 180),
    t('Sessão de psicoterapia', 50, 180),
    t('Sessão online', 50, 170),
    t('Terapia de casal', 60, 250),
  ],
  nutricao: [
    t('Primeira consulta', 60, 250),
    t('Retorno', 40, 150),
    t('Consulta online', 50, 200),
    t('Bioimpedância', 20, 60),
  ],
  fisio: [
    t('Avaliação fisioterapêutica', 50, 150),
    t('Sessão de fisioterapia', 50, 120),
    t('Aula de pilates', 50, 80),
    t('Aula experimental de pilates', 50, 0),
    t('RPG', 50, 150),
  ],
  massoterapia: [
    t('Massagem relaxante', 60, 140),
    t('Massagem modeladora', 60, 150),
    t('Drenagem linfática', 60, 130),
    t('Massagem com pedras quentes', 75, 180),
    t('Reflexologia', 45, 110),
  ],
  personal: [
    t('Aula experimental', 60, 0),
    t('Treino personalizado', 60, 120),
    t('Avaliação física', 45, 100),
    t('Treino em dupla', 60, 180),
    t('Treino online', 60, 90),
  ],
  banho_tosa: [
    t('Banho (porte pequeno)', 60, 60),
    t('Banho (porte grande)', 90, 100),
    t('Banho e tosa', 120, 120),
    t('Tosa higiênica', 30, 40),
    t('Hidratação de pelagem', 30, 40),
  ],
  veterinaria: [
    t('Consulta', 30, 180),
    t('Retorno', 20, 0),
    t('Vacinação', 15, 120),
    t('Check-up', 45, 250),
    t('Consulta de urgência', 45, 300),
  ],
  aulas: [
    t('Aula experimental', 30, 0),
    t('Aula particular', 60, 90),
    t('Aula em dupla', 60, 140),
    t('Aula online', 60, 80),
    t('Reforço escolar', 60, 70),
  ],
  musica: [
    t('Aula experimental', 30, 0),
    t('Aula de instrumento', 60, 100),
    t('Aula de canto', 60, 110),
    t('Aula de desenho e pintura', 90, 100),
    t('Aula em grupo', 60, 60),
  ],
  fotografia: [
    t('Ensaio em estúdio', 60, 350),
    t('Ensaio externo', 120, 600),
    t('Retrato profissional', 45, 250),
    t('Fotos de produto', 120, 500),
    t('Aluguel de estúdio (hora)', 60, 120),
  ],
  consultoria: [
    t('Primeira conversa', 30, 0),
    t('Consulta', 60, 300),
    t('Reunião de acompanhamento', 30, 150),
    t('Consulta online', 60, 250),
    t('Análise de documentos', 60, 350),
  ],
  automotivo: [
    t('Lavagem completa', 60, 80),
    t('Lavagem detalhada', 120, 180),
    t('Higienização interna', 180, 300),
    t('Polimento', 240, 450),
    t('Diagnóstico', 60, 150),
  ],
  outro: [t('Atendimento', 60, 100), t('Avaliação', 30, 0), t('Retorno', 30, 50)],
};

/** Cores de agenda para a equipe criada no primeiro acesso (uma por pessoa). */
export const TEAM_COLORS = [
  '#3b82f6',
  '#22c55e',
  '#a855f7',
  '#f97316',
  '#06b6d4',
  '#ec4899',
  '#eab308',
  '#6366f1',
];
export const SERVICE_COLORS = [
  '#0ea5e9',
  '#10b981',
  '#8b5cf6',
  '#f59e0b',
  '#ef4444',
  '#14b8a6',
  '#6366f1',
  '#ec4899',
];
