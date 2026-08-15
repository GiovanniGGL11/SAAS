import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    // Tests hit a real remote Postgres (Supabase pooler) — the 10s default
    // hook/test timeout is too tight for that round-trip latency.
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // Each test file gets its own worker process, each opening its own
    // connection pool. Running files in parallel multiplies concurrent
    // connections against Supabase's pooler enough to destabilize it —
    // run files sequentially instead.
    fileParallelism: false,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
