import {
  FORM_TYPE_LABEL,
  ENTRY_STATUS_LABEL,
  answerText,
  isQuestionVisible,
} from '@/lib/forms/schema';
import type { EntryExport } from '@/server/data/forms';
import type { getSessionRecord } from '@/server/data/package-sessions';
import { PdfWriter, formatDateTimeTz } from '@/server/pdf/writer';

/*
  PDFs de fichas, registros de sessão e pacotes. Documento interno: não é assinatura digital
  certificada, revisão não é autorização clínica e nada aqui afirma conformidade legal.
*/

const DISCLAIMER =
  'Documento interno gerado pelo Atendafy. Assinatura desenhada e revisão não equivalem a assinatura digital certificada.';

export type EntryPdfData = EntryExport & {
  filledByName: string | null;
  reviewedByName: string | null;
};

function filledByLabel(data: EntryPdfData) {
  if (data.filledBy === 'CLIENT') return 'Cliente (link de preenchimento)';
  if (data.filledBy === 'STAFF')
    return `Equipe${data.filledByName ? ` — ${data.filledByName}` : ''}`;
  return '—';
}

export function writeEntry(w: PdfWriter, data: EntryPdfData, timezone: string) {
  w.heading(`${data.formName}`, 15);
  w.text(
    `${FORM_TYPE_LABEL[data.templateType]} · versão ${data.version} do modelo${
      data.revision > 1 ? ` · revisão ${data.revision} das respostas` : ''
    }`,
    { muted: true, size: 9, gap: 8 },
  );
  w.field('Cliente', data.clientName);
  w.field('Situação', ENTRY_STATUS_LABEL[data.status]);
  if (data.appointmentAt)
    w.field('Atendimento vinculado', formatDateTimeTz(data.appointmentAt, timezone));
  if (data.packageName) w.field('Pacote', data.packageName);
  w.field('Pedida em', formatDateTimeTz(data.createdAt, timezone));
  w.field('Enviada em', formatDateTimeTz(data.submittedAt, timezone));
  w.field('Preenchida por', filledByLabel(data));
  if (data.reviewedAt) {
    w.field(
      'Revisada',
      `${formatDateTimeTz(data.reviewedAt, timezone)}${data.reviewedByName ? ` por ${data.reviewedByName}` : ''} (revisão não é autorização automática de procedimento)`,
    );
  }
  for (const section of data.schema.sections) {
    const questions = section.questions.filter((q) =>
      isQuestionVisible(data.schema, q, data.answers),
    );
    if (questions.length === 0) continue;
    w.divider();
    w.heading(section.title, 12);
    if (section.audience === 'staff') {
      w.text('Seção interna da equipe (não aparece para o cliente).', {
        muted: true,
        size: 8.5,
        gap: 6,
      });
    }
    for (const question of questions) {
      w.text(question.title, { bold: true, size: 9.5, gap: 1 });
      w.text(answerText(question, data.answers[question.id]), { size: 10, gap: 8 });
    }
  }
}

export async function buildEntryPdf(
  data: EntryPdfData & { companyName: string; timezone: string },
) {
  const w = await PdfWriter.create(`${data.formName} — ${data.clientName}`);
  w.text(data.companyName, { bold: true, size: 11, gap: 6 });
  writeEntry(w, data, data.timezone);
  return w.finish(`${data.companyName} · ${DISCLAIMER}`);
}

type SessionData = Awaited<ReturnType<typeof getSessionRecord>>;

const RECORD_STATUS = {
  DRAFT: 'Rascunho',
  FINALIZED: 'Finalizado',
  AMENDED: 'Retificado (com adendo)',
};
const APPOINTMENT_STATUS: Record<string, string> = {
  SCHEDULED: 'Agendado',
  CONFIRMED: 'Confirmado',
  IN_PROGRESS: 'Em andamento',
  DONE: 'Realizado',
  CANCELED: 'Cancelado',
  NO_SHOW: 'Falta',
};

export async function writeSession(w: PdfWriter, data: SessionData, timezone: string) {
  const title = data.package?.sessionNumber
    ? `Sessão ${data.package.sessionNumber} de ${data.package.sessionsTotal} — ${data.package.name}`
    : `Atendimento — ${data.appointment.serviceName}`;
  w.heading(title, 13);
  w.field('Data e horário', formatDateTimeTz(data.appointment.startAt, timezone));
  w.field('Profissional', data.appointment.professionalName);
  w.field('Atendimento', APPOINTMENT_STATUS[data.appointment.status] ?? data.appointment.status);
  if (!data.record) {
    w.field('Registro', 'Ainda sem registro');
    return;
  }
  w.field('Registro', RECORD_STATUS[data.record.status]);
  w.field(
    'Assinatura da versão atual',
    data.record.signature === 'signed'
      ? 'Coletada'
      : data.record.signature === 'pending'
        ? 'Pendente'
        : 'Não exigida',
  );
  // Da versão mais antiga para a mais nova: o que foi assinado primeiro, depois os adendos.
  for (const version of [...data.record.versions].reverse()) {
    w.divider();
    w.text(
      `Versão ${version.version} · ${formatDateTimeTz(version.createdAt, timezone)}${
        version.version === data.record.currentVersion ? ' · versão atual' : ''
      }`,
      { bold: true, size: 10, gap: 4 },
    );
    if (version.amendmentReason) w.field('Motivo do adendo', version.amendmentReason, 8);
    if (version.content) {
      w.field('Procedimento realizado', version.content.procedure, 8);
      if (version.content.clientReport)
        w.field('Relato do cliente', version.content.clientReport, 8);
      if (version.content.orientations) w.field('Orientações', version.content.orientations, 8);
      if (version.content.nextReturn) w.field('Próximo retorno', version.content.nextReturn, 8);
      if (version.content.internalNotes) {
        w.field(
          'Observações internas (não apresentadas ao cliente, fora do conteúdo assinado)',
          version.content.internalNotes,
          8,
        );
      }
    }
    if (version.signature) {
      w.text(`Conteúdo assinado — versão ${version.version}`, {
        bold: true,
        size: 9,
        indent: 8,
        gap: 2,
      });
      if (version.signature.image) await w.png(version.signature.image);
      w.field(
        'Assinado por (nome declarado)',
        `${version.signature.signerName ?? '—'} em ${formatDateTimeTz(version.signature.signedAt, timezone)} (horário do servidor)`,
        8,
      );
      w.field('Declaração apresentada', version.signature.statement, 8);
      w.text(
        `Método: desenho no aparelho do estabelecimento · conferência ${version.contentHash.slice(0, 12)}`,
        {
          muted: true,
          size: 8,
          indent: 8,
          gap: 6,
        },
      );
    } else if (data.requireSignature) {
      w.text('Assinatura pendente para esta versão.', { muted: true, size: 9, indent: 8, gap: 6 });
    }
  }
}

export async function buildSessionPdf(
  data: SessionData & { companyName: string; timezone: string },
) {
  const w = await PdfWriter.create(`Registro — ${data.appointment.clientName}`);
  w.text(data.companyName, { bold: true, size: 11, gap: 2 });
  w.text(`Cliente: ${data.appointment.clientName}`, { size: 10, gap: 6 });
  await writeSession(w, data, data.timezone);
  return w.finish(`${data.companyName} · ${DISCLAIMER}`);
}

export type PackagePdfData = {
  companyName: string;
  timezone: string;
  clientName: string;
  package: {
    name: string;
    serviceName: string;
    progress: string;
    remaining: number;
    contractedAt: Date;
    validUntil: Date | null;
    financial: { price: number; paid: number; pending: number; unbilled: number; status: string };
  };
  initialEntry: EntryPdfData | null;
  sessions: SessionData[];
};

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export async function buildPackagePdf(data: PackagePdfData) {
  const w = await PdfWriter.create(`${data.package.name} — ${data.clientName}`);
  w.text(data.companyName, { bold: true, size: 11, gap: 2 });
  w.heading(`${data.package.name}`, 15);
  w.field('Cliente', data.clientName);
  w.field('Serviço', data.package.serviceName);
  w.field('Sessões realizadas', `${data.package.progress} (${data.package.remaining} restantes)`);
  w.field('Contratação', formatDateTimeTz(data.package.contractedAt, data.timezone));
  w.field(
    'Validade',
    data.package.validUntil
      ? formatDateTimeTz(data.package.validUntil, data.timezone)
      : 'Sem validade',
  );
  w.field(
    'Financeiro',
    `Contratado ${brl(data.package.financial.price)} · pago ${brl(data.package.financial.paid)}${
      data.package.financial.pending ? ` · no fiado ${brl(data.package.financial.pending)}` : ''
    }${data.package.financial.unbilled ? ` · a lançar ${brl(data.package.financial.unbilled)}` : ''}`,
  );
  if (data.initialEntry) {
    w.divider();
    w.text('Ficha inicial', { muted: true, size: 9, gap: 2 });
    writeEntry(w, data.initialEntry, data.timezone);
  }
  for (const session of data.sessions) {
    w.divider();
    await writeSession(w, session, data.timezone);
  }
  if (data.sessions.length === 0) {
    w.divider();
    w.text('Nenhuma sessão selecionada.', { muted: true });
  }
  return w.finish(`${data.companyName} · ${DISCLAIMER}`);
}
