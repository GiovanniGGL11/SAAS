/**
 * Envio de e-mail pela API REST do Resend (sem SDK). Só funciona com `RESEND_API_KEY` e
 * `RESEND_FROM` (ex.: "Meu Negócio <avisos@seudominio.com>") configurados.
 */
export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim() && process.env.RESEND_FROM?.trim());
}

export type EmailMessage = { to: string; subject: string; text: string };
export type EmailSender = (message: EmailMessage) => Promise<void>;

export const sendEmail: EmailSender = async ({ to, subject, text }) => {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM?.trim();
  if (!apiKey || !from) throw new Error('E-mail não configurado (RESEND_API_KEY / RESEND_FROM).');

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [to], subject, text }),
  });
  if (!response.ok) {
    throw new Error(
      `Resend respondeu ${response.status}: ${(await response.text()).slice(0, 200)}`,
    );
  }
};
