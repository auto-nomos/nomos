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
  // P-CV3 — Linear + Stripe (Clawvisor parity).
  OAUTH_LINEAR_CLIENT_ID: z.string().optional(),
  OAUTH_LINEAR_CLIENT_SECRET: z.string().optional(),
  OAUTH_STRIPE_CLIENT_ID: z.string().optional(),
  OAUTH_STRIPE_CLIENT_SECRET: z.string().optional(),

  // Sprint 8 — push revocation. Comma-separated PDP webhook URLs the control
  // plane POSTs to on revoke (e.g. `http://localhost:8787/v1/internal/refresh-revocations`).
  // Empty = polling-only fallback (PDP still discovers within 5s).
  PDP_WEBHOOK_URLS: z.string().optional(),

  // Sprint 9 — step-up. Knock workflow id `step-up-request` triggers web
  // push to the deciding user. Empty KNOCK_API_KEY = dev console fallback
  // (logger prints the deep link). Public dashboard URL is where the
  // /approve/:id page lives.
  KNOCK_API_KEY: z.string().optional(),
  KNOCK_WORKFLOW_ID: z.string().default('step-up-request'),
  // 7-day default so users can revisit Telegram / dashboard within a week
  // even if the agent's in-flight call already timed out. The SDK still
  // polls 60s and gives up — but the approval row stays actionable.
  STEPUP_DEFAULT_TTL_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(7 * 24 * 60 * 60 * 1_000),
  DASHBOARD_PUBLIC_URL: z.string().url().default('http://localhost:3000'),

  // P1 — M6 Telegram approval bot. Empty token = bot disabled (Knock /
  // dashboard PWA still work). Username (without leading @) is used to
  // build deep links: https://t.me/<username>?start=<token>.
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_BOT_USERNAME: z.string().optional(),
  /** Long-poll timeout for getUpdates (server-side, seconds). */
  TELEGRAM_POLL_TIMEOUT_S: z.coerce.number().int().positive().default(30),

  // P1 — M7 chain-context LLM intent verification.
  // When ENABLED + ANTHROPIC_API_KEY set: per-request fact extraction
  // (after allow) + per-request verify (before allow). Misaligned →
  // step-up. Adds ~150-300ms latency per call; gated behind flag.
  INTENT_CHAIN_CONTEXT_ENABLED: z.coerce.boolean().default(false),
  INTENT_CHAIN_CONTEXT_TIMEOUT_MS: z.coerce.number().int().positive().default(3_000),

  // Sprint 8.3 / D-4 — env-managed Ed25519 root key over the audit hash chain.
  // Phase 1 default: one key per environment. Customer-managed-key is Phase 2.
  // Generate via `pnpm gen-keys`. AUDIT_VERIFY_KEY ships to the audit-verify CLI.
  AUDIT_SIGN_KEY: z.string().optional(),
  AUDIT_VERIFY_KEY: z.string().optional(),
  AUDIT_SIGNING_KEY_ID: z.string().optional(),
  /** How often the daily-root signer runs. Default 24h. */
  AUDIT_ROOT_SIGN_INTERVAL_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(24 * 60 * 60 * 1_000),

  // P-CV1 — LLM intent coherence verifier (Clawvisor parity).
  // When enabled, /v1/intent runs an LLM check after heuristic + envelope
  // pass; coherence_mismatch denies fall back to step-up. Fail-closed on
  // timeout/error. Default OFF — opt in per environment.
  ANTHROPIC_API_KEY: z.string().optional(),
  INTENT_COHERENCE_ENABLED: z
    .union([z.boolean(), z.string().transform((s) => s === 'true' || s === '1')])
    .default(false),
  INTENT_COHERENCE_TIMEOUT_MS: z.coerce.number().int().positive().default(1500),

  // M0 (Cloud IAM) — Nomos-hosted OIDC issuer that AWS STS / Azure AD /
  // GCP WIF federate to. The Cloudflare Worker at id.auto-nomos.com serves
  // the public JWKS; the control-plane mints ID tokens internally for the
  // PDP. In dev we run JWKS + mint on the same Hono server.
  /** Public issuer URL — appears in token `iss` and JWKS `issuer` discovery. */
  OIDC_ISSUER_URL: z.string().url().default('http://localhost:8788/oidc'),
  /** Default ID-token TTL. Min 60s, max 900s (cloud federation caps). */
  OIDC_ID_TOKEN_TTL_SECONDS: z.coerce.number().int().min(60).max(900).default(300),
  /**
   * Dev RS256 signer — PEM-encoded PKCS#8 private key. When set, mint uses
   * this instead of AWS KMS. Empty in prod; production sets OIDC_KMS_KEY_ARN.
   * Generate via `openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048`.
   */
  OIDC_DEV_RSA_PRIVATE_KEY_PEM: z.string().optional(),
  /** Matching kid for the dev key. Must equal the kid in OIDC_DEV_RSA_PUBLIC_JWK. */
  OIDC_DEV_KID: z.string().optional(),
  /**
   * Matching public JWK as JSON string (kid, kty, n, e, alg, use). Served
   * verbatim at /oidc/jwks.json when dev signer is active.
   */
  OIDC_DEV_RSA_PUBLIC_JWK: z.string().optional(),
  /**
   * AWS KMS key ARN for the issuer signing key in prod. Empty = dev signer
   * required (mint refuses to start with neither). Asymmetric RSA_2048
   * key with RSASSA_PKCS1_V1_5_SHA_256 algorithm.
   */
  OIDC_KMS_KEY_ARN: z.string().optional(),
  /** Per-agent ID-token mint rate-limit (tokens/minute). Burst = limit / 6. */
  OIDC_MINT_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(60),
  /** How often the cloud verify-poll worker probes each cloud_connection. Default 24h. */
  CLOUD_VERIFY_POLL_INTERVAL_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(24 * 60 * 60 * 1_000),

  // Sprint 8.5 — Cloudflare R2 audit archive. When any of these are blank the
  // archive worker is disabled (the audit_events Postgres rows still keep
  // every event; the archive is for long-term immutable retention).
  R2_AUDIT_ENDPOINT: z.string().url().optional(),
  R2_AUDIT_BUCKET: z.string().min(1).default('cb-audit-archive-dev'),
  R2_AUDIT_ACCESS_KEY_ID: z.string().optional(),
  R2_AUDIT_SECRET_ACCESS_KEY: z.string().optional(),
  /** How often the archive worker runs. Default 1h. */
  AUDIT_ARCHIVE_INTERVAL_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(60 * 60 * 1_000),
});

export type Config = z.infer<typeof Config>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  // Empty strings from env files mean "not set"; convert to undefined so
  // optional validators (.url(), .min(1)) don't fail on blank lines.
  const cleaned = Object.fromEntries(
    Object.entries(env).map(([k, v]) => [k, v === '' ? undefined : v]),
  );
  return Config.parse(cleaned);
}
