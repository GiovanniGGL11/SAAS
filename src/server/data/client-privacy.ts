import { prisma } from '@/lib/db';
import { displayValue, type FieldDefinition } from '@/lib/custom-fields';
import { UserError } from '@/server/errors';
import { recordAuditLog } from '@/server/data/audit';

/*
  Direitos do titular (LGPD, art. 18): acesso/portabilidade (exportar tudo o que o sistema guarda
  sobre a pessoa, em arquivo legível por máquina) e eliminação (anonimizar a pedido).

  Anonimizar apaga o que identifica a pessoa, mas mantém o que a lei manda guardar: lançamentos
  financeiros (obrigação fiscal) ficam, ligados a um cadastro sem nome. Fichas (anamnese,
  evolução) só são apagadas se quem pede marcar — algumas profissões são obrigadas a guardar
  prontuário por anos. Não tem volta.
*/

export const ANONYMIZED_NAME = 'Cliente anonimizado';

const money = (v: unknown) => (v == null ? null : Number(v));

/** Tudo o que o sistema guarda sobre o cliente, para entregar à própria pessoa. */
export async function exportClientData(companyId: string, clientId: string, userId: string) {
  const client = await prisma.client.findFirst({ where: { id: clientId, companyId } });
  if (!client) throw new UserError('Cliente não encontrado.');

  const [
    company,
    appointments,
    transactions,
    packages,
    forms,
    quotes,
    reviews,
    loyalty,
    waitlist,
    messages,
    fieldValues,
    fields,
  ] = await Promise.all([
    prisma.company.findUnique({ where: { id: companyId }, select: { name: true } }),
    prisma.appointment.findMany({
      where: { companyId, clientId },
      orderBy: { startAt: 'asc' },
      select: {
        startAt: true,
        status: true,
        serviceNameSnapshot: true,
        priceSnapshot: true,
        notes: true,
        professional: { select: { name: true } },
      },
    }),
    prisma.transaction.findMany({
      where: { companyId, clientId },
      orderBy: { createdAt: 'asc' },
      select: {
        type: true,
        status: true,
        description: true,
        amount: true,
        paymentMethod: true,
        dueDate: true,
        paidAt: true,
        createdAt: true,
      },
    }),
    prisma.clientPackage.findMany({
      where: { companyId, clientId },
      select: {
        nameSnapshot: true,
        sessionsTotal: true,
        sessionsUsed: true,
        price: true,
        status: true,
        contractedAt: true,
        periodEnd: true,
      },
    }),
    prisma.formEntry.findMany({
      where: { companyId, clientId },
      orderBy: { createdAt: 'asc' },
      select: {
        status: true,
        answers: true,
        submittedAt: true,
        reviewedAt: true,
        createdAt: true,
        template: { select: { name: true } },
      },
    }),
    prisma.quote.findMany({
      where: { companyId, clientId },
      select: { number: true, title: true, status: true, sentAt: true, approvedAt: true },
    }),
    prisma.review.findMany({
      where: { companyId, clientId },
      select: { rating: true, comment: true, publicConsent: true, createdAt: true },
    }),
    prisma.loyaltyEntry.findMany({
      where: { companyId, clientId },
      select: { kind: true, amount: true, description: true, createdAt: true },
    }),
    prisma.waitlistEntry.findMany({
      where: { companyId, clientId },
      select: { desiredDate: true, status: true, notes: true, createdAt: true },
    }),
    prisma.whatsappMessage.findMany({
      where: { companyId, clientId },
      orderBy: { createdAt: 'asc' },
      select: { kind: true, status: true, text: true, createdAt: true },
    }),
    prisma.customFieldValue.findMany({ where: { companyId, recordId: clientId } }),
    prisma.customField.findMany({ where: { companyId, entity: 'client' } }),
  ]);

  const fieldById = new Map(fields.map((f) => [f.id, f]));
  const customFields = fieldValues.flatMap((v) => {
    const f = fieldById.get(v.fieldId);
    if (!f) return [];
    const def: FieldDefinition = {
      id: f.id,
      label: f.label,
      type: f.type as FieldDefinition['type'],
      required: f.required,
      options: (f.options ?? []) as FieldDefinition['options'],
    };
    return [{ campo: f.label, valor: displayValue(def, v.value) }];
  });

  await recordAuditLog({
    companyId,
    entityType: 'Client',
    entityId: clientId,
    action: 'exported',
    userId,
    metadata: { lgpd: 'export' },
  });

  return {
    geradoEm: new Date().toISOString(),
    empresa: company?.name ?? null,
    titular: {
      nome: client.name,
      telefone: client.phone,
      email: client.email,
      cpf: client.cpf,
      nascimento: client.birthDate?.toISOString().slice(0, 10) ?? null,
      endereco: {
        cep: client.zipCode,
        rua: client.street,
        numero: client.number,
        complemento: client.complement,
        bairro: client.district,
        cidade: client.city,
        uf: client.state,
      },
      observacoes: client.notes,
      cadastradoEm: client.createdAt.toISOString(),
      recebePromocoes: client.marketingOptOutAt === null,
    },
    camposPersonalizados: customFields,
    atendimentos: appointments.map((a) => ({
      data: a.startAt.toISOString(),
      servico: a.serviceNameSnapshot,
      profissional: a.professional.name,
      status: a.status,
      valor: money(a.priceSnapshot),
      observacoes: a.notes,
    })),
    financeiro: transactions.map((t) => ({
      tipo: t.type,
      status: t.status,
      descricao: t.description,
      valor: money(t.amount),
      forma: t.paymentMethod,
      vencimento: t.dueDate?.toISOString() ?? null,
      pagoEm: t.paidAt?.toISOString() ?? null,
    })),
    pacotes: packages.map((p) => ({
      nome: p.nameSnapshot,
      sessoes: p.sessionsTotal,
      usadas: p.sessionsUsed,
      valor: money(p.price),
      status: p.status,
      contratadoEm: p.contractedAt?.toISOString() ?? null,
    })),
    fichas: forms.map((f) => ({
      modelo: f.template.name,
      status: f.status,
      respostas: f.answers,
      enviadaEm: f.submittedAt?.toISOString() ?? null,
      revisadaEm: f.reviewedAt?.toISOString() ?? null,
    })),
    orcamentos: quotes.map((q) => ({
      numero: q.number,
      titulo: q.title,
      status: q.status,
      enviadoEm: q.sentAt?.toISOString() ?? null,
      aprovadoEm: q.approvedAt?.toISOString() ?? null,
    })),
    avaliacoes: reviews.map((r) => ({
      nota: r.rating,
      comentario: r.comment,
      autorizouPublicar: r.publicConsent,
      data: r.createdAt.toISOString(),
    })),
    fidelidade: loyalty.map((l) => ({
      tipo: l.kind,
      quantidade: money(l.amount),
      descricao: l.description,
      data: l.createdAt.toISOString(),
    })),
    listaDeEspera: waitlist.map((w) => ({
      dataDesejada: w.desiredDate,
      status: w.status,
      observacoes: w.notes,
    })),
    mensagens: messages.map((m) => ({
      tipo: m.kind,
      status: m.status,
      texto: m.text,
      data: m.createdAt.toISOString(),
    })),
  };
}

/**
 * Anonimiza a pedido do titular. Recusa se houver horário futuro marcado (cancele antes, para a
 * agenda não ficar com um atendimento sem cliente). Fichas só saem com `deleteForms`.
 */
export async function anonymizeClient(
  companyId: string,
  userId: string,
  clientId: string,
  options: { deleteForms: boolean },
) {
  const client = await prisma.client.findFirst({
    where: { id: clientId, companyId },
    select: { id: true, name: true },
  });
  if (!client) throw new UserError('Cliente não encontrado.');
  if (client.name === ANONYMIZED_NAME) throw new UserError('Este cliente já foi anonimizado.');
  const upcoming = await prisma.appointment.count({
    where: {
      companyId,
      clientId,
      status: { in: ['SCHEDULED', 'CONFIRMED', 'IN_PROGRESS'] },
      startAt: { gte: new Date() },
    },
  });
  if (upcoming > 0) {
    throw new UserError(
      `Há ${upcoming} ${upcoming === 1 ? 'horário marcado' : 'horários marcados'} para este cliente. Cancele antes de anonimizar.`,
    );
  }

  const now = new Date();
  await prisma.$transaction(
    async (tx) => {
      await tx.client.update({
        where: { id: clientId },
        data: {
          name: ANONYMIZED_NAME,
          phone: null,
          email: null,
          cpf: null,
          birthDate: null,
          notes: null,
          zipCode: null,
          street: null,
          number: null,
          complement: null,
          district: null,
          city: null,
          state: null,
          isVip: false,
          active: false,
          marketingOptOutAt: now,
          marketingOptOutBy: userId,
          // Links do portal já enviados param de funcionar.
          portalVersion: { increment: 1 },
        },
      });
      await tx.customFieldValue.deleteMany({ where: { companyId, recordId: clientId } });
      await tx.appointment.updateMany({ where: { companyId, clientId }, data: { notes: null } });
      await tx.review.updateMany({
        where: { companyId, clientId },
        data: { comment: null, publicConsent: false },
      });
      await tx.waitlistEntry.deleteMany({ where: { companyId, clientId } });
      await tx.whatsappMessage.updateMany({
        where: { companyId, clientId },
        data: { phone: '', text: '(removido a pedido do titular)' },
      });
      await tx.opportunity.updateMany({
        where: { companyId, clientId },
        data: { contactName: null, contactPhone: null },
      });
      // Links de fichas ainda abertos deixam de valer.
      await tx.formAccessToken.updateMany({
        where: { companyId, entry: { clientId }, revokedAt: null },
        data: { revokedAt: now },
      });
      if (options.deleteForms) {
        await tx.formEntry.deleteMany({ where: { companyId, clientId } });
      }
      await recordAuditLog(
        {
          companyId,
          entityType: 'Client',
          entityId: clientId,
          action: 'deleted',
          userId,
          // Nunca o nome ou os dados apagados: só o que foi feito.
          metadata: { lgpd: 'anonymized', deletedForms: options.deleteForms },
        },
        tx,
      );
    },
    { maxWait: 10_000, timeout: 20_000 },
  );
  return { anonymized: true };
}
