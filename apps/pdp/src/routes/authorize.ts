import type { Schema } from '@credential-broker/cedar';
import { type DecideInput, decide } from '@credential-broker/core';
import {
  type AuthorizeDecision,
  type AuthorizeRequest,
  AuthorizeRequest as AuthorizeRequestSchema,
} from '@credential-broker/shared-types';
import { computeCid, parseUcanJwt } from '@credential-broker/ucan';
import { Hono } from 'hono';
import { decisionToAudit } from '../audit/emit.js';
import type { PolicyCache } from '../cache/policies.js';
import type { RevocationCache } from '../cache/revocations.js';
import { getLog } from '../middleware/logger.js';
import { recordAuthorize } from '../observability/metrics.js';
import { evaluateStepUpPotential, shouldDetectStepUp } from '../services/stepup.js';

export interface AuthorizeRouteDeps {
  policyCache: PolicyCache;
  revocationCache: RevocationCache;
  emitAudit?: (event: AuditEmitInput) => Promise<void> | void;
  schemaForCustomer?: (customerId: string) => Schema | undefined;
  /**
   * Sprint 9 — when supplied, denies that *would* allow with cosigner=true
   * trigger a control-plane push_approvals row + Knock notification, and the
   * decision returns `{ requiresStepUp: true, stepUpUrl, stepUpId }`.
   */
  stepup?: {
    create: (args: {
      customerId: string;
      agentId: string;
      command: string;
      resource: Record<string, unknown>;
      originalUcanCid?: string;
    }) => Promise<{ id: string; deepLink: string }>;
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

    const policies = deps.policyCache.getPolicies(customerId);
    if (policies === undefined) {
      log.warn({ customerId }, 'no policies cached for customer');
      return c.json({ error: 'unknown customer or policy bundle not yet loaded' }, 404);
    }

    const revokedCids = deps.revocationCache.getRevoked(customerId);
    const schema = deps.schemaForCustomer?.(customerId);

    const input: DecideInput = {
      ucan: request.ucan,
      request,
      policies,
      revokedCids,
      ...(schema !== undefined ? { schema } : {}),
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
        agentDid: 'unknown', // populated by validation in core in future iterations
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
