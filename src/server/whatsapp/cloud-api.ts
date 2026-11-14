/*
  WhatsApp oficial do Atendafy (API Cloud da Meta): confirmação e lembrete incluídos nos planos,
  saindo do número do Atendafy em nome do salão. Fora de uma conversa aberta pelo cliente, a Meta
  só aceita mensagens de MODELO aprovado (categoria Utilidade) — por isso o texto é fixo e só os
  campos {{1}}..{{4}} mudam. Desligado enquanto as variáveis abaixo não estiverem configuradas.

    WHATSAPP_CLOUD_TOKEN       token permanente do usuário do sistema (Meta Business)
    WHATSAPP_CLOUD_PHONE_ID    id do número de telefone do Atendafy na API
    WHATSAPP_CLOUD_API_VERSION versão da Graph API (padrão v21.0)
    WHATSAPP_TEMPLATE_CONFIRMATION / WHATSAPP_TEMPLATE_REMINDER  nomes dos modelos aprovados
*/

export type OfficialTemplate = 'confirmation' | 'reminder';

const DEFAULT_TEMPLATES: Record<OfficialTemplate, string> = {
  confirmation: 'atendafy_confirmacao',
  reminder: 'atendafy_lembrete',
};

export function officialWhatsappReady(): boolean {
  return Boolean(
    process.env.WHATSAPP_CLOUD_TOKEN?.trim() && process.env.WHATSAPP_CLOUD_PHONE_ID?.trim(),
  );
}

function templateName(template: OfficialTemplate): string {
  const env =
    template === 'confirmation'
      ? process.env.WHATSAPP_TEMPLATE_CONFIRMATION
      : process.env.WHATSAPP_TEMPLATE_REMINDER;
  return env?.trim() || DEFAULT_TEMPLATES[template];
}

/** Número para a Meta: só dígitos, com o 55 do Brasil quando vier sem DDI. */
export function toWhatsappNumber(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return digits.length === 10 || digits.length === 11 ? `55${digits}` : digits;
}

/** Envia o modelo aprovado com os campos na ordem {{1}}, {{2}}... Devolve o id da mensagem. */
export async function sendOfficialTemplate(params: {
  to: string;
  template: OfficialTemplate;
  values: string[];
}): Promise<{ messageId: string | null }> {
  const token = process.env.WHATSAPP_CLOUD_TOKEN?.trim();
  const phoneId = process.env.WHATSAPP_CLOUD_PHONE_ID?.trim();
  if (!token || !phoneId) throw new Error('WhatsApp oficial não configurado.');
  const version = process.env.WHATSAPP_CLOUD_API_VERSION?.trim() || 'v21.0';
  const response = await fetch(`https://graph.facebook.com/${version}/${phoneId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: toWhatsappNumber(params.to),
      type: 'template',
      template: {
        name: templateName(params.template),
        language: { code: 'pt_BR' },
        components: [
          {
            type: 'body',
            // A Meta recusa campo vazio, com quebra de linha ou com muitos espaços seguidos.
            parameters: params.values.map((text) => ({
              type: 'text',
              text: text.replace(/\s+/g, ' ').trim().slice(0, 300) || '-',
            })),
          },
        ],
      },
    }),
    signal: AbortSignal.timeout(20_000),
  });
  const body = (await response.json().catch(() => ({}))) as {
    messages?: { id?: string }[];
    error?: { message?: string };
  };
  if (!response.ok) throw new Error(body.error?.message || `Meta respondeu ${response.status}`);
  return { messageId: body.messages?.[0]?.id ?? null };
}
