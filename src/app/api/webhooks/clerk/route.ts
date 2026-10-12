import { NextResponse, type NextRequest } from 'next/server';
import { verifyWebhook } from '@clerk/nextjs/webhooks';
import { prisma } from '@/lib/db';
import { Prisma } from '@/generated/prisma/client';
import { softDeleteCompanyByClerkOrgId, upsertCompanyFromClerkOrg } from '@/server/data/company';

export async function POST(request: NextRequest) {
  const svixId = request.headers.get('svix-id');
  if (!svixId) {
    return new NextResponse('Missing svix-id header', { status: 400 });
  }

  let event: Awaited<ReturnType<typeof verifyWebhook>>;
  try {
    event = await verifyWebhook(request);
  } catch (error) {
    console.error('Clerk webhook signature verification failed', error);
    return new NextResponse('Invalid signature', { status: 400 });
  }

  // Idempotência: o Svix reenvia em timeout/5xx. Já processado → nada a fazer.
  const already = await prisma.webhookEvent.findUnique({ where: { clerkEventId: svixId } });
  if (already) return NextResponse.json({ received: true, deduped: true });

  switch (event.type) {
    case 'organization.created':
    case 'organization.updated': {
      await upsertCompanyFromClerkOrg({
        id: event.data.id,
        name: event.data.name,
        slug: event.data.slug,
      });
      break;
    }
    case 'organization.deleted': {
      if (event.data.id) {
        await softDeleteCompanyByClerkOrgId(event.data.id);
      }
      break;
    }
    default:
      break;
  }

  /*
    Registra a entrega só depois de processar. Antes registrava primeiro: se o processamento
    falhasse, o reenvio do Svix era tratado como duplicado e o evento se perdia (empresa renomeada
    ou excluída sem sincronizar). As operações acima são idempotentes, então reprocessar é seguro.
  */
  try {
    await prisma.webhookEvent.create({ data: { clerkEventId: svixId, type: event.type } });
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'))
      throw error;
  }

  return NextResponse.json({ received: true });
}
