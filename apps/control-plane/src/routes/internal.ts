import { Hono } from 'hono';
import type { Db } from '../db/index.js';
import { internalAuth } from '../middleware/internal-auth.js';
import { generateBundle } from '../services/bundle.js';
import { fetchRevokedCids } from '../services/revocations.js';

export interface InternalDeps {
  db: Db;
  signKey: Uint8Array;
  signerDid: string;
  serviceToken: string;
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

  return app;
}
