import { requireFormAccess } from '@/server/auth/form-access';
import { getSessionRecordForExport } from '@/server/data/package-sessions';
import { buildSessionPdf } from '@/server/pdf/forms-pdf';
import { pdfError, pdfResponse } from '@/server/pdf/respond';

/** PDF do registro de uma sessão (versões, adendos e assinaturas). Exige permissão de exportar. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ appointmentId: string }> },
) {
  try {
    const { appointmentId } = await params;
    const { company, access } = await requireFormAccess();
    const data = await getSessionRecordForExport(company.id, access, appointmentId.slice(0, 64));
    const bytes = await buildSessionPdf(data);
    return pdfResponse(bytes, `Registro ${data.appointment.clientName}`);
  } catch (error) {
    return pdfError(error);
  }
}
