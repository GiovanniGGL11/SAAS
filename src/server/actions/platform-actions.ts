'use server';

import { z } from 'zod';
import { auth } from '@clerk/nextjs/server';
import { revalidatePath } from 'next/cache';

import { prisma } from '@/lib/db';
import { PLANS } from '@/lib/billing/plans';
import { toActionResult } from '@/server/action-result';
import { UserError } from '@/server/errors';
import { isPlatformAdmin } from '@/server/platform/overview';

/** "Sem prazo" grava esta data (bem no futuro) — dá para tirar a qualquer momento. */
const NO_END = new Date('2100-01-01T00:00:00Z');

async function requirePlatformAdmin() {
  const { userId } = await auth();
  if (!userId || !isPlatformAdmin(userId)) throw new UserError('Sem permissão.');
  return userId;
}

const offeredPlans = PLANS.filter((p) => p.offered).map((p) => p.id) as [string, ...string[]];

/** Dá acesso a uma empresa sem pagar (cortesia), com o plano e o prazo escolhidos. */
export async function grantCourtesyAction(input: unknown) {
  return toActionResult(async () => {
    const userId = await requirePlatformAdmin();
    const data = z
      .object({
        companyId: z.string().min(1).max(64),
        plan: z.enum(offeredPlans),
        until: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .nullable(),
        note: z.string().trim().max(300).optional(),
      })
      .parse(input);
    const until = data.until ? new Date(`${data.until}T23:59:59-03:00`) : NO_END;
    if (until.getTime() <= Date.now()) throw new UserError('Escolha uma data no futuro.');
    const company = await prisma.company.update({
      where: { id: data.companyId },
      // Cortesia dispensa liberar o mês grátis.
      data: {
        courtesyUntil: until,
        courtesyPlan: data.plan,
        courtesyNote: data.note || null,
        trialPending: false,
      },
      select: { id: true },
    });
    await prisma.auditLog.create({
      data: {
        companyId: company.id,
        entityType: 'Company',
        entityId: company.id,
        action: 'courtesy.granted',
        userId,
        metadata: { plan: data.plan, until: until.toISOString(), note: data.note ?? null },
      },
    });
    revalidatePath('/plataforma');
    return { until: until.toISOString() };
  });
}

/** Tira a cortesia: a empresa volta a depender do teste ou da assinatura. */
export async function revokeCourtesyAction(input: unknown) {
  return toActionResult(async () => {
    const userId = await requirePlatformAdmin();
    const { companyId } = z.object({ companyId: z.string().min(1).max(64) }).parse(input);
    await prisma.company.update({
      where: { id: companyId },
      data: { courtesyUntil: null, courtesyPlan: null, courtesyNote: null },
    });
    await prisma.auditLog.create({
      data: {
        companyId,
        entityType: 'Company',
        entityId: companyId,
        action: 'courtesy.revoked',
        userId,
      },
    });
    revalidatePath('/plataforma');
  });
}
