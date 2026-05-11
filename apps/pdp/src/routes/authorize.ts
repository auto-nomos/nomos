import type { Schema } from '@auto-nomos/cedar';
import { type DecideInput, decide } from '@auto-nomos/core';
import { sha256Hex } from '@auto-nomos/crypto';
import { actionsFor, PACKS } from '@auto-nomos/schema-packs';
import {
  type AuthorizeDecision,
  type AuthorizeRequest,
  AuthorizeRequest as AuthorizeRequestSchema,
  type DenyReason,
} from '@auto-nomos/shared-types';
import { canonicalize, computeCid, parseUcanJwt } from '@auto-nomos/ucan';
import { Hono } from 'hono';
import { decisionToAudit } from '../audit/emit.js';
import type { PolicyCache } from '../cache/policies.js';
import type { RevocationCache } from '../cache/revocations.js';
import type { StepUpStateResponse } from '../control-plane/client.js';
import { getLog } from '../middleware/logger.js';
import { recordAuthorize } from '../observability/metrics.js';
import { validateCosigner } from '../services/cosigner-validate.js';
import { evaluateStepUpPotential, shouldDetectStepUp } from '../services/stepup.js';

export interface AuthorizeRouteDeps {
  policyCache: PolicyCache;
  revocationCache: RevocationCache;
  emitAudit?: (event: AuditEmitInput) => Promise<void> | void;
  schemaForCustomer?: (customerId: string) => Schema | undefined;
  trustedIssuerDid?: string;
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
}

const CUSTOMER_HEADER = 'x-cb-customer';

function extractAgentId(jwt: string): string | undefined {
  const parsed = parseUcanJwt(jwt);
  if ('error' in parsed) return undefined;
  const meta = parsed.payload.meta as Record<string, unknown> | undefined;
  return typeof meta?.agent_id === 'string' ? meta.agent_id : undefined;
}

function extractAgentDid(jwt: string): string {
  const parsed = parseUcanJwt(jwt);
  if ('error' in parsed) return 'unknown';
  return parsed.payload.aud;
}

const KNOWN_COMMANDS: ReadonlySet<string> = new Set(PACKS.flatMap((pack) => actionsFor(pack.id)));
const KNOWN_INTEGRATIONS: ReadonlySet<string> = new Set(PACKS.map((p) => p.id));

function isKnownCommand(command: string): boolean {
  if (KNOWN_COMMANDS.has(command)) return true;
  const seg = command.split('/')[1];
  if (!seg) return false;
  return !KNOWN_INTEGRATIONS.has(seg);
}

export function createAuthorizeRoutes(deps: AuthorizeRouteDeps): Hono {
  const app = new Hono();

  app.post('/v1/authorize', async (c) => {
    const log = getLog(c);
    const customerId = c.req.header(CUSTOMER_HEADER);
    if (!customerId) {
      return c.json({ error: 'missing x-cb-customer header' }, 400);
    }

    const body = await c.req.json().catch(() => null);
    if (!body) {
      return c.json({ error: 'invalid JSON body' }, 400);
    }

    const parsed = AuthorizeRequestSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: 'invalid request shape', issues: parsed.error.issues }, 400);
    }
    const request = parsed.data;

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

    const policies = deps.policyCache.getPolicies(customerId);
    if (policies === undefined) {
      log.warn({ customerId }, 'no policies cached for customer');
      return c.json({ error: 'unknown customer or policy bundle not yet loaded' }, 404);
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

    const input: DecideInput = {
      ucan: effectiveRequest.ucan,
      request: effectiveRequest,
      policies,
      revokedCids,
      ...(schema !== undefined ? { schema } : {}),
      ...(deps.trustedIssuerDid !== undefined ? { trustedIssuerDid: deps.trustedIssuerDid } : {}),
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
      });
    }

    log.info(
      {
        customerId,
        command: request.command,
        allow: decision.allow,
        reason: decision.reason,
        ...(decision.requiresStepUp ? { stepUpId: decision.stepUpId } : {}),
      },
      'authorize',
    );

    return c.json(decision, 200);
  });

  return app;
}
