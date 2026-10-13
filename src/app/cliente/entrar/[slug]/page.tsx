import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';

import { isOnlineBookingEnabled } from '@/server/data/public-booking';
import {
  PORTAL_COOKIE,
  getPortalCompanyBySlug,
  getPortalSession,
} from '@/server/data/client-portal';
import { RequestAccess } from '@/components/client-portal/request-access';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Área do cliente',
  robots: { index: false, follow: false },
};

/**
 * Porta de entrada pública de uma empresa ("Já é cliente?"): quem já está conectado vai direto
 * para a área; quem não está pede o link pelo WhatsApp da empresa.
 */
export default async function EntrarPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ expirado?: string }>;
}) {
  const [{ slug }, { expirado }] = await Promise.all([params, searchParams]);
  const company = await getPortalCompanyBySlug(slug);
  if (!company) notFound();

  const session = await getPortalSession((await cookies()).get(PORTAL_COOKIE)?.value);
  if (session?.company.id === company.id) redirect('/cliente');

  const bookingUrl = (await isOnlineBookingEnabled(company.clerkOrgId))
    ? `/agendar/${company.slug}`
    : null;

  return (
    <RequestAccess
      company={{ name: company.name, whatsapp: company.whatsapp }}
      expired={expirado === '1'}
      bookingUrl={bookingUrl}
    />
  );
}
