// Loads .env.local (Next.js convention) so `prisma migrate`/`prisma studio`
// see the same DATABASE_URL as the app.
import { config } from 'dotenv';
import { defineConfig } from 'prisma/config';

config({ path: '.env.local' });

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    // Migrations/introspection need a direct (non-pooled) connection.
    // The app itself connects via DATABASE_URL (pooled) through a driver
    // adapter — see src/lib/db.ts.
    url: process.env['DIRECT_URL'],
  },
});
