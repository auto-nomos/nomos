import { Hono } from 'hono';
import type { Db } from '../db/index.js';
import { internalAuth } from '../middleware/internal-auth.js';
import { loadConnectionById } from '../oauth/tokens.js';
import { generateBundle } from '../services/bundle.js';
import { fetchRevokedCids } from '../services/revocations.js';

export interface InternalDeps {
  db: Db;
  signKey: Uint8Array;
  signerDid: string;
  serviceToken: string;
  /** OAuth token encryption key — required for /v1/internal/oauth-tokens/:id. */
  encryptionKey?: Uint8Array;
}

export function createInternalRoutes(deps: InternalDeps): Hono {
  const app = new Hono();

  app.use('*', internalAuth(deps.serviceToken));

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

  return app;
}
