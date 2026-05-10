/**
 * POST /v1/proxy/:command — combined authorize + proxy.
 *
 * The wedge in one HTTP call: agent passes UCAN + the upstream API request,
 * PDP runs the same `decide()` as `/v1/authorize`, and on allow it pulls the
 * customer's OAuth access token from the control plane and calls the SaaS
 * API itself. The agent never sees the access token.
 *
 * The route depends on the UCAN carrying `meta.oauth_connection_id` (Sprint
 * 5.4 mints add this when callers ask for proxy mode). Without it the route
 * returns 400 — proxy mode without a binding is by definition impossible.
 */
import type { Schema } from '@credential-broker/cedar';
import { type DecideInput, decide } from '@credential-broker/core';
import { AuthorizeRequest as AuthorizeRequestSchema } from '@credential-broker/shared-types';
import { parseUcanJwt } from '@credential-broker/ucan';
import { Hono } from 'hono';
import { z } from 'zod';
import {
  isKnownProvider,
  type ProviderId,
  type ProxyRequest,
  proxyApiCall,
} from '../adapters/oauth.js';
import { decisionToAudit } from '../audit/emit.js';
import type { PolicyCache } from '../cache/policies.js';
import type { RevocationCache } from '../cache/revocations.js';
import type { OAuthTokenResponse } from '../control-plane/client.js';
import { getLog } from '../middleware/logger.js';
import { recordAuthorize } from '../observability/metrics.js';
import type { AuditEmitInput } from './authorize.js';

const CUSTOMER_HEADER = 'x-cb-customer';

const ProxyRequestSchema = z.object({
  ucan: z.union([z.string().min(1), z.array(z.string().min(1)).min(1)]),
  request: z.unknown(),
  apiCall: z.object({
    method: z.enum(['GET', 'POST', 'PATCH', 'PUT', 'DELETE']),
    path: z.string().min(1),
    query: z.record(z.string(), z.string()).optional(),
    body: z.unknown().optional(),
    headers: z.record(z.string(), z.string()).optional(),
  }),
});

export interface ProxyRouteDeps {
  policyCache: PolicyCache;
  revocationCache: RevocationCache;
  schemaForCustomer?: (customerId: string) => Schema | undefined;
  trustedIssuerDid?: string;
  fetchOAuthToken: (customerId: string, connectionId: string) => Promise<OAuthTokenResponse>;
  /**
   * Force-refresh path. When upstream returns 401 the route calls this and
   * retries the upstream call once. Refresh failure → 502 with reason
   * `oauth_token_invalid` so the SDK / downstream surfaces the right deny.
   */
  refreshOAuthToken?: (customerId: string, connectionId: string) => Promise<OAuthTokenResponse>;
  emitAudit?: (event: AuditEmitInput) => Promise<void> | void;
  /** Injectable upstream fetch — defaults to global fetch. */
  upstreamFetch?: typeof fetch;
}

export function createProxyRoutes(deps: ProxyRouteDeps): Hono {
  const app = new Hono();

  app.post('/v1/proxy/:command{.+}', async (c) => {
    const log = getLog(c);
    const customerId = c.req.header(CUSTOMER_HEADER);
    if (!customerId) {
      return c.json({ error: 'missing x-cb-customer header' }, 400);
    }
    const command = `/${c.req.param('command')}`;

    const raw = await c.req.json().catch(() => null);
    if (!raw) return c.json({ error: 'invalid JSON body' }, 400);
    const parsed = ProxyRequestSchema.safeParse(raw);
    if (!parsed.success) {
      return c.json({ error: 'invalid request shape', issues: parsed.error.issues }, 400);
    }

    const requestParse = AuthorizeRequestSchema.safeParse(parsed.data.request);
    if (!requestParse.success) {
      return c.json({ error: 'invalid authorize request', issues: requestParse.error.issues }, 400);
    }
    const request = requestParse.data;

    if (request.command !== command) {
      return c.json(
        {
          error: 'request.command does not match URL command',
          urlCommand: command,
          bodyCommand: request.command,
        },
        400,
      );
    }

    const policies = deps.policyCache.getPolicies(customerId);
    if (policies === undefined) {
      log.warn({ customerId }, 'no policies cached for customer');
      return c.json(
        {
          error: 'unknown customer or policy bundle not yet loaded',
          error_code: 'no_policies',
        },
        404,
      );
    }
    const revokedCids = deps.revocationCache.getRevoked(customerId);
    const schema = deps.schemaForCustomer?.(customerId);

    const decideInput: DecideInput = {
      ucan: parsed.data.ucan,
      request,
      policies,
      revokedCids,
      ...(schema !== undefined ? { schema } : {}),
      ...(deps.trustedIssuerDid !== undefined ? { trustedIssuerDid: deps.trustedIssuerDid } : {}),
    };

    const decision = decide(decideInput);
    recordAuthorize(decisionToAudit(decision), decision.reason);

    if (deps.emitAudit) {
      const leafForAudit = leafUcan(parsed.data.ucan);
      await deps.emitAudit({
        customerId,
        request,
        decision: {
          allow: decision.allow,
          ...(decision.reason !== undefined ? { reason: decision.reason } : {}),
          receiptId: decision.receiptId,
        },
        ts: Date.now(),
        agentDid: leafForAudit?.payload.aud ?? 'unknown',
      });
    }

    if (!decision.allow) {
      return c.json({ allow: false, decision, error_code: 'denied' }, 403);
    }

    const leaf = leafUcan(parsed.data.ucan);
    const connectionId =
      leaf?.payload.meta && typeof leaf.payload.meta.oauth_connection_id === 'string'
        ? leaf.payload.meta.oauth_connection_id
        : undefined;
    if (!connectionId) {
      return c.json(
        {
          allow: true,
          decision,
          error: 'ucan has no oauth_connection_id meta — re-mint with proxy binding',
          error_code: 'ucan_missing_oauth_binding',
        },
        400,
      );
    }

    let token: OAuthTokenResponse;
    try {
      token = await deps.fetchOAuthToken(customerId, connectionId);
    } catch (err) {
      log.error({ err, connectionId }, 'control-plane oauth token fetch failed');
      return c.json(
        {
          error: 'oauth_token_fetch_failed',
          error_code: 'oauth_token_fetch_failed',
          decision,
          connectionId,
        },
        502,
      );
    }
    if (!isKnownProvider(token.connector)) {
      return c.json(
        {
          error: 'connector_not_supported_by_proxy',
          error_code: 'connector_not_supported',
          connector: token.connector,
          decision,
        },
        501,
      );
    }
    const provider: ProviderId = token.connector;
    const apiCall = parsed.data.apiCall as ProxyRequest;

    let upstream: Awaited<ReturnType<typeof proxyApiCall>>;
    try {
      upstream = await proxyApiCall(provider, token.accessToken, apiCall, {
        fetch: deps.upstreamFetch,
      });
    } catch (err) {
      log.error({ err, connectionId, provider }, 'upstream proxy call failed');
      return c.json(
        { error: 'upstream_call_failed', error_code: 'upstream_call_failed', decision },
        502,
      );
    }

    // 401 from upstream + refresh capability available → refresh + retry once.
    if (upstream.status === 401 && deps.refreshOAuthToken) {
      try {
        const refreshed = await deps.refreshOAuthToken(customerId, connectionId);
        upstream = await proxyApiCall(provider, refreshed.accessToken, apiCall, {
          fetch: deps.upstreamFetch,
        });
        log.info(
          { customerId, connectionId, retriedStatus: upstream.status },
          'proxy: refreshed token after 401 and retried',
        );
      } catch (err) {
        log.warn(
          { err, customerId, connectionId, provider },
          'proxy: refresh after 401 failed — denying with oauth_token_invalid',
        );
        return c.json(
          {
            error: 'oauth_token_invalid',
            error_code: 'oauth_token_invalid',
            decision,
            connectionId,
            connector: provider,
          },
          502,
        );
      }
    }

    log.info(
      {
        customerId,
        command,
        provider,
        connectionId,
        upstreamStatus: upstream.status,
      },
      'proxy',
    );

    return c.json(
      {
        allow: true,
        decision,
        upstream: {
          status: upstream.status,
          body: upstream.body,
          headers: upstream.headers,
        },
        connector: provider,
      },
      200,
    );
  });

  return app;
}

function leafUcan(jwts: string | string[]) {
  const list = Array.isArray(jwts) ? jwts : [jwts];
  const last = list[list.length - 1];
  if (!last) return null;
  const parsed = parseUcanJwt(last);
  if ('error' in parsed) return null;
  return parsed;
}
