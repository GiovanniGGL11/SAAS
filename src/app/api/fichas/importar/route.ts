import { NextResponse, type NextRequest } from 'next/server';

import { requireFormAccess } from '@/server/auth/form-access';
import { requireAccess } from '@/server/data/form-permissions';
import { assertFeature, featureAccessFor } from '@/server/billing/features';
import { saveTemplate } from '@/server/data/forms';
import { UserError } from '@/server/errors';
import { GeminiError, generateJson, getGeminiConfig } from '@/server/assistant/gemini';
import { reserveUnits, settleReservation } from '@/server/ai/quota';
import { recordUsageEvent } from '@/server/ai/usage';
import {
  IMPORT_INSTRUCTIONS,
  IMPORT_RESPONSE_SCHEMA,
  normalizeImportedTemplate,
} from '@/lib/forms/pdf-import';

/*
  Importa a ficha de anamnese (PDF) do próprio estabelecimento: a IA lê o arquivo e monta o
  modelo, que abre no editor para conferir. Rota (e não ação de servidor) porque o PDF passa do
  limite de 1 MB das ações; a Vercel aceita até ~4,5 MB por pedido.
*/

export const maxDuration = 120;

const MAX_BYTES = 4 * 1024 * 1024;
/** Créditos de IA por importação (uma leitura de PDF pesa mais que uma pergunta ao assistente). */
const IMPORT_UNITS = 5;

const fail = (message: string, status = 400) => NextResponse.json({ error: message }, { status });

export async function POST(request: NextRequest) {
  let reservationId: string | null = null;
  try {
    const { company, access } = await requireFormAccess();
    assertFeature(company, 'forms');
    requireAccess(access, 'canManage', 'gerenciar modelos');

    const form = await request.formData().catch(() => null);
    const file = form?.get('file');
    if (!(file instanceof File)) return fail('Escolha o arquivo PDF da ficha.');
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      return fail('O arquivo precisa ser PDF.');
    }
    if (file.size > MAX_BYTES) return fail('O PDF passa de 4 MB. Tente uma versão menor.');

    const gemini = getGeminiConfig();
    if (!gemini) return fail('A leitura de PDF não está disponível agora.', 503);
    const limit = featureAccessFor(company).entitlements.ai.monthlyUnits ?? 0;
    if (limit <= 0) {
      return fail('A importação de PDF usa os créditos de IA do plano. Seu plano não inclui IA.');
    }
    const reservation = await reserveUnits({
      companyId: company.id,
      timezone: company.timezone,
      units: IMPORT_UNITS,
      limit,
      feature: 'form_pdf_import',
    });
    reservationId = reservation.id;

    const data = Buffer.from(await file.arrayBuffer()).toString('base64');
    const { json, usage } = await generateJson({
      apiKey: gemini.apiKey,
      model: gemini.model,
      systemInstruction: IMPORT_INSTRUCTIONS,
      parts: [
        { inlineData: { mimeType: 'application/pdf', data } },
        { text: 'Monte o formulário desta ficha seguindo as regras.' },
      ],
      responseSchema: IMPORT_RESPONSE_SCHEMA,
    });
    let imported;
    try {
      imported = normalizeImportedTemplate(json);
    } catch (error) {
      throw new UserError(error instanceof Error ? error.message : 'Não consegui montar a ficha.');
    }

    await settleReservation(reservation.id, reservation.units);
    reservationId = null;
    await recordUsageEvent({
      companyId: company.id,
      userId: access.userId,
      feature: 'form_pdf_import',
      provider: 'gemini',
      model: gemini.model,
      usage,
      calls: 1,
      units: reservation.units,
      outcome: 'SUCCEEDED',
    }).catch(() => undefined);

    const template = await saveTemplate(
      company.id,
      null,
      {
        name: imported.name,
        type: imported.type,
        description: imported.description || null,
        instructions: null,
        fillableBy: 'BOTH',
        renewal: 'ONCE',
        renewalDays: null,
        requirement: 'NONE',
        schema: imported.schema,
        serviceIds: [],
      },
      access.userId,
    );
    return NextResponse.json({ id: template.id });
  } catch (error) {
    // Leitura que falhou não gasta crédito.
    if (reservationId) await settleReservation(reservationId, 0).catch(() => undefined);
    if (error instanceof UserError || error instanceof GeminiError) return fail(error.message);
    console.error('[fichas/importar]', error);
    return fail('Não foi possível importar a ficha agora. Tente de novo.', 500);
  }
}
