import { createHmac, timingSafeEqual } from 'node:crypto';

import { prisma } from '@/lib/db';
import { UserError } from '@/server/errors';
import { recordAuditLog } from '@/server/data/audit';

/*
  Preferência de marketing (LGPD). Promoções — campanhas e parabéns de aniversário — só vão para
  quem não pediu para sair; toda mensagem de marketing leva o link para sair. Mensagens de serviço
  (confirmação, lembrete, avaliação, convite da lista de espera) não dependem disto.
*/

function secret(): string {
  const value = process.env.BOOKING_LINK_SECRET || process.env.CLERK_SECRET_KEY;
  if (!value) throw new Error('BOOKING_LINK_SECRET não configurado.');
  return value;
}

export function signOptOutToken(clientId: string): string {
  const sig = createHmac('sha256', secret())
    .update(`optout:${clientId}`)
    .digest('base64url')
    .slice(0, 22);
  return `${clientId}.${sig}`;
}

export function verifyOptOutToken(token: string): string | null {
  const [id, sig] = token.split('.');
  if (!id || !sig) return null;
  const expected = signOptOutToken(id).split('.')[1];
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b) ? id : null;
}

export function optOutUrl(baseUrl: string, clientId: string): string {
  return `${baseUrl.replace(/\/$/, '')}/descadastrar/${signOptOutToken(clientId)}`;
}

/** Rodapé obrigatório de toda mensagem de marketing. */
export function withOptOutFooter(text: string, url: string): string {
  return `${text}\n\nNão quer mais receber promoções? ${url}`;
}

/** Ids de quem não quer receber promoções nesta empresa. */
export async function optedOutIds(companyId: string): Promise<Set<string>> {
  const rows = await prisma.client.findMany({
    where: { companyId, marketingOptOutAt: { not: null } },
    select: { id: true },
  });
  return new Set(rows.map((r) => r.id));
}

/** Marca ou desmarca. `by`: "client" (pelo link) ou o id de quem registrou na equipe. */
export async function setMarketingOptOut(
  companyId: string,
  clientId: string,
  optedOut: boolean,
  by: string,
) {
  const result = await prisma.client.updateMany({
    where: { id: clientId, companyId },
    data: optedOut
      ? { marketingOptOutAt: new Date(), marketingOptOutBy: by }
      : { marketingOptOutAt: null, marketingOptOutBy: null },
  });
  if (result.count === 0) throw new UserError('Cliente não encontrado.');
  await recordAuditLog({
    companyId,
    entityType: 'Client',
    entityId: clientId,
    action: 'updated',
    userId: by,
    metadata: { marketingOptOut: optedOut },
  });
}

/** O que a página pública mostra: só o primeiro nome, a empresa e a preferência atual. */
export async function getOptOutContext(token: string) {
  const clientId = verifyOptOutToken(token);
  if (!clientId) return null;
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: {
      name: true,
      marketingOptOutAt: true,
      company: { select: { name: true, deletedAt: true } },
    },
  });
  if (!client || client.company.deletedAt) return null;
  return {
    companyName: client.company.name,
    clientFirstName: client.name.split(' ')[0],
    optedOut: client.marketingOptOutAt !== null,
  };
}

export async function setOptOutByToken(token: string, optedOut: boolean) {
  const clientId = verifyOptOutToken(token);
  if (!clientId) throw new UserError('Link inválido.');
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { companyId: true },
  });
  if (!client) throw new UserError('Link inválido.');
  await setMarketingOptOut(client.companyId, clientId, optedOut, 'client');
  return { optedOut };
}
