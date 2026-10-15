/*
  Serviços sugeridos por tipo de negócio no primeiro acesso. Preços de referência de mercado
  (capitais, 2026) — o dono ajusta antes de salvar.
*/

export type ServiceTemplate = { name: string; durationMinutes: number; price: number };

export const SEGMENTS = [
  { value: 'barbearia', label: 'Barbearia' },
  { value: 'salao', label: 'Salão de beleza' },
  { value: 'estetica', label: 'Clínica de estética' },
  { value: 'unhas', label: 'Manicure e pedicure' },
  { value: 'cilios', label: 'Lash e sobrancelhas' },
  { value: 'outro', label: 'Outro' },
] as const;

export type Segment = (typeof SEGMENTS)[number]['value'];

export const SERVICE_TEMPLATES: Record<Segment, ServiceTemplate[]> = {
  barbearia: [
    { name: 'Corte', durationMinutes: 40, price: 50 },
    { name: 'Barba', durationMinutes: 30, price: 35 },
    { name: 'Corte + barba', durationMinutes: 60, price: 80 },
    { name: 'Sobrancelha', durationMinutes: 15, price: 20 },
    { name: 'Pezinho', durationMinutes: 15, price: 15 },
  ],
  salao: [
    { name: 'Corte feminino', durationMinutes: 60, price: 90 },
    { name: 'Escova', durationMinutes: 45, price: 60 },
    { name: 'Coloração', durationMinutes: 120, price: 180 },
    { name: 'Hidratação', durationMinutes: 45, price: 80 },
    { name: 'Corte masculino', durationMinutes: 30, price: 50 },
  ],
  estetica: [
    { name: 'Limpeza de pele', durationMinutes: 60, price: 150 },
    { name: 'Drenagem linfática', durationMinutes: 60, price: 130 },
    { name: 'Massagem relaxante', durationMinutes: 60, price: 140 },
    { name: 'Depilação a laser (sessão)', durationMinutes: 30, price: 120 },
    { name: 'Avaliação', durationMinutes: 30, price: 0 },
  ],
  unhas: [
    { name: 'Mão', durationMinutes: 45, price: 35 },
    { name: 'Pé', durationMinutes: 45, price: 40 },
    { name: 'Pé e mão', durationMinutes: 90, price: 70 },
    { name: 'Alongamento em gel', durationMinutes: 120, price: 150 },
    { name: 'Esmaltação em gel', durationMinutes: 60, price: 70 },
  ],
  cilios: [
    { name: 'Extensão de cílios (fio a fio)', durationMinutes: 120, price: 160 },
    { name: 'Manutenção de cílios', durationMinutes: 60, price: 100 },
    { name: 'Design de sobrancelhas', durationMinutes: 30, price: 45 },
    { name: 'Design com henna', durationMinutes: 45, price: 60 },
    { name: 'Lash lifting', durationMinutes: 60, price: 120 },
  ],
  outro: [{ name: 'Atendimento', durationMinutes: 60, price: 100 }],
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
