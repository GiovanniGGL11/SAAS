import { NextResponse, type NextRequest } from 'next/server';
import { verifyWebhook } from '@clerk/nextjs/webhooks';
import { prisma } from '@/lib/db';
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

  // Idempotency: Svix retries deliveries on timeout/5xx, and Clerk may
  // redeliver events. Record the delivery id before doing any writes so a
  // retry of an already-processed event is a no-op.
  try {
    await prisma.webhookEvent.create({
      data: { clerkEventId: svixId, type: event.type },
    });
  } catch {
    // Unique constraint violation => already processed this delivery.
    return NextResponse.json({ received: true, deduped: true });
  }

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

  return NextResponse.json({ received: true });
}
