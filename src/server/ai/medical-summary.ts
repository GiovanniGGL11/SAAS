import { ageOn } from '@/lib/medical-records';
import {
  SUMMARY_INSTRUCTIONS,
  SUMMARY_RESPONSE_SCHEMA,
  buildSummaryPrompt,
  hasSummaryContent,
  normalizeSummary,
  type MedicalSummary,
} from '@/lib/medical-summary';
import { UserError } from '@/server/errors';
import { featureAccessFor } from '@/server/billing/features';
import { GeminiError, generateJson, getGeminiConfig } from '@/server/assistant/gemini';
import { reserveUnits, settleReservation } from '@/server/ai/quota';
import { recordUsageEvent } from '@/server/ai/usage';
import { getMedicalRecordHeader, listClinicalNotes } from '@/server/data/medical-records';
import { getTreatmentPlan } from '@/server/data/treatment-plan';
import { listFaceMaps, listToothMarks } from '@/server/data/clinical-charts';
import { describeToothMark } from '@/lib/odontogram';
import { clinicalCharts, faceMapTotals, formatAmount } from '@/lib/face-map';
import type { FormAccess } from '@/server/data/form-permissions';

/** Créditos de IA por resumo (uma chamada, mas com o prontuário inteiro de entrada). */
export const SUMMARY_UNITS = 2;
const FEATURE = 'medical_record_summary';

type SummaryCompany = Parameters<typeof featureAccessFor>[0] & {
  id: string;
  timezone: string;
  segment?: string | null;
};

/**
 * Resumo do prontuário com IA. Quem chama já conferiu o acesso ao prontuário e ao paciente; as
 * evoluções seguem o escopo de quem pede ("só os meus" vê só as próprias). Usa os créditos de IA
 * do plano; leitura que falha não gasta crédito.
 */
export async function summarizeMedicalRecord(params: {
  company: SummaryCompany;
  clientId: string;
  access: FormAccess;
}): Promise<MedicalSummary & { generatedAt: Date }> {
  const { company, clientId, access } = params;
  const gemini = getGeminiConfig();
  if (!gemini) throw new UserError('O resumo com IA não está disponível agora.');
  const limit = featureAccessFor(company).entitlements.ai.monthlyUnits ?? 0;
  if (limit <= 0) {
    throw new UserError(
      'O resumo com IA usa os créditos de IA do plano, e o seu plano não inclui IA. Veja em Assinatura.',
    );
  }

  const charts = clinicalCharts(company.segment);
  const [header, notes, plan, marks, faceMaps] = await Promise.all([
    getMedicalRecordHeader(company.id, clientId),
    listClinicalNotes(company.id, clientId, access),
    getTreatmentPlan(company.id, clientId),
    charts.odontogram ? listToothMarks(company.id, clientId) : Promise.resolve([]),
    charts.faceMap ? listFaceMaps(company.id, clientId) : Promise.resolve([]),
  ]);
  const day = new Intl.DateTimeFormat('pt-BR', {
    timeZone: company.timezone,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
  const input = {
    age: ageOn(header.client.birthDate),
    clientNotes: header.client.notes,
    alerts: header.alerts,
    nextAppointment: header.nextAppointment,
    lastVisit: header.lastVisit,
    returnSuggestion: header.returnSuggestion,
    notes,
    plan,
    dentalPending: marks
      .filter((m) => !m.removedAt && m.status === 'planned')
      .map((m) => describeToothMark(m) + (m.note ? ` (${m.note})` : '')),
    faceMaps: faceMaps
      .filter((m) => !m.canceledAt)
      .slice(0, 5)
      .map((m) => {
        const totals = faceMapTotals(m.points)
          .map((t) => `${t.product} ${formatAmount(t.amount, t.unit)}`)
          .join(', ');
        const areas = [...new Set(m.points.map((p) => p.area))].join(', ');
        return `${day.format(m.createdAt)}: ${m.title}${totals ? ` (${totals})` : ''} em ${areas}`;
      }),
  };
  if (!hasSummaryContent(input)) {
    throw new UserError(
      'Ainda não há o que resumir: registre uma evolução ou peça a anamnese primeiro.',
    );
  }

  const reservation = await reserveUnits({
    companyId: company.id,
    timezone: company.timezone,
    units: SUMMARY_UNITS,
    limit,
    feature: FEATURE,
  });
  try {
    const { json, usage } = await generateJson({
      apiKey: gemini.apiKey,
      model: gemini.model,
      systemInstruction: SUMMARY_INSTRUCTIONS,
      parts: [{ text: buildSummaryPrompt(input, company.timezone) }],
      responseSchema: SUMMARY_RESPONSE_SCHEMA,
      timeoutMs: 45_000,
    });
    const summary = normalizeSummary(json);
    await settleReservation(reservation.id, reservation.units);
    await recordUsageEvent({
      companyId: company.id,
      userId: access.userId,
      feature: FEATURE,
      provider: 'gemini',
      model: gemini.model,
      usage,
      calls: 1,
      units: reservation.units,
      outcome: 'SUCCEEDED',
    }).catch(() => undefined);
    return { ...summary, generatedAt: new Date() };
  } catch (error) {
    await settleReservation(reservation.id, 0).catch(() => undefined);
    if (error instanceof GeminiError) {
      throw new UserError(
        error.message.includes('sobrecarregada')
          ? 'A IA está sobrecarregada agora. Tente de novo em instantes.'
          : 'Não consegui gerar o resumo agora. Tente de novo.',
      );
    }
    if (error instanceof UserError) throw error;
    if (error instanceof Error && error.message.startsWith('Não consegui')) {
      throw new UserError(error.message);
    }
    throw error;
  }
}
