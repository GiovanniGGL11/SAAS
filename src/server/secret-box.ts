import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

/*
  Cifra credenciais de terceiros guardadas no banco (ex.: token da Z-API). Usa a mesma chave do
  Google Agenda quando ela existe; senão deriva uma do segredo do app — o valor nunca fica legível
  no banco nem volta para o navegador.
*/

const VERSION = 'sb1';

function getKey(): Buffer {
  const raw = process.env.GOOGLE_TOKEN_ENCRYPTION_KEY;
  const key = raw ? Buffer.from(raw, 'base64') : null;
  if (key && key.length === 32) return key;
  const fallback = process.env.BOOKING_LINK_SECRET || process.env.CLERK_SECRET_KEY;
  if (!fallback) throw new Error('Nenhuma chave disponível para cifrar segredos.');
  return createHash('sha256').update(`secret-box:${fallback}`).digest();
}

export function sealSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', getKey(), iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return [
    VERSION,
    iv.toString('base64url'),
    cipher.getAuthTag().toString('base64url'),
    data.toString('base64url'),
  ].join('.');
}

export function openSecret(payload: string): string {
  const [version, iv, tag, data] = payload.split('.');
  if (version !== VERSION || !iv || !tag || !data)
    throw new Error('Formato de segredo desconhecido.');
  const decipher = createDecipheriv('aes-256-gcm', getKey(), Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(data, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}
