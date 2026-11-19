/**
 * Unidade em que o estoque de um produto é controlado. Tudo (saldo, mínimo, consumo por serviço e
 * custo) fica nessa unidade: sérum em ml, luva em par, máscara em unidade.
 */
export const STOCK_UNITS = [
  { value: 'un', label: 'Unidade (un)', short: 'un' },
  { value: 'par', label: 'Par', short: 'par' },
  { value: 'ml', label: 'Mililitro (ml)', short: 'ml' },
  { value: 'g', label: 'Grama (g)', short: 'g' },
  { value: 'cx', label: 'Caixa (cx)', short: 'cx' },
  { value: 'pct', label: 'Pacote (pct)', short: 'pct' },
  { value: 'fl', label: 'Folha (fl)', short: 'fl' },
] as const;

export type StockUnit = (typeof STOCK_UNITS)[number]['value'];
export const STOCK_UNIT_VALUES = STOCK_UNITS.map((u) => u.value) as [StockUnit, ...StockUnit[]];

export function unitShort(unit: string | null | undefined): string {
  return STOCK_UNITS.find((u) => u.value === unit)?.short ?? 'un';
}

/** "350 ml", "12 par", "3 un". */
export function formatQty(quantity: number, unit: string | null | undefined): string {
  return `${quantity.toLocaleString('pt-BR')} ${unitShort(unit)}`;
}
