import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeftIcon } from 'lucide-react';

import { requireFormAccess } from '@/server/auth/form-access';
import { canSeeClient } from '@/server/auth/professional-scope';
import { getDocumentForPrint } from '@/server/data/clinical-documents';
import { getCompanyLogoUrl } from '@/server/data/public-booking';
import { DOCUMENT_LABEL, type DocumentKind } from '@/lib/clinical-documents';
import { medicalRecordsEnabled } from '@/lib/medical-records';
import { UserError } from '@/server/errors';
import { PrintButton } from './print-button';

export const metadata = { title: 'Imprimir documento', robots: { index: false, follow: false } };

/**
 * Documento do prontuário pronto para imprimir ou salvar em PDF (pela impressão do navegador).
 * Fora do menu do sistema, para sair limpo no papel. Mesmas travas do prontuário.
 */
export default async function PrintDocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { company, access } = await requireFormAccess();
  if (!medicalRecordsEnabled(company) || !access.canRead) notFound();
  const doc = await getDocumentForPrint(company.id, id).catch((e) => {
    if (e instanceof UserError) return null;
    throw e;
  });
  if (!doc || !(await canSeeClient(doc.clientId))) notFound();
  const logoUrl = await getCompanyLogoUrl(doc.company.clerkOrgId).catch(() => null);
  const when = new Intl.DateTimeFormat('pt-BR', {
    timeZone: doc.company.timezone,
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(doc.createdAt);

  return (
    <main className="min-h-screen bg-white text-black print:min-h-0">
      <div className="mx-auto flex max-w-[720px] flex-wrap items-center justify-between gap-2 px-4 py-4 print:hidden">
        <Link
          href={`/clientes/${doc.clientId}/prontuario`}
          className="inline-flex items-center gap-1 text-[14px] text-neutral-600 hover:text-black"
        >
          <ArrowLeftIcon className="size-4" /> Voltar ao prontuário
        </Link>
        <PrintButton />
      </div>

      <article className="relative mx-auto flex min-h-[900px] max-w-[720px] flex-col gap-8 px-10 py-10 font-serif print:min-h-0 print:px-0 print:py-0">
        {doc.canceledAt && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span className="rotate-[-24deg] rounded-xl border-4 border-red-600 px-6 py-2 text-[56px] font-bold tracking-widest text-red-600/70">
              ANULADO
            </span>
          </div>
        )}
        <header className="flex items-center gap-4 border-b border-neutral-300 pb-4">
          {logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- logo do Clerk, fora do domínio
            <img src={logoUrl} alt="" className="size-14 rounded-lg object-cover" />
          )}
          <div>
            <p className="font-sans text-[18px] font-semibold">{doc.company.name}</p>
            <p className="font-sans text-[13px] text-neutral-600">
              {DOCUMENT_LABEL[doc.kind as DocumentKind] ?? 'Documento'}
            </p>
          </div>
        </header>

        <div className="flex flex-col gap-1">
          <h1 className="font-sans text-[20px] font-semibold">{doc.title}</h1>
          <p className="font-sans text-[14px] text-neutral-700">
            Paciente: <strong>{doc.client.name}</strong>
            {doc.client.cpf ? ` · CPF ${doc.client.cpf}` : ''}
          </p>
        </div>

        <div className="text-[16px] leading-relaxed whitespace-pre-wrap">{doc.body}</div>

        <footer className="mt-auto flex flex-col items-center gap-1 pt-16 font-sans text-[14px]">
          <p className="self-end text-neutral-700">{when}</p>
          <div className="mt-12 w-72 border-t border-neutral-500" />
          <p className="font-semibold">{doc.professionalName}</p>
          {doc.professionalRegistry && (
            <p className="text-neutral-700">{doc.professionalRegistry}</p>
          )}
          {doc.canceledAt && (
            <p className="mt-4 text-[12px] text-red-700">
              Anulado em {new Date(doc.canceledAt).toLocaleDateString('pt-BR')}
              {doc.cancelReason ? `: ${doc.cancelReason}` : ''}
            </p>
          )}
        </footer>
      </article>
    </main>
  );
}
