import { generateKeypair, keypairFromPrivate, loadSecretboxKey } from '@auto-nomos/crypto';
import { serve } from '@hono/node-server';
import { hexToBytes } from '@noble/hashes/utils';
import { createAuth } from './auth/index.js';
import { createCredsCache } from './cloud/creds-cache.js';
import { createCloudProviderRegistry } from './cloud/registry.js';
import { type Config, loadConfig } from './config.js';
import type { Db } from './db/index.js';
import { createDb, seedSchemas } from './db/index.js';
import { createLogger, type Logger } from './logger.js';
import { DbKeyStore, StaticKeyStore, withDevFallback } from './oidc/key-store.js';
import { createTokenBucketRateLimiter } from './oidc/rate-limit.js';
import { buildSignerFromConfig } from './oidc/signer.js';
import { createServer } from './server.js';
import { writeAnchor as writeAnchorService } from './services/audit-genesis-anchor.js';
import { createRecoveryNotifier } from './services/auth/recovery-notify.js';
import { createCloudAuditPublisher } from './services/cloud-audit-publisher.js';
import { createRiskSummarizer } from './services/grants/llm-risk-summary.js';
import { createCoherenceVerifier } from './services/intent-coherence.js';
import { createResendInviteNotifier } from './services/invites/resend.js';
import { createTelegramBot, type TelegramBot } from './services/notify/telegram-bot.js';
import { createOAuthSweep } from './services/oauth-sweep.js';
import { createPolicyInvalidator } from './services/policy-invalidator.js';
import { createRevocationPublisher } from './services/revocation-publisher.js';
import { createStepUpNotifier } from './services/stepup/notify.js';
import { deriveWebAuthnConfig } from './services/stepup/webauthn.js';
import { createAuditArchiveWorker, createR2Uploader } from './workers/audit-archive.js';
import { createAuditRootSigner } from './workers/audit-root-signer.js';
import { createCloudVerifyPoll } from './workers/cloud-verify-poll.js';

function loadOAuthEncryptionKey(config: Config, logger: Logger): Uint8Array {
  const isDevPlaceholder = config.OAUTH_TOKEN_ENCRYPTION_KEY === '00'.repeat(32);
  if (isDevPlaceholder) {
    if (config.NODE_ENV === 'production') {
      throw new Error(
        'OAUTH_TOKEN_ENCRYPTION_KEY must be set in production. Run `pnpm gen-keys` to generate one.',
      );
    }
    logger.warn(
      'OAUTH_TOKEN_ENCRYPTION_KEY is the dev placeholder — generate a real one with `pnpm gen-keys` before storing real tokens',
    );
  }
  return loadSecretboxKey(config.OAUTH_TOKEN_ENCRYPTION_KEY);
}

function loadAuditSigningKey(
  config: Config,
  logger: Logger,
): { signKey: Uint8Array; signingKeyId: string } | undefined {
  if (!config.AUDIT_SIGN_KEY || config.AUDIT_SIGN_KEY.length === 0) {
    if (config.NODE_ENV === 'production') {
      throw new Error(
        'AUDIT_SIGN_KEY is required in production. Run `pnpm gen-keys` once and set the value.',
      );
    }
    logger.warn('AUDIT_SIGN_KEY not set — daily audit roots disabled in dev. Run `pnpm gen-keys`.');
    return undefined;
  }
  const kp = keypairFromPrivate(hexToBytes(config.AUDIT_SIGN_KEY));
  const signingKeyId = config.AUDIT_SIGNING_KEY_ID ?? kp.did;
  logger.info({ signingKeyId }, 'loaded audit root signing key from env');
  return { signKey: kp.privateKey, signingKeyId };
}

function loadOidcDeps(
  config: Config,
  logger: Logger,
  db: Db,
):
  | {
      issuer: string;
      defaultTtlSeconds: number;
      keyStore: import('./oidc/key-store.js').KeyStore;
      signer: import('@auto-nomos/crypto').JwtSigner;
      serviceToken: string;
      rateLimiter: import('./oidc/rate-limit.js').RateLimiter;
    }
  | undefined {
  const resolved = buildSignerFromConfig(config);
  if (!resolved) {
    if (config.NODE_ENV === 'production') {
      throw new Error(
        'OIDC issuer signing key is required in production (set OIDC_KMS_KEY_ARN or OIDC_DEV_RSA_PRIVATE_KEY_PEM + OIDC_DEV_KID).',
      );
    }
    logger.warn(
      'OIDC issuer signing key not configured — /oidc/* + /v1/internal/oidc/* disabled. Cloud federation (M1+) will fail until set.',
    );
    return undefined;
  }
  const devKey = {
    kid: resolved.publicJwk.kid,
    alg: 'RS256' as const,
    status: 'active' as const,
    publicJwk: resolved.publicJwk,
    kmsKeyRef: 'local-dev',
  };
  const keyStore = withDevFallback(new DbKeyStore(db), devKey);
  // For tests that don't touch the DB, fall through with StaticKeyStore.
  void StaticKeyStore;
  logger.info({ kid: resolved.publicJwk.kid }, 'oidc issuer signer loaded');
  return {
    issuer: config.OIDC_ISSUER_URL,
    defaultTtlSeconds: config.OIDC_ID_TOKEN_TTL_SECONDS,
    keyStore,
    signer: resolved.signer,
    serviceToken: config.CONTROL_PLANE_SERVICE_TOKEN,
    rateLimiter: createTokenBucketRateLimiter({
      ratePerMinute: config.OIDC_MINT_RATE_LIMIT_PER_MINUTE,
    }),
  };
}

function loadSigningKey(
  config: Config,
  logger: Logger,
): { signKey: Uint8Array; signerDid: string } {
  if (config.CONTROL_PLANE_BUNDLE_SIGN_KEY && config.CONTROL_PLANE_BUNDLE_SIGN_KEY.length > 0) {
    const kp = keypairFromPrivate(hexToBytes(config.CONTROL_PLANE_BUNDLE_SIGN_KEY));
    logger.info({ did: kp.did }, 'loaded bundle signing key from env');
    return { signKey: kp.privateKey, signerDid: kp.did };
  }
  if (config.NODE_ENV === 'production') {
    throw new Error(
      'CONTROL_PLANE_BUNDLE_SIGN_KEY is required in production. Run `pnpm gen-keys` once and set the value.',
    );
  }
  const kp = generateKeypair();
  logger.warn(
    { did: kp.did },
    'CONTROL_PLANE_BUNDLE_SIGN_KEY not set — generated ephemeral signing key for dev. PDP will reject signatures across restarts.',
  );
  return { signKey: kp.privateKey, signerDid: kp.did };
}

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger(config);

  const db = createDb(config);
  await seedSchemas(db);
  const recoveryNotifier = createRecoveryNotifier({
    apiKey: config.KNOCK_API_KEY,
    logger,
  });

  // Audit C3 phase 2 — hoist audit-root signing key load above createAuth so
  // we can wire `writeGenesisAnchor` into the user.create.after hook. When
  // either the signing key or the genesis secret is absent (dev), the hook
  // is undefined and signup proceeds without an anchor row; backfill picks
  // it up later when the operator sets both env vars.
  const earlyAuditSigning = loadAuditSigningKey(config, logger);
  const writeGenesisAnchor =
    earlyAuditSigning && config.AUDIT_GENESIS_SECRET
      ? async (customerId: string) => {
          await writeAnchorService(
            {
              db: db.drizzle,
              signKey: earlyAuditSigning.signKey,
              signingKeyId: earlyAuditSigning.signingKeyId,
              genesisSecret: config.AUDIT_GENESIS_SECRET as string,
            },
            customerId,
          );
        }
      : undefined;

  const auth = createAuth({
    db: db.drizzle,
    config,
    logger,
    recoveryNotifier,
    ...(writeGenesisAnchor ? { writeGenesisAnchor } : {}),
  });
  const { signKey, signerDid } = loadSigningKey(config, logger);
  const encryptionKey = loadOAuthEncryptionKey(config, logger);

  const pdpWebhookUrls = (config.PDP_WEBHOOK_URLS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (pdpWebhookUrls.length === 0) {
    logger.warn(
      'PDP_WEBHOOK_URLS not set — push revocation disabled; PDPs will discover revokes via 5s polling sweep only',
    );
  } else {
    logger.info({ count: pdpWebhookUrls.length }, 'push revocation enabled');
  }
  const revocationPublisher = createRevocationPublisher({
    webhookUrls: pdpWebhookUrls,
    serviceToken: config.CONTROL_PLANE_SERVICE_TOKEN,
    logger,
  });

  // P3 push-invalidation: derive policy refresh URLs from the revocation
  // URLs unless the operator pinned a separate set. Both routes live on
  // the same PDP service token.
  const pdpPolicyWebhookUrls = pdpWebhookUrls.map((u) =>
    u.replace(/\/v1\/internal\/refresh-revocations$/, '/v1/internal/refresh-policies'),
  );
  if (pdpPolicyWebhookUrls.length > 0) {
    logger.info({ count: pdpPolicyWebhookUrls.length }, 'push policy invalidation enabled');
  }
  const policyInvalidator = createPolicyInvalidator({
    webhookUrls: pdpPolicyWebhookUrls,
    serviceToken: config.CONTROL_PLANE_SERVICE_TOKEN,
    logger,
  });

  let telegramBot: TelegramBot | undefined;
  if (config.TELEGRAM_BOT_TOKEN && config.TELEGRAM_BOT_USERNAME) {
    telegramBot = createTelegramBot({
      token: config.TELEGRAM_BOT_TOKEN,
      username: config.TELEGRAM_BOT_USERNAME,
      pollTimeoutS: config.TELEGRAM_POLL_TIMEOUT_S,
      db: db.drizzle,
      logger,
      policyInvalidator,
    });
    telegramBot.start();
  } else if (config.TELEGRAM_BOT_TOKEN || config.TELEGRAM_BOT_USERNAME) {
    logger.warn(
      'Telegram bot disabled — both TELEGRAM_BOT_TOKEN and TELEGRAM_BOT_USERNAME must be set',
    );
  }

  const stepUpNotifier = createStepUpNotifier({
    apiKey: config.KNOCK_API_KEY,
    workflow: config.KNOCK_WORKFLOW_ID,
    logger,
    telegramBot,
  });
  if (!config.KNOCK_API_KEY && !telegramBot) {
    logger.warn(
      'KNOCK_API_KEY + Telegram bot both unset — step-up notifications will log deep links to console only',
    );
  }

  const coherenceVerifier =
    config.INTENT_COHERENCE_ENABLED && config.ANTHROPIC_API_KEY
      ? createCoherenceVerifier({
          apiKey: config.ANTHROPIC_API_KEY,
          timeoutMs: config.INTENT_COHERENCE_TIMEOUT_MS,
        })
      : undefined;

  const riskSummarizer = config.ANTHROPIC_API_KEY
    ? createRiskSummarizer({
        apiKey: config.ANTHROPIC_API_KEY,
        timeoutMs: config.INTENT_COHERENCE_TIMEOUT_MS,
      })
    : undefined;
  if (riskSummarizer) {
    logger.info('step-up risk summarizer enabled (Haiku 4.5, fail-open)');
  } else {
    logger.info('ANTHROPIC_API_KEY missing — step-up risk summary uses deterministic fallback');
  }
  if (config.INTENT_COHERENCE_ENABLED && !config.ANTHROPIC_API_KEY) {
    logger.warn(
      'INTENT_COHERENCE_ENABLED=true but ANTHROPIC_API_KEY missing — coherence verifier disabled',
    );
  } else if (coherenceVerifier) {
    logger.info(
      { timeoutMs: config.INTENT_COHERENCE_TIMEOUT_MS },
      'intent coherence verifier enabled (Haiku 4.5, fail-closed)',
    );
  }

  // M0/M1 — build OIDC + cloud deps once. Both server bring-up and the
  // verify-poll worker share the same signer/keystore.
  const oidcDeps = loadOidcDeps(config, logger, db);
  const cloudDeps = oidcDeps
    ? {
        registry: createCloudProviderRegistry(),
        credsCache: createCredsCache(),
        auditPublisher: createCloudAuditPublisher({
          // PDP owns the audit hash chain; CP echoes cloud.token.minted +
          // cloud.federation.exchanged through `/v1/internal/audit/emit-cloud`.
          webhookUrls: pdpWebhookUrls.map((u) =>
            u.replace(/\/v1\/internal\/refresh-revocations$/, '/v1/internal/audit/emit-cloud'),
          ),
          serviceToken: config.CONTROL_PLANE_SERVICE_TOKEN,
          logger,
        }),
      }
    : undefined;
  const verifyPoll =
    oidcDeps && cloudDeps
      ? createCloudVerifyPoll({
          db: db.drizzle,
          registry: cloudDeps.registry,
          signer: oidcDeps.signer,
          issuer: oidcDeps.issuer,
          defaultTtlSeconds: oidcDeps.defaultTtlSeconds,
          logger,
          intervalMs: config.CLOUD_VERIFY_POLL_INTERVAL_MS,
        })
      : undefined;

  const inviteNotifier = createResendInviteNotifier({
    apiKey: config.RESEND_API_KEY,
    from: config.RESEND_FROM,
    dashboardUrl: config.DASHBOARD_PUBLIC_URL,
    logger,
  });
  if (config.RESEND_API_KEY && config.RESEND_FROM) {
    logger.info({ from: config.RESEND_FROM }, 'resend invite notifier enabled');
  } else {
    logger.warn('resend invite notifier disabled — invite tokens log to console only');
  }

  const app = createServer({
    logger,
    db,
    auth,
    signing: { signKey, signerDid },
    internal: { serviceToken: config.CONTROL_PLANE_SERVICE_TOKEN },
    oauth: { config, encryptionKey },
    revocationPublisher,
    policyInvalidator,
    inviteNotifier,
    stepup: {
      notifier: stepUpNotifier,
      dashboardPublicUrl: config.DASHBOARD_PUBLIC_URL,
      defaultTtlSeconds: Math.floor(config.STEPUP_DEFAULT_TTL_MS / 1_000),
      ...(riskSummarizer ? { riskSummarizer } : {}),
    },
    webauthn: deriveWebAuthnConfig(config.DASHBOARD_PUBLIC_URL),
    ...(coherenceVerifier ? { coherenceVerifier } : {}),
    ...(telegramBot ? { telegramBot } : {}),
    skills: {
      controlPlanePublicUrl: config.CONTROL_PLANE_PUBLIC_URL,
      pdpPublicUrl: process.env.PDP_PUBLIC_URL ?? 'http://localhost:8787',
      dashboardPublicUrl: config.DASHBOARD_PUBLIC_URL,
    },
    ...(oidcDeps ? { oidc: oidcDeps } : {}),
    ...(cloudDeps ? { cloud: { ...cloudDeps, ...(verifyPoll ? { verifyPoll } : {}) } } : {}),
  });

  const sweep = createOAuthSweep({
    db: db.drizzle,
    encryptionKey,
    config,
    logger,
    ...(telegramBot ? { telegramBot } : {}),
  });
  sweep.start();
  logger.info('oauth refresh sweep started (interval=1h, lookahead=24h)');

  // Reuse the early load — audit-genesis-anchor wiring above already pulled
  // the signing key out of env. One env read + one log line.
  const auditSigning = earlyAuditSigning;
  const auditRootSigner = auditSigning
    ? createAuditRootSigner({
        db: db.drizzle,
        signKey: auditSigning.signKey,
        signingKeyId: auditSigning.signingKeyId,
        logger,
        intervalMs: config.AUDIT_ROOT_SIGN_INTERVAL_MS,
      })
    : undefined;
  if (auditRootSigner) {
    auditRootSigner.start();
    logger.info({ intervalMs: config.AUDIT_ROOT_SIGN_INTERVAL_MS }, 'audit root signer started');
  }

  // M9 verify-poll — built above so the tRPC verifyNow mutation shares
  // one instance. Daily by default; configurable via env.
  if (verifyPoll) {
    verifyPoll.start();
    logger.info({ intervalMs: config.CLOUD_VERIFY_POLL_INTERVAL_MS }, 'cloud verify poll started');
  }

  const r2Configured =
    !!config.R2_AUDIT_ENDPOINT &&
    !!config.R2_AUDIT_ACCESS_KEY_ID &&
    !!config.R2_AUDIT_SECRET_ACCESS_KEY;
  const auditArchive = r2Configured
    ? createAuditArchiveWorker({
        db: db.drizzle,
        uploader: createR2Uploader({
          bucket: config.R2_AUDIT_BUCKET,
          // biome-ignore lint/style/noNonNullAssertion: r2Configured guards undefined.
          endpoint: config.R2_AUDIT_ENDPOINT!,
          // biome-ignore lint/style/noNonNullAssertion: r2Configured guards undefined.
          accessKeyId: config.R2_AUDIT_ACCESS_KEY_ID!,
          // biome-ignore lint/style/noNonNullAssertion: r2Configured guards undefined.
          secretAccessKey: config.R2_AUDIT_SECRET_ACCESS_KEY!,
        }),
        intervalMs: config.AUDIT_ARCHIVE_INTERVAL_MS,
        logger,
      })
    : undefined;
  if (auditArchive) {
    auditArchive.start();
    logger.info(
      { intervalMs: config.AUDIT_ARCHIVE_INTERVAL_MS, bucket: config.R2_AUDIT_BUCKET },
      'audit archive worker started',
    );
  } else {
    logger.warn(
      'R2 audit archive disabled — set R2_AUDIT_ENDPOINT / R2_AUDIT_ACCESS_KEY_ID / R2_AUDIT_SECRET_ACCESS_KEY to enable',
    );
  }

  const server = serve({ fetch: app.fetch, port: config.PORT }, (info) => {
    logger.info({ port: info.port }, 'control-plane listening');
  });

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'shutting down');
    sweep.stop();
    auditRootSigner?.stop();
    auditArchive?.stop();
    verifyPoll?.stop();
    server.close();
    await db.pool.end();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('uncaughtException', (err) => {
    logger.fatal({ err }, 'uncaught exception');
  });
}

void main().catch((err) => {
  console.error('fatal startup error', err);
  process.exit(1);
});
