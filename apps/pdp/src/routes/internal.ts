import { sha256Hex } from '@auto-nomos/crypto';
import { Hono } from 'hono';
import type { PolicyCache } from '../cache/policies.js';
import type { RevocationCache } from '../cache/revocations.js';
import type { Logger } from '../logger.js';
import { internalAuth } from '../middleware/internal-auth.js';
import type { AuditEmitInput } from './authorize.js';

export interface InternalDeps {
  policyCache: PolicyCache;
  revocationCache: RevocationCache;
  serviceToken: string;
  logger: Logger;
  /**
   * Optional audit emitter for `cloud.token.minted` + `cloud.federation.exchanged`
   * rows pushed by the control plane after a successful mint/exchange. Plan §6
   * "three audit kinds" — PDP is the chain owner so CP echoes through here.
   */
  emitAudit?: (event: AuditEmitInput) => Promise<void> | void;
}

/**
 * Service-to-service routes the control plane calls. Sprint 8 push-revocation
 * lives here: control plane POSTs `{ customer_id }` after a revoke, PDP
 * refreshes that customer's revocation set immediately.
 */
export function createInternalRoutes(deps: InternalDeps): Hono {
  const app = new Hono();

  app.use('/v1/internal/*', internalAuth(deps.serviceToken));

  app.post('/v1/internal/refresh-revocations', async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'invalid_json' }, 400);
    }
    const customerId =
      body && typeof body === 'object' && 'customer_id' in body
        ? (body as { customer_id: unknown }).customer_id
        : undefined;
    if (typeof customerId !== 'string' || customerId.length === 0) {
      return c.json({ error: 'customer_id required' }, 400);
    }
    try {
      await deps.revocationCache.refresh(customerId);
    } catch (err) {
      deps.logger.error({ err, customerId }, 'push-driven revocation refresh failed');
      return c.json({ error: 'refresh_failed' }, 500);
    }
    return c.json({ ok: true, customer_id: customerId });
  });

  /**
   * P3 push-invalidation: control plane calls this after a grant upsert or
   * policy save so the new bundle is live in seconds, not on the 60s tick.
   */
  app.post('/v1/internal/refresh-policies', async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'invalid_json' }, 400);
    }
    const customerId =
      body && typeof body === 'object' && 'customer_id' in body
        ? (body as { customer_id: unknown }).customer_id
        : undefined;
    if (typeof customerId !== 'string' || customerId.length === 0) {
      return c.json({ error: 'customer_id required' }, 400);
    }
    try {
      await deps.policyCache.refresh(customerId);
    } catch (err) {
      deps.logger.error({ err, customerId }, 'push-driven policy refresh failed');
      return c.json({ error: 'refresh_failed' }, 500);
    }
    return c.json({ ok: true, customer_id: customerId });
  });

  /**
   * M1 audit polish — control plane posts here after every mintIdToken
   * (kind=cloud.token.minted) and successful acquireSessionCreds
   * (kind=cloud.federation.exchanged). PDP owns the per-customer hash
   * chain so all cloud audit rows flow through one writer.
   */
  app.post('/v1/internal/audit/emit-cloud', async (c) => {
    if (!deps.emitAudit) return c.json({ error: 'audit_disabled' }, 503);
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'invalid_json' }, 400);
    }
    const b = body as {
      kind?: string;
      customer_id?: string;
      agent_id?: string;
      connection_id?: string;
      connector?: string;
      command?: string;
      jti?: string;
      retryable?: boolean;
      error?: string;
    };
    const allowedKinds = new Set([
      'cloud.token.minted',
      'cloud.federation.exchanged',
      'cloud.federation.exchanged.failed',
    ]);
    if (
      typeof b.kind !== 'string' ||
      !allowedKinds.has(b.kind) ||
      typeof b.customer_id !== 'string' ||
      typeof b.agent_id !== 'string' ||
      typeof b.connection_id !== 'string' ||
      typeof b.connector !== 'string'
    ) {
      return c.json({ error: 'invalid_body' }, 400);
    }
    const allow = b.kind !== 'cloud.federation.exchanged.failed';
    const command = b.command ?? `${b.connector}:internal`;
    try {
      await deps.emitAudit({
        customerId: b.customer_id,
        request: {
          command,
          resource: { connection_id: b.connection_id },
          context: {
            cloud_kind: b.kind,
            cloud_connection_id: b.connection_id,
            cloud_connector: b.connector,
            ...(b.jti ? { cloud_id_token_jti: b.jti } : {}),
            ...(b.retryable !== undefined ? { cloud_retryable: b.retryable } : {}),
            ...(b.error ? { cloud_error: b.error } : {}),
          },
          // Control-plane-originated audit events are not behind a UCAN;
          // empty string distinguishes them from agent-driven authorize calls.
          ucan: '',
        },
        decision: {
          allow,
          reason: b.kind,
          receiptId: sha256Hex(`${b.kind}|${b.connection_id}|${b.jti ?? ''}|${b.error ?? ''}`),
        },
        ts: Date.now(),
        agentDid: `agent:${b.agent_id}`,
      });
    } catch (err) {
      deps.logger.error({ err, kind: b.kind }, 'cloud audit emit failed');
      return c.json({ error: 'emit_failed' }, 500);
    }
    return c.json({ ok: true });
  });

  return app;
}
