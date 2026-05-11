import { sha256Hex } from '@auto-nomos/crypto';
import { and, eq, isNull } from 'drizzle-orm';
import type { MiddlewareHandler } from 'hono';
import { createMiddleware } from 'hono/factory';
import type { Db } from '../db/index.js';
import * as schema from '../db/schema.js';

export interface ApiKeyAuthDeps {
  db: Db;
}

export interface ApiKeyAuthVariables {
  customerId: string;
  agentId: string;
  apiKeyId: string;
}

/**
 * Bearer-token guard for SDK ↔ control-plane endpoints (today: POST
 * /v1/mint-ucan). Hashes the bearer with sha256, looks up the row in
 * `api_keys`, rejects revoked keys. Sets c.var.{customerId, agentId,
 * apiKeyId} for downstream handlers.
 *
 * Rejects keys with no agentId — they're allowed by the schema but the
 * mintUcan service requires an agent, so an agentless key cannot mint.
 */
export const apiKeyAuth = (
  deps: ApiKeyAuthDeps,
): MiddlewareHandler<{ Variables: ApiKeyAuthVariables }> =>
  createMiddleware<{ Variables: ApiKeyAuthVariables }>(async (c, next) => {
    const auth = c.req.header('authorization') ?? '';
    const got = auth.replace(/^Bearer\s+/i, '');
    if (got === '' || !got.startsWith('cb_')) {
      return c.json({ error: 'unauthorized', error_code: 'missing_api_key' }, 401);
    }
    const keyHash = sha256Hex(got);
    const row = await deps.db.drizzle.query.apiKeys.findFirst({
      where: and(eq(schema.apiKeys.keyHash, keyHash), isNull(schema.apiKeys.revokedAt)),
    });
    if (!row) {
      return c.json({ error: 'unauthorized', error_code: 'invalid_api_key' }, 401);
    }
    if (!row.agentId) {
      return c.json(
        {
          error: 'api key has no agent binding — recreate it via the dashboard',
          error_code: 'agentless_api_key',
        },
        403,
      );
    }
    const agent = await deps.db.drizzle.query.agents.findFirst({
      where: eq(schema.agents.id, row.agentId),
      columns: { id: true, status: true, connectionApprovedAt: true },
    });
    if (!agent || agent.status === 'deleted') {
      return c.json({ error: 'unauthorized', error_code: 'agent_not_found' }, 401);
    }
    await deps.db.drizzle
      .update(schema.agents)
      .set({ lastActiveAt: new Date() })
      .where(eq(schema.agents.id, row.agentId));
    if (!agent.connectionApprovedAt) {
      return c.json(
        {
          error:
            'this agent has not been approved yet; approve it from the Nomos dashboard under Pending connections',
          error_code: 'pending_approval',
          agentId: agent.id,
        },
        403,
      );
    }
    if (agent.status !== 'active') {
      return c.json({ error: 'agent disabled', error_code: 'agent_not_active' }, 403);
    }
    c.set('customerId', row.customerId);
    c.set('agentId', row.agentId);
    c.set('apiKeyId', row.id);
    await next();
  });
