import { prisma } from '@/lib/db';
import { allQuestions, optionsOf, type Answers, type FormSchema } from '@/lib/forms/schema';
import { UserError } from '@/server/errors';
import { getClientReturnSuggestion } from '@/server/data/returns';
import type { FormAccess } from '@/server/data/form-permissions';

/*
  Prontuário do paciente (ramos de saúde, estética e odonto — src/lib/medical-records.ts).
  Junta o que já existe (fichas, registros com fotos, sessões, orçamentos) e acrescenta:
  - alertas da anamnese no topo (perguntas marcadas "Alerta no prontuário" no modelo);
  - evoluções, que nunca são apagadas nem editadas: corrigir cria uma retificação.

  Quem lê e escreve: quem pode ler as respostas das fichas (os mesmos dados de saúde). Quem tem o
  escopo "só os meus" vê as evoluções dos próprios atendimentos.
*/

export type RecordAlert = {
  /** Título curto (o da seção, ou da pergunta). */
  label: string;
  detail: string;
  formName: string;
  answeredAt: Date | null;
};

const NO_WORDS = /^(n[ãa]o|nenhum[a]?|nada|n\/a|-)\.?$/i;

/**
 * Alertas da anamnese: da ficha mais recente respondida de cada modelo, as perguntas marcadas
 * "Alerta no prontuário" com resposta que importa ("Sim", texto que não seja "não"/"nenhuma",
 * opções escolhidas). Num "Sim", junta as respostas das perguntas que dependem dele ("Quais?").
 */
export async function getRecordAlerts(companyId: string, clientId: string): Promise<RecordAlert[]> {
  const entries = await prisma.formEntry.findMany({
    where: { companyId, clientId, status: { in: ['SUBMITTED', 'REVIEWED'] } },
    orderBy: { submittedAt: 'desc' },
    select: {
      templateId: true,
      answers: true,
      submittedAt: true,
      template: { select: { name: true } },
      version: { select: { schema: true } },
    },
  });
  const latest = new Map<string, (typeof entries)[number]>();
  for (const e of entries) if (!latest.has(e.templateId)) latest.set(e.templateId, e);

  const alerts: RecordAlert[] = [];
  for (const entry of latest.values()) {
    const schema = entry.version.schema as unknown as FormSchema;
    const answers = (
      entry.answers && typeof entry.answers === 'object' ? entry.answers : {}
    ) as Answers;
    const sectionOf = new Map<string, string>();
    for (const s of schema.sections ?? [])
      for (const q of s.questions) sectionOf.set(q.id, s.title);
    const questions = allQuestions(schema);

    const textOf = (qid: string): string | null => {
      const q = questions.find((x) => x.id === qid);
      const value = answers[qid];
      if (!q || value === undefined || value === null) return null;
      if (q.type === 'yes_no' || q.type === 'single_choice') {
        const label = optionsOf(q).find((o) => o.id === value)?.label ?? null;
        return label && !NO_WORDS.test(label.trim()) ? label : null;
      }
      if (q.type === 'multi_choice' && Array.isArray(value)) {
        const labels = optionsOf(q)
          .filter((o) => (value as unknown[]).includes(o.id))
          .map((o) => o.label)
          .filter((l) => !NO_WORDS.test(l.trim()));
        return labels.length ? labels.join(', ') : null;
      }
      const text = String(value).trim();
      return text && !NO_WORDS.test(text) ? text : null;
    };

    for (const q of questions) {
      if (!q.alert) continue;
      let detail: string | null;
      if (q.type === 'yes_no') {
        if (answers[q.id] !== 'yes') continue;
        const follow = questions
          .filter((x) => x.showIf?.questionId === q.id && x.showIf.optionId === 'yes')
          .map((x) => textOf(x.id))
          .filter((t): t is string => !!t);
        detail = follow.length ? follow.join(' · ') : 'Sim';
      } else {
        detail = textOf(q.id);
      }
      if (!detail) continue;
      alerts.push({
        label: sectionOf.get(q.id) ?? q.title,
        detail,
        formName: entry.template.name,
        answeredAt: entry.submittedAt,
      });
    }
  }
  return alerts;
}

/** Cabeçalho do prontuário: dados do paciente, próxima consulta, retorno e alertas. */
export async function getMedicalRecordHeader(companyId: string, clientId: string) {
  const client = await prisma.client.findFirst({
    where: { id: clientId, companyId },
    select: {
      id: true,
      name: true,
      phone: true,
      email: true,
      birthDate: true,
      notes: true,
      isVip: true,
      active: true,
      createdAt: true,
      insuranceName: true,
      insuranceNumber: true,
      insurancePlan: true,
    },
  });
  if (!client) throw new UserError('Paciente não encontrado.');
  const [next, lastVisit, returnSuggestion, alerts, notesCount] = await Promise.all([
    prisma.appointment.findFirst({
      where: {
        companyId,
        clientId,
        startAt: { gte: new Date() },
        status: { in: ['SCHEDULED', 'CONFIRMED', 'IN_PROGRESS'] },
      },
      orderBy: { startAt: 'asc' },
      select: {
        id: true,
        startAt: true,
        serviceNameSnapshot: true,
        professional: { select: { name: true } },
      },
    }),
    prisma.appointment.findFirst({
      where: { companyId, clientId, status: 'DONE' },
      orderBy: { startAt: 'desc' },
      select: { startAt: true, serviceNameSnapshot: true },
    }),
    getClientReturnSuggestion(companyId, clientId),
    getRecordAlerts(companyId, clientId),
    prisma.clinicalNote.count({ where: { companyId, clientId } }),
  ]);
  return {
    client,
    nextAppointment: next
      ? {
          id: next.id,
          startAt: next.startAt,
          serviceName: next.serviceNameSnapshot,
          professionalName: next.professional.name,
        }
      : null,
    lastVisit: lastVisit
      ? { startAt: lastVisit.startAt, serviceName: lastVisit.serviceNameSnapshot }
      : null,
    returnSuggestion: returnSuggestion
      ? {
          serviceName: returnSuggestion.serviceName,
          dueAt: returnSuggestion.dueAt,
          daysLate: returnSuggestion.daysLate,
        }
      : null,
    alerts,
    notesCount,
  };
}

/** Evoluções do paciente (mais recente primeiro), com a marca de retificada. */
export async function listClinicalNotes(companyId: string, clientId: string, access: FormAccess) {
  const own = access.scope === 'OWN';
  const notes = await prisma.clinicalNote.findMany({
    where: {
      companyId,
      clientId,
      ...(own
        ? {
            OR: [
              { authorUserId: access.userId },
              ...(access.professionalId ? [{ professionalId: access.professionalId }] : []),
            ],
          }
        : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: 200,
    select: {
      id: true,
      text: true,
      createdAt: true,
      authorName: true,
      authorUserId: true,
      appointmentId: true,
      amendsId: true,
      amendedBy: { select: { id: true, createdAt: true } },
    },
  });
  return notes.map((n) => ({
    id: n.id,
    text: n.text,
    createdAt: n.createdAt,
    authorName: n.authorName,
    appointmentId: n.appointmentId,
    amendsId: n.amendsId,
    amendedAt: n.amendedBy?.createdAt ?? null,
    mine: n.authorUserId === access.userId,
  }));
}

/**
 * Nova evolução (ou retificação de uma anterior). Uma evolução só é retificada uma vez; para
 * corrigir de novo, retifica-se a retificação. O texto anterior continua no prontuário.
 */
export async function createClinicalNote(params: {
  companyId: string;
  clientId: string;
  text: string;
  authorUserId: string;
  authorName: string;
  appointmentId?: string | null;
  amendsId?: string | null;
}) {
  const text = params.text.trim();
  if (text.length < 3) throw new UserError('Escreva a evolução.');
  if (text.length > 20_000) throw new UserError('A evolução passou do tamanho máximo.');
  const client = await prisma.client.findFirst({
    where: { id: params.clientId, companyId: params.companyId },
    select: { id: true },
  });
  if (!client) throw new UserError('Paciente não encontrado.');

  let professionalId: string | null = null;
  if (params.appointmentId) {
    const appointment = await prisma.appointment.findFirst({
      where: { id: params.appointmentId, companyId: params.companyId, clientId: params.clientId },
      select: { professionalId: true },
    });
    if (!appointment) throw new UserError('Atendimento não encontrado para este paciente.');
    professionalId = appointment.professionalId;
  }
  if (params.amendsId) {
    const original = await prisma.clinicalNote.findFirst({
      where: { id: params.amendsId, companyId: params.companyId, clientId: params.clientId },
      select: {
        id: true,
        appointmentId: true,
        professionalId: true,
        amendedBy: { select: { id: true } },
      },
    });
    if (!original) throw new UserError('Evolução não encontrada.');
    if (original.amendedBy) {
      throw new UserError('Esta evolução já foi retificada. Retifique a versão mais nova.');
    }
    professionalId = professionalId ?? original.professionalId;
  }
  try {
    return await prisma.clinicalNote.create({
      data: {
        companyId: params.companyId,
        clientId: params.clientId,
        text,
        appointmentId: params.appointmentId ?? null,
        professionalId,
        amendsId: params.amendsId ?? null,
        authorUserId: params.authorUserId,
        authorName: params.authorName,
      },
      select: { id: true },
    });
  } catch (error) {
    // Duas retificações da mesma evolução ao mesmo tempo: a segunda esbarra no índice único.
    if ((error as { code?: string }).code === 'P2002') {
      throw new UserError('Esta evolução já foi retificada. Retifique a versão mais nova.');
    }
    throw error;
  }
}
