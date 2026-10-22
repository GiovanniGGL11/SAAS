import { prisma } from '@/lib/db';
import { MAX_BUFFER_MINUTES, clashesWithBuffer } from '@/lib/buffer';
import { recordAuditLog } from '@/server/data/audit';
import {
  createIncomeFromAppointment,
  feeFields,
  reverseIncomeFromAppointment,
} from '@/server/data/finance';
import { earnLoyaltyFromAppointment, reverseLoyaltyFromAppointment } from '@/server/data/loyalty';
import { Prisma as PrismaNamespace } from '@/generated/prisma/client';
import type {
  Appointment,
  AppointmentStatus,
  PaymentMethod,
  Prisma,
} from '@/generated/prisma/client';
import { UserError } from '@/server/errors';
import { addDays, calendarDateToUtc, utcToCalendarDate } from '@/lib/time';
import { assertAppointmentFormsReady } from '@/server/data/forms';
import { assertPackageForAppointment } from '@/server/data/package-sessions';
import { consumeSuppliesForAppointment } from '@/server/data/service-supplies';

export class AppointmentConflictError extends Error {
  constructor(reason: 'overlap' | 'blocked' | 'held') {
    super(
      reason === 'overlap'
        ? 'Este profissional já tem um agendamento nesse horário.'
        : reason === 'held'
          ? 'Esse horário está reservado para um convite da lista de espera. Cancele o convite (Lista de espera) para usar o horário.'
          : 'Esse horário está bloqueado na agenda deste profissional.',
    );
    this.name = 'AppointmentConflictError';
  }
}

export class ForeignEntityMismatchError extends Error {
  constructor(entity: 'client' | 'professional' | 'service') {
    const nome = { client: 'O cliente', professional: 'O profissional', service: 'O serviço' }[
      entity
    ];
    super(`${nome} escolhido não pertence a esta empresa.`);
    this.name = 'ForeignEntityMismatchError';
  }
}

export class AppointmentNotFoundError extends Error {
  constructor() {
    super('Agendamento não encontrado.');
    this.name = 'AppointmentNotFoundError';
  }
}

const ACTIVE_STATUSES: AppointmentStatus[] = ['SCHEDULED', 'CONFIRMED', 'IN_PROGRESS', 'DONE'];

export type AppointmentWithRelations = Appointment & {
  client: { id: string; name: string; phone: string | null };
  professional: { id: string; name: string; color: string };
  service: { id: string; name: string; color: string };
  /** Só quando o atendimento tem mais de um serviço (sem preço: o total está no agendamento). */
  items: { serviceId: string; nameSnapshot: string; durationMinutes: number }[];
};

const relationsInclude = {
  client: { select: { id: true, name: true, phone: true } },
  professional: { select: { id: true, name: true, color: true } },
  service: { select: { id: true, name: true, color: true } },
  items: {
    select: { serviceId: true, nameSnapshot: true, durationMinutes: true },
    orderBy: { position: 'asc' },
  },
} as const;

/**
 * Serviços do atendimento, na ordem: um só vira o próprio agendamento; vários viram itens e o
 * agendamento guarda a soma (nome "Corte + Barba", duração e preço totais). Assim relatórios,
 * comissão e cobrança que leem o agendamento continuam certos sem saber dos itens.
 */
async function resolveServices(
  db: Prisma.TransactionClient | typeof prisma,
  companyId: string,
  serviceIds: string[],
) {
  const unique = [...new Set(serviceIds)];
  const services = await db.service.findMany({ where: { companyId, id: { in: unique } } });
  if (services.length !== unique.length) throw new ForeignEntityMismatchError('service');
  const byId = new Map(services.map((s) => [s.id, s]));
  const ordered = serviceIds.map((id) => byId.get(id)!);
  const duration = ordered.reduce((sum, s) => sum + s.durationMinutes, 0);
  const price = ordered.reduce((sum, s) => sum.add(s.price), new PrismaNamespace.Decimal(0));
  return {
    main: ordered[0],
    snapshots: {
      serviceId: ordered[0].id,
      serviceNameSnapshot: ordered.map((s) => s.name).join(' + '),
      durationMinutesSnapshot: duration,
      priceSnapshot: price,
      // Preparo depois do atendimento: o maior dos serviços combinados.
      bufferMinutes: Math.max(0, ...ordered.map((s) => s.bufferMinutes)),
    },
    items:
      ordered.length > 1
        ? ordered.map((s, position) => ({
            serviceId: s.id,
            position,
            nameSnapshot: s.name,
            durationMinutes: s.durationMinutes,
            priceSnapshot: s.price,
          }))
        : [],
  };
}

export async function listAppointmentsInRange(
  companyId: string,
  range: { startAt: Date; endAt: Date },
  filters?: { professionalId?: string; serviceId?: string; status?: AppointmentStatus },
): Promise<AppointmentWithRelations[]> {
  return prisma.appointment.findMany({
    where: {
      companyId,
      startAt: { lt: range.endAt },
      endAt: { gt: range.startAt },
      ...(filters?.professionalId ? { professionalId: filters.professionalId } : {}),
      ...(filters?.serviceId ? { serviceId: filters.serviceId } : {}),
      ...(filters?.status ? { status: filters.status } : {}),
    },
    include: relationsInclude,
    orderBy: { startAt: 'asc' },
  });
}

export async function getAppointmentById(
  companyId: string,
  id: string,
): Promise<AppointmentWithRelations | null> {
  return prisma.appointment.findFirst({
    where: { id, companyId },
    include: relationsInclude,
  });
}

/**
 * Throws AppointmentConflictError if the given professional already has an
 * overlapping active appointment, or the range falls inside a ScheduleBlock
 * (vacation/lunch/etc). Classic interval overlap: a.start < b.end AND a.end > b.start.
 *
 * Known limitation for this phase: this check-then-create is not race-proof
 * across concurrent requests (no DB-level exclusion constraint). Acceptable
 * for a single-instance MVP; a Postgres EXCLUDE constraint is the follow-up
 * if double-booking under concurrent load becomes an issue.
 */
/**
 * Trava por profissional até o fim da transação: dois agendamentos no mesmo horário, criados ao
 * mesmo tempo, passavam ambos pela checagem de conflito antes de qualquer um gravar.
 */
export async function lockProfessionalSchedule(db: Prisma.TransactionClient, professionalId: string) {
  await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'agenda:' + professionalId}))`;
}

export async function assertNoConflict(
  params: {
    companyId: string;
    professionalId: string;
    startAt: Date;
    endAt: Date;
    excludeAppointmentId?: string;
    /** Convite da lista de espera que está sendo aceito: a reserva dele não conta como conflito. */
    allowOfferId?: string;
    /** Preparo depois deste atendimento (o dos vizinhos vem do banco). */
    bufferMinutes?: number;
  },
  db: Prisma.TransactionClient = prisma,
): Promise<void> {
  // Vizinhos que podem encostar, contando o preparo de cada um; o choque é conferido abaixo.
  const ownBufferMs = (params.bufferMinutes ?? 0) * 60_000;
  const neighbours = await db.appointment.findMany({
    where: {
      companyId: params.companyId,
      professionalId: params.professionalId,
      status: { in: ACTIVE_STATUSES },
      startAt: { lt: new Date(params.endAt.getTime() + ownBufferMs) },
      endAt: { gt: new Date(params.startAt.getTime() - MAX_BUFFER_MINUTES * 60_000) },
      ...(params.excludeAppointmentId ? { id: { not: params.excludeAppointmentId } } : {}),
    },
    select: { startAt: true, endAt: true, bufferMinutes: true },
  });
  const self = { startAt: params.startAt, endAt: params.endAt, bufferMinutes: params.bufferMinutes };
  if (neighbours.some((n) => clashesWithBuffer(self, n))) {
    throw new AppointmentConflictError('overlap');
  }

  const overlappingBlock = await db.scheduleBlock.findFirst({
    where: {
      professionalId: params.professionalId,
      startAt: { lt: params.endAt },
      endAt: { gt: params.startAt },
    },
    select: { id: true },
  });
  if (overlappingBlock) {
    throw new AppointmentConflictError('blocked');
  }

  // Convite pendente da lista de espera segura o horário até o prazo de resposta.
  const heldByOffer = await db.waitlistOffer.findFirst({
    where: {
      companyId: params.companyId,
      professionalId: params.professionalId,
      status: 'PENDING',
      expiresAt: { gt: new Date() },
      startAt: { lt: params.endAt },
      endAt: { gt: params.startAt },
      ...(params.allowOfferId ? { id: { not: params.allowOfferId } } : {}),
    },
    select: { id: true },
  });
  if (heldByOffer) {
    throw new AppointmentConflictError('held');
  }
}

export async function createAppointment(params: {
  companyId: string;
  clientId: string;
  professionalId: string;
  serviceId: string;
  /** Outros serviços no mesmo atendimento (corte + barba), feitos em seguida. */
  extraServiceIds?: string[];
  startAt: Date;
  notes?: string;
  /** Sessão de pacote planejada (escolhida por quem agenda; a baixa só acontece ao concluir). */
  clientPackageId?: string | null;
  createdByUserId: string;
  /** Aceite de convite da lista de espera: a reserva do próprio convite não é conflito. */
  waitlistOfferId?: string;
}): Promise<Appointment> {
  const [client, professional, resolved] = await Promise.all([
    prisma.client.findFirst({ where: { id: params.clientId, companyId: params.companyId } }),
    prisma.professional.findFirst({
      where: { id: params.professionalId, companyId: params.companyId },
    }),
    resolveServices(prisma, params.companyId, [
      params.serviceId,
      ...(params.extraServiceIds ?? []),
    ]),
  ]);
  if (!client) throw new ForeignEntityMismatchError('client');
  if (!professional) throw new ForeignEntityMismatchError('professional');

  // endAt is always derived from the services' current duration — never
  // trusted from the caller — so it can never drift from the snapshot below.
  const endAt = new Date(
    params.startAt.getTime() + resolved.snapshots.durationMinutesSnapshot * 60_000,
  );

  const appointment = await prisma.$transaction(async (tx) => {
    await lockProfessionalSchedule(tx, params.professionalId);
    await assertNoConflict(
      {
        companyId: params.companyId,
        professionalId: params.professionalId,
        startAt: params.startAt,
        endAt,
        allowOfferId: params.waitlistOfferId,
        bufferMinutes: resolved.snapshots.bufferMinutes,
      },
      tx,
    );
    if (params.clientPackageId) {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'pkgplan:' + params.clientPackageId}))`;
      await assertPackageForAppointment(tx, {
        companyId: params.companyId,
        clientId: params.clientId,
        clientPackageId: params.clientPackageId,
        serviceIds: [params.serviceId, ...(params.extraServiceIds ?? [])],
        startAt: params.startAt,
      });
    }
    return tx.appointment.create({
      data: {
        companyId: params.companyId,
        clientId: params.clientId,
        professionalId: params.professionalId,
        ...resolved.snapshots,
        startAt: params.startAt,
        endAt,
        notes: params.notes,
        clientPackageId: params.clientPackageId ?? null,
        createdByUserId: params.createdByUserId,
        ...(resolved.items.length ? { items: { create: resolved.items } } : {}),
      },
    });
  });

  await recordAuditLog({
    companyId: params.companyId,
    entityType: 'Appointment',
    entityId: appointment.id,
    action: 'created',
    userId: params.createdByUserId,
  });

  return appointment;
}

export async function moveAppointment(params: {
  companyId: string;
  id: string;
  startAt: Date;
  /** Quando informado, o atendimento passa para este profissional. */
  professionalId?: string;
  updatedByUserId: string;
}): Promise<Appointment> {
  const existing = await prisma.appointment.findFirst({
    where: { id: params.id, companyId: params.companyId },
  });
  if (!existing) throw new AppointmentNotFoundError();

  const professionalId = params.professionalId ?? existing.professionalId;
  if (professionalId !== existing.professionalId) {
    // Mesma regra da criação: o profissional de destino tem de ser desta empresa.
    const professional = await prisma.professional.findFirst({
      where: { id: professionalId, companyId: params.companyId },
      select: { id: true },
    });
    if (!professional) throw new ForeignEntityMismatchError('professional');
  }

  // Duration is preserved from the existing appointment — moving only
  // shifts the time range, it never resizes it (resize is out of scope
  // for this phase).
  const durationMs = existing.endAt.getTime() - existing.startAt.getTime();
  const endAt = new Date(params.startAt.getTime() + durationMs);

  const result = await prisma.$transaction(async (tx) => {
    await lockProfessionalSchedule(tx, professionalId);
    await assertNoConflict(
      {
        companyId: params.companyId,
        professionalId,
        startAt: params.startAt,
        endAt,
        excludeAppointmentId: existing.id,
        bufferMinutes: existing.bufferMinutes,
      },
      tx,
    );
    return tx.appointment.updateMany({
      where: { id: params.id, companyId: params.companyId },
      data: {
        startAt: params.startAt,
        endAt,
        professionalId,
        updatedByUserId: params.updatedByUserId,
      },
    });
  });
  if (result.count === 0) throw new AppointmentNotFoundError();

  await recordAuditLog({
    companyId: params.companyId,
    entityType: 'Appointment',
    entityId: params.id,
    action: 'moved',
    userId: params.updatedByUserId,
    metadata: {
      // O horário de antes também: é o que resolve "quem tirou das 10h e pôs às 14h?".
      fromStartAt: existing.startAt.toISOString(),
      startAt: params.startAt.toISOString(),
      endAt: endAt.toISOString(),
      ...(professionalId !== existing.professionalId
        ? { fromProfessionalId: existing.professionalId, toProfessionalId: professionalId }
        : {}),
    },
  });

  return (await prisma.appointment.findFirst({
    where: { id: params.id, companyId: params.companyId },
  }))!;
}

/** Trava a linha do agendamento até o fim da transação: dois cliques em "Concluir" viram um. */
async function lockAppointment(db: Prisma.TransactionClient, companyId: string, id: string) {
  const rows = await db.$queryRaw<{ id: string }[]>`
    SELECT id FROM "Appointment" WHERE id = ${id} AND "companyId" = ${companyId} FOR UPDATE`;
  if (rows.length === 0) throw new AppointmentNotFoundError();
}

/**
 * Muda o status com os efeitos no caixa e na fidelidade na mesma transação. Concluir lança a
 * receita e credita a fidelidade; sair de Concluído desfaz os dois — antes a receita ficava no
 * caixa de um serviço que não aconteceu.
 */
export async function updateAppointmentStatus(params: {
  companyId: string;
  id: string;
  status: Exclude<AppointmentStatus, 'CANCELED'>;
  updatedByUserId: string;
}): Promise<Appointment> {
  return prisma.$transaction(async (tx) => {
    await lockAppointment(tx, params.companyId, params.id);
    const before = (await tx.appointment.findFirst({
      where: { id: params.id, companyId: params.companyId },
    }))!;
    // Ficha exigida pelo serviço ou pacote: conferida aqui, não só na tela.
    if (params.status === 'IN_PROGRESS' && before.status !== 'IN_PROGRESS') {
      await assertAppointmentFormsReady(tx, params.companyId, params.id);
    }
    // Sessão de pacote conclui pela comanda ("Concluir sessão"), que dá a baixa no pacote.
    if (params.status === 'DONE' && before.status !== 'DONE' && before.clientPackageId) {
      throw new UserError('Esta é uma sessão de pacote: use "Concluir sessão" para dar baixa no pacote.');
    }

    await tx.appointment.updateMany({
      where: { id: params.id, companyId: params.companyId },
      data: { status: params.status, updatedByUserId: params.updatedByUserId },
    });
    const updated = (await tx.appointment.findFirst({
      where: { id: params.id, companyId: params.companyId },
    }))!;

    if (params.status === 'DONE') {
      await createIncomeFromAppointment(params.companyId, updated, params.updatedByUserId, tx);
      await earnLoyaltyFromAppointment(params.companyId, updated, params.updatedByUserId, tx);
      await consumeSuppliesForAppointment(tx, {
        companyId: params.companyId,
        appointmentId: updated.id,
        serviceId: updated.serviceId,
        userId: params.updatedByUserId,
      });
    } else if (before.status === 'DONE') {
      await reverseIncomeFromAppointment(params.companyId, params.id, tx, params.updatedByUserId);
      await reverseLoyaltyFromAppointment(params.companyId, params.id, tx);
    }

    await recordAuditLog(
      {
        companyId: params.companyId,
        entityType: 'Appointment',
        entityId: params.id,
        action: 'status_changed',
        userId: params.updatedByUserId,
        metadata: { from: before.status, status: params.status },
      },
      tx,
    );
    return updated;
    // Desfazer uma conclusão estorna caixa, fidelidade e sessão de pacote: folga acima dos 5 s.
  }, { maxWait: 10_000, timeout: 20_000 });
}

/**
 * Trocar cliente, serviço ou observação de um agendamento marcado. Trocar o serviço refaz a
 * duração, o nome e o preço gravados no agendamento, e confere conflito com a nova duração.
 * Concluído ou cancelado não muda: o caixa já foi lançado com os dados de antes.
 */
export async function updateAppointmentDetails(params: {
  companyId: string;
  id: string;
  clientId?: string;
  /** Lista completa de serviços, na ordem (troca o serviço ou adiciona/remove outros). */
  serviceIds?: string[];
  notes?: string | null;
  /** Trocar ou tirar o pacote planejado (null tira). */
  clientPackageId?: string | null;
  updatedByUserId: string;
}): Promise<Appointment> {
  return prisma.$transaction(async (tx) => {
    await lockAppointment(tx, params.companyId, params.id);
    const current = (await tx.appointment.findFirst({
      where: { id: params.id, companyId: params.companyId },
    }))!;
    if (current.status === 'DONE' || current.status === 'CANCELED') {
      throw new UserError('Atendimento concluído ou cancelado não pode ser editado.');
    }

    const data: Prisma.AppointmentUncheckedUpdateManyInput = {
      updatedByUserId: params.updatedByUserId,
    };
    if (params.notes !== undefined) data.notes = params.notes || null;

    if (params.clientId && params.clientId !== current.clientId) {
      const client = await tx.client.findFirst({
        where: { id: params.clientId, companyId: params.companyId },
      });
      if (!client) throw new ForeignEntityMismatchError('client');
      data.clientId = client.id;
    }

    if (params.serviceIds?.length) {
      const currentIds = (
        await tx.appointmentItem.findMany({
          where: { appointmentId: current.id },
          orderBy: { position: 'asc' },
          select: { serviceId: true },
        })
      ).map((i) => i.serviceId);
      const before = currentIds.length ? currentIds : [current.serviceId];
      if (before.join(',') !== params.serviceIds.join(',')) {
        const resolved = await resolveServices(tx, params.companyId, params.serviceIds);
        const endAt = new Date(
          current.startAt.getTime() + resolved.snapshots.durationMinutesSnapshot * 60_000,
        );
        await lockProfessionalSchedule(tx, current.professionalId);
        await assertNoConflict(
          {
            companyId: params.companyId,
            professionalId: current.professionalId,
            startAt: current.startAt,
            endAt,
            excludeAppointmentId: current.id,
            bufferMinutes: resolved.snapshots.bufferMinutes,
          },
          tx,
        );
        Object.assign(data, { ...resolved.snapshots, endAt });
        await tx.appointmentItem.deleteMany({ where: { appointmentId: current.id } });
        if (resolved.items.length) {
          await tx.appointmentItem.createMany({
            data: resolved.items.map((item) => ({ ...item, appointmentId: current.id })),
          });
        }
      }
    }

    // Pacote planejado: confere com o cliente e os serviços finais. Trocar o cliente sem dizer o
    // pacote tira o pacote (era do outro cliente).
    const finalClientId = (data.clientId as string | undefined) ?? current.clientId;
    let packageId =
      params.clientPackageId !== undefined ? params.clientPackageId : current.clientPackageId;
    if (params.clientPackageId === undefined && finalClientId !== current.clientId) packageId = null;
    if (packageId) {
      const finalServiceIds = params.serviceIds?.length
        ? params.serviceIds
        : [
            current.serviceId,
            ...(
              await tx.appointmentItem.findMany({
                where: { appointmentId: current.id },
                select: { serviceId: true },
              })
            ).map((i) => i.serviceId),
          ];
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'pkgplan:' + packageId}))`;
      await assertPackageForAppointment(tx, {
        companyId: params.companyId,
        clientId: finalClientId,
        clientPackageId: packageId,
        serviceIds: finalServiceIds,
        startAt: current.startAt,
        excludeAppointmentId: current.id,
      });
    }
    if (packageId !== current.clientPackageId) data.clientPackageId = packageId;

    await tx.appointment.updateMany({
      where: { id: params.id, companyId: params.companyId },
      data,
    });
    await recordAuditLog(
      {
        companyId: params.companyId,
        entityType: 'Appointment',
        entityId: params.id,
        action: 'moved',
        userId: params.updatedByUserId,
        metadata: {
          edited: true,
          clientId: params.clientId ?? null,
          serviceIds: params.serviceIds ?? null,
          ...(packageId !== current.clientPackageId ? { clientPackageId: packageId } : {}),
        },
      },
      tx,
    );
    return (await tx.appointment.findFirst({
      where: { id: params.id, companyId: params.companyId },
    }))!;
  });
}

export type CheckoutInput = {
  companyId: string;
  id: string;
  paymentMethod: PaymentMethod;
  /** Desconto em reais, além do cupom. */
  discount?: number;
  couponCode?: string;
  tip?: number;
  /**
   * Pagamento dividido: as outras partes, com valor fixo. A forma principal (`paymentMethod`) fica
   * com o que sobrar do total — o total só é conhecido aqui, depois do cupom.
   */
  split?: { paymentMethod: PaymentMethod; amount: number }[];
  /** Usar uma sessão deste pacote/assinatura do cliente no serviço correspondente. */
  packageId?: string;
  /** Pagar (parte) com o saldo de um vale-presente. */
  giftCardCode?: string;
  /** Deixar o restante no fiado do cliente. */
  payOnTab?: boolean;
  updatedByUserId: string;
};

/**
 * "Concluir e cobrar": a comanda do atendimento. Conclui, lança a receita com a forma de
 * pagamento e o valor já com desconto e cupom, a gorjeta à parte, e credita a fidelidade —
 * tudo numa transação. Cupom é conferido (ativo, validade, limite de usos) e gasto aqui.
 */
export async function checkoutAppointment(params: CheckoutInput) {
  return prisma.$transaction(async (tx) => {
    await lockAppointment(tx, params.companyId, params.id);
    const appointment = (await tx.appointment.findFirst({
      where: { id: params.id, companyId: params.companyId },
    }))!;
    if (appointment.status === 'CANCELED') throw new UserError('Este agendamento está cancelado.');
    if (appointment.status === 'DONE')
      throw new UserError('Este atendimento já foi concluído e cobrado.');

    const price = new PrismaNamespace.Decimal(appointment.priceSnapshot);
    // Desconto nunca passa do serviço: acima disso não vira crédito, e o histórico mostra o real.
    let discount = PrismaNamespace.Decimal.min(params.discount ?? 0, price);
    const notes: string[] = [];

    if (params.couponCode?.trim()) {
      const code = params.couponCode.trim().toUpperCase();
      const coupon = await tx.coupon.findFirst({ where: { companyId: params.companyId, code } });
      if (!coupon || !coupon.active) throw new UserError('Cupom inválido ou desativado.');
      if (coupon.expiresAt && coupon.expiresAt < new Date())
        throw new UserError('Este cupom expirou.');
      // Gasta o cupom só se ainda houver uso disponível — conferido no próprio UPDATE.
      const used = await tx.coupon.updateMany({
        where: {
          id: coupon.id,
          ...(coupon.maxUses !== null ? { usedCount: { lt: coupon.maxUses } } : {}),
        },
        data: { usedCount: { increment: 1 } },
      });
      if (used.count === 0) throw new UserError('Este cupom já atingiu o limite de usos.');
      const couponDiscount =
        coupon.discountType === 'PERCENTAGE'
          ? price.mul(coupon.discountValue).div(100).toDecimalPlaces(2)
          : new PrismaNamespace.Decimal(coupon.discountValue);
      discount = discount.add(couponDiscount);
      notes.push(`cupom:${coupon.code} (−R$ ${couponDiscount.toFixed(2).replace('.', ',')})`);
    } else if (discount.gt(0)) {
      notes.push(`Desconto de R$ ${discount.toFixed(2).replace('.', ',')}`);
    }

    const total = PrismaNamespace.Decimal.max(0, price.sub(discount));
    const credits: Prisma.AppointmentCreditCreateManyInput[] = [];
    let toCharge = total;

    if (params.packageId) {
      const pkg = await tx.clientPackage.findFirst({
        where: {
          id: params.packageId,
          companyId: params.companyId,
          clientId: appointment.clientId,
          status: 'ACTIVE',
        },
      });
      if (!pkg) throw new UserError('Pacote não encontrado para este cliente.');
      if (!pkg.recurring && pkg.periodEnd && pkg.periodEnd < new Date()) {
        throw new UserError('Este pacote venceu.');
      }
      const items = await tx.appointmentItem.findMany({ where: { appointmentId: appointment.id } });
      const parts = items.length
        ? items.map((i) => ({
            serviceId: i.serviceId,
            price: new PrismaNamespace.Decimal(i.priceSnapshot),
          }))
        : [{ serviceId: appointment.serviceId, price: price }];
      const part = parts.find((p) => p.serviceId === pkg.serviceId);
      if (!part) throw new UserError('Este pacote é de outro serviço.');
      // Conferido no próprio UPDATE: duas comandas ao mesmo tempo não gastam a última sessão duas vezes.
      const used = await tx.clientPackage.updateMany({
        where: { id: pkg.id, sessionsUsed: { lt: pkg.sessionsTotal } },
        data: { sessionsUsed: { increment: 1 } },
      });
      if (used.count === 0) throw new UserError('As sessões deste pacote acabaram.');
      // O livro do pacote: esta é a sessão n (o progresso "2 de 8" sai daqui).
      const after = await tx.clientPackage.findUniqueOrThrow({
        where: { id: pkg.id },
        select: { sessionsUsed: true },
      });
      await tx.packageMovement.create({
        data: {
          companyId: params.companyId,
          clientPackageId: pkg.id,
          kind: 'CONSUME',
          quantity: 1,
          appointmentId: appointment.id,
          sessionNumber: after.sessionsUsed,
          createdByUserId: params.updatedByUserId,
        },
      });
      // O registro da sessão (se já existe) fica ligado ao pacote que pagou a sessão.
      await tx.sessionRecord.updateMany({
        where: { appointmentId: appointment.id, clientPackageId: null },
        data: { clientPackageId: pkg.id },
      });
      toCharge = PrismaNamespace.Decimal.max(0, toCharge.sub(part.price));
      credits.push({
        appointmentId: appointment.id,
        kind: 'PACKAGE',
        clientPackageId: pkg.id,
        amount: pkg.sessionValue,
      });
      notes.push(`pacote:${pkg.nameSnapshot} (sessão ${after.sessionsUsed}/${pkg.sessionsTotal})`);
    }

    if (params.giftCardCode?.trim()) {
      const code = params.giftCardCode.trim().toUpperCase();
      const card = await tx.giftCard.findFirst({
        where: { companyId: params.companyId, code, status: 'ACTIVE' },
      });
      if (!card) throw new UserError('Vale-presente não encontrado.');
      if (card.expiresAt && card.expiresAt < new Date())
        throw new UserError('Este vale-presente venceu.');
      const use = PrismaNamespace.Decimal.min(card.balance, toCharge);
      if (use.lte(0)) throw new UserError('Não há valor a pagar com o vale-presente.');
      const spent = await tx.giftCard.updateMany({
        where: { id: card.id, balance: { gte: use } },
        data: { balance: { decrement: use } },
      });
      if (spent.count === 0) throw new UserError('O saldo do vale-presente mudou. Tente de novo.');
      toCharge = toCharge.sub(use);
      credits.push({
        appointmentId: appointment.id,
        kind: 'GIFT_CARD',
        giftCardId: card.id,
        amount: use,
      });
      notes.push(`vale:${code} (−R$ ${use.toFixed(2).replace('.', ',')})`);
    }

    // Sinal pago pelo link online: já entrou no caixa, sai do que falta cobrar.
    const deposit = await tx.transaction.aggregate({
      where: { appointmentId: appointment.id, category: 'Sinal', status: 'PAID' },
      _sum: { amount: true },
    });
    const depositPaid = new PrismaNamespace.Decimal(deposit._sum.amount ?? 0);
    if (depositPaid.gt(0)) {
      const used = PrismaNamespace.Decimal.min(depositPaid, toCharge);
      toCharge = toCharge.sub(used);
      notes.push(`sinal pago (−R$ ${used.toFixed(2).replace('.', ',')})`);
    }

    if (params.payOnTab && params.split?.length) {
      throw new UserError('No fiado não dá para dividir o pagamento.');
    }
    const splitTotal = (params.split ?? []).reduce(
      (sum, part) => sum.add(part.amount),
      new PrismaNamespace.Decimal(0),
    );
    if (splitTotal.gt(toCharge)) {
      throw new UserError(
        `A soma das outras formas de pagamento passa do total (R$ ${toCharge.toFixed(2).replace('.', ',')}).`,
      );
    }
    const remainder = toCharge.sub(splitTotal);
    const payments = params.payOnTab
      ? [{ amount: toCharge, paymentMethod: null, pending: true }]
      : [
          ...(remainder.gt(0) || splitTotal.eq(0)
            ? [{ amount: remainder, paymentMethod: params.paymentMethod }]
            : []),
          ...(params.split ?? []).map((part) => ({
            amount: new PrismaNamespace.Decimal(part.amount),
            paymentMethod: part.paymentMethod,
          })),
        ];

    await tx.appointment.updateMany({
      where: { id: params.id, companyId: params.companyId },
      data: { status: 'DONE', updatedByUserId: params.updatedByUserId },
    });
    const done = (await tx.appointment.findFirst({
      where: { id: params.id, companyId: params.companyId },
    }))!;

    await createIncomeFromAppointment(params.companyId, done, params.updatedByUserId, tx, {
      payments,
      notes: notes.join(' · ') || null,
    });
    if (credits.length) await tx.appointmentCredit.createMany({ data: credits });
    if (params.tip && params.tip > 0) {
      // No fiado, a gorjeta também fica para receber junto.
      const tipPaid = !params.payOnTab;
      const paidAt = tipPaid ? new Date() : null;
      await tx.transaction.create({
        data: {
          ...(await feeFields(tx, params.companyId, {
            type: 'INCOME',
            status: tipPaid ? 'PAID' : 'PENDING',
            amount: params.tip,
            paymentMethod: params.paymentMethod,
            paidAt,
          })),
          companyId: params.companyId,
          appointmentId: params.id,
          clientId: done.clientId,
          type: 'INCOME',
          status: tipPaid ? 'PAID' : 'PENDING',
          description: `Gorjeta — ${done.serviceNameSnapshot}`,
          category: 'Gorjeta',
          amount: params.tip,
          paymentMethod: tipPaid ? params.paymentMethod : null,
          paidAt,
          createdByUserId: params.updatedByUserId,
        },
      });
    }
    await earnLoyaltyFromAppointment(params.companyId, done, params.updatedByUserId, tx);
    await consumeSuppliesForAppointment(tx, {
      companyId: params.companyId,
      appointmentId: done.id,
      serviceId: done.serviceId,
      userId: params.updatedByUserId,
    });
    await recordAuditLog(
      {
        companyId: params.companyId,
        entityType: 'Appointment',
        entityId: params.id,
        action: 'status_changed',
        userId: params.updatedByUserId,
        metadata: {
          from: appointment.status,
          status: 'DONE',
          total: total.toString(),
          paymentMethod: params.paymentMethod,
          split: params.split ?? [],
          coupon: params.couponCode ?? null,
          packageId: params.packageId ?? null,
          giftCard: params.giftCardCode ?? null,
          tab: !!params.payOnTab,
          charged: toCharge.toString(),
          tip: params.tip ?? 0,
        },
      },
      tx,
    );
    return { appointment: done, total: Number(toCharge) };
    // A comanda faz muitas consultas seguidas (cupom, pacote, vale, caixa): folga acima dos 5 s.
  }, { maxWait: 10_000, timeout: 20_000 });
}

export async function cancelAppointment(params: {
  companyId: string;
  id: string;
  canceledByUserId: string;
  reason?: string;
}): Promise<Appointment> {
  return prisma.$transaction(async (tx) => {
    await lockAppointment(tx, params.companyId, params.id);
    await tx.appointment.updateMany({
      where: { id: params.id, companyId: params.companyId },
      data: {
        status: 'CANCELED',
        canceledAt: new Date(),
        canceledByUserId: params.canceledByUserId,
        cancellationReason: params.reason,
        updatedByUserId: params.canceledByUserId,
      },
    });
    // Cancelar um atendimento já concluído também tira a receita e a fidelidade dele.
    await reverseIncomeFromAppointment(params.companyId, params.id, tx, params.canceledByUserId);
    await reverseLoyaltyFromAppointment(params.companyId, params.id, tx);

    await recordAuditLog(
      {
        companyId: params.companyId,
        entityType: 'Appointment',
        entityId: params.id,
        action: 'canceled',
        userId: params.canceledByUserId,
        metadata: { reason: params.reason },
      },
      tx,
    );
    return (await tx.appointment.findFirst({
      where: { id: params.id, companyId: params.companyId },
    }))!;
  }, { maxWait: 10_000, timeout: 20_000 });
}

// ---------------------------------------------------------------------------
// Expediente e bloqueios: o que a grade mostra em cinza, e o "próximo horário livre".
// ---------------------------------------------------------------------------

export class InvalidBlockRangeError extends Error {
  constructor() {
    super('O fim do bloqueio precisa ser depois do início.');
    this.name = 'InvalidBlockRangeError';
  }
}

/** Expediente semanal dos profissionais ativos e os bloqueios que tocam o período. */
export async function getScheduleContext(companyId: string, range: { startAt: Date; endAt: Date }) {
  const [availabilities, blocks] = await Promise.all([
    prisma.professionalAvailability.findMany({
      where: { professional: { companyId, active: true } },
      select: { professionalId: true, weekday: true, startTime: true, endTime: true },
    }),
    prisma.scheduleBlock.findMany({
      where: {
        professional: { companyId },
        startAt: { lt: range.endAt },
        endAt: { gt: range.startAt },
      },
      select: { id: true, professionalId: true, startAt: true, endAt: true, reason: true },
      orderBy: { startAt: 'asc' },
    }),
  ]);
  return { availabilities, blocks };
}

export async function createScheduleBlock(params: {
  companyId: string;
  professionalId: string;
  startAt: Date;
  endAt: Date;
  reason?: string;
  createdByUserId: string;
}) {
  if (params.endAt.getTime() <= params.startAt.getTime()) throw new InvalidBlockRangeError();
  const professional = await prisma.professional.findFirst({
    where: { id: params.professionalId, companyId: params.companyId },
    select: { id: true },
  });
  if (!professional) throw new ForeignEntityMismatchError('professional');

  // Bloquear em cima de um agendamento esconderia um cliente marcado: quem bloqueia precisa
  // remarcar ou cancelar antes.
  const overlapping = await prisma.appointment.findFirst({
    where: {
      companyId: params.companyId,
      professionalId: params.professionalId,
      status: { in: ACTIVE_STATUSES },
      startAt: { lt: params.endAt },
      endAt: { gt: params.startAt },
    },
    select: { id: true },
  });
  if (overlapping) throw new AppointmentConflictError('overlap');

  const block = await prisma.scheduleBlock.create({
    data: {
      professionalId: params.professionalId,
      startAt: params.startAt,
      endAt: params.endAt,
      reason: params.reason,
    },
  });
  await recordAuditLog({
    companyId: params.companyId,
    entityType: 'ScheduleBlock',
    entityId: block.id,
    action: 'created',
    userId: params.createdByUserId,
  });
  return block;
}

export async function deleteScheduleBlock(params: {
  companyId: string;
  id: string;
  userId: string;
}) {
  // O bloqueio não tem companyId próprio: o escopo vem do profissional.
  const result = await prisma.scheduleBlock.deleteMany({
    where: { id: params.id, professional: { companyId: params.companyId } },
  });
  if (result.count === 0) throw new AppointmentNotFoundError();
  await recordAuditLog({
    companyId: params.companyId,
    entityType: 'ScheduleBlock',
    entityId: params.id,
    action: 'deleted',
    userId: params.userId,
  });
}

/** Janela usada para quem ainda não tem expediente cadastrado — a mesma da grade. */
export const DEFAULT_DAY_WINDOW = { startMinutes: 7 * 60, endMinutes: 21 * 60 };

function timeToMinutes(value: string): number {
  const [h, m] = value.split(':').map(Number);
  return h * 60 + (m || 0);
}

/**
 * Primeiro horário a partir de `from` em que o serviço cabe inteiro: dentro do expediente do
 * profissional, sem agendamento ativo nem bloqueio. Sem profissional informado, procura em todos
 * e devolve quem fica livre primeiro. Procura até 14 dias à frente, em passos de 15 minutos.
 */
export async function findNextAvailableSlot(params: {
  companyId: string;
  serviceId: string;
  professionalId?: string;
  from: Date;
  timezone: string;
}): Promise<{ startAt: Date; professionalId: string } | null> {
  const service = await prisma.service.findFirst({
    where: { id: params.serviceId, companyId: params.companyId },
    select: { durationMinutes: true, bufferMinutes: true },
  });
  if (!service) throw new ForeignEntityMismatchError('service');

  const professionals = await prisma.professional.findMany({
    where: {
      companyId: params.companyId,
      active: true,
      ...(params.professionalId ? { id: params.professionalId } : {}),
    },
    select: {
      id: true,
      availabilities: { select: { weekday: true, startTime: true, endTime: true } },
    },
  });
  if (params.professionalId && professionals.length === 0) {
    throw new ForeignEntityMismatchError('professional');
  }

  const DAYS = 14;
  const STEP = 15;
  const horizonEnd = new Date(params.from.getTime() + (DAYS + 1) * 86_400_000);
  const ids = professionals.map((p) => p.id);
  const [busy, blocks] = await Promise.all([
    prisma.appointment.findMany({
      where: {
        companyId: params.companyId,
        professionalId: { in: ids },
        status: { in: ACTIVE_STATUSES },
        startAt: { lt: horizonEnd },
        endAt: { gt: new Date(params.from.getTime() - MAX_BUFFER_MINUTES * 60_000) },
      },
      select: { professionalId: true, startAt: true, endAt: true, bufferMinutes: true },
    }),
    prisma.scheduleBlock.findMany({
      where: {
        professionalId: { in: ids },
        startAt: { lt: horizonEnd },
        endAt: { gt: params.from },
      },
      select: { professionalId: true, startAt: true, endAt: true },
    }),
  ]);
  // Bloqueios não têm preparo; atendimentos trazem o seu.
  const occupied = [...busy, ...blocks.map((b) => ({ ...b, bufferMinutes: 0 }))];
  const durationMs = service.durationMinutes * 60_000;
  const firstDay = utcToCalendarDate(params.from, params.timezone);

  for (let offset = 0; offset < DAYS; offset++) {
    const day = addDays(firstDay, offset);
    const weekday = new Date(Date.UTC(day.year, day.month - 1, day.day)).getUTCDay();
    let best: { startAt: Date; professionalId: string } | null = null;

    for (const professional of professionals) {
      const windows = professional.availabilities.length
        ? professional.availabilities
            .filter((a) => a.weekday === weekday)
            .map((a) => ({
              startMinutes: timeToMinutes(a.startTime),
              endMinutes: timeToMinutes(a.endTime),
            }))
        : [DEFAULT_DAY_WINDOW];

      for (const window of windows) {
        for (
          let m = window.startMinutes;
          m + service.durationMinutes <= window.endMinutes;
          m += STEP
        ) {
          const startAt = calendarDateToUtc(day, m, params.timezone);
          if (startAt.getTime() < params.from.getTime()) continue;
          if (best && startAt.getTime() >= best.startAt.getTime()) break;
          const endAt = new Date(startAt.getTime() + durationMs);
          const self = { startAt, endAt, bufferMinutes: service.bufferMinutes };
          const clash = occupied.some(
            (o) => o.professionalId === professional.id && clashesWithBuffer(self, o),
          );
          if (!clash) {
            best = { startAt, professionalId: professional.id };
            break;
          }
        }
      }
    }
    if (best) return best;
  }
  return null;
}

export class InvalidDurationError extends Error {
  constructor() {
    super('O atendimento precisa durar pelo menos 15 minutos.');
    this.name = 'InvalidDurationError';
  }
}

/** Puxar a borda do card: muda só o fim, conferindo conflito com o novo intervalo. */
export async function resizeAppointment(params: {
  companyId: string;
  id: string;
  endAt: Date;
  updatedByUserId: string;
}): Promise<Appointment> {
  const existing = await prisma.appointment.findFirst({
    where: { id: params.id, companyId: params.companyId },
  });
  if (!existing) throw new AppointmentNotFoundError();
  if (params.endAt.getTime() - existing.startAt.getTime() < 15 * 60_000)
    throw new InvalidDurationError();

  await prisma.$transaction(async (tx) => {
    await lockProfessionalSchedule(tx, existing.professionalId);
    await assertNoConflict(
      {
        companyId: params.companyId,
        professionalId: existing.professionalId,
        startAt: existing.startAt,
        endAt: params.endAt,
        excludeAppointmentId: existing.id,
        bufferMinutes: existing.bufferMinutes,
      },
      tx,
    );
    await tx.appointment.updateMany({
      where: { id: params.id, companyId: params.companyId },
      data: { endAt: params.endAt, updatedByUserId: params.updatedByUserId },
    });
  });
  await recordAuditLog({
    companyId: params.companyId,
    entityType: 'Appointment',
    entityId: params.id,
    action: 'moved',
    userId: params.updatedByUserId,
    metadata: { endAt: params.endAt.toISOString(), resized: true },
  });
  return (await prisma.appointment.findFirst({
    where: { id: params.id, companyId: params.companyId },
  }))!;
}

export type AvailabilityInput = { weekday: number; startTime: string; endTime: string }[];

/** Expediente semanal do profissional: substitui tudo de uma vez, numa transação. */
export async function setProfessionalAvailability(params: {
  companyId: string;
  professionalId: string;
  availabilities: AvailabilityInput;
}) {
  const professional = await prisma.professional.findFirst({
    where: { id: params.professionalId, companyId: params.companyId },
    select: { id: true },
  });
  if (!professional) throw new ForeignEntityMismatchError('professional');

  await prisma.$transaction([
    prisma.professionalAvailability.deleteMany({
      where: { professionalId: params.professionalId },
    }),
    prisma.professionalAvailability.createMany({
      data: params.availabilities.map((a) => ({ ...a, professionalId: params.professionalId })),
    }),
  ]);
}

export async function getProfessionalAvailability(companyId: string, professionalId: string) {
  return prisma.professionalAvailability.findMany({
    where: { professionalId, professional: { companyId } },
    select: { weekday: true, startTime: true, endTime: true },
    orderBy: [{ weekday: 'asc' }, { startTime: 'asc' }],
  });
}
