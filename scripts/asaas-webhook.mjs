/*
  Cadastra (ou confere) o webhook de assinaturas na conta Asaas da plataforma.

    ASAAS_API_KEY=... ASAAS_WEBHOOK_TOKEN=... node scripts/asaas-webhook.mjs https://SEU-DOMINIO email@aviso.com

  A chave decide o ambiente (sandbox: "$aact_hmlg_"). O token precisa ter de 32 a 255 caracteres
  e ser o mesmo de ASAAS_WEBHOOK_TOKEN na Vercel. Envio sequencial: os eventos chegam na ordem.
*/

const [site, email] = process.argv.slice(2);
const apiKey = process.env.ASAAS_API_KEY?.trim();
const authToken = process.env.ASAAS_WEBHOOK_TOKEN?.trim();

if (!site || !email || !apiKey || !authToken) {
  console.error(
    'Uso: ASAAS_API_KEY=... ASAAS_WEBHOOK_TOKEN=... node scripts/asaas-webhook.mjs <site> <email>',
  );
  process.exit(1);
}
if (authToken.length < 32 || authToken.length > 255) {
  console.error('ASAAS_WEBHOOK_TOKEN precisa ter de 32 a 255 caracteres.');
  process.exit(1);
}

const base = apiKey.startsWith('$aact_hmlg_')
  ? 'https://api-sandbox.asaas.com/v3'
  : 'https://api.asaas.com/v3';
const url = `${site.replace(/\/$/, '')}/api/webhooks/asaas`;
const events = [
  'PAYMENT_CONFIRMED',
  'PAYMENT_RECEIVED',
  'PAYMENT_OVERDUE',
  'PAYMENT_REFUNDED',
  'PAYMENT_CHARGEBACK_REQUESTED',
  'SUBSCRIPTION_DELETED',
  'SUBSCRIPTION_INACTIVATED',
];

async function asaas(path, init = {}) {
  const response = await fetch(`${base}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', access_token: apiKey, 'User-Agent': 'Atendafy' },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${response.status} ${JSON.stringify(body.errors ?? body)}`);
  return body;
}

const existing = (await asaas('/webhooks')).data?.find((w) => w.url === url);
const config = {
  name: 'Atendafy — assinaturas',
  url,
  email,
  enabled: true,
  interrupted: false,
  apiVersion: 3,
  authToken,
  sendType: 'SEQUENTIALLY',
  events,
};
const saved = existing
  ? await asaas(`/webhooks/${existing.id}`, { method: 'PUT', body: JSON.stringify(config) })
  : await asaas('/webhooks', { method: 'POST', body: JSON.stringify(config) });
console.log(`${existing ? 'Atualizado' : 'Criado'}: ${saved.id} → ${url} (${base})`);
