import { formatCurrencyBRL } from '@/lib/serialize';

/** Como o preço de um item do catálogo é mostrado. Nunca expõe custo ou comissão. */
export const PRICE_KINDS = {
  fixed: 'Preço fixo',
  from: 'A partir de',
  on_request: 'Sob consulta',
} as const;
export type PriceKind = keyof typeof PRICE_KINDS;

export function priceLabel(price: number, kind: string | null | undefined): string {
  if (kind === 'on_request') return 'Sob consulta';
  if (kind === 'from') return `a partir de ${formatCurrencyBRL(price)}`;
  return formatCurrencyBRL(price);
}
