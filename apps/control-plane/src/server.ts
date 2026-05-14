import type { CloudConnectorId, CloudProvider } from '@auto-nomos/core';
import type { JwtSigner } from '@auto-nomos/crypto';
import { generateKeypair } from '@auto-nomos/crypto';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { secureHeaders } from 'hono/secure-headers';
import type { Auth } from './auth/index.js';
import type { Config } from './config.js';
import type { Db } from './db/index.js';
import type { Logger } from './logger.js';
import { loggerMiddleware } from './middleware/logger.js';
import { requestId } from './middleware/request-id.js';
import type { KeyStore } from './oidc/key-store.js';
import { createAgentMeRoutes } from './routes/agent-me.js';
import { createCloudInternalRoutes } from './routes/cloud-internal.js';
import { createHealthRoutes } from './routes/health.js';
import { createIntentRoutes } from './routes/intent.js';
import { createInternalRoutes } from './routes/internal.js';
import { createMintChildUcanRoutes } from './routes/mint-child-ucan.js';
import { createMintUcanRoutes } from './routes/mint-ucan.js';
import { createOAuthRoutes } from './routes/oauth.js';
import { createOidcRoutes } from './routes/oidc.js';
import { createSkillRoutes } from './routes/skill.js';
import { createSpansRoutes } from './routes/spans.js';
import type { CoherenceVerifier } from './services/intent-coherence.js';
import type { TelegramBot } from './services/notify/telegram-bot.js';
import type { PolicyInvalidator } from './services/policy-invalidator.js';
import type { RevocationPublisher } from './services/revocation-publisher.js';
import type { StepUpNotifier } from './services/stepup/notify.js';
import type { WebAuthnConfig } from './services/stepup/webauthn.js';
import { createUsageService } from './services/usage.js';
import { handleTrpc } from './trpc/handler.js';

export interface ServerDeps {
  logger: Logger;
  db: Db;
  auth: Auth;
  /**
   * Control-plane signing key (Ed25519). Used to sign policy bundles and
   * minted UCANs. When omitted (only in tests / dev), an ephemeral keypair is
   * generated at startup. `index.ts` always supplies this from
   * `CONTROL_PLANE_BUNDLE_SIGN_KEY` so production never falls back.
   */
  signing?: { signKey: Uint8Array; signerDid: string };
  /** Internal-route deps. When omitted, /v1/internal/* is not mounted. */
  internal?: {
    serviceToken: string;
  };
  /** OAuth bridge deps. When omitted, /v1/oauth/* is not mounted. */
  oauth?: {
    config: Config;
    encryptionKey: Uint8Array;
    fetch?: typeof fetch;
    now?: () => number;
  };
  /** Sprint 8 — push revocation. When omitted, ucans.revoke noop-publishes. */
  revocationPublisher?: RevocationPublisher;
  /** P3 — push policy invalidation. When omitted, PDP picks up grant + policy
   *  changes on the periodic refresh tick. */
  policyInvalidator?: PolicyInvalidator;
  /** Sprint 9 step-up. When omitted, /v1/internal/stepup/* is not mounted. */
  stepup?: {
    notifier: StepUpNotifier;
    dashboardPublicUrl: string;
    defaultTtlSeconds?: number;
    riskSummarizer?: import('./services/grants/llm-risk-summary.js').RiskSummarizer;
  };
  /** Sprint 9 — WebAuthn config (RP id + origin) for passkey approval. */
  webauthn?: WebAuthnConfig;
  /** Telegram bot for customer event notifications. */
  telegramBot?: TelegramBot;
  /** P-CV1 — Optional LLM intent coherence verifier. When omitted,
   *  /v1/intent skips the coherence step entirely. */
  coherenceVerifier?: CoherenceVerifier;
  /** Skill marketplace — public URLs templated into served markdown. */
  skills?: {
    controlPlanePublicUrl: string;
    pdpPublicUrl: string;
    dashboardPublicUrl: string;
  };
  /**
   * M0 — Nomos OIDC issuer. When omitted, /.well-known/openid-configuration,
   * /oidc/jwks.json, and /v1/internal/oidc/* are not mounted. Cloud federation
   * (M1+) requires this; SaaS-only deployments can leave it off.
   */
  oidc?: {
    issuer: string;
    defaultTtlSeconds: number;
    keyStore: KeyStore;
    signer: JwtSigner;
    serviceToken: string;
    rateLimiter?: import('./oidc/rate-limit.js').RateLimiter;
  };
  /**
   * M1 — cloud IAM federation. Requires `oidc` to also be set so the
   * session-creds endpoint can mint ID tokens for the federation exchange.
   */
  cloud?: {
    registry: Map<CloudConnectorId, CloudProvider>;
    credsCache?: import('./cloud/creds-cache.js').CredsCache;
    auditPublisher?: import('./services/cloud-audit-publisher.js').CloudAuditPublisher;
    verifyPoll?: import('./workers/cloud-verify-poll.js').CloudVerifyPoll;
  };
}

export function createServer(deps: ServerDeps): Hono {
  const app = new Hono();
  const signing = deps.signing ?? ephemeralSigning();

  // CORS — dashboard (3000) and tunnel callbacks need cross-origin POST + cookies.
  // Better-Auth's trustedOrigins gates the auth flow itself; CORS headers here
  // satisfy the browser preflight.
  app.use(
    '*',
    cors({
      origin: (origin) => {
        if (!origin) return origin;
        if (
          origin === 'http://localhost:3000' ||
          origin === 'http://127.0.0.1:3000' ||
          origin === 'https://app.auto-nomos.com' ||
          origin === 'https://auto-nomos.com' ||
          origin === 'https://www.auto-nomos.com' ||
          origin.endsWith('.trycloudflare.com') ||
          origin.endsWith('.ngrok-free.app')
        ) {
          return origin;
        }
        return null;
      },
      credentials: true,
      allowHeaders: ['content-type', 'authorization', 'cookie', 'x-cb-customer'],
      allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      maxAge: 600,
    }),
  );
  app.use('*', secureHeaders());
  app.use('*', requestId());
  app.use('*', loggerMiddleware(deps.logger));

  app.route('/', createHealthRoutes({ db: deps.db }));

  const usage = createUsageService({ db: deps.db });

  // SDK ↔ control-plane: trade an API key for short-lived UCANs. The PDP
  // never sees API keys; this route is the only one that does.
  app.route('/', createMintUcanRoutes({ db: deps.db, signing, usage }));

  // Sprint MAOS-A.2 — child UCAN minting for delegation chains. Only
  // mounted when oauth.encryptionKey is wired (it's needed to unseal the
  // parent agent's per-agent signing key). Without it, /v1/mint-child-ucan
  // can't decrypt the parent key, so the route is silently absent — the
  // route's response would be 500 anyway.
  if (deps.oauth?.encryptionKey) {
    app.route(
      '/',
      createMintChildUcanRoutes({
        db: deps.db,
        encryptionKey: deps.oauth.encryptionKey,
        usage,
      }),
    );
  }

  // MCP-server / agent discovery: which integrations + commands are
  // available to this API key? Derived from the customer's policy set so
  // the platform stays single-source-of-truth (no CB_INTEGRATIONS drift).
  app.route('/', createAgentMeRoutes({ db: deps.db }));

  // Observability v2 — MCP emits one span per tool call after the upstream
  // returns. Records outcome/latency/hashes + tiny redacted summary; never
  // raw bodies. Idempotent on (customer_id, receipt_id).
  app.route('/', createSpansRoutes({ db: deps.db }));

  // SDK ↔ control-plane: dynamic per-request scope narrowing via the
  // Approval Envelope model. Mounted only when step-up is configured —
  // step-up is the safety floor for new envelopes.
  if (deps.stepup) {
    app.route(
      '/',
      createIntentRoutes({
        db: deps.db,
        signing,
        stepup: deps.stepup,
        ...(deps.coherenceVerifier ? { coherenceVerifier: deps.coherenceVerifier } : {}),
      }),
    );
  }

  // Better-Auth handles all /auth/* routes itself.
  app.all('/auth/*', (c) => deps.auth.handler(c.req.raw));

  // tRPC under /trpc — every procedure resolves session via Better-Auth.
  app.all('/trpc/*', (c) =>
    handleTrpc(c.req.raw, {
      db: deps.db,
      auth: deps.auth,
      logger: deps.logger,
      signing: signing,
      ...(deps.revocationPublisher ? { revocationPublisher: deps.revocationPublisher } : {}),
      ...(deps.policyInvalidator ? { policyInvalidator: deps.policyInvalidator } : {}),
      ...(deps.webauthn ? { webauthn: deps.webauthn } : {}),
      ...(deps.oauth
        ? { oauth: { config: deps.oauth.config, encryptionKey: deps.oauth.encryptionKey } }
        : {}),
      ...(deps.telegramBot ? { telegramBot: deps.telegramBot } : {}),
      ...(deps.cloud?.credsCache ? { credsCache: deps.cloud.credsCache } : {}),
      ...(deps.cloud?.verifyPoll ? { cloudVerifyPoll: deps.cloud.verifyPoll } : {}),
    }),
  );

  // Service-to-service endpoints (PDP polls these for signed bundle + revocations).
  if (deps.internal) {
    app.route(
      '/',
      createInternalRoutes({
        db: deps.db,
        signKey: signing.signKey,
        signerDid: signing.signerDid,
        serviceToken: deps.internal.serviceToken,
        ...(deps.oauth?.encryptionKey ? { encryptionKey: deps.oauth.encryptionKey } : {}),
        ...(deps.oauth?.config ? { config: deps.oauth.config } : {}),
        ...(deps.oauth?.fetch ? { fetch: deps.oauth.fetch } : {}),
        logger: deps.logger,
        ...(deps.stepup ? { stepup: deps.stepup } : {}),
      }),
    );
  }

  // OAuth bridge — connect/callback (Sprint 5).
  if (deps.oauth) {
    app.route(
      '/',
      createOAuthRoutes({
        db: deps.db,
        auth: deps.auth,
        config: deps.oauth.config,
        logger: deps.logger,
        encryptionKey: deps.oauth.encryptionKey,
        fetch: deps.oauth.fetch,
        now: deps.oauth.now,
      }),
    );
  }

  if (deps.skills) {
    app.route('/', createSkillRoutes(deps.skills));
  }

  // M0 — OIDC issuer (public discovery + JWKS + internal mint).
  if (deps.oidc) {
    app.route('/', createOidcRoutes(deps.oidc));
    // M1 — cloud federation. Strictly requires oidc because session-creds
    // mints an ID token before calling the cloud token endpoint.
    if (deps.cloud) {
      app.route(
        '/',
        createCloudInternalRoutes({
          db: deps.db,
          serviceToken: deps.oidc.serviceToken,
          issuer: deps.oidc.issuer,
          signer: deps.oidc.signer,
          defaultTtlSeconds: deps.oidc.defaultTtlSeconds,
          registry: deps.cloud.registry,
          ...(deps.cloud.credsCache ? { credsCache: deps.cloud.credsCache } : {}),
          ...(deps.cloud.auditPublisher ? { auditPublisher: deps.cloud.auditPublisher } : {}),
        }),
      );
    }
  }

  app.onError((err, c) => {
    deps.logger.error({ err }, 'unhandled error');
    return c.json({ error: 'internal_error' }, 500);
  });

  app.notFound((c) => c.json({ error: 'not_found' }, 404));

  return app;
}

function ephemeralSigning(): { signKey: Uint8Array; signerDid: string } {
  const kp = generateKeypair();
  return { signKey: kp.privateKey, signerDid: kp.did };
}
