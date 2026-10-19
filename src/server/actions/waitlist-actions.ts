'use server';

import { revalidatePath } from 'next/cache';

import { toActionResult } from '@/server/action-result';
import { parseId } from '@/server/errors';

import { requireCurrentCompany } from '@/server/auth/require-current-company';
import { assertFeature, hasFeature } from '@/server/billing/features';
import {
  cancelWaitlistOffer,
  createWaitlistEntry,
  createWaitlistOffer,
  findOpenSlotsForWaitlist,
  listWaitingEntries,
  listWaitlistOffers,
  respondWaitlistOffer,
  setWaitlistEntryStatus,
} from '@/server/data/waitlist';
import { recordAuditLog } from '@/server/data/audit';
import {
  createOfferInput,
  offerIdInput,
  setWaitlistStatusInput,
  waitlistInput,
} from '@/lib/validations/waitlist';
import { z } from 'zod';

export async function listWaitlistAction() {
  const { company } = await requireCurrentCompany();
  return listWaitingEntries(company.id, company.timezone);
}

/** Vagas livres agora para cada pessoa da lista, dentro das preferências dela. */
export async function getWaitlistOpenSlotsAction() {
  const { company } = await requireCurrentCompany();
  return findOpenSlotsForWaitlist(company.id, company.timezone);
}

/** O que o plano libera na lista de espera (a tela esconde; o servidor confere de novo). */
export async function getWaitlistCapabilitiesAction() {
  const { company } = await requireCurrentCompany();
  return {
    invites: hasFeature(company, 'waitlistInvites'),
    automation: hasFeature(company, 'waitlistAutomation'),
  };
}

export async function createWaitlistEntryAction(input: unknown) {
  return toActionResult(async () => {
    const parsed = waitlistInput.parse(input);
    const { userId, company } = await requireCurrentCompany();
    // Preferências (vários profissionais, dias, faixa, validade) são do plano Profissional em diante;
    // o dia específico continua para todos.
    const advanced =
      (parsed.acceptedProfessionalIds?.length ?? 0) > 1 ||
      (parsed.weekdays?.length ?? 0) > 0 ||
      parsed.timeFrom != null ||
      parsed.timeTo != null ||
      Boolean(parsed.validUntil) ||
      !parsed.desiredDate;
    if (advanced) assertFeature(company, 'waitlistInvites');

    const entry = await createWaitlistEntry(company.id, company.timezone, userId, parsed);
    await recordAuditLog({
      companyId: company.id,
      entityType: 'WaitlistEntry',
      entityId: entry.id,
      action: 'created',
      userId,
      metadata: { source: 'app', desiredDate: entry.desiredDate },
    });
    return entry;
  });
}

export async function setWaitlistStatusAction(input: unknown) {
  return toActionResult(async () => {
    const parsed = setWaitlistStatusInput.parse(input);
    parseId(parsed.id);
    const { userId, company } = await requireCurrentCompany();

    await setWaitlistEntryStatus(company.id, parsed.id, parsed.status);
    await recordAuditLog({
      companyId: company.id,
      entityType: 'WaitlistEntry',
      entityId: parsed.id,
      action: parsed.status === 'CANCELED' ? 'canceled' : 'status_changed',
      userId,
      metadata: { source: 'app', status: parsed.status },
    });
  });
}

export async function listWaitlistOffersAction() {
  const { company } = await requireCurrentCompany();
  if (!hasFeature(company, 'waitlistInvites')) return [];
  return listWaitlistOffers(company.id);
}

/** Convida uma pessoa para um horário e segura o horário até o prazo de resposta. */
export async function createWaitlistOfferAction(input: unknown) {
  return toActionResult(async () => {
    const parsed = createOfferInput.parse(input);
    const { userId, company } = await requireCurrentCompany();
    assertFeature(company, 'waitlistInvites');
    const result = await createWaitlistOffer({
      companyId: company.id,
      timezone: company.timezone,
      userId,
      ...parsed,
    });
    revalidatePath('/agenda');
    return {
      id: result.offer.id,
      expiresAt: result.offer.expiresAt.toISOString(),
      message: result.message,
      whatsappUrl: result.whatsappUrl,
    };
  });
}

export async function respondWaitlistOfferAction(input: unknown) {
  return toActionResult(async () => {
    const parsed = offerIdInput.extend({ accept: z.boolean() }).parse(input);
    const { userId, company } = await requireCurrentCompany();
    assertFeature(company, 'waitlistInvites');
    const result = await respondWaitlistOffer({
      companyId: company.id,
      offerId: parsed.id,
      accept: parsed.accept,
      actorUserId: userId,
    });
    revalidatePath('/agenda');
    return result;
  });
}

export async function cancelWaitlistOfferAction(input: unknown) {
  return toActionResult(async () => {
    const parsed = offerIdInput.parse(input);
    const { userId, company } = await requireCurrentCompany();
    await cancelWaitlistOffer(company.id, userId, parsed.id);
    revalidatePath('/agenda');
  });
}
