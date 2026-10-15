/**
 * Máscara de dinheiro para campos de valor: a pessoa só digita números e eles entram pela direita,
 * como na maquininha. "2" → "0,02", "2000" → "20,00", "2000000" → "20.000,00".
 */
export function maskMoneyInput(raw: string): string {
  const digits = raw.replace(/\D/g, '').replace(/^0+/, '');
  if (!digits) return '';
  const cents = digits.padStart(3, '0');
  const reais = cents.slice(0, -2).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${reais},${cents.slice(-2)}`;
}

/** Valor já salvo (20000 ou 1234.5) no formato do campo mascarado ("20.000,00", "1.234,50"). */
export function moneyToInput(value: number | null | undefined): string {
  if (!value || value <= 0) return '';
  return maskMoneyInput(String(Math.round(value * 100)));
}

/** "20.000,00" → 20000. Vazio ou inválido vira 0. */
export function parseMoneyInput(masked: string): number {
  const n = Number(masked.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}
