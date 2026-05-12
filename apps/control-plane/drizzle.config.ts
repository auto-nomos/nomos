import { resolve } from 'node:path';
import { config } from 'dotenv';
import { defineConfig } from 'drizzle-kit';

// Load root .env.local (dev + VM), then package-level .env as override.
config({ path: resolve(__dirname, '../../.env.local') });
config({ path: resolve(__dirname, '.env'), override: true });

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_DIRECT_URL ?? 'postgres://cb:cb@localhost:5433/cb_dev',
  },
  verbose: true,
  strict: true,
});
