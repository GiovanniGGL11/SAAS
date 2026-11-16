/*
  Armazenamento privado das fotos de evolução dos clientes (Supabase Storage). O balde é
  PRIVADO: as fotos só abrem por link assinado, que expira em 1 hora — nunca por link fixo.
  Precisa de SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY (só no servidor; nunca no navegador).
*/

export const RECORDS_BUCKET = 'client-records';
/** Tempo dos links das fotos (segundos): 1 h para a equipe; o cliente recebe 10 min. */
const SIGNED_URL_SECONDS = 60 * 60;
export const CLIENT_SIGNED_URL_SECONDS = 10 * 60;
export const PHOTO_MAX_BYTES = 5 * 1024 * 1024;
export const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

export class StorageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StorageError';
  }
}

function config() {
  const url = process.env.SUPABASE_URL?.trim().replace(/\/$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  return url && key ? { url, key } : null;
}

export function isStorageConfigured(): boolean {
  return config() !== null;
}

function requireConfig() {
  const c = config();
  if (!c) throw new StorageError('O envio de fotos ainda não está configurado.');
  return c;
}

const headers = (key: string, extra: Record<string, string> = {}) => ({
  Authorization: `Bearer ${key}`,
  apikey: key,
  ...extra,
});

let bucketReady = false;

/** Cria o balde privado na primeira vez (se já existir, segue). */
async function ensureBucket() {
  if (bucketReady) return;
  const { url, key } = requireConfig();
  const res = await fetch(`${url}/storage/v1/bucket`, {
    method: 'POST',
    headers: headers(key, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      id: RECORDS_BUCKET,
      name: RECORDS_BUCKET,
      public: false,
      file_size_limit: PHOTO_MAX_BYTES,
      allowed_mime_types: [...PHOTO_TYPES],
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    // Já existe: tudo certo.
    if (!/already exists|Duplicate|409/i.test(`${res.status} ${text}`)) {
      console.error('[storage] criar balde', res.status, text.slice(0, 300));
      throw new StorageError('Não foi possível preparar o armazenamento das fotos.');
    }
  }
  bucketReady = true;
}

export async function uploadPhoto(path: string, body: Buffer, contentType: string) {
  await ensureBucket();
  const { url, key } = requireConfig();
  const res = await fetch(`${url}/storage/v1/object/${RECORDS_BUCKET}/${path}`, {
    method: 'POST',
    headers: headers(key, { 'Content-Type': contentType, 'x-upsert': 'false' }),
    body: new Uint8Array(body),
  });
  if (!res.ok) {
    console.error(
      '[storage] enviar foto',
      res.status,
      (await res.text().catch(() => '')).slice(0, 300),
    );
    throw new StorageError('Não foi possível guardar a foto. Tente de novo.');
  }
}

/** Links temporários para várias fotos de uma vez (padrão 1 h). */
export async function signedPhotoUrls(
  paths: string[],
  expiresIn = SIGNED_URL_SECONDS,
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  const c = config();
  if (!c || paths.length === 0) return result;
  const res = await fetch(`${c.url}/storage/v1/object/sign/${RECORDS_BUCKET}`, {
    method: 'POST',
    headers: headers(c.key, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({ expiresIn, paths }),
  });
  if (!res.ok) {
    console.error('[storage] links', res.status, (await res.text().catch(() => '')).slice(0, 300));
    return result;
  }
  const rows = (await res.json()) as { path?: string; signedURL?: string | null; error?: string }[];
  for (const row of rows) {
    if (row.path && row.signedURL) result.set(row.path, `${c.url}/storage/v1${row.signedURL}`);
  }
  return result;
}

export async function removePhotos(paths: string[]) {
  const c = config();
  if (!c || paths.length === 0) return;
  await fetch(`${c.url}/storage/v1/object/${RECORDS_BUCKET}`, {
    method: 'DELETE',
    headers: headers(c.key, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({ prefixes: paths }),
  }).catch((error) => console.error('[storage] apagar fotos', error));
}
