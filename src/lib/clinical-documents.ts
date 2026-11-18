/*
  Documentos do prontuário: receita, atestado, laudo, declaração de comparecimento, orientações e
  outro. Cada tipo tem um modelo de texto que a pessoa edita antes de emitir. {paciente}, {data} e
  {hora} são preenchidos sozinhos. O documento impresso leva o nome e o registro do profissional.
*/

export const DOCUMENT_KINDS = [
  'receita',
  'atestado',
  'laudo',
  'declaracao',
  'orientacoes',
  'outro',
] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

export const DOCUMENT_LABEL: Record<DocumentKind, string> = {
  receita: 'Receituário',
  atestado: 'Atestado',
  laudo: 'Laudo',
  declaracao: 'Declaração de comparecimento',
  orientacoes: 'Orientações ao paciente',
  outro: 'Outro documento',
};

const TEMPLATES: Record<DocumentKind, string> = {
  receita: [
    'Paciente: {paciente}',
    '',
    'Uso:',
    '',
    '1. Nome do medicamento ____ concentração ____',
    '   Tomar ____ de ____ em ____ horas, por ____ dias.',
    '',
    '2. ',
  ].join('\n'),
  atestado: [
    'Atesto, para os devidos fins, que {paciente} esteve sob meus cuidados nesta data,',
    'necessitando de ____ dia(s) de afastamento de suas atividades, a partir de {data}.',
  ].join('\n'),
  laudo: ['Paciente: {paciente}', 'Data: {data}', '', 'Avaliação:', '', 'Conclusão:'].join('\n'),
  declaracao: [
    'Declaro, para os devidos fins, que {paciente} compareceu a atendimento nesta data,',
    '{data}, às {hora}.',
  ].join('\n'),
  orientacoes: [
    'Orientações para {paciente}:',
    '',
    '- ',
    '- ',
    '',
    'Em caso de dúvida ou reação, entre em contato.',
  ].join('\n'),
  outro: '',
};

/** Modelo do tipo, com paciente, data e hora preenchidos. */
export function documentTemplate(
  kind: DocumentKind,
  values: { patient: string; date: string; time: string },
): string {
  return TEMPLATES[kind]
    .replaceAll('{paciente}', values.patient)
    .replaceAll('{data}', values.date)
    .replaceAll('{hora}', values.time);
}
