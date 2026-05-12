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
import type { Schema } from '@auto-nomos/cedar';
import { type DecideInput, decide } from '@auto-nomos/core';
import { sha256Hex } from '@auto-nomos/crypto';
import {
  type AuthorizeDecision,
  AuthorizeRequest as AuthorizeRequestSchema,
  type DenyReason,
} from '@auto-nomos/shared-types';
import { canonicalize, computeCid, parseUcanJwt } from '@auto-nomos/ucan';
import { Hono } from 'hono';
import { z } from 'zod';
import { validateGithubProxyCall } from '../adapters/github.js';
import {
  isKnownProvider,
  type ProviderId,
  type ProxyRequest,
  proxyApiCall,
} from '../adapters/oauth.js';
import { decisionToAudit } from '../audit/emit.js';
import type { PolicyCache } from '../cache/policies.js';
import type { RevocationCache } from '../cache/revocations.js';
import type { OAuthTokenResponse, StepUpStateResponse } from '../control-plane/client.js';
import { getLog } from '../middleware/logger.js';
import { sanitizeResponseBody } from '../middleware/sanitize-response.js';
import { recordAuthorize } from '../observability/metrics.js';
import { validateCosigner } from '../services/cosigner-validate.js';
import { evaluateStepUpPotential, shouldDetectStepUp } from '../services/stepup.js';
import { CUSTOMER_HEADER, extractAgentDid, extractAgentId, isKnownCommand } from './_shared.js';
import type { AuditEmitInput } from './authorize.js';

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
  /**
   * Step-up support on the proxy path (parity with /v1/authorize). When a
   * policy_denied result would allow with cosigner=true, the route synthesizes
   * a push_approvals row and returns `{ requiresStepUp, stepUpUrl, stepUpId }`
   * inside the decision so the SDK can poll. On the SDK retry (cosignerJwt
   * present in `request`), the route validates the cosigner and merges
   * context.cosigner=true before evaluating.
   */
  stepup?: {
    create: (args: {
      customerId: string;
      agentId: string;
      command: string;
      resource: Record<string, unknown>;
      originalUcanCid?: string;
    }) => Promise<{ id: string; deepLink: string }>;
    fetchApproval?: (id: string) => Promise<StepUpStateResponse | undefined>;
  };
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

    if (!isKnownCommand(request.command)) {
      log.warn({ command: request.command, customerId }, 'unknown command rejected');
      return c.json(
        {
          allow: false,
          decision: {
            allow: false,
            reason: 'unknown_command',
            receiptId: sha256Hex(`unknown-command|${request.command}`),
          },
          error_code: 'unknown_command',
        },
        403,
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

    let effectiveRequest = request;

    // Cosigner retry — parity with /v1/authorize. SDK supplies cosignerJwt on
    // the second pass after a passkey approval; PDP validates the JWT
    // (signature, command, cid binding, approval state) and merges
    // context.cosigner=true before evaluating Cedar.
    if (request.cosignerJwt && deps.stepup?.fetchApproval) {
      const fetchApproval = deps.stepup.fetchApproval;
      const validation = await validateCosigner({
        cosignerJwt: request.cosignerJwt,
        requestUcan: request.ucan,
        command: request.command,
        fetchApproval,
      });
      if (!validation.ok) {
        const denyReason: DenyReason =
          validation.reason === 'cosigner_expired' ? 'cosigner_expired' : 'cosigner_invalid';
        const receiptBasis = `proxy-cosigner-deny|${request.ucan}|${canonicalize(request as unknown as Record<string, unknown>)}`;
        const denyDecision: AuthorizeDecision = {
          allow: false,
          reason: denyReason,
          receiptId: sha256Hex(receiptBasis),
        };
        recordAuthorize(decisionToAudit(denyDecision), denyDecision.reason);
        if (deps.emitAudit) {
          await deps.emitAudit({
            customerId,
            request,
            decision: { ...denyDecision },
            ts: Date.now(),
            agentDid: extractAgentDid(request.ucan),
          });
        }
        log.info(
          { customerId, command: request.command, allow: false, reason: denyReason },
          'proxy cosigner-deny',
        );
        return c.json({ allow: false, decision: denyDecision, error_code: denyReason }, 200);
      }
      effectiveRequest = {
        ...request,
        context: {
          ...(request.context as Record<string, unknown>),
          cosigner: true,
        },
      };
    }

    const decideInput: DecideInput = {
      ucan: parsed.data.ucan,
      request: effectiveRequest,
      policies,
      revokedCids,
      ...(schema !== undefined ? { schema } : {}),
      ...(deps.trustedIssuerDid !== undefined ? { trustedIssuerDid: deps.trustedIssuerDid } : {}),
    };

    let decision: AuthorizeDecision = decide(decideInput);

    // Step-up detection — parity with /v1/authorize. When first-pass denies
    // for policy_denied and a second pass with cosigner=true would allow,
    // create a push_approvals row and patch the decision with
    // requiresStepUp + deep link so the SDK can poll.
    if (deps.stepup && shouldDetectStepUp(decision, decideInput)) {
      const wouldAllow = evaluateStepUpPotential(decideInput);
      if (wouldAllow) {
        const agentId = extractAgentId(request.ucan);
        if (agentId) {
          try {
            const created = await deps.stepup.create({
              customerId,
              agentId,
              command: request.command,
              resource: request.resource as Record<string, unknown>,
              originalUcanCid: computeCid(request.ucan),
            });
            decision = {
              ...decision,
              reason: 'step_up_required',
              requiresStepUp: true,
              stepUpUrl: created.deepLink,
              stepUpId: created.id,
            };
          } catch (err) {
            log.warn({ err, customerId, command: request.command }, 'proxy step-up create failed');
          }
        } else {
          log.warn(
            { customerId, command: request.command },
            'proxy step-up potential detected but UCAN has no meta.agent_id — skipping push',
          );
        }
      }
    }

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
      // 200 (not 403) when step-up is required so the SDK keeps the decision
      // intact and can call waitForApproval. Other denies stay 403 for
      // backwards compat with existing callers.
      const status = decision.requiresStepUp ? 200 : 403;
      return c.json({ allow: false, decision, error_code: 'denied' }, status);
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

    // GitHub gate: the agent's `resource` already passed the pre-Cedar
    // `constraintMatchesResource` check, but the upstream URL might
    // still target a different repo. Re-derive the target from
    // `apiCall.path` and refuse anything outside the UCAN's signed
    // github constraint.
    const leafMeta = leaf?.payload.meta as Record<string, unknown> | undefined;
    const ghConstraint =
      leafMeta && typeof leafMeta.resource_constraint === 'object'
        ? (leafMeta.resource_constraint as { provider?: string })
        : undefined;
    if (ghConstraint?.provider === 'github') {
      const ghCheck = validateGithubProxyCall(
        ghConstraint as Parameters<typeof validateGithubProxyCall>[0],
        apiCall,
        apiCall.query,
      );
      if (!ghCheck.ok) {
        return c.json(
          {
            allow: false,
            decision: {
              allow: false,
              reason: 'resource_out_of_scope',
              receiptId: sha256Hex(
                `proxy-out-of-scope|${request.command}|${canonicalize(request as unknown as Record<string, unknown>)}`,
              ),
            },
            error_code: 'resource_out_of_scope',
            adapter_reason: ghCheck.reason,
          },
          403,
        );
      }
    }

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

    const sanitized = sanitizeResponseBody(upstream.body, upstream.headers['content-type']);

    log.info(
      {
        customerId,
        command,
        provider,
        connectionId,
        upstreamStatus: upstream.status,
        redactions: sanitized.redactions.length,
      },
      'proxy',
    );

    return c.json(
      {
        allow: true,
        decision,
        upstream: {
          status: upstream.status,
          body: sanitized.body,
          headers: upstream.headers,
        },
        connector: provider,
        ...(sanitized.redactions.length > 0 ? { redactions: sanitized.redactions } : {}),
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
