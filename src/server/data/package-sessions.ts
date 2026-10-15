import { createHash } from 'node:crypto';

import { prisma } from '@/lib/db';
import { Prisma } from '@/generated/prisma/client';
import type { PaymentMethod } from '@/generated/prisma/client';
import { UserError } from '@/server/errors';
import { recordAuditLog } from '@/server/data/audit';
import { recordSaleIncome } from '@/server/data/sales';
import { requireAccess, type FormAccess } from '@/server/data/form-permissions';
import {
  packageAlerts,
  packageFinancial,
  packageFitsAppointment,
  progressLabel,
  sessionsDone,
} from '@/lib/packages';

/*
  Pacotes de sessões dentro do cliente e o registro de cada atendimento.
  - Progresso sai do livro (PackageMovement); `sessionsUsed` é o contador que a comanda trava no
    UPDATE e anda sempre junto com o livro, na mesma transação.
  - Pagamento é separado da execução: o que foi pago sai dos lançamentos ligados ao pacote.
  - Registro da sessão: versões imutáveis depois de finalizado; assinatura presa à versão exata.
*/

type Db = Prisma.TransactionClient | typeof prisma;
const D = (v: Prisma.Decimal | number | string) => new Prisma.Decimal(v);

export class PackageUnavailableError extends UserError {
  constructor(message: string) {
    super(message);
    this.name = 'PackageUnavailableError';
  }
}

// ---- Cadastro do pacote no cliente --------------------------------------------------------------

export type PackagePaymentInput =
  | { kind: 'full'; method: PaymentMethod }
  | { kind: 'partial'; amount: number; method: PaymentMethod }
  | { kind: 'tab' }
  /** Ainda não cobrado: o valor fica como "a lançar" no pacote. */
  | { kind: 'later' };

export type CreatePackageInput = {
  companyId: string;
  clientId: string;
  userId: string;
  /** Vendido a partir de um plano (preenche nome, serviço, sessões, preço e validade). */
  planId?: string | null;
  name: string;
  serviceId: string;
  sessionsTotal: number;
  price: number;
  contractedAt: Date;
  validUntil?: Date | null;
  responsibleProfessionalId?: string | null;
  notes?: string | null;
  initialFormTemplateId?: string | null;
  sessionFormTemplateId?: string | null;
  requireSignature: boolean;
  payment: PackagePaymentInput;
  /**
   * Pacote contratado antes do sistema: sessões já feitas e valor já pago. Não cria histórico
   * de atendimentos, nem assinaturas, nem lançamentos para o passado — só o saldo de partida.
   */
  opening?: { sessionsDone: number; paidAmount: number } | null;
};

async function assertTemplate(db: Db, companyId: string, id: string | null | undefined) {
  if (!id) return null;
  const template = await db.formTemplate.findFirst({
    where: { id, companyId, status: 'ACTIVE' },
    select: { id: true },
  });
  if (!template) throw new UserError('Modelo de ficha não encontrado ou arquivado.');
  return template.id;
}

export async function createClientPackage(input: CreatePackageInput) {
  const price = D(input.price).toDecimalPlaces(2);
  if (input.sessionsTotal < 1 || input.sessionsTotal > 200) {
    throw new UserError('Informe entre 1 e 200 sessões.');
  }
  if (price.lt(0)) throw new UserError('Valor inválido.');
  const opening = input.opening ?? null;
  if (opening) {
    if (opening.sessionsDone < 0 || opening.sessionsDone > input.sessionsTotal) {
      throw new UserError('As sessões já realizadas não podem passar do total do pacote.');
    }
    if (opening.paidAmount < 0 || D(opening.paidAmount).gt(price)) {
      throw new UserError('O valor já pago não pode passar do valor do pacote.');
    }
  }
  if (input.validUntil && input.validUntil < input.contractedAt) {
    throw new UserError('A validade precisa ser depois da contratação.');
  }
  const alreadyPaid = D(opening?.paidAmount ?? 0);
  const toBill = price.sub(alreadyPaid);
  if (input.payment.kind === 'partial') {
    if (input.payment.amount <= 0) throw new UserError('Informe o valor pago agora.');
    if (D(input.payment.amount).gte(toBill)) {
      throw new UserError('O valor pago agora cobre o pacote todo: use "Pago".');
    }
  }

  return prisma.$transaction(async (tx) => {
    const client = await tx.client.findFirst({
      where: { id: input.clientId, companyId: input.companyId },
      select: { id: true, name: true },
    });
    if (!client) throw new UserError('Cliente não encontrado.');
    const service = await tx.service.findFirst({
      where: { id: input.serviceId, companyId: input.companyId },
      select: { id: true },
    });
    if (!service) throw new UserError('Serviço não encontrado.');
    if (input.planId) {
      const plan = await tx.packagePlan.findFirst({
        where: { id: input.planId, companyId: input.companyId },
        select: { id: true, recurring: true },
      });
      if (!plan) throw new UserError('Plano não encontrado.');
      if (plan.recurring) {
        throw new UserError('Assinaturas são vendidas pela tela de vendas (Pacotes e assinaturas).');
      }
    }
    if (input.responsibleProfessionalId) {
      const pro = await tx.professional.findFirst({
        where: { id: input.responsibleProfessionalId, companyId: input.companyId },
        select: { id: true },
      });
      if (!pro) throw new UserError('Profissional não encontrado.');
    }
    const [initialFormTemplateId, sessionFormTemplateId] = await Promise.all([
      assertTemplate(tx, input.companyId, input.initialFormTemplateId),
      assertTemplate(tx, input.companyId, input.sessionFormTemplateId),
    ]);

    const done = opening?.sessionsDone ?? 0;
    const pkg = await tx.clientPackage.create({
      data: {
        companyId: input.companyId,
        clientId: client.id,
        planId: input.planId ?? null,
        nameSnapshot: input.name.trim(),
        serviceId: service.id,
        sessionsTotal: input.sessionsTotal,
        sessionsUsed: done,
        sessionValue: price.div(input.sessionsTotal).toDecimalPlaces(2),
        price,
        recurring: false,
        contractedAt: input.contractedAt,
        periodStart: input.contractedAt,
        periodEnd: input.validUntil ?? null,
        responsibleProfessionalId: input.responsibleProfessionalId ?? null,
        notes: input.notes?.trim() || null,
        initialFormTemplateId,
        sessionFormTemplateId,
        requireSignature: input.requireSignature,
        openingPaidAmount: opening ? alreadyPaid : null,
        createdByUserId: input.userId,
      },
    });
    if (done > 0) {
      await tx.packageMovement.create({
        data: {
          companyId: input.companyId,
          clientPackageId: pkg.id,
          kind: 'OPENING_DONE',
          quantity: done,
          reason: 'Saldo inicial: sessões feitas antes do sistema',
          createdByUserId: input.userId,
        },
      });
    }

    const description = `${pkg.nameSnapshot} — ${client.name}`;
    const charge = (amount: Prisma.Decimal, payment: { method: PaymentMethod } | { tab: true }) =>
      recordSaleIncome(tx, {
        companyId: input.companyId,
        clientId: client.id,
        category: 'Pacotes',
        description,
        amount,
        payment,
        userId: input.userId,
        clientPackageId: pkg.id,
      });
    if (toBill.gt(0)) {
      if (input.payment.kind === 'full') await charge(toBill, { method: input.payment.method });
      else if (input.payment.kind === 'tab') await charge(toBill, { tab: true });
      else if (input.payment.kind === 'partial') {
        const now = D(input.payment.amount).toDecimalPlaces(2);
        await charge(now, { method: input.payment.method });
        await charge(toBill.sub(now), { tab: true });
      }
    }

    await recordAuditLog(
      {
        companyId: input.companyId,
        entityType: 'ClientPackage',
        entityId: pkg.id,
        action: 'created',
        userId: input.userId,
        metadata: {
          name: pkg.nameSnapshot,
          clientId: client.id,
          sessionsTotal: input.sessionsTotal,
          price: price.toString(),
          opening: opening ? { sessionsDone: done, paidAmount: alreadyPaid.toString() } : null,
          payment: input.payment.kind,
        },
      },
      tx,
    );
    return pkg;
  });
}

/**
 * Receber parte do pacote (ou o restante). Não aceita mais do que falta: pacote pago nunca é
 * cobrado de novo. O que está no fiado é recebido pelo fiado (não soma aqui).
 */
export async function receivePackagePayment(params: {
  companyId: string;
  clientPackageId: string;
  amount: number;
  method: PaymentMethod;
  userId: string;
}) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'pkgpay:' + params.clientPackageId}))`;
    const pkg = await tx.clientPackage.findFirst({
      where: { id: params.clientPackageId, companyId: params.companyId },
      include: { client: { select: { name: true } } },
    });
    if (!pkg) throw new UserError('Pacote não encontrado.');
    if (pkg.recurring) throw new UserError('Mensalidades de assinatura são recebidas pelo fiado.');
    const financial = await packageFinancialFor(tx, pkg);
    if (financial.unbilled <= 0) {
      throw new UserError(
        financial.pending > 0
          ? 'O restante deste pacote está no fiado: receba pelo fiado do cliente.'
          : 'Este pacote já está pago.',
      );
    }
    const amount = D(params.amount).toDecimalPlaces(2);
    if (amount.lte(0)) throw new UserError('Informe o valor recebido.');
    if (amount.gt(financial.unbilled)) {
      throw new UserError(
        `O valor passa do que falta pagar (R$ ${financial.unbilled.toFixed(2).replace('.', ',')}).`,
      );
    }
    await recordSaleIncome(tx, {
      companyId: params.companyId,
      clientId: pkg.clientId,
      category: 'Pacotes',
      description: `${pkg.nameSnapshot} — ${pkg.client.name}`,
      amount,
      payment: { method: params.method },
      userId: params.userId,
      clientPackageId: pkg.id,
    });
  });
}

async function packageFinancialFor(
  db: Db,
  pkg: { id: string; price: Prisma.Decimal; openingPaidAmount: Prisma.Decimal | null },
) {
  const sums = await db.transaction.groupBy({
    by: ['status'],
    where: { clientPackageId: pkg.id, type: 'INCOME', status: { in: ['PAID', 'PENDING'] } },
    _sum: { amount: true },
  });
  const sum = (status: 'PAID' | 'PENDING') =>
    Number(sums.find((s) => s.status === status)?._sum.amount ?? 0);
  return packageFinancial({
    price: Number(pkg.price),
    paid: sum('PAID') + Number(pkg.openingPaidAmount ?? 0),
    pending: sum('PENDING'),
  });
}

/** Ampliar o pacote (mais sessões). O valor extra, se houver, entra como "a lançar". */
export async function extendPackage(params: {
  companyId: string;
  clientPackageId: string;
  sessions: number;
  extraPrice: number;
  reason: string;
  userId: string;
}) {
  if (params.sessions < 1 || params.sessions > 100) throw new UserError('Informe de 1 a 100 sessões.');
  if (!params.reason.trim()) throw new UserError('Informe o motivo.');
  return prisma.$transaction(async (tx) => {
    const pkg = await tx.clientPackage.findFirst({
      where: { id: params.clientPackageId, companyId: params.companyId, status: 'ACTIVE' },
    });
    if (!pkg) throw new UserError('Pacote não encontrado.');
    if (pkg.recurring) throw new UserError('Assinaturas não são ampliadas por aqui.');
    const total = pkg.sessionsTotal + params.sessions;
    const price = D(pkg.price).add(params.extraPrice).toDecimalPlaces(2);
    await tx.clientPackage.update({
      where: { id: pkg.id },
      data: { sessionsTotal: total, price, sessionValue: price.div(total).toDecimalPlaces(2) },
    });
    await tx.packageMovement.create({
      data: {
        companyId: params.companyId,
        clientPackageId: pkg.id,
        kind: 'EXTEND',
        quantity: params.sessions,
        reason: params.reason.trim(),
        createdByUserId: params.userId,
      },
    });
    await recordAuditLog(
      {
        companyId: params.companyId,
        entityType: 'ClientPackage',
        entityId: pkg.id,
        action: 'updated',
        userId: params.userId,
        metadata: { name: pkg.nameSnapshot, extended: params.sessions, extraPrice: params.extraPrice },
      },
      tx,
    );
  });
}

/**
 * Correção manual do saldo (ex.: sessão feita fora do sistema). Fica no livro com o motivo e no
 * histórico; nunca passa do total nem fica negativo.
 */
export async function adjustPackage(params: {
  companyId: string;
  clientPackageId: string;
  delta: number;
  reason: string;
  userId: string;
}) {
  if (!Number.isInteger(params.delta) || params.delta === 0) {
    throw new UserError('Informe quantas sessões somar ou tirar.');
  }
  if (params.reason.trim().length < 3) throw new UserError('Informe o motivo da correção.');
  return prisma.$transaction(async (tx) => {
    const pkg = await tx.clientPackage.findFirst({
      where: { id: params.clientPackageId, companyId: params.companyId },
    });
    if (!pkg) throw new UserError('Pacote não encontrado.');
    const changed = await tx.clientPackage.updateMany({
      where: {
        id: pkg.id,
        sessionsUsed:
          params.delta > 0
            ? { lte: pkg.sessionsTotal - params.delta }
            : { gte: -params.delta },
      },
      data: { sessionsUsed: { increment: params.delta } },
    });
    if (changed.count === 0) {
      throw new UserError('A correção deixaria o pacote com saldo negativo ou acima do total.');
    }
    await tx.packageMovement.create({
      data: {
        companyId: params.companyId,
        clientPackageId: pkg.id,
        kind: 'ADJUST',
        quantity: params.delta,
        reason: params.reason.trim(),
        createdByUserId: params.userId,
      },
    });
    await recordAuditLog(
      {
        companyId: params.companyId,
        entityType: 'ClientPackage',
        entityId: pkg.id,
        action: 'adjusted',
        userId: params.userId,
        metadata: { name: pkg.nameSnapshot, delta: params.delta },
      },
      tx,
    );
  });
}

// ---- Leitura: aba "Pacotes e tratamentos" -------------------------------------------------------

export async function getClientPackagesDetail(companyId: string, clientId: string) {
  const packages = await prisma.clientPackage.findMany({
    where: { companyId, clientId },
    include: {
      service: { select: { id: true, name: true } },
      responsibleProfessional: { select: { id: true, name: true } },
      movements: { orderBy: { createdAt: 'asc' } },
      plannedAppointments: {
        where: { status: { in: ['SCHEDULED', 'CONFIRMED', 'IN_PROGRESS'] } },
        select: { id: true, startAt: true, status: true },
        orderBy: { startAt: 'asc' },
      },
    },
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
  });
  if (packages.length === 0) return [];
  const templateIds = [
    ...new Set(
      packages.flatMap((p) => [p.initialFormTemplateId, p.sessionFormTemplateId]).filter(Boolean),
    ),
  ] as string[];
  const [sums, templates, sessionAppointments] = await Promise.all([
    prisma.transaction.groupBy({
      by: ['clientPackageId', 'status'],
      where: {
        companyId,
        clientPackageId: { in: packages.map((p) => p.id) },
        type: 'INCOME',
        status: { in: ['PAID', 'PENDING'] },
      },
      _sum: { amount: true },
    }),
    templateIds.length
      ? prisma.formTemplate.findMany({
          where: { companyId, id: { in: templateIds } },
          select: { id: true, name: true },
        })
      : [],
    prisma.appointment.findMany({
      where: {
        companyId,
        id: {
          in: packages.flatMap((p) =>
            p.movements.map((m) => m.appointmentId).filter((id): id is string => !!id),
          ),
        },
      },
      select: {
        id: true,
        startAt: true,
        status: true,
        professional: { select: { name: true } },
        sessionRecord: {
          select: {
            status: true,
            currentVersion: true,
            requireSignature: true,
            signatures: { select: { version: { select: { version: true } } } },
          },
        },
      },
    }),
  ]);
  const templateName = new Map(templates.map((t) => [t.id, t.name]));
  const appointmentById = new Map(sessionAppointments.map((a) => [a.id, a]));
  const now = new Date();
  return packages.map((p) => {
    const sum = (status: 'PAID' | 'PENDING') =>
      Number(
        sums.find((s) => s.clientPackageId === p.id && s.status === status)?._sum.amount ?? 0,
      );
    const done = sessionsDone(p.movements);
    const financial = packageFinancial({
      price: p.recurring ? sum('PAID') + sum('PENDING') : Number(p.price),
      paid: sum('PAID') + Number(p.openingPaidAmount ?? 0),
      pending: sum('PENDING'),
    });
    return {
      id: p.id,
      name: p.nameSnapshot,
      status: p.status,
      recurring: p.recurring,
      service: p.service,
      responsibleProfessional: p.responsibleProfessional,
      sessionsTotal: p.sessionsTotal,
      // Assinatura zera a cada ciclo (o livro registra o novo ciclo); pacote acumula.
      done,
      remaining: Math.max(p.sessionsTotal - done, 0),
      progress: progressLabel(done, p.sessionsTotal),
      contractedAt: p.contractedAt ?? p.createdAt,
      validUntil: p.periodEnd,
      notes: p.notes,
      requireSignature: p.requireSignature,
      initialFormTemplate: p.initialFormTemplateId
        ? { id: p.initialFormTemplateId, name: templateName.get(p.initialFormTemplateId) ?? '' }
        : null,
      sessionFormTemplate: p.sessionFormTemplateId
        ? { id: p.sessionFormTemplateId, name: templateName.get(p.sessionFormTemplateId) ?? '' }
        : null,
      financial,
      openingPaidAmount: p.openingPaidAmount === null ? null : Number(p.openingPaidAmount),
      alerts: p.status === 'ACTIVE'
        ? packageAlerts({ done, total: p.sessionsTotal, validUntil: p.periodEnd, recurring: p.recurring, now })
        : [],
      planned: p.plannedAppointments.map((a) => ({ id: a.id, startAt: a.startAt, status: a.status })),
      movements: p.movements.map((m) => {
        const appointment = m.appointmentId ? appointmentById.get(m.appointmentId) : undefined;
        const record = appointment?.sessionRecord ?? null;
        return {
          id: m.id,
          kind: m.kind,
          quantity: m.quantity,
          sessionNumber: m.sessionNumber,
          reason: m.reason,
          createdAt: m.createdAt,
          appointment: appointment
            ? {
                id: appointment.id,
                startAt: appointment.startAt,
                status: appointment.status,
                professionalName: appointment.professional.name,
              }
            : null,
          record: record
            ? {
                status: record.status,
                signature: signatureState(record),
              }
            : null,
        };
      }),
    };
  });
}

/** Pacotes do cliente que servem para estes serviços na data — para escolher ao agendar. */
export async function listCompatiblePackages(
  companyId: string,
  clientId: string,
  serviceIds: string[],
  at: Date,
) {
  const packages = await prisma.clientPackage.findMany({
    where: { companyId, clientId, status: 'ACTIVE', serviceId: { in: serviceIds } },
    include: {
      service: { select: { name: true } },
      _count: {
        select: {
          plannedAppointments: { where: { status: { in: ['SCHEDULED', 'CONFIRMED', 'IN_PROGRESS'] } } },
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  });
  return packages.map((p) => {
    const fit = packageFitsAppointment(
      {
        serviceId: p.serviceId,
        status: p.status,
        done: p.sessionsUsed,
        total: p.sessionsTotal,
        validUntil: p.periodEnd,
        recurring: p.recurring,
      },
      serviceIds,
      at,
    );
    return {
      id: p.id,
      name: p.nameSnapshot,
      serviceName: p.service.name,
      progress: progressLabel(p.sessionsUsed, p.sessionsTotal),
      remaining: p.sessionsTotal - p.sessionsUsed,
      planned: p._count.plannedAppointments,
      validUntil: p.periodEnd,
      ok: fit.ok,
      reason: fit.ok ? null : fit.reason,
    };
  });
}

/**
 * Confere o pacote escolhido ao agendar: do cliente, do serviço, válido e com saldo — contando
 * as sessões já agendadas, para não marcar mais sessões do que o pacote tem.
 */
export async function assertPackageForAppointment(
  db: Db,
  params: {
    companyId: string;
    clientId: string;
    clientPackageId: string;
    serviceIds: string[];
    startAt: Date;
    excludeAppointmentId?: string;
  },
) {
  const pkg = await db.clientPackage.findFirst({
    where: { id: params.clientPackageId, companyId: params.companyId, clientId: params.clientId },
  });
  if (!pkg) throw new PackageUnavailableError('Pacote não encontrado para este cliente.');
  const fit = packageFitsAppointment(
    {
      serviceId: pkg.serviceId,
      status: pkg.status,
      done: pkg.sessionsUsed,
      total: pkg.sessionsTotal,
      validUntil: pkg.periodEnd,
      recurring: pkg.recurring,
    },
    params.serviceIds,
    params.startAt,
  );
  if (!fit.ok) throw new PackageUnavailableError(`Não dá para usar este pacote: ${fit.reason.toLowerCase()}`);
  if (!pkg.recurring) {
    const planned = await db.appointment.count({
      where: {
        clientPackageId: pkg.id,
        status: { in: ['SCHEDULED', 'CONFIRMED', 'IN_PROGRESS'] },
        ...(params.excludeAppointmentId ? { id: { not: params.excludeAppointmentId } } : {}),
      },
    });
    if (pkg.sessionsUsed + planned >= pkg.sessionsTotal) {
      throw new PackageUnavailableError(
        'Todas as sessões restantes deste pacote já estão agendadas.',
      );
    }
  }
  return pkg;
}

// ---- Registro da sessão e assinatura -----------------------------------------------------------

export type SessionContent = {
  procedure: string;
  clientReport?: string | null;
  orientations?: string | null;
  nextReturn?: string | null;
};

export const SIGNATURE_STATEMENT =
  'Confirmo que recebi o atendimento descrito acima nesta data. Assinatura desenhada no ' +
  'aparelho do estabelecimento — registro interno, não é assinatura digital certificada.';

/** O que o cliente confirma: o conteúdo visível (sem as observações internas). */
export function sessionContentHash(content: SessionContent): string {
  const normalized = {
    procedure: content.procedure.trim(),
    clientReport: content.clientReport?.trim() || null,
    orientations: content.orientations?.trim() || null,
    nextReturn: content.nextReturn?.trim() || null,
  };
  return createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
}

export type SignatureState = 'not_required' | 'pending' | 'signed';

function signatureState(record: {
  currentVersion: number;
  requireSignature: boolean;
  signatures: { version: { version: number } }[];
}): SignatureState {
  if (record.signatures.some((s) => s.version.version === record.currentVersion)) return 'signed';
  return record.requireSignature ? 'pending' : 'not_required';
}

async function loadAppointmentForRecord(db: Db, companyId: string, appointmentId: string) {
  const appointment = await db.appointment.findFirst({
    where: { id: appointmentId, companyId },
    select: {
      id: true,
      clientId: true,
      professionalId: true,
      clientPackageId: true,
      startAt: true,
      status: true,
      serviceNameSnapshot: true,
      client: { select: { name: true } },
      professional: { select: { name: true } },
      credits: { where: { kind: 'PACKAGE' }, select: { clientPackageId: true } },
    },
  });
  if (!appointment) throw new UserError('Agendamento não encontrado.');
  return appointment;
}

function assertRecordScope(access: FormAccess, professionalId: string) {
  if (access.scope === 'OWN' && access.professionalId !== professionalId) {
    throw new UserError('Você só pode abrir registros dos seus próprios atendimentos.');
  }
}

/**
 * Registro do atendimento. Status (rascunho/finalizado/assinatura) é de toda a equipe; o
 * conteúdo, só de quem pode ler fichas.
 */
export async function getSessionRecord(companyId: string, access: FormAccess, appointmentId: string) {
  const appointment = await loadAppointmentForRecord(prisma, companyId, appointmentId);
  const record = await prisma.sessionRecord.findUnique({
    where: { appointmentId },
    include: {
      versions: { orderBy: { version: 'desc' } },
      signatures: { include: { version: { select: { version: true } } } },
      clientPackage: { select: { nameSnapshot: true, sessionsTotal: true } },
    },
  });
  const packageId =
    record?.clientPackageId ?? appointment.credits[0]?.clientPackageId ?? appointment.clientPackageId;
  const pkg = packageId
    ? await prisma.clientPackage.findFirst({
        where: { id: packageId, companyId },
        select: { id: true, nameSnapshot: true, sessionsTotal: true, requireSignature: true },
      })
    : null;
  const movement = pkg
    ? await prisma.packageMovement.findFirst({
        where: { clientPackageId: pkg.id, appointmentId, kind: 'CONSUME' },
        orderBy: { createdAt: 'desc' },
        select: { sessionNumber: true },
      })
    : null;
  const canSeeContent =
    access.canRead && (access.scope === 'ALL' || access.professionalId === appointment.professionalId);
  const base = {
    appointment: {
      id: appointment.id,
      startAt: appointment.startAt,
      status: appointment.status,
      serviceName: appointment.serviceNameSnapshot,
      clientName: appointment.client.name,
      professionalName: appointment.professional.name,
    },
    package: pkg
      ? {
          id: pkg.id,
          name: pkg.nameSnapshot,
          sessionNumber: movement?.sessionNumber ?? null,
          sessionsTotal: pkg.sessionsTotal,
        }
      : null,
    requireSignature: record?.requireSignature ?? pkg?.requireSignature ?? false,
    canSeeContent,
  };
  if (!record) return { ...base, record: null };
  if (canSeeContent) {
    await recordAuditLog({
      companyId,
      entityType: 'SessionRecord',
      entityId: record.id,
      action: 'viewed',
      userId: access.userId,
      metadata: { clientId: record.clientId },
    });
  }
  const signedVersions = new Map(record.signatures.map((s) => [s.version.version, s]));
  return {
    ...base,
    record: {
      id: record.id,
      status: record.status,
      currentVersion: record.currentVersion,
      signature: signatureState(record),
      versions: record.versions.map((v) => {
        const signature = signedVersions.get(v.version);
        return {
          version: v.version,
          createdAt: v.createdAt,
          amendmentReason: v.amendmentReason,
          contentHash: v.contentHash,
          content: canSeeContent
            ? {
                procedure: v.procedure,
                clientReport: v.clientReport,
                orientations: v.orientations,
                nextReturn: v.nextReturn,
                internalNotes: v.internalNotes,
              }
            : null,
          signature: signature
            ? {
                signerName: canSeeContent ? signature.signerName : null,
                image: canSeeContent ? signature.image : null,
                signedAt: signature.signedAt,
                method: signature.method,
                statement: signature.statement,
              }
            : null,
        };
      }),
    },
  };
}

/**
 * Salva o registro. Rascunho: edita a versão em aberto. Finalizado: só por adendo — versão nova
 * com motivo; a versão assinada continua guardada e a nova pede nova assinatura (se exigida).
 */
export async function saveSessionRecord(params: {
  companyId: string;
  access: FormAccess;
  appointmentId: string;
  content: SessionContent & { internalNotes?: string | null };
  amendmentReason?: string | null;
}) {
  const { access } = params;
  requireAccess(access, 'canFill', 'registrar atendimentos');
  const procedure = params.content.procedure.trim();
  if (!procedure) throw new UserError('Descreva o que foi feito na sessão.');
  return prisma.$transaction(async (tx) => {
    const appointment = await loadAppointmentForRecord(tx, params.companyId, params.appointmentId);
    assertRecordScope(access, appointment.professionalId);
    if (appointment.status === 'CANCELED' || appointment.status === 'NO_SHOW') {
      throw new UserError('Atendimento cancelado ou falta: não há sessão para registrar.');
    }
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'record:' + appointment.id}))`;
    const packageId = appointment.credits[0]?.clientPackageId ?? appointment.clientPackageId;
    const pkg = packageId
      ? await tx.clientPackage.findFirst({
          where: { id: packageId, companyId: params.companyId },
          select: { id: true, requireSignature: true },
        })
      : null;
    let record = await tx.sessionRecord.findUnique({ where: { appointmentId: appointment.id } });
    const fields = {
      procedure,
      clientReport: params.content.clientReport?.trim() || null,
      orientations: params.content.orientations?.trim() || null,
      nextReturn: params.content.nextReturn?.trim() || null,
      internalNotes: params.content.internalNotes?.trim() || null,
      contentHash: sessionContentHash({ ...params.content, procedure }),
    };

    if (!record) {
      record = await tx.sessionRecord.create({
        data: {
          companyId: params.companyId,
          clientId: appointment.clientId,
          appointmentId: appointment.id,
          clientPackageId: pkg?.id ?? null,
          professionalId: appointment.professionalId,
          requireSignature: pkg?.requireSignature ?? false,
          currentVersion: 1,
          createdByUserId: access.userId,
          versions: {
            create: { companyId: params.companyId, version: 1, ...fields, createdByUserId: access.userId },
          },
        },
      });
      await recordAuditLog(
        {
          companyId: params.companyId,
          entityType: 'SessionRecord',
          entityId: record.id,
          action: 'created',
          userId: access.userId,
          metadata: { clientId: appointment.clientId, appointmentId: appointment.id },
        },
        tx,
      );
      return { version: 1 };
    }

    if (record.status === 'DRAFT') {
      const signed = await tx.sessionSignature.count({
        where: { recordId: record.id, version: { version: record.currentVersion } },
      });
      if (signed > 0) {
        throw new UserError('Esta versão já foi assinada. Finalize o registro e use um adendo para mudar.');
      }
      await tx.sessionRecordVersion.update({
        where: { recordId_version: { recordId: record.id, version: record.currentVersion } },
        data: fields,
      });
      await recordAuditLog(
        {
          companyId: params.companyId,
          entityType: 'SessionRecord',
          entityId: record.id,
          action: 'updated',
          userId: access.userId,
          metadata: { clientId: record.clientId, version: record.currentVersion },
        },
        tx,
      );
      return { version: record.currentVersion };
    }

    // Finalizado: adendo.
    const reason = params.amendmentReason?.trim();
    if (!reason || reason.length < 3) {
      throw new UserError('Registro finalizado: para mudar, informe o motivo do adendo.');
    }
    const version = record.currentVersion + 1;
    await tx.sessionRecordVersion.create({
      data: {
        recordId: record.id,
        companyId: params.companyId,
        version,
        ...fields,
        amendmentReason: reason,
        createdByUserId: access.userId,
      },
    });
    await tx.sessionRecord.update({
      where: { id: record.id },
      data: { currentVersion: version, status: 'AMENDED' },
    });
    await recordAuditLog(
      {
        companyId: params.companyId,
        entityType: 'SessionRecord',
        entityId: record.id,
        action: 'amended',
        userId: access.userId,
        metadata: { clientId: record.clientId, version },
      },
      tx,
    );
    return { version };
  });
}

/** Finaliza o registro. Se o pacote exige assinatura, ela precisa estar na versão atual. */
export async function finalizeSessionRecord(params: {
  companyId: string;
  access: FormAccess;
  appointmentId: string;
}) {
  requireAccess(params.access, 'canFill', 'registrar atendimentos');
  return prisma.$transaction(async (tx) => {
    const record = await tx.sessionRecord.findFirst({
      where: { appointmentId: params.appointmentId, companyId: params.companyId },
      include: { signatures: { include: { version: { select: { version: true } } } } },
    });
    if (!record) throw new UserError('Escreva o registro da sessão antes de finalizar.');
    assertRecordScope(params.access, record.professionalId);
    if (record.status !== 'DRAFT') throw new UserError('Este registro já foi finalizado.');
    if (signatureState(record) === 'pending') {
      throw new UserError('Este pacote exige a assinatura do cliente antes de finalizar o registro.');
    }
    const result = await tx.sessionRecord.updateMany({
      where: { id: record.id, status: 'DRAFT' },
      data: { status: 'FINALIZED' },
    });
    if (result.count === 0) throw new UserError('Este registro já foi finalizado.');
    await recordAuditLog(
      {
        companyId: params.companyId,
        entityType: 'SessionRecord',
        entityId: record.id,
        action: 'finalized',
        userId: params.access.userId,
        metadata: { clientId: record.clientId, version: record.currentVersion },
      },
      tx,
    );
  });
}

const MAX_SIGNATURE_BYTES = 400_000;

/**
 * Assinatura desenhada pelo cliente no aparelho da empresa. Presa à versão que ele viu: se o
 * registro mudou enquanto ele assinava (hash diferente), a assinatura é recusada.
 */
export async function signSessionRecord(params: {
  companyId: string;
  access: FormAccess;
  appointmentId: string;
  version: number;
  contentHash: string;
  signerName: string;
  image: string;
  strokes: number;
}) {
  requireAccess(params.access, 'canFill', 'coletar assinaturas');
  const signerName = params.signerName.trim();
  if (signerName.length < 2) throw new UserError('Informe o nome de quem assina.');
  if (!params.image.startsWith('data:image/png;base64,') || params.image.length > MAX_SIGNATURE_BYTES) {
    throw new UserError('Assinatura inválida. Limpe e assine de novo.');
  }
  // Traço vazio (ou um toque só): não é assinatura.
  if (params.strokes < 1 || params.image.length < 1500) {
    throw new UserError('A assinatura está vazia. Peça para o cliente assinar no quadro.');
  }
  return prisma.$transaction(async (tx) => {
    const record = await tx.sessionRecord.findFirst({
      where: { appointmentId: params.appointmentId, companyId: params.companyId },
    });
    if (!record) throw new UserError('Escreva o registro da sessão antes de pedir a assinatura.');
    assertRecordScope(params.access, record.professionalId);
    if (record.currentVersion !== params.version) {
      throw new UserError('O registro mudou enquanto o cliente assinava. Mostre a versão nova e assine de novo.');
    }
    const version = await tx.sessionRecordVersion.findUniqueOrThrow({
      where: { recordId_version: { recordId: record.id, version: params.version } },
    });
    if (version.contentHash !== params.contentHash) {
      throw new UserError('O registro mudou enquanto o cliente assinava. Mostre a versão nova e assine de novo.');
    }
    try {
      await tx.sessionSignature.create({
        data: {
          companyId: params.companyId,
          recordId: record.id,
          versionId: version.id,
          signerName,
          image: params.image,
          method: 'drawn_on_device',
          statement: SIGNATURE_STATEMENT,
          contentHash: version.contentHash,
          collectedByUserId: params.access.userId,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new UserError('Esta versão do registro já foi assinada.');
      }
      throw error;
    }
    await recordAuditLog(
      {
        companyId: params.companyId,
        entityType: 'SessionRecord',
        entityId: record.id,
        action: 'signed',
        userId: params.access.userId,
        metadata: { clientId: record.clientId, version: params.version },
      },
      tx,
    );
  });
}

/** Aba "Histórico das sessões": atendimentos do cliente com os três status independentes. */
export async function listClientSessions(
  companyId: string,
  access: FormAccess,
  clientId: string,
  options: { packageId?: string | null } = {},
) {
  const appointments = await prisma.appointment.findMany({
    where: { companyId, clientId },
    select: {
      id: true,
      startAt: true,
      status: true,
      serviceNameSnapshot: true,
      professionalId: true,
      clientPackageId: true,
      professional: { select: { name: true } },
      packageMovements: {
        where: { kind: 'CONSUME' },
        select: { sessionNumber: true, clientPackage: { select: { id: true, nameSnapshot: true, sessionsTotal: true } } },
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
      clientPackage: { select: { id: true, nameSnapshot: true, sessionsTotal: true } },
      sessionRecord: {
        select: {
          status: true,
          currentVersion: true,
          requireSignature: true,
          signatures: { select: { version: { select: { version: true } } } },
          versions: { orderBy: { version: 'desc' }, take: 1, select: { procedure: true } },
        },
      },
    },
    orderBy: { startAt: 'desc' },
    take: 200,
  });
  const rows = options.packageId
    ? appointments.filter(
        (a) =>
          a.clientPackageId === options.packageId ||
          a.packageMovements.some((m) => m.clientPackage.id === options.packageId),
      )
    : appointments;
  return rows.map((a) => {
    const consumed = a.packageMovements[0];
    const pkg = consumed?.clientPackage ?? a.clientPackage;
    const canSee =
      access.canRead && (access.scope === 'ALL' || access.professionalId === a.professionalId);
    return {
      appointmentId: a.id,
      startAt: a.startAt,
      appointmentStatus: a.status,
      serviceName: a.serviceNameSnapshot,
      professionalName: a.professional.name,
      package: pkg
        ? {
            id: pkg.id,
            name: pkg.nameSnapshot,
            sessionNumber: consumed?.sessionNumber ?? null,
            sessionsTotal: pkg.sessionsTotal,
            planned: !consumed,
          }
        : null,
      recordStatus: a.sessionRecord?.status ?? null,
      signature: a.sessionRecord ? signatureState(a.sessionRecord) : null,
      summary: canSee ? (a.sessionRecord?.versions[0]?.procedure ?? null) : null,
    };
  });
}

/** Dados para o PDF do registro (com a imagem da assinatura). Exige exportar. */
export async function getSessionRecordForExport(
  companyId: string,
  access: FormAccess,
  appointmentId: string,
) {
  requireAccess(access, 'canExport', 'exportar registros');
  const data = await getSessionRecord(companyId, access, appointmentId);
  if (!data.record) throw new UserError('Este atendimento ainda não tem registro.');
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { name: true, timezone: true },
  });
  await recordAuditLog({
    companyId,
    entityType: 'SessionRecord',
    entityId: data.record.id,
    action: 'exported',
    userId: access.userId,
    metadata: { format: 'pdf' },
  });
  return { ...data, companyName: company?.name ?? '', timezone: company?.timezone ?? 'America/Sao_Paulo' };
}

/**
 * Dados do PDF do pacote: resumo, ficha inicial (se houver e estiver enviada) e as sessões
 * escolhidas (ou todas as realizadas). Exige exportar; cada parte respeita o escopo da pessoa.
 */
export async function getPackageForExport(
  companyId: string,
  access: FormAccess,
  clientPackageId: string,
  appointmentIds: string[] | null,
) {
  requireAccess(access, 'canExport', 'exportar pacotes');
  const detail = await prisma.clientPackage.findFirst({
    where: { id: clientPackageId, companyId },
    select: { clientId: true, initialFormTemplateId: true, client: { select: { name: true } } },
  });
  if (!detail) throw new UserError('Pacote não encontrado.');
  const pkg = (await getClientPackagesDetail(companyId, detail.clientId)).find(
    (p) => p.id === clientPackageId,
  )!;
  const done = pkg.movements
    .filter((m) => m.kind === 'CONSUME' && m.appointment)
    .map((m) => m.appointment!.id);
  const wanted = appointmentIds?.length ? done.filter((id) => appointmentIds.includes(id)) : done;
  const sessions = [];
  for (const appointmentId of [...new Set(wanted)]) {
    sessions.push(await getSessionRecord(companyId, access, appointmentId));
  }
  const initial = detail.initialFormTemplateId
    ? await prisma.formEntry.findFirst({
        where: {
          companyId,
          clientId: detail.clientId,
          templateId: detail.initialFormTemplateId,
          status: { in: ['SUBMITTED', 'REVIEWED'] },
          OR: [{ clientPackageId }, { clientPackageId: null }],
        },
        orderBy: { submittedAt: 'desc' },
        select: { id: true },
      })
    : null;
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { name: true, timezone: true },
  });
  await recordAuditLog({
    companyId,
    entityType: 'ClientPackage',
    entityId: clientPackageId,
    action: 'exported',
    userId: access.userId,
    metadata: { name: pkg.name, sessions: sessions.length, format: 'pdf' },
  });
  return {
    companyName: company?.name ?? '',
    timezone: company?.timezone ?? 'America/Sao_Paulo',
    clientName: detail.client.name,
    pkg,
    initialEntryId: initial?.id ?? null,
    sessions,
  };
}
