/*
  Resumo do prontuário com IA (fase 4). Aqui fica a parte pura: o que vai para a IA e como a
  resposta volta. Vai só o necessário para o resumo clínico: idade, alertas da anamnese,
  observações do cadastro, evoluções, plano de tratamento e datas. Nunca nome, telefone, e-mail,
  CPF ou carteirinha do convênio. O resumo aparece na tela e não vira registro do prontuário.
*/

/** Quantas evoluções (as mais recentes, já sem as retificadas) entram no resumo. */
export const SUMMARY_MAX_NOTES = 30;
const NOTE_MAX_CHARS = 1500;
const INPUT_MAX_CHARS = 40_000;

export type SummaryInput = {
  age: number | null;
  clientNotes: string | null;
  alerts: { label: string; detail: string }[];
  nextAppointment: { startAt: Date | string; serviceName: string } | null;
  lastVisit: { startAt: Date | string; serviceName: string } | null;
  returnSuggestion: { serviceName: string; dueAt: Date | string; daysLate: number } | null;
  notes: {
    text: string;
    createdAt: Date | string;
    amendsId: string | null;
    amendedAt: Date | string | null;
  }[];
  plan: { title: string; items: { description: string; total: number; done: number }[] }[];
  /** Odontograma: o que está marcado a fazer (ex.: "36 · Cárie (O) · a fazer"). */
  dentalPending?: string[];
  /** Últimas aplicações do mapa facial (ex.: "10/11/2026: Toxina botulínica, 24 U"). */
  faceMaps?: string[];
};

export type MedicalSummary = {
  overview: string;
  alerts: string[];
  treatment: string[];
  recent: string[];
  attention: string[];
};

export const SUMMARY_INSTRUCTIONS = `Você ajuda profissionais de saúde, estética e odontologia a se preparar para o atendimento. Recebe os dados do prontuário de um paciente e escreve um resumo curto, em português do Brasil.

Regras:
- Use só o que está nos dados. Não invente, não suponha e não complete lacunas.
- Não faça diagnóstico, não sugira remédio, dose nem conduta clínica. Só organize o que foi registrado.
- Chame a pessoa de "paciente". Não use nomes.
- Frases curtas e diretas. Cada item da lista com no máximo 2 frases.
- overview: 2 ou 3 frases com o quadro geral (idade, há quanto tempo é atendido, o que trata).
- alerts: alergias, medicamentos, doenças e outros cuidados que aparecem nos alertas ou nas evoluções. Lista vazia se não houver.
- treatment: procedimentos do plano com o andamento (ex.: "Clareamento: 2 de 3 sessões feitas"), o que está a fazer no odontograma e as últimas aplicações do mapa facial. Lista vazia se não houver nada disso.
- recent: o que aconteceu nos últimos atendimentos, do mais recente para o mais antigo, com a data. No máximo 5 itens.
- attention: o que a profissional deve olhar no próximo atendimento, segundo o que já foi registrado (retorno atrasado, sessões que faltam, queixa que se repete, orientação pendente). Lista vazia se não houver.
- Se houver pouca informação, diga isso no overview em vez de encher.`;

export const SUMMARY_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    overview: { type: 'STRING' },
    alerts: { type: 'ARRAY', items: { type: 'STRING' } },
    treatment: { type: 'ARRAY', items: { type: 'STRING' } },
    recent: { type: 'ARRAY', items: { type: 'STRING' } },
    attention: { type: 'ARRAY', items: { type: 'STRING' } },
  },
  required: ['overview', 'alerts', 'treatment', 'recent', 'attention'],
} as const;

const dateIn = (d: Date | string, timezone: string) =>
  new Intl.DateTimeFormat('pt-BR', {
    timeZone: timezone,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(d));

const clip = (text: string, max: number) =>
  text.length > max ? `${text.slice(0, max).trimEnd()}…` : text;

/** Quando não há nada para resumir, nem chama a IA. */
export function hasSummaryContent(input: SummaryInput): boolean {
  return (
    input.notes.length > 0 ||
    input.alerts.length > 0 ||
    input.plan.some((q) => q.items.length > 0) ||
    !!input.dentalPending?.length ||
    !!input.faceMaps?.length ||
    !!input.clientNotes?.trim()
  );
}

/** Texto enviado à IA (sem dados que identificam o paciente). */
export function buildSummaryPrompt(input: SummaryInput, timezone: string, now = new Date()) {
  const lines: string[] = [`Data de hoje: ${dateIn(now, timezone)}`];
  lines.push(`Idade: ${input.age !== null ? `${input.age} anos` : 'não informada'}`);
  if (input.clientNotes?.trim()) {
    lines.push(`Observações do cadastro: ${clip(input.clientNotes.trim(), 1000)}`);
  }

  lines.push('', '## Alertas da anamnese');
  if (input.alerts.length) {
    for (const a of input.alerts) lines.push(`- ${a.label}: ${clip(a.detail, 400)}`);
  } else lines.push('Nenhum.');

  lines.push('', '## Agenda');
  lines.push(
    `Último atendimento concluído: ${
      input.lastVisit
        ? `${dateIn(input.lastVisit.startAt, timezone)} (${input.lastVisit.serviceName})`
        : 'nenhum'
    }`,
  );
  lines.push(
    `Próxima consulta: ${
      input.nextAppointment
        ? `${dateIn(input.nextAppointment.startAt, timezone)} (${input.nextAppointment.serviceName})`
        : 'nenhuma marcada'
    }`,
  );
  if (input.returnSuggestion) {
    const r = input.returnSuggestion;
    lines.push(
      `Retorno previsto de ${r.serviceName}: ${dateIn(r.dueAt, timezone)}${
        r.daysLate > 0 ? ` (atrasado ${r.daysLate} dias)` : ''
      }`,
    );
  }

  lines.push('', '## Plano de tratamento');
  const items = input.plan.flatMap((q) =>
    q.items.map((i) => `- ${i.description} (${q.title}): ${i.done} de ${i.total} sessões feitas`),
  );
  lines.push(...(items.length ? items : ['Nenhum.']));

  if (input.dentalPending?.length) {
    lines.push('', '## Odontograma: a fazer');
    for (const d of input.dentalPending.slice(0, 40)) lines.push(`- ${clip(d, 200)}`);
  }
  if (input.faceMaps?.length) {
    lines.push('', '## Mapa facial: últimas aplicações');
    for (const f of input.faceMaps.slice(0, 5)) lines.push(`- ${clip(f, 300)}`);
  }

  // Só a versão em vigor de cada evolução: a retificada sai, a retificação fica.
  const current = input.notes
    .filter((n) => !n.amendedAt)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, SUMMARY_MAX_NOTES);
  lines.push('', `## Evoluções (${current.length}, da mais recente para a mais antiga)`);
  if (current.length) {
    for (const n of current) {
      lines.push(
        `- ${dateIn(n.createdAt, timezone)}${n.amendsId ? ' (retificação)' : ''}: ${clip(
          n.text.trim().replace(/\s+/g, ' '),
          NOTE_MAX_CHARS,
        )}`,
      );
    }
  } else lines.push('Nenhuma.');

  return clip(lines.join('\n'), INPUT_MAX_CHARS);
}

const strings = (value: unknown, max: number) =>
  Array.isArray(value)
    ? value
        .filter((v): v is string => typeof v === 'string')
        .map((v) => clip(v.trim(), 400))
        .filter(Boolean)
        .slice(0, max)
    : [];

/** Confere a resposta da IA (formato e tamanho) antes de mostrar. */
export function normalizeSummary(raw: unknown): MedicalSummary {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const overview = typeof obj.overview === 'string' ? clip(obj.overview.trim(), 800) : '';
  if (!overview) throw new Error('Não consegui montar o resumo. Tente de novo.');
  return {
    overview,
    alerts: strings(obj.alerts, 10),
    treatment: strings(obj.treatment, 10),
    recent: strings(obj.recent, 5),
    attention: strings(obj.attention, 6),
  };
}
