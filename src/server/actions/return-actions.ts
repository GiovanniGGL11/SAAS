'use server';

import { z } from 'zod';

import { toActionResult } from '@/server/action-result';
import { UserError } from '@/server/errors';
import { requireCurrentCompany } from '@/server/auth/require-current-company';
import { getOwnProfessional } from '@/server/auth/professional-scope';
import { whatsappLink } from '@/lib/phone';
import { findPendingReturn, listPendingReturns, markReturnContact } from '@/server/data/returns';

/*
  Retorno do paciente sem o envio automático: quando o dia chega, a tela pergunta; a pessoa
  confirma (Enter), o WhatsApp abre com a mensagem pronta e ela envia. Dono e recepção; a
  profissional com login próprio não recebe a pergunta.
*/

async function requireReturnsViewer() {
  const session = await requireCurrentCompany();
  if (await getOwnProfessional()) return null;
  return session;
}

/** Retornos esperando alguém chamar (vazio com o envio automático ligado e conectado). */
export async function getReturnPromptsAction() {
  const session = await requireReturnsViewer();
  if (!session) return { auto: false, items: [] };
  const { company } = session;
  const auto = Boolean(company.waAutoReturn && company.zapiInstanceId && company.zapiToken);
  if (auto) return { auto: true, items: [] };
  const pending = await listPendingReturns(company.id);
  return {
    auto: false,
    items: pending.map((r) => ({
      clientId: r.clientId,
      serviceId: r.serviceId,
      name: r.name,
      serviceName: r.serviceName,
      lastVisitAt: r.lastVisitAt.toISOString(),
      dueAt: r.dueAt.toISOString(),
      daysLate: r.daysLate,
      message: r.message,
      whatsappUrl: whatsappLink(r.phone, r.message),
    })),
  };
}

/** Enviado (abriu o WhatsApp), lembrar amanhã ou não chamar. */
export async function markReturnAction(input: unknown) {
  return toActionResult(async () => {
    const { clientId, serviceId, status } = z
      .object({
        clientId: z.string().min(1).max(64),
        serviceId: z.string().min(1).max(64),
        status: z.enum(['SENT', 'SNOOZED', 'DISMISSED']),
      })
      .parse(input);
    const session = await requireReturnsViewer();
    if (!session) throw new UserError('O retorno é tratado pela recepção ou pelo responsável.');
    const due = await findPendingReturn(session.company.id, clientId, serviceId);
    if (!due) throw new UserError('Este retorno não está mais pendente.');
    await markReturnContact({
      companyId: session.company.id,
      clientId,
      serviceId,
      lastVisitAt: due.lastVisitAt,
      status,
      userId: session.userId,
    });
  });
}
