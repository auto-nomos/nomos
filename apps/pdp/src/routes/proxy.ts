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
  type EmitSpanInput,
  redactRequest,
  redactResponse,
  sha256Of,
  statusFromOutcome,
} from '@auto-nomos/shared-types';
import { canonicalize, computeCid, parseUcanJwt } from '@auto-nomos/ucan';
import { Hono } from 'hono';
import { z } from 'zod';
import { type CloudAdapterDeps, CloudCallError, cloudApiCall } from '../adapters/cloud.js';
import { executeFilesystemCommand } from '../adapters/filesystem-dispatch.js';
import { validateGithubProxyCall } from '../adapters/github.js';
import { validateGoogleCalendarProxyCall } from '../adapters/google_calendar.js';
import { validateGoogleContactsProxyCall } from '../adapters/google_contacts.js';
import { validateGoogleDocsProxyCall } from '../adapters/google_docs.js';
import { validateGoogleDriveProxyCall } from '../adapters/google_drive.js';
import { validateGoogleGmailProxyCall } from '../adapters/google_gmail.js';
import { validateGoogleSheetsProxyCall } from '../adapters/google_sheets.js';
import { validateGoogleTasksProxyCall } from '../adapters/google_tasks.js';
import { validateLinearProxyCall } from '../adapters/linear.js';
import { validateNotionProxyCall } from '../adapters/notion.js';
import {
  isKnownProvider,
  type ProviderId,
  type ProxyRequest,
  proxyApiCall,
} from '../adapters/oauth.js';
import { validateSlackProxyCall } from '../adapters/slack.js';
import { executeSshCommand } from '../adapters/ssh-dispatch.js';
import { validateStripeProxyCall } from '../adapters/stripe.js';
import { decisionToAudit } from '../audit/emit.js';
import type { PolicyCache } from '../cache/policies.js';
import type { RevocationCache } from '../cache/revocations.js';
import type { OAuthTokenResponse, StepUpStateResponse } from '../control-plane/client.js';
import { getLog } from '../middleware/logger.js';
import { sanitizeResponseBody } from '../middleware/sanitize-response.js';
import { recordAuthorize } from '../observability/metrics.js';
import { shouldForceStepUp } from '../services/cloud-risk-rules.js';
import { validateCosigner } from '../services/cosigner-validate.js';
import { evaluateStepUpPotential, shouldDetectStepUp } from '../services/stepup.js';
import {
  CUSTOMER_HEADER,
  deriveCustomerId,
  extractAgentDid,
  extractAgentId,
  isKnownCommand,
  validateApiCall,
  validateResource,
  validateResourceConsistency,
} from './_shared.js';
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
    /**
     * Optional narrative layer — agent declares why this call is happening.
     * Surfaced in the action graph drawer; never affects PDP decision logic.
     */
    intent: z.string().max(256).optional(),
    /**
     * Agent self-declared follow-up. Free-form (e.g. "researcher will summarize
     * to writer"). Plain hint; PDP does not validate or use it for routing.
     */
    nextAgentHint: z.string().max(256).optional(),
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
   * Fire-and-forget span emitter. Defined separately from emitAudit so a
   * deployment can disable spans without affecting audit. When undefined,
   * proxy still functions; spans just don't land.
   */
  emitSpan?: (args: {
    customerId: string;
    agentDid: string;
    input: EmitSpanInput;
  }) => Promise<void> | void;
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
  /**
   * M1 — cloud federation. When set, proxy requests whose UCAN carries
   * `meta.cloud_connection_id` route through control-plane's
   * /v1/internal/cloud/api-call instead of the OAuth bearer adapter.
   */
  cloud?: CloudAdapterDeps;
}

export function createProxyRoutes(deps: ProxyRouteDeps): Hono {
  const app = new Hono();

  app.post('/v1/proxy/:command{.+}', async (c) => {
    const log = getLog(c);
    const headerCustomerId = c.req.header(CUSTOMER_HEADER);
    const command = `/${c.req.param('command')}`;
    const startedAtMs = Date.now();

    const raw = await c.req.json().catch(() => null);
    if (!raw) return c.json({ error: 'invalid JSON body' }, 400);
    const parsed = ProxyRequestSchema.safeParse(raw);
    if (!parsed.success) {
      return c.json({ error: 'invalid request shape', issues: parsed.error.issues }, 400);
    }
    const parsedData = parsed.data;
    const intentField =
      typeof parsedData.apiCall.intent === 'string'
        ? parsedData.apiCall.intent.slice(0, 256)
        : null;
    const nextAgentHintField =
      typeof parsedData.apiCall.nextAgentHint === 'string'
        ? parsedData.apiCall.nextAgentHint.slice(0, 256)
        : null;

    /**
     * Build EmitSpanInput from the request + outcome. Receipts come from
     * decision.receiptId; the agent DID comes from the leaf UCAN. The helper
     * never throws — span emit is a fire-and-forget side channel. Caller
     * passes the request body as a plain object so redactRequest can pull
     * connector-specific allowlisted fields.
     */
    function fireSpan(args: {
      customerId: string;
      agentDid: string | undefined;
      receiptId: string;
      toolStatus: 'allowed' | 'denied' | 'failed';
      httpStatus?: number;
      errorMessage?: string;
      errorCode?: string;
      requestArgs?: Record<string, unknown>;
      responseBody?: unknown;
    }): void {
      if (!deps.emitSpan || !args.agentDid) return;
      const endedAtMs = Date.now();
      const input: EmitSpanInput = {
        receiptId: args.receiptId,
        toolName: command,
        status: statusFromOutcome(args.toolStatus, args.httpStatus),
        startedAt: new Date(startedAtMs).toISOString(),
        endedAt: new Date(endedAtMs).toISOString(),
        latencyMs: Math.max(0, endedAtMs - startedAtMs),
        httpStatus: args.httpStatus ?? null,
        errorCode: args.errorCode ?? (args.toolStatus === 'denied' ? 'denied' : null),
        errorMessage: args.errorMessage ? args.errorMessage.slice(0, 1024) : null,
        requestArgsHash: sha256Of(args.requestArgs ?? null),
        requestSummary: redactRequest(command, args.requestArgs),
        responseHash: args.responseBody !== undefined ? sha256Of(args.responseBody) : null,
        responseSummary: redactResponse(args.responseBody),
        parentSpanId: null,
        nextAgentHint: nextAgentHintField,
        intent: intentField,
      };
      try {
        void Promise.resolve(
          deps.emitSpan({ customerId: args.customerId, agentDid: args.agentDid, input }),
        ).catch((err) => log.warn({ err, receiptId: args.receiptId }, 'pdp emitSpan failed'));
      } catch (err) {
        log.warn({ err, receiptId: args.receiptId }, 'pdp emitSpan threw');
      }
    }

    const requestParse = AuthorizeRequestSchema.safeParse(parsed.data.request);
    if (!requestParse.success) {
      return c.json({ error: 'invalid authorize request', issues: requestParse.error.issues }, 400);
    }
    const request = requestParse.data;

    // D2: derive customerId from UCAN meta when present; reject mismatched
    // headers. For chained UCANs the leaf carries the same meta.customer_id
    // as the root because chain attenuation never widens the tenant.
    const firstUcan = Array.isArray(parsed.data.ucan) ? parsed.data.ucan[0] : parsed.data.ucan;
    if (!firstUcan) {
      return c.json({ error: 'missing UCAN', error_code: 'missing_ucan' }, 400);
    }
    const derive = deriveCustomerId(headerCustomerId, firstUcan);
    if (!derive.ok) {
      if (derive.code === 'mismatch') {
        log.warn(
          { header: derive.headerCustomerId, ucan: derive.ucanCustomerId },
          'customerId mismatch between header and UCAN — rejecting',
        );
        return c.json({ error: derive.message, error_code: 'customer_id_mismatch' }, 400);
      }
      return c.json({ error: derive.message, error_code: 'missing_customer_id' }, 400);
    }
    const customerId = derive.customerId;
    // Best-effort fields for span emission. agentDid may be empty for
    // malformed UCANs; fireSpan treats undefined as "skip emit".
    const agentDidForSpan = extractAgentDid(firstUcan) || undefined;
    const requestArgs: Record<string, unknown> = {
      ...(parsed.data.apiCall.query ?? {}),
      ...((parsed.data.apiCall.body as Record<string, unknown> | undefined) ?? {}),
    };
    if (derive.source === 'header') {
      log.warn(
        { customerId },
        'customerId from header (legacy); mint with meta.customer_id to remove deprecation warning',
      );
    }

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

    let policies = deps.policyCache.getPolicies(customerId);
    if (policies === undefined) {
      // Lazy-fetch: PDP boot may have missed this customer (newly added in
      // control-plane after start, or discovery hadn't fired yet). Try once
      // before denying so first proxy call doesn't 404 forever.
      try {
        await deps.policyCache.refresh(customerId);
      } catch (err) {
        log.warn({ err, customerId }, 'on-demand bundle fetch failed');
      }
      policies = deps.policyCache.getPolicies(customerId);
    }
    if (policies === undefined) {
      log.warn({ customerId }, 'no policies cached for customer');
      const denyDecision: AuthorizeDecision = {
        allow: false,
        reason: 'unknown_customer',
        receiptId: sha256Hex(`unknown-customer|${customerId}|${request.command}`),
      };
      recordAuthorize(decisionToAudit(denyDecision), denyDecision.reason);
      if (deps.emitAudit) {
        await deps.emitAudit({
          customerId,
          request,
          decision: { ...denyDecision },
          ts: Date.now(),
          agentDid: extractAgentDid(request.ucan),
          apiCall: { method: parsed.data.apiCall.method, path: parsed.data.apiCall.path },
        });
      }
      return c.json({ allow: false, decision: denyDecision, error_code: 'unknown_customer' }, 200);
    }

    // D3: schema-pack enforcement. Runs after policy cache so a tenant the
    // PDP doesn't recognize gets a 404 (operability) before paying for two
    // zod parses. As of the 2026-05-14 apiCall-smuggle fix, an in-tree
    // command without an apiCallSchema fails closed (`schema_missing`)
    // instead of passing through.
    const apiCallCheck = validateApiCall(request.command, parsed.data.apiCall);
    if (!apiCallCheck.ok) {
      const reason =
        apiCallCheck.reason === 'schema_missing' ? 'schema_missing' : 'schema_violation';
      log.info(
        { command: request.command, customerId, reason, issues: apiCallCheck.issues },
        'schema-pack apiCall validation failed',
      );
      const denyDecision: AuthorizeDecision = {
        allow: false,
        reason,
        receiptId: sha256Hex(`${reason}|${request.command}|apiCall`),
      };
      recordAuthorize(decisionToAudit(denyDecision), denyDecision.reason);
      if (deps.emitAudit) {
        await deps.emitAudit({
          customerId,
          request,
          decision: { ...denyDecision },
          ts: Date.now(),
          agentDid: extractAgentDid(firstUcan),
          apiCall: { method: parsed.data.apiCall.method, path: parsed.data.apiCall.path },
        });
      }
      return c.json({ allow: false, decision: denyDecision, error_code: reason }, 403);
    }
    const resourceCheck = validateResource(request.command, request.resource);
    if (!resourceCheck.ok) {
      log.info(
        { command: request.command, customerId, issues: resourceCheck.issues },
        'schema-pack resource validation failed',
      );
      const denyDecision: AuthorizeDecision = {
        allow: false,
        reason: 'schema_violation',
        receiptId: sha256Hex(`schema-violation|${request.command}|resource`),
      };
      recordAuthorize(decisionToAudit(denyDecision), denyDecision.reason);
      if (deps.emitAudit) {
        await deps.emitAudit({
          customerId,
          request,
          decision: { ...denyDecision },
          ts: Date.now(),
          agentDid: extractAgentDid(firstUcan),
          apiCall: { method: parsed.data.apiCall.method, path: parsed.data.apiCall.path },
        });
      }
      return c.json({ allow: false, decision: denyDecision, error_code: 'schema_violation' }, 403);
    }

    // 2026-05-14 resource_mismatch fix — declared `request.resource` must
    // match the resource derived from `apiCall.{method,path}`. Closes
    // Probe-14 (Cursor declared resource = octocat/Hello-World while
    // apiCall.path targeted admin-brickexchange/test-repo; file landed on
    // test-repo, audit logged octocat). Pack-driven: each schema-pack
    // exports `extractResourceFromApiCall`; packs without one pass through.
    const consistency = validateResourceConsistency(
      request.command,
      request.resource,
      parsed.data.apiCall,
    );
    if (!consistency.ok) {
      log.warn(
        {
          command: request.command,
          customerId,
          field: consistency.field,
          declared: consistency.declared,
          effective: consistency.effective,
          apiCallPath: parsed.data.apiCall.path,
        },
        'request.resource diverges from apiCall.path',
      );
      const denyDecision: AuthorizeDecision = {
        allow: false,
        reason: 'resource_mismatch',
        receiptId: sha256Hex(
          `resource-mismatch|${request.command}|${consistency.field}|${String(consistency.declared)}|${String(consistency.effective)}`,
        ),
      };
      recordAuthorize(decisionToAudit(denyDecision), denyDecision.reason);
      if (deps.emitAudit) {
        await deps.emitAudit({
          customerId,
          request,
          decision: { ...denyDecision },
          ts: Date.now(),
          agentDid: extractAgentDid(firstUcan),
          apiCall: { method: parsed.data.apiCall.method, path: parsed.data.apiCall.path },
        });
      }
      fireSpan({
        customerId,
        agentDid: agentDidForSpan,
        receiptId: denyDecision.receiptId,
        toolStatus: 'denied',
        errorCode: 'resource_mismatch',
        requestArgs,
      });
      return c.json(
        {
          allow: false,
          decision: denyDecision,
          error_code: 'resource_mismatch',
          field: consistency.field,
        },
        403,
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
            apiCall: { method: parsed.data.apiCall.method, path: parsed.data.apiCall.path },
          });
        }
        log.info(
          { customerId, command: request.command, allow: false, reason: denyReason },
          'proxy cosigner-deny',
        );
        fireSpan({
          customerId,
          agentDid: agentDidForSpan,
          receiptId: denyDecision.receiptId,
          toolStatus: 'denied',
          errorCode: denyReason,
          requestArgs,
        });
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

    // Sprint MAOS-A — when the SDK supplies `request.delegated_chain`, the
    // *chain* (root → leaf) is the authoritative input to validateChain, not
    // the bare leaf in `body.ucan`. Without this swap, decide() sees a single
    // UCAN whose iss is an agent DID (not the trusted root), and rejects with
    // `untrusted_issuer` even though the chain itself roots at the CP signer.
    const ucanForDecide =
      Array.isArray(request.delegated_chain) && request.delegated_chain.length > 0
        ? request.delegated_chain
        : parsed.data.ucan;
    const decideInput: DecideInput = {
      ucan: ucanForDecide,
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
      // Sprint MAOS-A — propagate causation + swarm metadata so the swarm
      // view (/app/swarms/:id) can list receipts and walk the chain. Without
      // these the row lands in audit_events with swarm_id=null and the swarm
      // detail page shows an empty receipts table even though the chain ran.
      const chainDepthForAudit =
        Array.isArray(request.delegated_chain) && request.delegated_chain.length > 0
          ? request.delegated_chain.length - 1
          : 0;
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
        apiCall: { method: parsed.data.apiCall.method, path: parsed.data.apiCall.path },
        ...(request.parent_receipt_id !== undefined
          ? { parentReceiptId: request.parent_receipt_id }
          : {}),
        ...(request.swarm_id !== undefined ? { swarmId: request.swarm_id } : {}),
        ...(chainDepthForAudit > 0 ? { chainDepth: chainDepthForAudit } : {}),
      });
    }

    if (!decision.allow) {
      // 200 (not 403) when step-up is required so the SDK keeps the decision
      // intact and can call waitForApproval. Other denies stay 403 for
      // backwards compat with existing callers.
      const status = decision.requiresStepUp ? 200 : 403;
      fireSpan({
        customerId,
        agentDid: agentDidForSpan,
        receiptId: decision.receiptId,
        toolStatus: 'denied',
        errorCode: decision.reason ?? 'denied',
        requestArgs,
      });
      return c.json({ allow: false, decision, error_code: 'denied' }, status);
    }

    const leaf = leafUcan(parsed.data.ucan);
    const leafMeta2 = leaf?.payload.meta as Record<string, unknown> | undefined;
    const rConstraint = leafMeta2?.resource_constraint as { provider?: string } | undefined;

    // M1 — cloud federation branch. UCAN may carry meta.cloud_connection_id
    // instead of meta.oauth_connection_id; control-plane handles credential
    // acquisition + the upstream call in one shot.
    const cloudConnectionId =
      leaf?.payload.meta && typeof leaf.payload.meta.cloud_connection_id === 'string'
        ? leaf.payload.meta.cloud_connection_id
        : undefined;
    if (cloudConnectionId) {
      if (!deps.cloud) {
        fireSpan({
          customerId,
          agentDid: agentDidForSpan,
          receiptId: decision.receiptId,
          toolStatus: 'failed',
          httpStatus: 501,
          errorCode: 'cloud_proxy_disabled',
          requestArgs,
        });
        return c.json(
          {
            error: 'cloud_proxy_disabled',
            error_code: 'cloud_proxy_disabled',
            decision,
          },
          501,
        );
      }
      // extractAgentId reads from the leaf UCAN JWT string.
      const leafJwt = Array.isArray(parsed.data.ucan)
        ? parsed.data.ucan[parsed.data.ucan.length - 1]
        : parsed.data.ucan;
      const agentId = leafJwt ? extractAgentId(leafJwt) : undefined;
      if (!agentId) {
        return c.json(
          { error: 'ucan missing agent_id', error_code: 'missing_agent_id', decision },
          400,
        );
      }
      const apiCall = parsed.data.apiCall as ProxyRequest;
      const ucanCid = leaf
        ? computeCid(canonicalize(leaf.payload as Record<string, unknown>))
        : undefined;
      // Cloud risk rules: destructive verbs (delete/stop/drain/run_command
      // /scale/rotate/redeploy/invoke) require cosigner=true even when
      // Cedar allowed. Defense-in-depth against over-permissive policies.
      if (shouldForceStepUp(decision, { request })) {
        fireSpan({
          customerId,
          agentDid: agentDidForSpan,
          receiptId: decision.receiptId,
          toolStatus: 'denied',
          httpStatus: 403,
          errorCode: 'cosigner_required',
          requestArgs,
        });
        return c.json(
          {
            error: 'cosigner_required',
            error_code: 'cosigner_required',
            decision: {
              ...decision,
              allow: false,
              requiresStepUp: true,
              reason: 'destructive_cloud_action_requires_cosigner',
            },
          },
          403,
        );
      }
      // Sprint MAOS-A — propagate causation + swarm metadata so cloud calls
      // surface in the swarm detail view alongside OAuth proxy rows. Cloud
      // audit rows share the same parent_receipt_id / swarm_id / chain_depth
      // schema as the SaaS proxy path.
      const chainDepthForCloud =
        Array.isArray(request.delegated_chain) && request.delegated_chain.length > 0
          ? request.delegated_chain.length - 1
          : 0;
      const cloudChainContext = {
        ...(request.parent_receipt_id !== undefined
          ? { parentReceiptId: request.parent_receipt_id }
          : {}),
        ...(request.swarm_id !== undefined ? { swarmId: request.swarm_id } : {}),
        ...(chainDepthForCloud > 0 ? { chainDepth: chainDepthForCloud } : {}),
      };
      try {
        const cloudUpstream = await cloudApiCall(
          deps.cloud,
          cloudConnectionId,
          {
            customerId,
            agentId,
            ...(ucanCid ? { ucanCid } : {}),
            ...(request.parent_receipt_id ? { parentReceiptId: request.parent_receipt_id } : {}),
            ...(request.swarm_id ? { swarmId: request.swarm_id } : {}),
            ...(chainDepthForCloud > 0 ? { chainDepth: chainDepthForCloud } : {}),
          },
          {
            method: apiCall.method,
            url: apiCall.path,
            ...(apiCall.query ? { query: apiCall.query } : {}),
            ...(apiCall.body !== undefined ? { body: apiCall.body } : {}),
            ...(apiCall.headers ? { headers: apiCall.headers } : {}),
          },
        );
        const sanitized = sanitizeResponseBody(
          cloudUpstream.body,
          cloudUpstream.headers['content-type'],
        );
        log.info(
          {
            customerId,
            connectionId: cloudConnectionId,
            connector: cloudUpstream.connector,
            status: cloudUpstream.status,
            idTokenJti: cloudUpstream.idTokenJti,
          },
          'cloud proxy call completed',
        );
        // M1 audit polish (#1) — emit chain entry capturing the three stages
        // of the cloud call: mint (jti), federation exchange (implied by the
        // control-plane returning a connector), and the upstream call.
        if (deps.emitAudit) {
          const cloudReceiptId = sha256Hex(
            `cloud-call|${request.command}|${cloudConnectionId}|${cloudUpstream.idTokenJti}|${cloudUpstream.status}`,
          );
          await deps.emitAudit({
            customerId,
            request: {
              ...request,
              context: {
                ...(request.context as Record<string, unknown>),
                cloud_kind: 'cloud.call.allowed',
                cloud_connection_id: cloudConnectionId,
                cloud_connector: cloudUpstream.connector,
                cloud_id_token_jti: cloudUpstream.idTokenJti,
                cloud_upstream_status: cloudUpstream.status,
              },
            },
            decision: {
              allow: cloudUpstream.status >= 200 && cloudUpstream.status < 400,
              reason:
                cloudUpstream.status >= 200 && cloudUpstream.status < 400
                  ? 'cloud_call_allowed'
                  : `cloud_upstream_status_${cloudUpstream.status}`,
              receiptId: cloudReceiptId,
            },
            ts: Date.now(),
            agentDid: leafJwt ? extractAgentDid(leafJwt) : '',
            apiCall: { method: apiCall.method, path: apiCall.path },
            ...cloudChainContext,
          });
        }
        fireSpan({
          customerId,
          agentDid: agentDidForSpan,
          receiptId: decision.receiptId,
          toolStatus:
            cloudUpstream.status >= 200 && cloudUpstream.status < 400 ? 'allowed' : 'failed',
          httpStatus: cloudUpstream.status,
          requestArgs,
          responseBody: sanitized,
        });
        return c.json({
          allow: true,
          decision,
          upstream: {
            status: cloudUpstream.status,
            body: sanitized,
            headers: cloudUpstream.headers,
          },
          connection: { id: cloudConnectionId, connector: cloudUpstream.connector },
        });
      } catch (err) {
        if (err instanceof CloudCallError) {
          log.warn(
            {
              connectionId: cloudConnectionId,
              providerStatus: err.providerStatus,
              retryable: err.retryable,
            },
            'cloud federation rejected the call',
          );
          if (deps.emitAudit) {
            await deps.emitAudit({
              customerId,
              request: {
                ...request,
                context: {
                  ...(request.context as Record<string, unknown>),
                  cloud_kind: 'cloud.federation.exchanged.failed',
                  cloud_connection_id: cloudConnectionId,
                  cloud_provider_status: err.providerStatus,
                  cloud_retryable: err.retryable,
                },
              },
              decision: {
                allow: false,
                reason: 'cloud_call_failed',
                receiptId: sha256Hex(
                  `cloud-call-failed|${request.command}|${cloudConnectionId}|${err.providerStatus}`,
                ),
              },
              ts: Date.now(),
              agentDid: leafJwt ? extractAgentDid(leafJwt) : '',
              apiCall: { method: apiCall.method, path: apiCall.path },
              ...cloudChainContext,
            });
          }
          fireSpan({
            customerId,
            agentDid: agentDidForSpan,
            receiptId: decision.receiptId,
            toolStatus: 'failed',
            httpStatus: err.providerStatus ?? 502,
            errorCode: 'cloud_call_failed',
            errorMessage: err.message,
            requestArgs,
          });
          return c.json(
            {
              error: 'cloud_call_failed',
              error_code: 'cloud_call_failed',
              decision,
              connectionId: cloudConnectionId,
              providerStatus: err.providerStatus,
              providerBody: err.providerBody,
              retryable: err.retryable,
            },
            err.retryable ? 503 : 502,
          );
        }
        log.error({ err, connectionId: cloudConnectionId }, 'cloud proxy call failed');
        fireSpan({
          customerId,
          agentDid: agentDidForSpan,
          receiptId: decision.receiptId,
          toolStatus: 'failed',
          httpStatus: 502,
          errorCode: 'cloud_call_failed',
          errorMessage: (err as Error)?.message,
          requestArgs,
        });
        return c.json(
          { error: 'cloud_call_failed', error_code: 'cloud_call_failed', decision },
          502,
        );
      }
    }

    // ── Local filesystem: no OAuth token needed, executed directly by the PDP ──
    if (command.startsWith('/filesystem/')) {
      let fsResult: unknown;
      try {
        fsResult = await executeFilesystemCommand(command, parsed.data.apiCall, rConstraint);
      } catch (err) {
        fireSpan({
          customerId,
          agentDid: agentDidForSpan,
          receiptId: decision.receiptId,
          toolStatus: 'failed',
          errorCode: 'filesystem_exec_failed',
          errorMessage: (err as Error).message,
          requestArgs,
        });
        return c.json(
          { error: 'filesystem_exec_failed', error_code: 'filesystem_exec_failed', decision },
          502,
        );
      }
      fireSpan({
        customerId,
        agentDid: agentDidForSpan,
        receiptId: decision.receiptId,
        toolStatus: 'allowed',
        requestArgs,
        responseBody: fsResult,
      });
      return c.json({ allow: true, decision, upstream: { status: 200, body: fsResult } }, 200);
    }

    // ── SSH/SFTP: execute on remote host using env-supplied SSH key ──
    if (command.startsWith('/ssh/')) {
      let sshResult: unknown;
      try {
        sshResult = await executeSshCommand(command, parsed.data.apiCall, rConstraint);
      } catch (err) {
        fireSpan({
          customerId,
          agentDid: agentDidForSpan,
          receiptId: decision.receiptId,
          toolStatus: 'failed',
          errorCode: 'ssh_exec_failed',
          errorMessage: (err as Error).message,
          requestArgs,
        });
        return c.json({ error: 'ssh_exec_failed', error_code: 'ssh_exec_failed', decision }, 502);
      }
      fireSpan({
        customerId,
        agentDid: agentDidForSpan,
        receiptId: decision.receiptId,
        toolStatus: 'allowed',
        requestArgs,
        responseBody: sshResult,
      });
      return c.json({ allow: true, decision, upstream: { status: 200, body: sshResult } }, 200);
    }

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
      fireSpan({
        customerId,
        agentDid: agentDidForSpan,
        receiptId: decision.receiptId,
        toolStatus: 'failed',
        httpStatus: 502,
        errorCode: 'oauth_token_fetch_failed',
        errorMessage: (err as Error)?.message,
        requestArgs,
      });
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
      fireSpan({
        customerId,
        agentDid: agentDidForSpan,
        receiptId: decision.receiptId,
        toolStatus: 'failed',
        httpStatus: 501,
        errorCode: 'connector_not_supported',
        requestArgs,
      });
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

    // Per-provider data-plane gate. The agent's `resource` already
    // passed the pre-Cedar `constraintMatchesResource` check, but the
    // upstream URL might still target a different object. Re-derive the
    // target from `apiCall` and refuse anything outside the UCAN's
    // signed `meta.resource_constraint`. One validator per provider —
    // each mirrors the shape of `validateGithubProxyCall`.
    const leafMeta = leaf?.payload.meta as Record<string, unknown> | undefined;
    const constraint =
      leafMeta && typeof leafMeta.resource_constraint === 'object'
        ? (leafMeta.resource_constraint as { provider?: string })
        : undefined;
    let adapterReason: string | undefined;
    if (constraint?.provider) {
      switch (constraint.provider) {
        case 'github': {
          const r = validateGithubProxyCall(
            constraint as Parameters<typeof validateGithubProxyCall>[0],
            apiCall,
            apiCall.query,
          );
          if (!r.ok) adapterReason = r.reason;
          break;
        }
        case 'slack': {
          const r = validateSlackProxyCall(
            constraint as Parameters<typeof validateSlackProxyCall>[0],
            apiCall,
          );
          if (!r.ok) adapterReason = r.reason;
          break;
        }
        case 'stripe': {
          const r = validateStripeProxyCall(
            constraint as Parameters<typeof validateStripeProxyCall>[0],
            apiCall,
          );
          if (!r.ok) adapterReason = r.reason;
          break;
        }
        case 'linear': {
          const r = validateLinearProxyCall(
            constraint as Parameters<typeof validateLinearProxyCall>[0],
            apiCall,
          );
          if (!r.ok) adapterReason = r.reason;
          break;
        }
        case 'notion': {
          const r = validateNotionProxyCall(
            constraint as Parameters<typeof validateNotionProxyCall>[0],
            apiCall,
          );
          if (!r.ok) adapterReason = r.reason;
          break;
        }
        case 'google_drive': {
          const r = validateGoogleDriveProxyCall(
            constraint as Parameters<typeof validateGoogleDriveProxyCall>[0],
            apiCall,
          );
          if (!r.ok) adapterReason = r.reason;
          break;
        }
        case 'google_gmail': {
          const r = validateGoogleGmailProxyCall(
            constraint as Parameters<typeof validateGoogleGmailProxyCall>[0],
            apiCall,
          );
          if (!r.ok) adapterReason = r.reason;
          break;
        }
        case 'google_calendar': {
          const r = validateGoogleCalendarProxyCall(
            constraint as Parameters<typeof validateGoogleCalendarProxyCall>[0],
            apiCall,
          );
          if (!r.ok) adapterReason = r.reason;
          break;
        }
        case 'google_docs': {
          const r = validateGoogleDocsProxyCall(
            constraint as Parameters<typeof validateGoogleDocsProxyCall>[0],
            apiCall,
          );
          if (!r.ok) adapterReason = r.reason;
          break;
        }
        case 'google_sheets': {
          const r = validateGoogleSheetsProxyCall(
            constraint as Parameters<typeof validateGoogleSheetsProxyCall>[0],
            apiCall,
          );
          if (!r.ok) adapterReason = r.reason;
          break;
        }
        case 'google_tasks': {
          const r = validateGoogleTasksProxyCall(
            constraint as Parameters<typeof validateGoogleTasksProxyCall>[0],
            apiCall,
          );
          if (!r.ok) adapterReason = r.reason;
          break;
        }
        case 'google_contacts': {
          const r = validateGoogleContactsProxyCall(
            constraint as Parameters<typeof validateGoogleContactsProxyCall>[0],
            apiCall,
          );
          if (!r.ok) adapterReason = r.reason;
          break;
        }
        // 'filesystem' constraint is enforced upstream in the adapter
        // executor; PDP proxy does not handle filesystem requests.
      }
    }
    if (adapterReason !== undefined) {
      const oosReceiptId = sha256Hex(
        `proxy-out-of-scope|${request.command}|${canonicalize(request as unknown as Record<string, unknown>)}`,
      );
      fireSpan({
        customerId,
        agentDid: agentDidForSpan,
        receiptId: oosReceiptId,
        toolStatus: 'denied',
        errorCode: 'resource_out_of_scope',
        requestArgs,
      });
      return c.json(
        {
          allow: false,
          decision: {
            allow: false,
            reason: 'resource_out_of_scope',
            receiptId: oosReceiptId,
          },
          error_code: 'resource_out_of_scope',
          adapter_reason: adapterReason,
        },
        403,
      );
    }

    let upstream: Awaited<ReturnType<typeof proxyApiCall>>;
    try {
      upstream = await proxyApiCall(provider, token.accessToken, apiCall, {
        fetch: deps.upstreamFetch,
      });
    } catch (err) {
      log.error({ err, connectionId, provider }, 'upstream proxy call failed');
      fireSpan({
        customerId,
        agentDid: agentDidForSpan,
        receiptId: decision.receiptId,
        toolStatus: 'failed',
        httpStatus: 502,
        errorCode: 'upstream_call_failed',
        errorMessage: (err as Error)?.message,
        requestArgs,
      });
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
        fireSpan({
          customerId,
          agentDid: agentDidForSpan,
          receiptId: decision.receiptId,
          toolStatus: 'failed',
          httpStatus: 502,
          errorCode: 'oauth_token_invalid',
          errorMessage: (err as Error)?.message,
          requestArgs,
        });
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

    fireSpan({
      customerId,
      agentDid: agentDidForSpan,
      receiptId: decision.receiptId,
      toolStatus: upstream.status >= 400 ? 'failed' : 'allowed',
      httpStatus: upstream.status,
      requestArgs,
      responseBody: sanitized.body,
    });

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
