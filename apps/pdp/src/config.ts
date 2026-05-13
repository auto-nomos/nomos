import { z } from 'zod';

const Config = z.object({
  PORT: z.coerce.number().int().positive().default(8787),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  CONTROL_PLANE_URL: z.string().url().default('http://localhost:8788'),
  CONTROL_PLANE_SERVICE_TOKEN: z.string().min(1).default('dev-shared-token'),
  CONTROL_PLANE_BUNDLE_VERIFY_KEY: z.string().optional(),
  PDP_CUSTOMER_IDS: z.string().optional(),
  POLICY_REFRESH_MS: z.coerce.number().int().positive().default(60_000),
  REVOCATION_REFRESH_MS: z.coerce.number().int().positive().default(5_000),
  AUDIT_LOG_PATH: z.string().min(1).default('./audit.log'),
  /**
   * Sprint 8.2 — DATABASE_URL is the Postgres the audit emitter writes to.
   * Local docker default matches `infrastructure/docker/docker-compose.yml`.
   * Required in production; in tests the JSONL fallback is allowed.
   */
  DATABASE_URL: z.string().min(1).default('postgres://cb:cb@localhost:5433/cb_dev'),
  AUDIT_BACKEND: z.enum(['postgres', 'jsonl']).default('postgres'),
  AUDIT_FLUSH_INTERVAL_MS: z.coerce.number().int().positive().default(100),
  AUDIT_BATCH_SIZE_MAX: z.coerce.number().int().positive().default(100),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().url().optional(),
  OTEL_EXPORTER_OTLP_HEADERS: z.string().optional(),
  OTEL_SERVICE_NAME: z.string().default('cb-pdp'),
  SENTRY_DSN: z.string().url().optional(),
  SENTRY_TRACES_SAMPLE_RATE: z.coerce.number().min(0).max(1).default(0.1),
  /**
   * Sprint MAOS-A — chain depth cap. Hard guard against runaway delegation
   * in agent swarms. Effective length includes the leaf.
   */
  NOMOS_MAX_CHAIN_DEPTH: z.coerce.number().int().positive().default(8),
});

export type Config = z.infer<typeof Config>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return Config.parse(env);
}
