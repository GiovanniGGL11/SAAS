import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@/generated/prisma/client';

declare global {
  var prisma: PrismaClient | undefined;
}

function createPrismaClient() {
  // Explicit, conservative pool settings: Supabase's pooler (pgbouncer) can
  // silently close idle connections server-side. node-postgres's default
  // Pool doesn't validate a connection before handing it back out, so a
  // connection the server already dropped surfaces as a confusing
  // "Connection terminated unexpectedly" on the next query. Keeping
  // idleTimeoutMillis short means the pool recycles connections on its own
  // schedule instead of finding out they're dead mid-request.
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL!,
    max: 5,
    idleTimeoutMillis: 10_000,
    // Detects a dead socket (machine slept, pooler killed it) via TCP
    // keep-alive probes instead of only finding out on the next query.
    keepAlive: true,
  });
  return new PrismaClient({ adapter });
}

export const prisma = globalThis.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalThis.prisma = prisma;
}
