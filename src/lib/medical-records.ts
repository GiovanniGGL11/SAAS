/*
  Prontuário: área do paciente para os ramos de saúde, estética e odontologia. Liga sozinho pelo
  ramo escolhido no primeiro acesso; em Configurações dá para ligar ou desligar ("on"/"off").
  Os outros ramos (barbearia, salão, unhas, pet, aulas...) seguem só com a aba Clientes.
*/

/** Ramos que ganham o Prontuário sem precisar ligar. */
export const MEDICAL_SEGMENTS = [
  'estetica',
  'depilacao',
  'cilios',
  'consultorio',
  'odonto',
  'psicologia',
  'nutricao',
  'fisio',
  'massoterapia',
  'veterinaria',
] as const;

export type MedicalRecordsMode = 'on' | 'off' | null;

export function isMedicalSegment(segment: string | null | undefined): boolean {
  return !!segment && (MEDICAL_SEGMENTS as readonly string[]).includes(segment);
}

/** Prontuário ligado para esta empresa: a escolha em Configurações, senão o ramo. */
export function medicalRecordsEnabled(company: {
  segment?: string | null;
  medicalRecordsMode?: string | null;
}): boolean {
  if (company.medicalRecordsMode === 'on') return true;
  if (company.medicalRecordsMode === 'off') return false;
  return isMedicalSegment(company.segment);
}

export type EvolutionTemplate = { key: string; label: string; text: string };

const GENERAL: EvolutionTemplate = {
  key: 'geral',
  label: 'Evolução geral',
  text: [
    'Queixa principal:',
    '',
    'Avaliação:',
    '',
    'Conduta / procedimento realizado:',
    '',
    'Orientações ao paciente:',
    '',
    'Próximo passo / retorno:',
  ].join('\n'),
};

const AESTHETICS: EvolutionTemplate[] = [
  {
    key: 'estetica',
    label: 'Procedimento estético',
    text: [
      'Procedimento:',
      'Região tratada:',
      'Produto / lote / quantidade:',
      'Parâmetros do equipamento (se houver):',
      '',
      'Avaliação da pele antes:',
      'Reação durante / logo após:',
      '',
      'Orientações de cuidados em casa:',
      'Retorno sugerido:',
    ].join('\n'),
  },
  GENERAL,
];

const DENTAL: EvolutionTemplate[] = [
  {
    key: 'odonto',
    label: 'Atendimento odontológico',
    text: [
      'Queixa principal:',
      'Dente(s) / região:',
      'Exame clínico:',
      '',
      'Procedimento realizado:',
      'Anestesia (tipo / quantidade):',
      'Materiais utilizados:',
      '',
      'Prescrição / orientações:',
      'Próxima etapa do tratamento:',
    ].join('\n'),
  },
  GENERAL,
];

const PSYCHOLOGY: EvolutionTemplate[] = [
  {
    key: 'psicologia',
    label: 'Sessão',
    text: [
      'Demanda trazida na sessão:',
      '',
      'Intervenções realizadas:',
      '',
      'Observações / evolução:',
      '',
      'Encaminhamentos / tarefas para a próxima sessão:',
    ].join('\n'),
  },
  GENERAL,
];

const NUTRITION: EvolutionTemplate[] = [
  {
    key: 'nutricao',
    label: 'Consulta de nutrição',
    text: [
      'Peso: kg   Altura: m   IMC:',
      'Circunferências / bioimpedância:',
      '',
      'Recordatório / hábitos:',
      '',
      'Conduta e plano alimentar:',
      'Metas até o retorno:',
    ].join('\n'),
  },
  GENERAL,
];

const PHYSIO: EvolutionTemplate[] = [
  {
    key: 'fisio',
    label: 'Sessão de fisioterapia',
    text: [
      'Queixa / dor (0 a 10):',
      'Avaliação funcional:',
      '',
      'Condutas e exercícios realizados:',
      '',
      'Resposta ao tratamento:',
      'Orientações para casa:',
    ].join('\n'),
  },
  GENERAL,
];

const VET: EvolutionTemplate[] = [
  {
    key: 'veterinaria',
    label: 'Atendimento veterinário',
    text: [
      'Animal / espécie / raça / peso:',
      'Queixa do tutor:',
      'Exame clínico (temperatura, mucosas, hidratação):',
      '',
      'Procedimento / medicação aplicada:',
      'Prescrição e orientações ao tutor:',
      'Retorno:',
    ].join('\n'),
  },
  GENERAL,
];

/** Modelos de texto da evolução, pelo ramo (todo ramo tem pelo menos a evolução geral). */
export function evolutionTemplates(segment: string | null | undefined): EvolutionTemplate[] {
  switch (segment) {
    case 'estetica':
    case 'depilacao':
    case 'cilios':
      return AESTHETICS;
    case 'odonto':
      return DENTAL;
    case 'psicologia':
      return PSYCHOLOGY;
    case 'nutricao':
      return NUTRITION;
    case 'fisio':
    case 'massoterapia':
      return PHYSIO;
    case 'veterinaria':
      return VET;
    default:
      return [GENERAL];
  }
}

/** Idade em anos completos na data de hoje (para o cabeçalho do prontuário). */
export function ageOn(
  birthDate: Date | string | null | undefined,
  now = new Date(),
): number | null {
  if (!birthDate) return null;
  const b = new Date(birthDate);
  if (Number.isNaN(b.getTime())) return null;
  let age = now.getUTCFullYear() - b.getUTCFullYear();
  const beforeBirthday =
    now.getUTCMonth() < b.getUTCMonth() ||
    (now.getUTCMonth() === b.getUTCMonth() && now.getUTCDate() < b.getUTCDate());
  if (beforeBirthday) age -= 1;
  return age >= 0 && age < 150 ? age : null;
}
