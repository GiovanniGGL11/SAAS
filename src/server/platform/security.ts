import { headers } from 'next/headers';

import { prisma } from '@/lib/db';
import { PLATFORM_SESSION_MAX_MINUTES, isFreshSignIn } from '@/lib/platform-security';

/*
  Segurança do painel da plataforma, além da lista de donos (PLATFORM_ADMIN_USER_IDS):
  - login recente: o painel e as ações só funcionam se o login foi feito há menos de 1 hora;
  - histórico: cada abertura fica registrada (IP e aparelho) para o dono conferir.
*/

export { PLATFORM_SESSION_MAX_MINUTES, isFreshSignIn };

/** Recarregar a página várias vezes não enche o histórico: mesmo IP e aparelho em 10 min = 1. */
const DEDUPE_MS = 10 * 60_000;

export async function recordPlatformAccess(userId: string, now = new Date()): Promise<void> {
  try {
    const h = await headers();
    const ip =
      h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip')?.trim() || null;
    const userAgent = h.get('user-agent')?.slice(0, 400) || null;
    const recent = await prisma.platformAccess.findFirst({
      where: { userId, ip, userAgent, createdAt: { gte: new Date(now.getTime() - DEDUPE_MS) } },
      select: { id: true },
    });
    if (recent) return;
    await prisma.platformAccess.create({ data: { userId, ip, userAgent, createdAt: now } });
  } catch (error) {
    // O registro nunca pode impedir o dono de abrir o painel.
    console.error('[plataforma] não foi possível registrar o acesso', error);
  }
}

export type PlatformAccessRow = {
  id: string;
  userId: string;
  ip: string | null;
  userAgent: string | null;
  createdAt: Date;
};

export async function getPlatformAccesses(limit = 30): Promise<PlatformAccessRow[] | null> {
  try {
    return await prisma.platformAccess.findMany({ orderBy: { createdAt: 'desc' }, take: limit });
  } catch (error) {
    console.error('[plataforma] não foi possível ler o histórico de acessos', error);
    return null;
  }
}
