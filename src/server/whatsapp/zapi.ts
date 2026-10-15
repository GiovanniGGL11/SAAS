/*
  Cliente mínimo da Z-API (https://developer.z-api.io): enviar texto e ver se a instância está
  conectada. Cada empresa usa a própria instância (o WhatsApp do salão, conectado por QR code no
  painel da Z-API).
*/

export type ZapiConfig = { instanceId: string; token: string; clientToken?: string | null };

const BASE = 'https://api.z-api.io/instances';

/** Telefone no formato da Z-API: só dígitos, com DDI (55 para números brasileiros sem DDI). */
export function toZapiPhone(phone: string): string | null {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  if (digits.length >= 12 && digits.length <= 15) return digits;
  return null;
}

async function call(config: ZapiConfig, path: string, init: RequestInit = {}) {
  const url = `${BASE}/${encodeURIComponent(config.instanceId)}/token/${encodeURIComponent(config.token)}/${path}`;
  const response = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(config.clientToken ? { 'Client-Token': config.clientToken } : {}),
    },
    signal: AbortSignal.timeout(15_000),
    cache: 'no-store',
  });
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    const detail =
      typeof body.error === 'string'
        ? body.error
        : typeof body.message === 'string'
          ? body.message
          : '';
    throw new Error(`Z-API respondeu ${response.status}${detail ? `: ${detail}` : ''}`);
  }
  return body;
}

export async function sendText(config: ZapiConfig, phone: string, message: string) {
  const to = toZapiPhone(phone);
  if (!to) throw new Error('Telefone inválido para WhatsApp.');
  const body = await call(config, 'send-text', {
    method: 'POST',
    body: JSON.stringify({ phone: to, message }),
  });
  return {
    messageId: (body.messageId as string | undefined) ?? (body.id as string | undefined) ?? null,
  };
}

export async function getStatus(config: ZapiConfig) {
  const body = await call(config, 'status', { method: 'GET' });
  return {
    connected: body.connected === true,
    smartphoneConnected: body.smartphoneConnected === true,
    error: typeof body.error === 'string' ? body.error : null,
  };
}
