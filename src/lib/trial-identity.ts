/*
  Dados que identificam quem pede o 1º mês grátis. Normalizados para que variações do mesmo dado
  (pontos e "+algo" no e-mail, máscara no CPF, DDI no celular) contem como um só.
*/

/** Provedores de e-mail descartável mais comuns: não liberam o mês grátis. */
const DISPOSABLE_DOMAINS = new Set([
  '10minutemail.com',
  '10minutemail.net',
  'dispostable.com',
  'emailondeck.com',
  'fakeinbox.com',
  'getnada.com',
  'guerrillamail.com',
  'guerrillamail.net',
  'mailinator.com',
  'maildrop.cc',
  'mailnesia.com',
  'mintemail.com',
  'mohmal.com',
  'moakt.com',
  'sharklasers.com',
  'temp-mail.org',
  'temp-mail.io',
  'tempmail.com',
  'tempmail.dev',
  'tempmailo.com',
  'throwawaymail.com',
  'trashmail.com',
  'yopmail.com',
  'yopmail.net',
]);

/** E-mail em minúsculas, sem "+algo"; no Gmail, sem pontos (o Gmail ignora os dois). */
export function normalizeEmail(email: string): string {
  const [rawLocal = '', rawDomain = ''] = email.trim().toLowerCase().split('@');
  const domain = rawDomain === 'googlemail.com' ? 'gmail.com' : rawDomain;
  let local = rawLocal.split('+')[0];
  if (domain === 'gmail.com') local = local.replace(/\./g, '');
  return `${local}@${domain}`;
}

export function isDisposableEmail(email: string): boolean {
  return DISPOSABLE_DOMAINS.has(email.trim().toLowerCase().split('@')[1] ?? '');
}

const allSame = (d: string) => /^(\d)\1+$/.test(d);

export function isValidCpf(value: string): boolean {
  const d = value.replace(/\D/g, '');
  if (d.length !== 11 || allSame(d)) return false;
  const check = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(d[i]) * (len + 1 - i);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return check(9) === Number(d[9]) && check(10) === Number(d[10]);
}

export function isValidCnpj(value: string): boolean {
  const d = value.replace(/\D/g, '');
  if (d.length !== 14 || allSame(d)) return false;
  const check = (len: number) => {
    const weights =
      len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const sum = weights.reduce((acc, w, i) => acc + w * Number(d[i]), 0);
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return check(12) === Number(d[12]) && check(13) === Number(d[13]);
}

/** CPF ou CNPJ só com dígitos; `null` se não for um número válido. */
export function normalizeDocument(value: string): string | null {
  const d = value.replace(/\D/g, '');
  if (d.length === 11) return isValidCpf(d) ? d : null;
  if (d.length === 14) return isValidCnpj(d) ? d : null;
  return null;
}

/** Celular brasileiro com DDD (11 dígitos, começando em 9), sem o 55; `null` se não for. */
export function normalizeMobile(value: string): string | null {
  let d = value.replace(/\D/g, '');
  if ((d.length === 12 || d.length === 13) && d.startsWith('55')) d = d.slice(2);
  if (d.length !== 11) return null;
  const ddd = Number(d.slice(0, 2));
  if (ddd < 11 || ddd > 99 || d[2] !== '9' || allSame(d.slice(2))) return null;
  return d;
}
