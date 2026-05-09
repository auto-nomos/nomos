import { Hono } from 'hono';
import type { RevocationCache } from '../cache/revocations.js';
import type { Logger } from '../logger.js';
import { internalAuth } from '../middleware/internal-auth.js';

export interface InternalDeps {
  revocationCache: RevocationCache;
  serviceToken: string;
  logger: Logger;
}

/**
 * Service-to-service routes the control plane calls. Sprint 8 push-revocation
 * lives here: control plane POSTs `{ customer_id }` after a revoke, PDP
 * refreshes that customer's revocation set immediately.
 */
export function createInternalRoutes(deps: InternalDeps): Hono {
  const app = new Hono();

  app.use('/v1/internal/*', internalAuth(deps.serviceToken));

  app.post('/v1/internal/refresh-revocations', async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'invalid_json' }, 400);
    }
    const customerId =
      body && typeof body === 'object' && 'customer_id' in body
        ? (body as { customer_id: unknown }).customer_id
        : undefined;
    if (typeof customerId !== 'string' || customerId.length === 0) {
      return c.json({ error: 'customer_id required' }, 400);
    }
    try {
      await deps.revocationCache.refresh(customerId);
    } catch (err) {
      deps.logger.error({ err, customerId }, 'push-driven revocation refresh failed');
      return c.json({ error: 'refresh_failed' }, 500);
    }
    return c.json({ ok: true, customer_id: customerId });
  });

  return app;
}
