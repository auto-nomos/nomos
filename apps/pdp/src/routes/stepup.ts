import { Hono } from 'hono';
import type { StepUpStateResponse } from '../control-plane/client.js';
import type { Logger } from '../logger.js';

export interface StepUpRouteDeps {
  /**
   * SDK-facing read of step-up state. PDP proxies the control-plane
   * /v1/internal/stepup/:id; the bearer token never leaves the PDP.
   */
  getStepUp: (id: string) => Promise<StepUpStateResponse | undefined>;
  logger: Logger;
}

const CUSTOMER_HEADER = 'x-cb-customer';

export function createStepUpRoutes(deps: StepUpRouteDeps): Hono {
  const app = new Hono();

  app.get('/v1/stepup/:id', async (c) => {
    const customerId = c.req.header(CUSTOMER_HEADER);
    if (!customerId) {
      return c.json({ error: 'missing x-cb-customer header' }, 400);
    }
    const id = c.req.param('id');
    let row: StepUpStateResponse | undefined;
    try {
      row = await deps.getStepUp(id);
    } catch (err) {
      deps.logger.warn({ err, id }, 'stepup state fetch failed');
      return c.json({ error: 'stepup_unavailable' }, 502);
    }
    if (!row) {
      return c.json({ error: 'not_found' }, 404);
    }
    if (row.customerId !== customerId) {
      // Don't leak existence to other customers.
      return c.json({ error: 'not_found' }, 404);
    }
    return c.json({
      id: row.id,
      state: row.state,
      command: row.command,
      resource: row.resource,
      expiresAt: row.expiresAt,
      decidedAt: row.decidedAt,
      cosignerJwt: row.cosignerAttestationJwt,
    });
  });

  return app;
}
