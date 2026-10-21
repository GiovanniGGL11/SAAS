/** Valor mínimo de cobrança na Asaas. */
export const MIN_DEPOSIT = 5;

/** Quanto cobrar adiantado de um serviço; `null` quando fica abaixo do mínimo da Asaas. */
export function depositAmountFor(price: number, percent: number): number | null {
  const amount = Math.round(price * percent) / 100;
  return amount >= MIN_DEPOSIT ? amount : null;
}
