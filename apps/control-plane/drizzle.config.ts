import { defineConfig } from 'drizzle-kit';

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
