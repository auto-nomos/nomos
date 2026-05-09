import { generateKeypair } from '@credential-broker/crypto';
import { Hono } from 'hono';
import { secureHeaders } from 'hono/secure-headers';
import type { Auth } from './auth/index.js';
import type { Config } from './config.js';
import type { Db } from './db/index.js';
import type { Logger } from './logger.js';
import { loggerMiddleware } from './middleware/logger.js';
import { requestId } from './middleware/request-id.js';
import { createHealthRoutes } from './routes/health.js';
import { createInternalRoutes } from './routes/internal.js';
import { createOAuthRoutes } from './routes/oauth.js';
import type { RevocationPublisher } from './services/revocation-publisher.js';
import type { StepUpNotifier } from './services/stepup/notify.js';
import type { WebAuthnConfig } from './services/stepup/webauthn.js';
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
  /** Sprint 9 step-up. When omitted, /v1/internal/stepup/* is not mounted. */
  stepup?: {
    notifier: StepUpNotifier;
    dashboardPublicUrl: string;
    defaultTtlSeconds?: number;
  };
  /** Sprint 9 — WebAuthn config (RP id + origin) for passkey approval. */
  webauthn?: WebAuthnConfig;
}

export function createServer(deps: ServerDeps): Hono {
  const app = new Hono();
  const signing = deps.signing ?? ephemeralSigning();

  app.use('*', secureHeaders());
  app.use('*', requestId());
  app.use('*', loggerMiddleware(deps.logger));

  app.route('/', createHealthRoutes({ db: deps.db }));

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
      ...(deps.webauthn ? { webauthn: deps.webauthn } : {}),
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
