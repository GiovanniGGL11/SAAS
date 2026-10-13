import { headers } from 'next/headers';

import { UserError } from '@/server/errors';

// ---- Proteção das ações públicas (sem login) --------------------------------------------------
// Limite simples por IP, em memória: segura curiosos e robôs simples numa instância. Não substitui
// um rate limit distribuído (Upstash/Redis) se o tráfego crescer.
const hits = new Map<string, { count: number; resetAt: number }>();
export async function rateLimit(key: string, max: number, windowMs: number) {
  const ip = (await headers()).get('x-forwarded-for')?.split(',')[0]?.trim() || 'local';
  rateLimitByKey(`${key}:${ip}`, max, windowMs);
}

/** Mesmo limite, por uma chave já pronta (ex.: o usuário logado, para ações que custam dinheiro). */
export function rateLimitByKey(id: string, max: number, windowMs: number) {
  const now = Date.now();
  const entry = hits.get(id);
  if (!entry || entry.resetAt < now) {
    hits.set(id, { count: 1, resetAt: now + windowMs });
    return;
  }
  entry.count += 1;
  if (entry.count > max)
    throw new UserError('Muitas tentativas. Aguarde um minuto e tente de novo.');
}
