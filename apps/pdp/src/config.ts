import { z } from 'zod';

const Config = z.object({
  PORT: z.coerce.number().int().positive().default(8787),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  CONTROL_PLANE_URL: z.string().url().default('http://localhost:8788'),
  CONTROL_PLANE_SERVICE_TOKEN: z.string().min(1).default('dev-shared-token'),
  POLICY_REFRESH_MS: z.coerce.number().int().positive().default(60_000),
  REVOCATION_REFRESH_MS: z.coerce.number().int().positive().default(5_000),
  AUDIT_LOG_PATH: z.string().min(1).default('./audit.log'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
});

export type Config = z.infer<typeof Config>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return Config.parse(env);
}
