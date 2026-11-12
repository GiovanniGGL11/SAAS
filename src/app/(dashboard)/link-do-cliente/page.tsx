import { requireAdminPage } from '@/server/auth/require-current-company';
import { prisma } from '@/lib/db';
import { appBaseUrl } from '@/server/app-url';
import {
  getCompanyLogoUrl,
  isOnlineBookingEnabled,
  listProfessionalsWithoutSchedule,
} from '@/server/data/public-booking';
import { ClientLinkView } from '@/components/link-do-cliente/client-link-view';

export const metadata = { title: 'Link do cliente' };

/** Tudo o que o cliente vê: link de agendamento, página, serviços, pagamento, área do cliente. */
export default async function LinkDoClientePage({
  searchParams,
}: {
  searchParams: Promise<{ aba?: string }>;
}) {
  const { company } = await requireAdminPage();
  const [{ aba }, enabled, baseUrl, withoutSchedule, logoUrl, services] = await Promise.all([
    searchParams,
    isOnlineBookingEnabled(company.clerkOrgId),
    appBaseUrl(),
    listProfessionalsWithoutSchedule(company.id),
    getCompanyLogoUrl(company.clerkOrgId),
    prisma.service.findMany({
      where: { companyId: company.id, active: true },
      select: {
        id: true,
        name: true,
        durationMinutes: true,
        price: true,
        priceKind: true,
        publicVisible: true,
      },
      orderBy: { name: 'asc' },
    }),
  ]);

  return (
    <ClientLinkView
      initialTab={aba}
      data={{
        companyName: company.name,
        bookingUrl: `${baseUrl}/agendar/${company.slug}`,
        entryUrl: `${baseUrl}/cliente/entrar/${company.slug}`,
        enabled,
        slotStep: company.bookingSlotStep,
        leadMinutes: company.bookingLeadMinutes,
        withoutSchedule,
        hasLogo: logoUrl !== null,
        profile: {
          zipCode: company.zipCode,
          street: company.street,
          number: company.number,
          complement: company.complement,
          district: company.district,
          city: company.city,
          state: company.state,
          instagram: company.instagram,
          cancellationPolicy: company.cancellationPolicy,
        },
        whatsapp: company.whatsapp,
        googleReviewUrl: company.googleReviewUrl,
        deposit: {
          // Pronto para cobrar: chave PIX cadastrada (PIX direto) ou conta Asaas conectada.
          connected: Boolean(
            company.depositMethod === 'pix' ? company.pixKey : company.asaasApiKey,
          ),
          percent: company.depositPercent,
          required: company.depositRequired,
        },
        services: services.map((s) => ({ ...s, price: Number(s.price) })),
      }}
    />
  );
}
