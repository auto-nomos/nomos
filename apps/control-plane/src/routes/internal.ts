import { Hono } from 'hono';
import type { Config } from '../config.js';
import type { Db } from '../db/index.js';
import * as schema from '../db/schema.js';
import type { Logger } from '../logger.js';
import { internalAuth } from '../middleware/internal-auth.js';
import { loadConnectionById } from '../oauth/tokens.js';
import { generateBundle } from '../services/bundle.js';
import { RefreshError, refreshConnection } from '../services/oauth-refresh.js';
import { fetchRevokedCids } from '../services/revocations.js';
import { createStepUpApproval, StepUpCreateError } from '../services/stepup/create.js';
import { getStepUpApproval, isExpired } from '../services/stepup/get.js';
import type { StepUpNotifier } from '../services/stepup/notify.js';

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
  /** Sprint 9 step-up — when omitted, /v1/internal/stepup/* is not mounted. */
  stepup?: {
    notifier: StepUpNotifier;
    dashboardPublicUrl: string;
    defaultTtlSeconds?: number;
    riskSummarizer?: import('../services/grants/llm-risk-summary.js').RiskSummarizer;
  };
}

export function createInternalRoutes(deps: InternalDeps): Hono {
  const app = new Hono();

  // Scope the bearer guard to /v1/internal/* so requests for other routes
  // (e.g. /v1/oauth/callback, mounted on the same parent app) don't get
  // intercepted with 401 by this sub-app's middleware.
  app.use('/v1/internal/*', internalAuth(deps.serviceToken));

  // Discoverable customer list — replaces PDP_CUSTOMER_IDS env var.
  // Returns id + createdAt; PDP polls this on a slow interval to learn
  // about new tenants without a redeploy.
  app.get('/v1/internal/customers', async (c) => {
    const rows = await deps.db.drizzle
      .select({ id: schema.customers.id, createdAt: schema.customers.createdAt })
      .from(schema.customers);
    return c.json({ customers: rows });
  });

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

  if (deps.stepup) {
    const stepup = deps.stepup;
    const noopLogger: Logger =
      deps.logger ??
      ({
        info: () => {},
        warn: () => {},
        error: () => {},
        debug: () => {},
        trace: () => {},
        fatal: () => {},
        child: () => noopLogger,
      } as unknown as Logger);

    app.post('/v1/internal/stepup/create', async (c) => {
      let body: unknown;
      try {
        body = await c.req.json();
      } catch {
        return c.json({ error: 'invalid_json' }, 400);
      }
      const b = body as Record<string, unknown> | null;
      if (!b || typeof b !== 'object') {
        return c.json({ error: 'invalid_body' }, 400);
      }
      const customerId = typeof b.customer_id === 'string' ? b.customer_id : '';
      const agentId = typeof b.agent_id === 'string' ? b.agent_id : '';
      const command = typeof b.command === 'string' ? b.command : '';
      const resource = (b.resource as Record<string, unknown> | undefined) ?? {};
      const ttlSeconds = typeof b.ttl_seconds === 'number' ? b.ttl_seconds : undefined;
      const originalUcanCid =
        typeof b.original_ucan_cid === 'string' ? b.original_ucan_cid : undefined;
      if (!customerId || !agentId || !command) {
        return c.json({ error: 'customer_id, agent_id, command required' }, 400);
      }
      try {
        const created = await createStepUpApproval(
          {
            customerId,
            agentId,
            command,
            resource,
            ...(ttlSeconds ? { ttlSeconds } : {}),
            ...(originalUcanCid ? { originalUcanCid } : {}),
          },
          {
            db: deps.db.drizzle,
            notifier: stepup.notifier,
            dashboardPublicUrl: stepup.dashboardPublicUrl,
            ...(stepup.defaultTtlSeconds ? { defaultTtlSeconds: stepup.defaultTtlSeconds } : {}),
            ...(stepup.riskSummarizer ? { riskSummarizer: stepup.riskSummarizer } : {}),
            logger: noopLogger,
          },
        );
        return c.json({
          id: created.id,
          expires_at: created.expiresAt.toISOString(),
          deep_link: created.deepLink,
        });
      } catch (err) {
        if (err instanceof StepUpCreateError) {
          noopLogger.warn({ err, customerId, agentId, code: err.code }, 'step-up create rejected');
          return c.json({ error: err.code }, err.code === 'agent_not_found' ? 404 : 400);
        }
        noopLogger.error({ err, customerId, agentId }, 'step-up create failed');
        return c.json({ error: 'internal_error' }, 500);
      }
    });

    app.get('/v1/internal/stepup/:id', async (c) => {
      const id = c.req.param('id');
      const row = await getStepUpApproval(deps.db.drizzle, id);
      if (!row) {
        return c.json({ error: 'not_found' }, 404);
      }
      const now = new Date();
      const state = isExpired(row, now) ? 'expired' : row.state;
      return c.json({
        id: row.id,
        customer_id: row.customerId,
        agent_id: row.agentId,
        command: row.command,
        resource: row.resource,
        state,
        expires_at: row.expiresAt.toISOString(),
        decided_at: row.decidedAt ? row.decidedAt.toISOString() : null,
        cosigner_attestation_jwt: row.cosignerAttestationJwt,
      });
    });
  }

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
