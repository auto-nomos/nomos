import type { Schema } from '@credential-broker/cedar';
import { type DecideInput, decide } from '@credential-broker/core';
import {
  type AuthorizeRequest,
  AuthorizeRequest as AuthorizeRequestSchema,
} from '@credential-broker/shared-types';
import { Hono } from 'hono';
import type { PolicyCache } from '../cache/policies.js';
import type { RevocationCache } from '../cache/revocations.js';
import { getLog } from '../middleware/logger.js';

export interface AuthorizeRouteDeps {
  policyCache: PolicyCache;
  revocationCache: RevocationCache;
  emitAudit?: (event: AuditEmitInput) => Promise<void> | void;
  schemaForCustomer?: (customerId: string) => Schema | undefined;
}

export interface AuditEmitInput {
  customerId: string;
  request: AuthorizeRequest;
  decision: { allow: boolean; reason?: string; receiptId: string };
  ts: number;
  agentDid: string;
}

const CUSTOMER_HEADER = 'x-cb-customer';

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

    const decision = decide(input);

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
      { customerId, command: request.command, allow: decision.allow, reason: decision.reason },
      'authorize',
    );

    return c.json(decision, 200);
  });

  return app;
}
