import type { Metadata } from 'next';
import { cookies } from 'next/headers';

import { getTodayInTz } from '@/lib/time';
import { isOnlineBookingEnabled } from '@/server/data/public-booking';
import {
  PORTAL_COOKIE,
  getCompanyOfStaleToken,
  getPortalExtras,
  getPortalOverview,
  getPortalSession,
} from '@/server/data/client-portal';
import { ClientPortal } from '@/components/client-portal/client-portal';
import { RequestAccess } from '@/components/client-portal/request-access';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Área do cliente',
  robots: { index: false, follow: false },
};

/** A área do cliente, aberta pelo link pessoal (/c/[token]) que deixa o cookie neste aparelho. */
export default async function ClientePage() {
  const token = (await cookies()).get(PORTAL_COOKIE)?.value;
  const session = await getPortalSession(token);

  if (!session) {
    // Cookie de um link que foi trocado: ainda dá para dizer de qual empresa era.
    const stale = token ? await getCompanyOfStaleToken(token) : null;
    return <RequestAccess company={stale} expired={Boolean(stale)} />;
  }

  const [overview, onlineBooking, extras] = await Promise.all([
    getPortalOverview(session),
    isOnlineBookingEnabled(session.company.clerkOrgId),
    getPortalExtras(session),
  ]);

  return (
    <ClientPortal
      clientName={session.name}
      company={{
        name: session.company.name,
        slug: session.company.slug,
        timezone: session.company.timezone,
        whatsapp: session.company.whatsapp,
      }}
      overview={overview}
      extras={extras}
      onlineBooking={onlineBooking}
      today={getTodayInTz(session.company.timezone)}
    />
  );
}
