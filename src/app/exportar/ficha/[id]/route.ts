import { requireFormAccess } from '@/server/auth/form-access';
import { getEntryForExport } from '@/server/data/forms';
import { actorNames } from '@/server/data/audit-history';
import { buildEntryPdf } from '@/server/pdf/forms-pdf';
import { pdfError, pdfResponse } from '@/server/pdf/respond';

/** PDF de uma ficha: só para quem pode exportar (e ler) — e a exportação fica no histórico. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { company, access } = await requireFormAccess();
    const data = await getEntryForExport(company.id, access, id.slice(0, 64));
    const names = await actorNames(
      [data.filledByUserId, data.reviewedByUserId].filter((v): v is string => !!v),
    );
    const bytes = await buildEntryPdf({
      ...data,
      filledByName: data.filledByUserId ? (names.get(data.filledByUserId) ?? null) : null,
      reviewedByName: data.reviewedByUserId ? (names.get(data.reviewedByUserId) ?? null) : null,
    });
    return pdfResponse(bytes, `${data.formName} ${data.clientName}`);
  } catch (error) {
    return pdfError(error);
  }
}
