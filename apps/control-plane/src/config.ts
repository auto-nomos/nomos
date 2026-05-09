import { z } from 'zod';

const Config = z.object({
  PORT: z.coerce.number().int().positive().default(8788),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().min(1).default('postgres://cb:cb@localhost:5433/cb_dev'),
  DATABASE_DIRECT_URL: z.string().min(1).default('postgres://cb:cb@localhost:5433/cb_dev'),
  CONTROL_PLANE_SERVICE_TOKEN: z.string().min(1).default('dev-shared-token'),
  CONTROL_PLANE_BUNDLE_SIGN_KEY: z.string().optional(),
  WORKOS_API_KEY: z.string().optional(),
  WORKOS_CLIENT_ID: z.string().optional(),
  SENTRY_DSN: z.string().url().optional(),
});

export type Config = z.infer<typeof Config>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return Config.parse(env);
}
