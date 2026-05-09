import { z } from 'zod';

const Config = z.object({
  PORT: z.coerce.number().int().positive().default(8788),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().min(1).default('postgres://cb:cb@localhost:5433/cb_dev'),
  DATABASE_DIRECT_URL: z.string().min(1).default('postgres://cb:cb@localhost:5433/cb_dev'),
  CONTROL_PLANE_SERVICE_TOKEN: z.string().min(1).default('dev-shared-token'),
  CONTROL_PLANE_BUNDLE_SIGN_KEY: z.string().optional(),
  CONTROL_PLANE_BUNDLE_SIGN_DID: z.string().optional(),
  CONTROL_PLANE_PUBLIC_URL: z.string().url().default('http://localhost:8788'),
  BETTER_AUTH_SECRET: z.string().min(16).default('dev-only-better-auth-secret-must-be-32+'),
  WORKOS_API_KEY: z.string().optional(),
  WORKOS_CLIENT_ID: z.string().optional(),
  SENTRY_DSN: z.string().url().optional(),

  // Sprint 5 — OAuth bridge.
  // 64-hex-char (32-byte) master key used to encrypt OAuth refresh + access
  // tokens at rest (XChaCha20-Poly1305). Generate with `pnpm gen-keys`.
  OAUTH_TOKEN_ENCRYPTION_KEY: z
    .string()
    .regex(/^[0-9a-f]{64}$/i)
    .default('00'.repeat(32)),
  // HMAC secret used to sign the OAuth `state` query param so the callback
  // can verify the redirect originated from us.
  OAUTH_STATE_SIGN_SECRET: z.string().min(16).default('dev-only-oauth-state-secret-32chars'),
  // Per-provider OAuth app credentials. Empty = connector disabled in dev.
  OAUTH_GITHUB_CLIENT_ID: z.string().optional(),
  OAUTH_GITHUB_CLIENT_SECRET: z.string().optional(),
  OAUTH_SLACK_CLIENT_ID: z.string().optional(),
  OAUTH_SLACK_CLIENT_SECRET: z.string().optional(),
  OAUTH_GOOGLE_CLIENT_ID: z.string().optional(),
  OAUTH_GOOGLE_CLIENT_SECRET: z.string().optional(),
  OAUTH_NOTION_CLIENT_ID: z.string().optional(),
  OAUTH_NOTION_CLIENT_SECRET: z.string().optional(),

  // Sprint 8 — push revocation. Comma-separated PDP webhook URLs the control
  // plane POSTs to on revoke (e.g. `http://localhost:8787/v1/internal/refresh-revocations`).
  // Empty = polling-only fallback (PDP still discovers within 5s).
  PDP_WEBHOOK_URLS: z.string().optional(),
});

export type Config = z.infer<typeof Config>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return Config.parse(env);
}
