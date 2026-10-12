/**
 * Telefone guardado só com dígitos: "(11) 98888-7777" e "11988887777" eram dois clientes
 * diferentes para o banco, e a regra de "um cliente por telefone" não pegava a duplicata.
 */
export function normalizePhone(value: string | null | undefined): string | undefined {
  const digits = (value ?? '').replace(/\D/g, '');
  return digits || undefined;
}

/** "11988887777" → "(11) 98888-7777"; o que não reconhecer volta como veio. */
export function formatPhone(value: string | null | undefined): string {
  const d = (value ?? '').replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '');
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return value ?? '';
}

/** Link do WhatsApp com a mensagem pronta; DDI 55 quando o número não traz o país. */
export function whatsappLink(phone: string | null | undefined, message?: string): string | null {
  const digits = (phone ?? '').replace(/\D/g, '');
  if (digits.length < 10) return null;
  const withCountry = digits.length <= 11 ? `55${digits}` : digits;
  return `https://wa.me/${withCountry}${message ? `?text=${encodeURIComponent(message)}` : ''}`;
}
