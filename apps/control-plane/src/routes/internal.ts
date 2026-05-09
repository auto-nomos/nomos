import { Hono } from 'hono';
import type { Config } from '../config.js';
import type { Db } from '../db/index.js';
import type { Logger } from '../logger.js';
import { internalAuth } from '../middleware/internal-auth.js';
import { loadConnectionById } from '../oauth/tokens.js';
import { generateBundle } from '../services/bundle.js';
import { RefreshError, refreshConnection } from '../services/oauth-refresh.js';
import { fetchRevokedCids } from '../services/revocations.js';

export interface InternalDeps {
  db: Db;
  signKey: Uint8Array;
  signerDid: string;
  serviceToken: string;
  /** OAuth token encryption key — required for /v1/internal/oauth-tokens/:id. */
  encryptionKey?: Uint8Array;
  /** Required for /v1/internal/oauth-tokens/:id/refresh — config carries client creds. */
  config?: Config;
  logger?: Logger;
  /** Inject upstream fetch for refresh tests. */
  fetch?: typeof fetch;
}

export function createInternalRoutes(deps: InternalDeps): Hono {
  const app = new Hono();

  // Scope the bearer guard to /v1/internal/* so requests for other routes
  // (e.g. /v1/oauth/callback, mounted on the same parent app) don't get
  // intercepted with 401 by this sub-app's middleware.
  app.use('/v1/internal/*', internalAuth(deps.serviceToken));

  app.get('/v1/internal/bundles/:customerId', async (c) => {
    const customerId = c.req.param('customerId');
    const bundle = await generateBundle(customerId, {
      db: deps.db.drizzle,
      signKey: deps.signKey,
      signerDid: deps.signerDid,
    });
    return c.json(bundle);
  });

  app.get('/v1/internal/revocations/:customerId', async (c) => {
    const customerId = c.req.param('customerId');
    const cids = await fetchRevokedCids(customerId, deps.db.drizzle);
    return c.json({ customer_id: customerId, revoked: cids });
  });

  app.get('/v1/internal/oauth-tokens/:connectionId', async (c) => {
    if (!deps.encryptionKey) {
      return c.json({ error: 'oauth_disabled' }, 503);
    }
    const connectionId = c.req.param('connectionId');
    const customerId = c.req.query('customerId');
    if (!customerId) {
      return c.json({ error: 'customerId query param required' }, 400);
    }
    const stored = await loadConnectionById(
      { db: deps.db.drizzle, encryptionKey: deps.encryptionKey },
      customerId,
      connectionId,
    );
    if (!stored) {
      return c.json({ error: 'connection_not_found' }, 404);
    }
    return c.json({
      connectionId: stored.id,
      customerId: stored.customerId,
      connector: stored.connector,
      accountId: stored.accountId,
      accessToken: stored.tokens.accessToken,
      accessTokenExpiresAt: stored.tokens.accessTokenExpiresAt?.toISOString() ?? null,
      scopesGranted: stored.tokens.scopesGranted,
    });
  });

  app.post('/v1/internal/oauth-tokens/:connectionId/refresh', async (c) => {
    if (!deps.encryptionKey || !deps.config) {
      return c.json({ error: 'oauth_disabled' }, 503);
    }
    const connectionId = c.req.param('connectionId');
    const customerId = c.req.query('customerId');
    if (!customerId) {
      return c.json({ error: 'customerId query param required' }, 400);
    }
    try {
      const refreshed = await refreshConnection(
        {
          db: deps.db.drizzle,
          encryptionKey: deps.encryptionKey,
          config: deps.config,
          ...(deps.fetch !== undefined ? { fetch: deps.fetch } : {}),
        },
        customerId,
        connectionId,
      );
      return c.json({
        connectionId: refreshed.id,
        customerId: refreshed.customerId,
        connector: refreshed.connector,
        accountId: refreshed.accountId,
        accessToken: refreshed.tokens.accessToken,
        accessTokenExpiresAt: refreshed.tokens.accessTokenExpiresAt?.toISOString() ?? null,
        scopesGranted: refreshed.tokens.scopesGranted,
      });
    } catch (err) {
      if (err instanceof RefreshError) {
        deps.logger?.warn({ err, connectionId, code: err.code }, 'oauth token refresh failed');
        const status = err.code === 'connection_not_found' ? 404 : 401;
        return c.json(
          { error: 'oauth_token_invalid', code: err.code, providerStatus: err.providerStatus },
          status,
        );
      }
      throw err;
    }
  });

  return app;
}
