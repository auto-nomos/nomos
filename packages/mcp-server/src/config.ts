import { readFileSync } from 'node:fs';
import { z } from 'zod';

export const SUPPORTED_INTEGRATIONS = [
  'github',
  'slack',
  'google',
  'notion',
  'linear',
  'stripe',
  'google_calendar',
  'google_gmail',
] as const;
export type IntegrationId = (typeof SUPPORTED_INTEGRATIONS)[number];

export const ConfigSchema = z.object({
  apiKey: z.string().regex(/^cb_[0-9a-f-]+_/, 'expected api key format cb_<uuid>_<secret>'),
  pdpUrl: z.string().url(),
  controlPlaneUrl: z.string().url(),
  // Empty array = "fetch from control plane at startup". The platform is
  // the single source of truth for which integrations an agent can use —
  // the env var is an offline / power-user override only.
  integrations: z.array(z.enum(SUPPORTED_INTEGRATIONS)).default([]),
});
export type Config = z.infer<typeof ConfigSchema>;

interface RawConfig {
  apiKey?: string;
  pdpUrl?: string;
  controlPlaneUrl?: string;
  integrations?: string[];
}

/**
 * Resolve config in priority order: --config <file> > env vars.
 *
 * Env shape (parsed when no config file):
 *   CB_API_KEY            cb_<uuid>_<secret>
 *   CB_PDP_URL            https://pdp.example.com
 *   CB_CONTROL_PLANE_URL  https://api.example.com
 *   CB_INTEGRATIONS       github,slack    (comma-separated)
 */
export function loadConfig(argv: string[], env: NodeJS.ProcessEnv = process.env): Config {
  const raw = readArgvOrEnv(argv, env);
  const parsed = ConfigSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  • ${i.path.join('.') || '<root>'}: ${i.message}`)
      .join('\n');
    throw new ConfigError(`invalid mcp-server config:\n${issues}`);
  }
  return parsed.data;
}

function readArgvOrEnv(argv: string[], env: NodeJS.ProcessEnv): RawConfig {
  const configIdx = argv.findIndex((a) => a === '--config' || a === '-c');
  if (configIdx >= 0) {
    const path = argv[configIdx + 1];
    if (!path) throw new ConfigError('--config requires a path');
    let body: string;
    try {
      body = readFileSync(path, 'utf8');
    } catch (err) {
      throw new ConfigError(`could not read --config ${path}: ${(err as Error).message}`);
    }
    let json: unknown;
    try {
      json = JSON.parse(body);
    } catch (err) {
      throw new ConfigError(`config file ${path} is not valid JSON: ${(err as Error).message}`);
    }
    return json as RawConfig;
  }
  return {
    apiKey: env.CB_API_KEY,
    pdpUrl: env.CB_PDP_URL,
    controlPlaneUrl: env.CB_CONTROL_PLANE_URL,
    integrations: env.CB_INTEGRATIONS
      ? env.CB_INTEGRATIONS.split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : undefined,
  };
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}
