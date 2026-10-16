/*
  Cliente mínimo da Asaas (https://docs.asaas.com, API v3). A chave decide o ambiente: chaves de
  sandbox começam com "$aact_hmlg_" e vão para api-sandbox; as de produção para api.asaas.com.
*/

export function asaasBaseUrl(apiKey: string): string {
  return apiKey.startsWith('$aact_hmlg_')
    ? 'https://api-sandbox.asaas.com/v3'
    : 'https://api.asaas.com/v3';
}

export class AsaasError extends Error {}

export async function asaasRequest<T = Record<string, unknown>>(
  apiKey: string,
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<T> {
  const response = await fetch(`${asaasBaseUrl(apiKey)}${path}`, {
    method: init.method ?? 'GET',
    headers: { 'Content-Type': 'application/json', access_token: apiKey, 'User-Agent': 'Atendafy' },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    signal: AbortSignal.timeout(20_000),
    cache: 'no-store',
  });
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    const errors = Array.isArray(body.errors) ? (body.errors as { description?: string }[]) : [];
    throw new AsaasError(
      errors
        .map((e) => e.description)
        .filter(Boolean)
        .join(' ') || `Asaas respondeu ${response.status}`,
    );
  }
  return body as T;
}

export type AsaasCustomerInput = {
  name: string;
  cpfCnpj: string;
  email?: string | null;
  mobilePhone?: string | null;
  externalReference?: string;
};

export async function createCustomer(apiKey: string, input: AsaasCustomerInput) {
  return asaasRequest<{ id: string }>(apiKey, '/customers', { method: 'POST', body: input });
}

export async function createSubscription(
  apiKey: string,
  input: {
    customer: string;
    value: number;
    nextDueDate: string;
    description: string;
    externalReference: string;
  },
) {
  return asaasRequest<{ id: string; status: string }>(apiKey, '/subscriptions', {
    method: 'POST',
    // UNDEFINED: o cliente escolhe PIX, boleto ou cartão na página de pagamento da Asaas.
    body: { ...input, billingType: 'UNDEFINED', cycle: 'MONTHLY' },
  });
}

export async function listSubscriptionPayments(apiKey: string, subscriptionId: string) {
  return asaasRequest<{
    data: { id: string; status: string; invoiceUrl: string; dueDate: string; value: number }[];
  }>(apiKey, `/subscriptions/${encodeURIComponent(subscriptionId)}/payments`);
}

export async function cancelSubscription(apiKey: string, subscriptionId: string) {
  return asaasRequest(apiKey, `/subscriptions/${encodeURIComponent(subscriptionId)}`, {
    method: 'DELETE',
  });
}

export async function createPixPayment(
  apiKey: string,
  input: {
    customer: string;
    value: number;
    dueDate: string;
    description: string;
    externalReference: string;
  },
) {
  return asaasRequest<{ id: string; status: string; invoiceUrl: string }>(apiKey, '/payments', {
    method: 'POST',
    body: { ...input, billingType: 'PIX' },
  });
}

export async function getPixQrCode(apiKey: string, paymentId: string) {
  return asaasRequest<{ encodedImage: string; payload: string; expirationDate: string }>(
    apiKey,
    `/payments/${encodeURIComponent(paymentId)}/pixQrCode`,
  );
}

export async function getPayment(apiKey: string, paymentId: string) {
  return asaasRequest<{ id: string; status: string; value: number }>(
    apiKey,
    `/payments/${encodeURIComponent(paymentId)}`,
  );
}

/** Status da Asaas que significam "dinheiro pago". */
export const PAID_STATUSES = new Set(['RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH']);
