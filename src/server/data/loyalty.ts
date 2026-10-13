import { prisma } from '@/lib/db';
import { Prisma } from '@/generated/prisma/client';
import type {
  Appointment,
  LoyaltyEntry,
  LoyaltyMode,
  LoyaltyRewardType,
} from '@/generated/prisma/client';
import { serializeLoyaltyProgram, type SerializedLoyaltyProgram } from '@/lib/serialize';
import { describeReward, earnedFor, rewardThreshold } from '@/lib/loyalty';
import { UserError } from '@/server/errors';

const programInclude = { rewardService: { select: { id: true, name: true } } } as const;

export async function getLoyaltyProgram(
  companyId: string,
): Promise<SerializedLoyaltyProgram | null> {
  const program = await prisma.loyaltyProgram.findUnique({
    where: { companyId },
    include: programInclude,
  });
  return program ? serializeLoyaltyProgram(program) : null;
}

export type LoyaltyProgramInput = {
  active: boolean;
  mode: LoyaltyMode;
  stampsRequired: number;
  pointsPerReal: number;
  pointsRequired: number;
  cashbackPercent: number;
  rewardType: LoyaltyRewardType;
  rewardServiceId?: string | null;
  rewardValue?: number | null;
  rewardDescription?: string | null;
};

export async function saveLoyaltyProgram(
  companyId: string,
  data: LoyaltyProgramInput,
): Promise<SerializedLoyaltyProgram> {
  const usesReward = data.mode !== 'CASHBACK';

  let rewardServiceId: string | null = null;
  if (usesReward && data.rewardType === 'FREE_SERVICE' && data.rewardServiceId) {
    const service = await prisma.service.findFirst({
      where: { id: data.rewardServiceId, companyId },
      select: { id: true },
    });
    if (!service) throw new UserError('Serviço não encontrado.');
    rewardServiceId = service.id;
  }

  const fields = {
    active: data.active,
    mode: data.mode,
    stampsRequired: data.stampsRequired,
    pointsPerReal: data.pointsPerReal,
    pointsRequired: data.pointsRequired,
    cashbackPercent: data.cashbackPercent,
    rewardType: data.rewardType,
    rewardServiceId,
    rewardValue:
      usesReward && (data.rewardType === 'PERCENT_DISCOUNT' || data.rewardType === 'FIXED_DISCOUNT')
        ? (data.rewardValue ?? null)
        : null,
    rewardDescription:
      usesReward && data.rewardType === 'CUSTOM' ? (data.rewardDescription?.trim() ?? null) : null,
  };

  const program = await prisma.loyaltyProgram.upsert({
    where: { companyId },
    create: { companyId, ...fields },
    update: fields,
    include: programInclude,
  });
  return serializeLoyaltyProgram(program);
}

type LedgerClient = Pick<typeof prisma, 'loyaltyEntry'>;

/** EARN minus REDEEM per client, counting only entries of the given mode. */
async function balancesByClient(
  db: LedgerClient,
  companyId: string,
  mode: LoyaltyMode,
  clientIds?: string[],
): Promise<Map<string, number>> {
  const rows = await db.loyaltyEntry.groupBy({
    by: ['clientId', 'kind'],
    where: { companyId, mode, ...(clientIds ? { clientId: { in: clientIds } } : {}) },
    _sum: { amount: true },
  });

  const balances = new Map<string, number>();
  for (const row of rows) {
    const value = Number(row._sum.amount ?? 0) * (row.kind === 'EARN' ? 1 : -1);
    balances.set(row.clientId, (balances.get(row.clientId) ?? 0) + value);
  }
  // Cashback is money: keep sums at cent precision instead of float noise.
  for (const [id, value] of balances) balances.set(id, Math.round(value * 100) / 100);
  return balances;
}

export type ClientLoyalty = {
  program: SerializedLoyaltyProgram | null;
  balance: number;
  entries: LoyaltyEntry[];
};

export async function getClientLoyalty(
  companyId: string,
  clientId: string,
): Promise<ClientLoyalty | null> {
  const client = await prisma.client.findFirst({
    where: { id: clientId, companyId },
    select: { id: true },
  });
  if (!client) return null;

  const program = await getLoyaltyProgram(companyId);
  if (!program) return { program: null, balance: 0, entries: [] };

  const [balances, entries] = await Promise.all([
    balancesByClient(prisma, companyId, program.mode, [clientId]),
    prisma.loyaltyEntry.findMany({
      where: { companyId, clientId, mode: program.mode },
      orderBy: { createdAt: 'desc' },
      take: 10,
    }),
  ]);

  return { program, balance: balances.get(clientId) ?? 0, entries };
}

export type LoyaltyMember = { id: string; name: string; phone: string | null; balance: number };

/** Clients with a positive balance in the current mode, highest first. */
export async function listLoyaltyMembers(companyId: string): Promise<LoyaltyMember[]> {
  const program = await prisma.loyaltyProgram.findUnique({
    where: { companyId },
    select: { mode: true },
  });
  if (!program) return [];

  const balances = await balancesByClient(prisma, companyId, program.mode);
  const ids = [...balances].filter(([, balance]) => balance > 0).map(([id]) => id);
  if (ids.length === 0) return [];

  const clients = await prisma.client.findMany({
    where: { companyId, id: { in: ids } },
    select: { id: true, name: true, phone: true },
  });
  return clients
    .map((client) => ({ ...client, balance: balances.get(client.id) ?? 0 }))
    .sort((a, b) => b.balance - a.balance);
}

/**
 * Credits a completed appointment. Idempotent: the (appointmentId, kind)
 * unique key means an appointment marked DONE twice is only credited once.
 */
export async function earnLoyaltyFromAppointment(
  companyId: string,
  appointment: Appointment,
  createdByUserId: string,
  db: Prisma.TransactionClient = prisma,
): Promise<void> {
  const raw = await db.loyaltyProgram.findUnique({ where: { companyId }, include: programInclude });
  const program = raw ? serializeLoyaltyProgram(raw) : null;
  if (!program?.active) return;

  const amount = earnedFor(program, Number(appointment.priceSnapshot));
  if (amount <= 0) return;

  // Conferido antes de gravar (o agendamento está travado por quem chama): dentro de uma
  // transação, um erro de chave duplicada abortaria tudo, não só este crédito.
  const existing = await db.loyaltyEntry.findFirst({
    where: { appointmentId: appointment.id, kind: 'EARN' },
    select: { id: true },
  });
  if (existing) return;

  await db.loyaltyEntry.create({
    data: {
      companyId,
      clientId: appointment.clientId,
      appointmentId: appointment.id,
      mode: program.mode,
      kind: 'EARN',
      amount,
      description: appointment.serviceNameSnapshot,
      createdByUserId,
    },
  });
}

/** Tira o crédito de fidelidade de um atendimento desfeito (cancelado ou status voltado). */
export async function reverseLoyaltyFromAppointment(
  companyId: string,
  appointmentId: string,
  db: Prisma.TransactionClient = prisma,
): Promise<void> {
  await db.loyaltyEntry.deleteMany({ where: { companyId, appointmentId, kind: 'EARN' } });
}

async function requireActiveProgramAndClient(companyId: string, clientId: string) {
  const program = await getLoyaltyProgram(companyId);
  if (!program?.active) throw new UserError('O programa de fidelidade está desativado.');

  const client = await prisma.client.findFirst({
    where: { id: clientId, companyId },
    select: { id: true },
  });
  if (!client) throw new UserError('Cliente não encontrado.');
  return program;
}

/**
 * Redeems the reward (stamps/points) or `cashbackAmount` of the cashback
 * balance. The client row is locked for the transaction so two clicks at once
 * can't both pass the balance check and overdraw it.
 */
export async function redeemLoyalty(params: {
  companyId: string;
  clientId: string;
  createdByUserId: string;
  cashbackAmount?: number;
}): Promise<LoyaltyEntry> {
  const program = await requireActiveProgramAndClient(params.companyId, params.clientId);

  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT 1 FROM "Client" WHERE "id" = ${params.clientId} FOR UPDATE`;

    const balances = await balancesByClient(tx, params.companyId, program.mode, [params.clientId]);
    const balance = balances.get(params.clientId) ?? 0;

    let amount: number;
    if (program.mode === 'CASHBACK') {
      amount = Math.round((params.cashbackAmount ?? 0) * 100) / 100;
      if (amount <= 0) throw new UserError('Informe o valor a usar.');
      if (amount > balance) throw new UserError('Saldo de cashback insuficiente.');
    } else {
      amount = rewardThreshold(program)!;
      if (balance < amount) throw new UserError('Saldo insuficiente para o resgate.');
    }

    return tx.loyaltyEntry.create({
      data: {
        companyId: params.companyId,
        clientId: params.clientId,
        mode: program.mode,
        kind: 'REDEEM',
        amount,
        description: describeReward(program),
        createdByUserId: params.createdByUserId,
      },
    });
  });
}

/** Manual credit — e.g. carrying over stamps from a client's old paper card. */
export async function addLoyaltyManually(params: {
  companyId: string;
  clientId: string;
  amount: number;
  description?: string;
  createdByUserId: string;
}): Promise<LoyaltyEntry> {
  const program = await requireActiveProgramAndClient(params.companyId, params.clientId);
  if (program.mode !== 'CASHBACK' && !Number.isInteger(params.amount)) {
    throw new UserError('Selos e pontos precisam ser um número inteiro.');
  }

  return prisma.loyaltyEntry.create({
    data: {
      companyId: params.companyId,
      clientId: params.clientId,
      mode: program.mode,
      kind: 'EARN',
      amount: program.mode === 'CASHBACK' ? Math.round(params.amount * 100) / 100 : params.amount,
      description: params.description?.trim() || 'Lançamento manual',
      createdByUserId: params.createdByUserId,
    },
  });
}
