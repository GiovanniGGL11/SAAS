import { prisma } from '@/lib/db';
import { ADD_ONS, getAddOn, getPlan } from '@/lib/billing/plans';
import { UserError } from '@/server/errors';
import { AiAccessError, type AiSession } from '@/server/ai/access';

/*
  Adicionais (ex.: atendimento com IA no WhatsApp). Separados do plano e do assistente interno;
  automações comuns de WhatsApp (sem IA) continuam no módulo de WhatsApp. Nada aqui envia
  mensagens: o adicional ainda não está implementado, então não pode ser ativado.
*/

export async function listAddOnStates(session: AiSession) {
  const rows = await prisma.companyAddOn.findMany({ where: { companyId: session.companyId } });
  const plan = getPlan(session.entitlements.planId);
  return ADD_ONS.map((addOn) => {
    const row = rows.find((r) => r.addOnId === addOn.id);
    return {
      id: addOn.id,
      name: addOn.name,
      description: addOn.description,
      implemented: addOn.implemented,
      allowedInPlan:
        !!plan?.addOns.includes(addOn.id) &&
        (!addOn.requiresAi || session.entitlements.ai.available.assistant),
      status: row?.status ?? 'INACTIVE',
      integrationStatus: row?.integrationStatus ?? 'NOT_CONFIGURED',
      monthlyQuota: row?.monthlyQuota ?? null,
      spendLimitCents: row?.spendLimitCents ?? null,
    };
  });
}

/** Ativar exige: adicional implementado, plano com IA que o permite, franquia e teto definidos. */
export async function activateAddOn(session: AiSession, addOnId: string) {
  if (!session.isAdmin)
    throw new AiAccessError('not_allowed', 'Só administradores ativam adicionais.');
  const addOn = getAddOn(addOnId);
  if (!addOn) throw new UserError('Adicional não encontrado.');
  const plan = getPlan(session.entitlements.planId);
  if (
    !plan?.addOns.includes(addOn.id) ||
    (addOn.requiresAi && !session.entitlements.ai.included?.assistant)
  ) {
    throw new AiAccessError(
      'not_in_plan',
      'Este adicional exige um plano com IA (Profissional ou Pro).',
    );
  }
  if (!addOn.implemented || addOn.priceCents === null) {
    throw new AiAccessError(
      'not_implemented',
      `${addOn.name} ainda não está disponível para contratação.`,
    );
  }
  const row = await prisma.companyAddOn.findUnique({
    where: { companyId_addOnId: { companyId: session.companyId, addOnId } },
  });
  if (!row?.monthlyQuota || !row.spendLimitCents) {
    throw new UserError('Defina a franquia e o limite de gastos antes de ativar.');
  }
  await prisma.companyAddOn.update({
    where: { id: row.id },
    data: { status: 'ACTIVE', activatedAt: new Date(), updatedByUserId: session.userId },
  });
}
