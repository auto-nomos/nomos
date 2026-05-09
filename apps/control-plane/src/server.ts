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
import { handleTrpc } from './trpc/handler.js';

export interface ServerDeps {
  logger: Logger;
  db: Db;
  auth: Auth;
  /** Internal-route deps. When omitted, /v1/internal/* is not mounted. */
  internal?: {
    signKey: Uint8Array;
    signerDid: string;
    serviceToken: string;
  };
  /** OAuth bridge deps. When omitted, /v1/oauth/* is not mounted. */
  oauth?: {
    config: Config;
    encryptionKey: Uint8Array;
    fetch?: typeof fetch;
    now?: () => number;
  };
}

export function createServer(deps: ServerDeps): Hono {
  const app = new Hono();

  app.use('*', secureHeaders());
  app.use('*', requestId());
  app.use('*', loggerMiddleware(deps.logger));

  app.route('/', createHealthRoutes({ db: deps.db }));

  // Better-Auth handles all /auth/* routes itself.
  app.all('/auth/*', (c) => deps.auth.handler(c.req.raw));

  // tRPC under /trpc — every procedure resolves session via Better-Auth.
  app.all('/trpc/*', (c) =>
    handleTrpc(c.req.raw, { db: deps.db, auth: deps.auth, logger: deps.logger }),
  );

  // Service-to-service endpoints (PDP polls these for signed bundle + revocations).
  if (deps.internal) {
    app.route(
      '/',
      createInternalRoutes({
        db: deps.db,
        signKey: deps.internal.signKey,
        signerDid: deps.internal.signerDid,
        serviceToken: deps.internal.serviceToken,
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
