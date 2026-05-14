import type { EmitSpanInput } from '@auto-nomos/shared-types';
import { Hono } from 'hono';
import { secureHeaders } from 'hono/secure-headers';
import type { PolicyCache } from './cache/policies.js';
import type { RevocationCache } from './cache/revocations.js';
import type { OAuthTokenResponse, StepUpStateResponse } from './control-plane/client.js';
import type { Logger } from './logger.js';
import { loggerMiddleware } from './middleware/logger.js';
import { getRequestId, requestId } from './middleware/request-id.js';
import { type AuditEmitInput, createAuthorizeRoutes } from './routes/authorize.js';
import { healthRoutes } from './routes/health.js';
import { createInternalRoutes } from './routes/internal.js';
import { createProxyRoutes } from './routes/proxy.js';
import { createReceiptRoutes, type ReceiptEmitInput } from './routes/receipts.js';
import { createStepUpRoutes } from './routes/stepup.js';

export interface ServerDeps {
  logger: Logger;
  policyCache: PolicyCache;
  revocationCache: RevocationCache;
  emitAudit?: (event: AuditEmitInput) => Promise<void> | void;
  emitReceipt?: (event: ReceiptEmitInput) => Promise<void> | void;
  /** Expected root UCAN issuer DID, derived from the control-plane verify key. */
  trustedIssuerDid?: string;
  /**
   * Sprint MAOS-A — chain depth cap (env: NOMOS_MAX_CHAIN_DEPTH, default 8).
   * Hard guard against runaway delegation in agent swarms.
   */
  maxChainDepth?: number;
  /**
   * Sprint 8 push-revocation. When supplied, mounts
   * POST /v1/internal/refresh-revocations so the control plane can flush a
   * customer's revocation set within ~1s of a revoke.
   */
  internal?: {
    serviceToken: string;
  };
  /**
   * OAuth proxy mode (Sprint 5.5). When supplied, /v1/proxy/:command is
   * mounted and the PDP can call upstream SaaS APIs on behalf of the agent.
   */
  oauthProxy?: {
    fetchOAuthToken: (customerId: string, connectionId: string) => Promise<OAuthTokenResponse>;
    /** Sprint 5.6 — refresh-on-401. Optional; route falls back to 502 without it. */
    refreshOAuthToken?: (customerId: string, connectionId: string) => Promise<OAuthTokenResponse>;
    /** Injectable upstream fetch — defaults to global fetch. */
    upstreamFetch?: typeof fetch;
    /**
     * Observability v2 — per-tool-call span emit. Best-effort, fire-and-forget.
     * Bound to control-plane's POST /v1/internal/spans/emit at boot.
     */
    emitSpan?: (args: {
      customerId: string;
      agentDid: string;
      input: EmitSpanInput;
    }) => Promise<void> | void;
  };
  /**
   * Sprint 9 step-up. When supplied, authorize denies that would allow with
   * cosigner=true synthesize a push_approvals row, and `/v1/stepup/:id`
   * exposes state for SDK polling.
   */
  stepup?: {
    create: (args: {
      customerId: string;
      agentId: string;
      command: string;
      resource: Record<string, unknown>;
    }) => Promise<{ id: string; deepLink: string }>;
    getStepUp: (id: string) => Promise<StepUpStateResponse | undefined>;
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
      ...(deps.trustedIssuerDid !== undefined ? { trustedIssuerDid: deps.trustedIssuerDid } : {}),
      ...(deps.maxChainDepth !== undefined ? { maxChainDepth: deps.maxChainDepth } : {}),
      ...(deps.stepup
        ? {
            stepup: {
              create: deps.stepup.create,
              fetchApproval: deps.stepup.getStepUp,
            },
          }
        : {}),
    }),
  );
  if (deps.stepup) {
    app.route('/', createStepUpRoutes({ getStepUp: deps.stepup.getStepUp, logger: deps.logger }));
  }
  app.route(
    '/',
    createReceiptRoutes({
      ...(deps.emitReceipt !== undefined ? { emitReceipt: deps.emitReceipt } : {}),
    }),
  );
  if (deps.internal) {
    app.route(
      '/',
      createInternalRoutes({
        policyCache: deps.policyCache,
        revocationCache: deps.revocationCache,
        serviceToken: deps.internal.serviceToken,
        logger: deps.logger,
      }),
    );
  }
  if (deps.oauthProxy) {
    app.route(
      '/',
      createProxyRoutes({
        policyCache: deps.policyCache,
        revocationCache: deps.revocationCache,
        fetchOAuthToken: deps.oauthProxy.fetchOAuthToken,
        ...(deps.trustedIssuerDid !== undefined ? { trustedIssuerDid: deps.trustedIssuerDid } : {}),
        ...(deps.oauthProxy.refreshOAuthToken !== undefined
          ? { refreshOAuthToken: deps.oauthProxy.refreshOAuthToken }
          : {}),
        ...(deps.emitAudit !== undefined ? { emitAudit: deps.emitAudit } : {}),
        ...(deps.stepup
          ? {
              stepup: {
                create: deps.stepup.create,
                fetchApproval: deps.stepup.getStepUp,
              },
            }
          : {}),
        ...(deps.oauthProxy.upstreamFetch !== undefined
          ? { upstreamFetch: deps.oauthProxy.upstreamFetch }
          : {}),
        ...(deps.oauthProxy.emitSpan !== undefined ? { emitSpan: deps.oauthProxy.emitSpan } : {}),
      }),
    );
  }

  app.onError((err, c) => {
    const requestId = getRequestId(c);
    deps.logger.error({ err, requestId }, 'unhandled error');
    return c.json({ error: 'internal_error', request_id: requestId }, 500);
  });

  app.notFound((c) => c.json({ error: 'not_found', request_id: getRequestId(c) }, 404));

  return app;
}
