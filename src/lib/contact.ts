/** Canais de contato do Atendafy (rodapé do site, termos, privacidade e mensagens de suporte). */
export const CONTACT_EMAIL = 'contato@atendafy.com';

export const CONTACT_EMAIL_HREF = `mailto:${CONTACT_EMAIL}`;

/**
 * Instagram do Atendafy: NEXT_PUBLIC_CONTACT_INSTAGRAM na Vercel, com o @ ou o link do perfil.
 * Enquanto não estiver configurado, o link não aparece.
 */
export function instagramProfile(): { handle: string; url: string } | null {
  const raw = (process.env.NEXT_PUBLIC_CONTACT_INSTAGRAM ?? '').trim();
  const handle = raw
    .replace(/^https?:\/\/(www\.)?instagram\.com\//i, '')
    .replace(/^@/, '')
    .replace(/[/?#].*$/, '');
  if (!/^[A-Za-z0-9._]{1,30}$/.test(handle)) return null;
  return { handle, url: `https://www.instagram.com/${handle}/` };
}
