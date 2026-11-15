/*
  Foto de perfil do profissional: reduzida no próprio aparelho para um quadrado de 256 px
  (~15–30 KB) e guardada junto do cadastro. Só é carregada nas telas de profissionais e na agenda;
  os agendamentos levam apenas nome e cor do profissional.
*/

/** Data URL de imagem aceita (JPEG, PNG ou WebP) — o servidor só guarda isto. */
export const AVATAR_DATA_URL = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/;

/** Teto do texto da foto (a de 256 px fica bem abaixo disto). */
export const AVATAR_MAX_CHARS = 150_000;

/** Lado da foto guardada, em pixels. */
const SIZE = 256;

/** Recorta o centro da imagem em quadrado e reduz para 256 px. */
export async function fileToAvatarDataUrl(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Escolha uma imagem (JPG, PNG ou WebP).');
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error('Não foi possível abrir essa imagem. Tente uma foto em JPG ou PNG.');
  }
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Não foi possível preparar a foto.');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(
    bitmap,
    (bitmap.width - side) / 2,
    (bitmap.height - side) / 2,
    side,
    side,
    0,
    0,
    SIZE,
    SIZE,
  );
  bitmap.close();
  // WebP é menor; navegador sem WebP devolve PNG, então cai para JPEG.
  const webp = canvas.toDataURL('image/webp', 0.82);
  const url = webp.startsWith('data:image/webp') ? webp : canvas.toDataURL('image/jpeg', 0.85);
  if (url.length > AVATAR_MAX_CHARS) throw new Error('A foto ficou grande demais. Tente outra.');
  return url;
}
