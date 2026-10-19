import { prisma } from '@/lib/db';
import { UserError } from '@/server/errors';
import { recordAuditLog } from '@/server/data/audit';
import { getClientPackagesDetail } from '@/server/data/package-sessions';
import { listServiceSupplies } from '@/server/data/service-supplies';
import type { FormAccess } from '@/server/data/form-permissions';

/*
  Visão do atendimento: tudo do atendimento num lugar só, reaproveitando os módulos que já
  existem (fichas, registro da sessão, pacote, estoque, comanda). Permissões separadas:
  - clínico (registro anterior): permissão de LER fichas, no escopo da pessoa;
  - financeiro (pendências): só administrador.
  Nada aqui cria registro retroativo nem consome sessão — isso só acontece ao concluir pela comanda.
*/

export type OverviewViewer = {
  isAdmin: boolean;
  access: FormAccess | null;
  features: { checklists: boolean; quotes: boolean };
};

export async function getAppointmentOverview(
  companyId: string,
  appointmentId: string,
  viewer: OverviewViewer,
) {
  const appointment = await prisma.appointment.findFirst({
    where: { id: appointmentId, companyId },
    include: {
      client: { select: { id: true, name: true, phone: true, isVip: true, notes: true } },
      professional: { select: { id: true, name: true, color: true } },
      service: { select: { id: true, name: true, checklistItems: true } },
      items: { select: { serviceId: true, nameSnapshot: true }, orderBy: { position: 'asc' } },
      packageMovements: { select: { kind: true, sessionNumber: true } },
      sessionRecord: { select: { status: true, currentVersion: true } },
    },
  });
  if (!appointment) throw new UserError('Atendimento não encontrado.');
  const serviceIds = appointment.items.length
    ? appointment.items.map((i) => i.serviceId)
    : [appointment.serviceId];

  const canSeeClinical =
    !!viewer.access?.canRead &&
    (viewer.access.scope === 'ALL' || viewer.access.professionalId === appointment.professionalId);

  const [packages, supplies, consumed, previous, next, openTab, quotes, extraServices] =
    await Promise.all([
      appointment.clientPackageId
        ? getClientPackagesDetail(companyId, appointment.clientId)
        : Promise.resolve([]),
      Promise.all(serviceIds.map((id) => listServiceSupplies(companyId, id))).then((l) => l.flat()),
      prisma.stockMovement.findMany({
        where: { companyId, appointmentId: appointment.id },
        include: { product: { select: { name: true } } },
        orderBy: { createdAt: 'asc' },
      }),
      canSeeClinical
        ? prisma.appointment.findFirst({
            where: {
              companyId,
              clientId: appointment.clientId,
              status: 'DONE',
              startAt: { lt: appointment.startAt },
              ...(viewer.access?.scope === 'OWN'
                ? { professionalId: viewer.access.professionalId ?? '__none__' }
                : {}),
            },
            orderBy: { startAt: 'desc' },
            select: {
              id: true,
              startAt: true,
              serviceNameSnapshot: true,
              professional: { select: { name: true } },
              sessionRecord: { select: { status: true } },
            },
          })
        : Promise.resolve(null),
      prisma.appointment.findFirst({
        where: {
          companyId,
          clientId: appointment.clientId,
          status: { in: ['SCHEDULED', 'CONFIRMED'] },
          startAt: { gt: appointment.startAt },
        },
        orderBy: { startAt: 'asc' },
        select: { id: true, startAt: true, serviceNameSnapshot: true },
      }),
      viewer.isAdmin
        ? prisma.transaction.aggregate({
            where: { companyId, clientId: appointment.clientId, type: 'INCOME', status: 'PENDING' },
            _sum: { amount: true },
            _count: true,
          })
        : Promise.resolve(null),
      viewer.features.quotes
        ? prisma.quote.findMany({
            where: {
              companyId,
              clientId: appointment.clientId,
              status: { in: ['DRAFT', 'SENT', 'APPROVED'] },
              convertedAt: null,
            },
            select: { id: true, number: true, title: true, status: true },
            orderBy: { number: 'desc' },
            take: 5,
          })
        : Promise.resolve([]),
      appointment.items.length ? Promise.resolve(appointment.items.map((i) => i.nameSnapshot)) : [],
    ]);

  const pkg = appointment.clientPackageId
    ? packages.find((p) => p.id === appointment.clientPackageId)
    : undefined;
  const consumedSession = appointment.packageMovements.find((m) => m.kind === 'CONSUME');

  // Agrupa materiais previstos por produto (vários serviços podem pedir o mesmo).
  const planned = new Map<
    string,
    { productId: string; name: string; quantity: number; stock: number }
  >();
  for (const s of supplies) {
    const entry = planned.get(s.productId) ?? {
      productId: s.productId,
      name: s.productName,
      quantity: 0,
      stock: s.stock,
    };
    entry.quantity += s.quantity;
    planned.set(s.productId, entry);
  }

  return {
    id: appointment.id,
    status: appointment.status,
    startAt: appointment.startAt.toISOString(),
    endAt: appointment.endAt.toISOString(),
    serviceName: appointment.serviceNameSnapshot,
    extraServices,
    price: Number(appointment.priceSnapshot),
    notes: appointment.notes,
    cancellationReason: appointment.cancellationReason,
    client: {
      id: appointment.client.id,
      name: appointment.client.name,
      phone: appointment.client.phone,
      isVip: appointment.client.isVip,
    },
    professional: appointment.professional,
    plannedPackageId: appointment.clientPackageId,
    package: pkg
      ? {
          id: pkg.id,
          name: pkg.name,
          done: pkg.done,
          total: pkg.sessionsTotal,
          remaining: pkg.remaining,
          validUntil: pkg.validUntil?.toISOString() ?? null,
          alerts: pkg.alerts,
          // Número desta sessão: só existe depois de concluída (agendar não consome).
          sessionNumber: consumedSession?.sessionNumber ?? null,
          // Situação financeira do pacote é dado financeiro: só para administradores.
          financial: viewer.isAdmin ? pkg.financial : null,
        }
      : null,
    sessionRecord: appointment.sessionRecord
      ? {
          status: appointment.sessionRecord.status,
          version: appointment.sessionRecord.currentVersion,
        }
      : null,
    clinical: canSeeClinical
      ? {
          previous: previous
            ? {
                id: previous.id,
                startAt: previous.startAt.toISOString(),
                serviceName: previous.serviceNameSnapshot,
                professionalName: previous.professional.name,
                recordStatus: previous.sessionRecord?.status ?? null,
              }
            : null,
        }
      : null,
    financial:
      viewer.isAdmin && openTab
        ? { openTabAmount: Number(openTab._sum.amount ?? 0), openTabCount: openTab._count }
        : null,
    supplies: {
      planned: [...planned.values()],
      movements: consumed.map((m) => ({
        id: m.id,
        name: m.product.name,
        type: m.type,
        quantity: m.quantity,
        reason: m.reason,
      })),
    },
    checklist: viewer.features.checklists
      ? {
          items: appointment.service.checklistItems,
          checked: appointment.checklistChecked.filter((c) =>
            appointment.service.checklistItems.includes(c),
          ),
        }
      : null,
    next: next
      ? { id: next.id, startAt: next.startAt.toISOString(), serviceName: next.serviceNameSnapshot }
      : null,
    quotes,
  };
}

export type AppointmentOverview = Awaited<ReturnType<typeof getAppointmentOverview>>;

/** Marca/desmarca um item do checklist do serviço neste atendimento. */
export async function setChecklistItem(params: {
  companyId: string;
  userId: string;
  appointmentId: string;
  item: string;
  checked: boolean;
}) {
  const appointment = await prisma.appointment.findFirst({
    where: { id: params.appointmentId, companyId: params.companyId },
    select: { id: true, status: true, service: { select: { checklistItems: true } } },
  });
  if (!appointment) throw new UserError('Atendimento não encontrado.');
  if (appointment.status === 'CANCELED') throw new UserError('Atendimento cancelado.');
  if (!appointment.service.checklistItems.includes(params.item)) {
    throw new UserError('Esse item não está no checklist do serviço.');
  }
  // Atualização atômica no banco (duas pessoas marcando itens diferentes não se sobrescrevem).
  if (params.checked) {
    await prisma.$executeRaw`
      UPDATE "Appointment" SET "checklistChecked" = array_append("checklistChecked", ${params.item}), "updatedAt" = now()
      WHERE id = ${appointment.id} AND NOT (${params.item} = ANY("checklistChecked"))`;
  } else {
    await prisma.$executeRaw`
      UPDATE "Appointment" SET "checklistChecked" = array_remove("checklistChecked", ${params.item}), "updatedAt" = now()
      WHERE id = ${appointment.id}`;
  }
  await recordAuditLog({
    companyId: params.companyId,
    entityType: 'Appointment',
    entityId: appointment.id,
    action: 'updated',
    userId: params.userId,
    metadata: { checklist: params.item, checked: params.checked },
  });
}

/**
 * Material usado a mais neste atendimento (além do previsto no serviço). Sai do estoque na hora,
 * ligado ao atendimento, e NÃO volta se o atendimento for desfeito — foi usado de verdade.
 */
export async function recordExtraMaterial(params: {
  companyId: string;
  userId: string;
  appointmentId: string;
  productId: string;
  quantity: number;
}) {
  if (!Number.isInteger(params.quantity) || params.quantity < 1 || params.quantity > 1000) {
    throw new UserError('Informe uma quantidade inteira maior que zero.');
  }
  return prisma.$transaction(
    async (tx) => {
      const appointment = await tx.appointment.findFirst({
        where: { id: params.appointmentId, companyId: params.companyId },
        select: { id: true, status: true },
      });
      if (!appointment) throw new UserError('Atendimento não encontrado.');
      if (appointment.status === 'CANCELED') throw new UserError('Atendimento cancelado.');
      const [product] = await tx.$queryRaw<{ id: string; quantity: number; name: string }[]>`
        SELECT id, quantity, name FROM "Product"
        WHERE id = ${params.productId} AND "companyId" = ${params.companyId} FOR UPDATE`;
      if (!product) throw new UserError('Produto não encontrado.');
      if (product.quantity < params.quantity) {
        throw new UserError(`Estoque insuficiente: há ${product.quantity} de ${product.name}.`);
      }
      await tx.product.update({
        where: { id: product.id },
        data: { quantity: { decrement: params.quantity } },
      });
      return tx.stockMovement.create({
        data: {
          companyId: params.companyId,
          productId: product.id,
          type: 'OUT',
          quantity: params.quantity,
          reason: 'Material extra no atendimento',
          appointmentId: appointment.id,
          createdByUserId: params.userId,
        },
      });
    },
    { maxWait: 10_000, timeout: 20_000 },
  );
}
