import type { Schema } from '@auto-nomos/cedar';
import { type DecideInput, decide } from '@auto-nomos/core';
import { sha256Hex } from '@auto-nomos/crypto';
import {
  type AuthorizeDecision,
  type AuthorizeRequest,
  AuthorizeRequest as AuthorizeRequestSchema,
  type DenyReason,
} from '@auto-nomos/shared-types';
import { canonicalize, computeCid } from '@auto-nomos/ucan';
import { Hono } from 'hono';
import { decisionToAudit } from '../audit/emit.js';
import type { PolicyCache } from '../cache/policies.js';
import type { RevocationCache } from '../cache/revocations.js';
import type { StepUpStateResponse } from '../control-plane/client.js';
import { getLog } from '../middleware/logger.js';
import { recordAuthorize } from '../observability/metrics.js';
import { validateCosigner } from '../services/cosigner-validate.js';
import { evaluateStepUpPotential, shouldDetectStepUp } from '../services/stepup.js';
import {
  CUSTOMER_HEADER,
  deriveCustomerId,
  extractAgentDid,
  extractAgentId,
  isKnownCommand,
  validateResource,
} from './_shared.js';

export interface AuthorizeRouteDeps {
  policyCache: PolicyCache;
  revocationCache: RevocationCache;
  emitAudit?: (event: AuditEmitInput) => Promise<void> | void;
  schemaForCustomer?: (customerId: string) => Schema | undefined;
  trustedIssuerDid?: string;
  /**
   * Sprint MAOS-A — chain depth cap (env: NOMOS_MAX_CHAIN_DEPTH, default 8).
   * Hard guard against runaway delegation; enforced in `decide()`.
   */
  maxChainDepth?: number;
  /**
   * Sprint 9 — when supplied, denies that *would* allow with cosigner=true
   * trigger a control-plane push_approvals row + Knock notification, and the
   * decision returns `{ requiresStepUp: true, stepUpUrl, stepUpId }`.
   *
   * On the SDK retry with `cosignerJwt`, the same deps are used to fetch
   * approval state and validate the JWT before re-evaluating with
   * `context.cosigner = true`.
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
}

export interface AuditEmitInput {
  customerId: string;
  request: AuthorizeRequest;
  decision: { allow: boolean; reason?: string; receiptId: string };
  ts: number;
  agentDid: string;
  /** Sprint MAOS-A — chain causation. Optional for legacy single-UCAN calls. */
  parentReceiptId?: string;
  swarmId?: string;
  chainDepth?: number;
  /**
   * 2026-05-14 resource_mismatch fix — for /v1/proxy rows, the
   * effective upstream call about to be (or just) executed. Persisted
   * as structured columns on audit_events so divergence between
   * declared `request.resource` and the actual HTTP target is
   * queryable without scanning the payload jsonb. Undefined on
   * /v1/authorize-only rows.
   */
  apiCall?: { method: string; path: string };
}

export function createAuthorizeRoutes(deps: AuthorizeRouteDeps): Hono {
  const app = new Hono();

  app.post('/v1/authorize', async (c) => {
    const log = getLog(c);
    const headerCustomerId = c.req.header(CUSTOMER_HEADER);

    const body = await c.req.json().catch(() => null);
    if (!body) {
      return c.json({ error: 'invalid JSON body' }, 400);
    }

    const parsed = AuthorizeRequestSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: 'invalid request shape', issues: parsed.error.issues }, 400);
    }
    let request = parsed.data;

    // Sprint MAOS-A — propagate W3C traceparent header into context so the
    // chain trace correlates across PDP + egress + downstream SaaS calls.
    const traceparent = c.req.header('traceparent');
    const contextRecord = request.context as Record<string, unknown>;
    if (traceparent && typeof contextRecord.trace !== 'string') {
      request = {
        ...request,
        context: { ...contextRecord, trace: traceparent } as typeof request.context,
      };
    }

    const derive = deriveCustomerId(headerCustomerId, request.ucan);
    if (!derive.ok) {
      if (derive.code === 'mismatch') {
        log.warn(
          {
            header: derive.headerCustomerId,
            ucan: derive.ucanCustomerId,
          },
          'customerId mismatch between header and UCAN — rejecting',
        );
        return c.json({ error: derive.message, error_code: 'customer_id_mismatch' }, 400);
      }
      return c.json({ error: derive.message, error_code: 'missing_customer_id' }, 400);
    }
    const customerId = derive.customerId;
    if (derive.source === 'header') {
      log.warn(
        { customerId },
        'customerId from header (legacy); mint with meta.customer_id to remove deprecation warning',
      );
    }

    if (!isKnownCommand(request.command)) {
      log.warn({ command: request.command, customerId }, 'unknown command rejected');
      const denyDecision: AuthorizeDecision = {
        allow: false,
        reason: 'unknown_command',
        receiptId: sha256Hex(`unknown-command|${request.command}`),
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
      return c.json(denyDecision, 200);
    }

    // D3: schema-pack resource validation. Runs before decide() so a
    // malformed resource shape never reaches Cedar — engineers debugging a
    // policy match failure see schema_violation, not a confusing Cedar
    // miss. Packs without per-action schemas pass through unchanged.
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
          agentDid: extractAgentDid(request.ucan),
        });
      }
      return c.json(denyDecision, 200);
    }

    let policies = deps.policyCache.getPolicies(customerId);
    if (policies === undefined) {
      // Lazy-fetch: PDP boot may have missed this customer (newly added in
      // control-plane after start, or discovery hadn't fired yet). Try once
      // before denying so first calls don't 404 forever.
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
        });
      }
      return c.json(denyDecision, 200);
    }

    const agentDid = extractAgentDid(request.ucan);
    const agentMeta = deps.policyCache.getAgentByDid(customerId, agentDid);
    // Static apps must be approved by the operator at the dashboard before the
    // PDP authorises any call. Dynamic apps bypass this gate — their unmapped
    // commands still deny via empty policy coverage and route through step-up.
    if (agentMeta && agentMeta.mode === 'static' && agentMeta.connectionApprovedAt === null) {
      const denyDecision: AuthorizeDecision = {
        allow: false,
        reason: 'agent_not_connected',
        receiptId: sha256Hex(`agent-not-connected|${agentMeta.agentId}|${request.command}`),
      };
      recordAuthorize(decisionToAudit(denyDecision), denyDecision.reason);
      if (deps.emitAudit) {
        await deps.emitAudit({
          customerId,
          request,
          decision: { ...denyDecision },
          ts: Date.now(),
          agentDid,
        });
      }
      log.info(
        {
          customerId,
          command: request.command,
          agentId: agentMeta.agentId,
          reason: denyDecision.reason,
        },
        'authorize deny agent_not_connected',
      );
      return c.json(denyDecision, 200);
    }
    if (agentMeta && agentMeta.status !== 'active') {
      const denyDecision: AuthorizeDecision = {
        allow: false,
        reason: 'agent_disabled',
        receiptId: sha256Hex(`agent-disabled|${agentMeta.agentId}|${request.command}`),
      };
      recordAuthorize(decisionToAudit(denyDecision), denyDecision.reason);
      if (deps.emitAudit) {
        await deps.emitAudit({
          customerId,
          request,
          decision: { ...denyDecision },
          ts: Date.now(),
          agentDid,
        });
      }
      log.info(
        { customerId, command: request.command, agentId: agentMeta.agentId },
        'authorize deny agent_disabled',
      );
      return c.json(denyDecision, 200);
    }

    const revokedCids = deps.revocationCache.getRevoked(customerId);
    const schema = deps.schemaForCustomer?.(customerId);

    let effectiveRequest = request;

    // Sprint 9 — cosigner retry. When the SDK supplies `cosignerJwt`, the
    // PDP validates it (signature, command, cid binding, approval state)
    // and merges `context.cosigner = true` before evaluating Cedar.
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
        const receiptBasis = `cosigner-deny|${request.ucan}|${canonicalize(request as unknown as Record<string, unknown>)}`;
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
          'authorize cosigner-deny',
        );
        return c.json(denyDecision, 200);
      }
      effectiveRequest = {
        ...request,
        context: {
          ...(request.context as Record<string, unknown>),
          cosigner: true,
        },
      };
    }

    // Sprint MAOS-A — when delegated_chain is supplied, decide() validates
    // the whole chain (signature continuity + attenuation) and uses the leaf
    // for Cedar evaluation. Single-UCAN callers still pass through the
    // existing path unchanged.
    const ucanInput: string | string[] = effectiveRequest.delegated_chain?.length
      ? effectiveRequest.delegated_chain
      : effectiveRequest.ucan;

    const input: DecideInput = {
      ucan: ucanInput,
      request: effectiveRequest,
      policies,
      revokedCids,
      ...(schema !== undefined ? { schema } : {}),
      ...(deps.trustedIssuerDid !== undefined ? { trustedIssuerDid: deps.trustedIssuerDid } : {}),
      ...(deps.maxChainDepth !== undefined ? { maxChainDepth: deps.maxChainDepth } : {}),
    };

    let decision: AuthorizeDecision = decide(input);

    // Sprint 9 — step-up detection. Run only when the first pass denied for
    // policy reasons and there's no cosigner already in context.
    if (deps.stepup && shouldDetectStepUp(decision, input)) {
      const wouldAllow = evaluateStepUpPotential(input);
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
            log.warn({ err, customerId, command: request.command }, 'step-up create failed');
          }
        } else {
          log.warn(
            { customerId, command: request.command },
            'step-up potential detected but UCAN has no meta.agent_id — skipping push',
          );
        }
      }
    }

    recordAuthorize(decisionToAudit(decision), decision.reason);

    if (deps.emitAudit) {
      await deps.emitAudit({
        customerId,
        request,
        decision: {
          allow: decision.allow,
          ...(decision.reason !== undefined ? { reason: decision.reason } : {}),
          receiptId: decision.receiptId,
        },
        ts: Date.now(),
        agentDid: extractAgentDid(request.ucan),
        ...(request.parent_receipt_id !== undefined
          ? { parentReceiptId: request.parent_receipt_id }
          : {}),
        ...(request.swarm_id !== undefined ? { swarmId: request.swarm_id } : {}),
        ...(decision.chain_depth !== undefined ? { chainDepth: decision.chain_depth } : {}),
      });
    }

    log.info(
      {
        customerId,
        command: request.command,
        allow: decision.allow,
        reason: decision.reason,
        ...(decision.requiresStepUp ? { stepUpId: decision.stepUpId } : {}),
        ...(decision.chain_depth !== undefined ? { chainDepth: decision.chain_depth } : {}),
      },
      'authorize',
    );

    return c.json(decision, 200);
  });

  return app;
}
