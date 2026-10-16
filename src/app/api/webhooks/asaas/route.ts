import { timingSafeEqual } from 'node:crypto';

import { NextResponse } from 'next/server';

import { handleBillingWebhook } from '@/server/billing/subscription';

export const dynamic = 'force-dynamic';

/**
 * Webhook da Asaas (conta da plataforma): cadastre esta URL no painel da Asaas com o token de
 * ASAAS_WEBHOOK_TOKEN. Sem o token configurado a rota fica fechada.
 */
export async function POST(request: Request) {
  const expected = process.env.ASAAS_WEBHOOK_TOKEN?.trim();
  if (!expected)
    return NextResponse.json({ error: 'ASAAS_WEBHOOK_TOKEN não configurado.' }, { status: 503 });
  const given = Buffer.from(request.headers.get('asaas-access-token') ?? '');
  const want = Buffer.from(expected);
  if (given.length !== want.length || !timingSafeEqual(given, want)) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
  }
  const payload = await request.json().catch(() => null);
  if (!payload) return NextResponse.json({ error: 'Corpo inválido.' }, { status: 400 });
  const result = await handleBillingWebhook(payload);
  // A Asaas só precisa de 200 para não reenviar; eventos de outras coisas são ignorados.
  return NextResponse.json({ result });
}
