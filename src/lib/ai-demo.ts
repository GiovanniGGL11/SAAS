/*
  Demonstração do assistente de IA para quem está num plano sem IA (o Básico). A IA tem custo,
  então é bem curta: poucas perguntas, uma vez só por empresa, só consulta (não muda nada),
  resposta rápida e sem conversa longa. As sugestões puxam perguntas diretas sobre o negócio.
*/

/** Perguntas de demonstração por empresa (uma vez, não renova). */
export const AI_DEMO_QUESTIONS = 3;
/** Tamanho máximo da pergunta (perguntas diretas). */
export const AI_DEMO_MAX_CHARS = 150;
/** Passos do modelo por pergunta (consultas a dados). Bem abaixo do que os planos usam. */
export const AI_DEMO_MAX_STEPS = 3;
/** Tempo máximo por resposta, em segundos. */
export const AI_DEMO_SECONDS = 25;

export const AI_DEMO_SUGGESTIONS = [
  'Quanto faturei este mês?',
  'Quantos atendimentos tenho amanhã?',
  'Qual serviço mais vendeu este mês?',
  'Quais clientes não voltam há mais de 60 dias?',
] as const;
