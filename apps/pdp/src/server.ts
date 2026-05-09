import { Hono } from 'hono';
import { secureHeaders } from 'hono/secure-headers';
import type { PolicyCache } from './cache/policies.js';
import type { RevocationCache } from './cache/revocations.js';
import type { OAuthTokenResponse } from './control-plane/client.js';
import type { Logger } from './logger.js';
import { loggerMiddleware } from './middleware/logger.js';
import { requestId } from './middleware/request-id.js';
import { type AuditEmitInput, createAuthorizeRoutes } from './routes/authorize.js';
import { healthRoutes } from './routes/health.js';
import { createProxyRoutes } from './routes/proxy.js';
import { createReceiptRoutes, type ReceiptEmitInput } from './routes/receipts.js';

export interface ServerDeps {
  logger: Logger;
  policyCache: PolicyCache;
  revocationCache: RevocationCache;
  emitAudit?: (event: AuditEmitInput) => Promise<void> | void;
  emitReceipt?: (event: ReceiptEmitInput) => Promise<void> | void;
  /**
   * OAuth proxy mode (Sprint 5.5). When supplied, /v1/proxy/:command is
   * mounted and the PDP can call upstream SaaS APIs on behalf of the agent.
   */
  oauthProxy?: {
    fetchOAuthToken: (customerId: string, connectionId: string) => Promise<OAuthTokenResponse>;
    /** Injectable upstream fetch — defaults to global fetch. */
    upstreamFetch?: typeof fetch;
  };
}

export function createServer(deps: ServerDeps): Hono {
  const app = new Hono();

  app.use('*', secureHeaders());
  app.use('*', requestId());
  app.use('*', loggerMiddleware(deps.logger));

  app.route('/', healthRoutes);
  app.route(
    '/',
    createAuthorizeRoutes({
      policyCache: deps.policyCache,
      revocationCache: deps.revocationCache,
      ...(deps.emitAudit !== undefined ? { emitAudit: deps.emitAudit } : {}),
    }),
  );
  app.route(
    '/',
    createReceiptRoutes({
      ...(deps.emitReceipt !== undefined ? { emitReceipt: deps.emitReceipt } : {}),
    }),
  );
  if (deps.oauthProxy) {
    app.route(
      '/',
      createProxyRoutes({
        policyCache: deps.policyCache,
        revocationCache: deps.revocationCache,
        fetchOAuthToken: deps.oauthProxy.fetchOAuthToken,
        ...(deps.emitAudit !== undefined ? { emitAudit: deps.emitAudit } : {}),
        ...(deps.oauthProxy.upstreamFetch !== undefined
          ? { upstreamFetch: deps.oauthProxy.upstreamFetch }
          : {}),
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
