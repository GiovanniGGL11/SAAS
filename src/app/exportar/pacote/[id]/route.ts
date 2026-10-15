import { requireFormAccess } from '@/server/auth/form-access';
import { getPackageForExport } from '@/server/data/package-sessions';
import { getEntryForExport } from '@/server/data/forms';
import { actorNames } from '@/server/data/audit-history';
import { buildPackagePdf } from '@/server/pdf/forms-pdf';
import { pdfError, pdfResponse } from '@/server/pdf/respond';

/**
 * PDF do pacote: resumo, ficha inicial e sessões. `?sessoes=id1,id2` escolhe as sessões
 * (atendimentos); sem ele, vão todas as realizadas.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const selected = new URL(request.url).searchParams
      .get('sessoes')
      ?.split(',')
      .map((s) => s.trim().slice(0, 64))
      .filter(Boolean)
      .slice(0, 200);
    const { company, access } = await requireFormAccess();
    const data = await getPackageForExport(company.id, access, id.slice(0, 64), selected ?? null);
    let initialEntry = null;
    if (data.initialEntryId) {
      const entry = await getEntryForExport(company.id, access, data.initialEntryId);
      const names = await actorNames(
        [entry.filledByUserId, entry.reviewedByUserId].filter((v): v is string => !!v),
      );
      initialEntry = {
        ...entry,
        filledByName: entry.filledByUserId ? (names.get(entry.filledByUserId) ?? null) : null,
        reviewedByName: entry.reviewedByUserId ? (names.get(entry.reviewedByUserId) ?? null) : null,
      };
    }
    const bytes = await buildPackagePdf({
      companyName: data.companyName,
      timezone: data.timezone,
      clientName: data.clientName,
      package: {
        name: data.pkg.name,
        serviceName: data.pkg.service.name,
        progress: data.pkg.progress,
        remaining: data.pkg.remaining,
        contractedAt: data.pkg.contractedAt,
        validUntil: data.pkg.validUntil,
        financial: data.pkg.financial,
      },
      initialEntry,
      sessions: data.sessions,
    });
    return pdfResponse(bytes, `${data.pkg.name} ${data.clientName}`);
  } catch (error) {
    return pdfError(error);
  }
}
