import { sha256Hex } from '@auto-nomos/crypto';
import {
  type Action,
  expandRolePermissions,
  hasPermission,
  type Resource,
  type Role,
} from '@auto-nomos/rbac';
import { and, eq, isNull } from 'drizzle-orm';
import type { Context, MiddlewareHandler } from 'hono';
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
  role: Role;
  permissions: ReturnType<typeof expandRolePermissions>;
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
    const now = new Date();
    await deps.db.drizzle
      .update(schema.agents)
      .set({ lastActiveAt: now })
      .where(eq(schema.agents.id, row.agentId));
    const userAgent = c.req.header('user-agent') ?? null;
    const forwardedFor = c.req.header('x-forwarded-for') ?? '';
    const host = forwardedFor.split(',')[0]?.trim() || c.req.header('x-real-ip') || null;
    await deps.db.drizzle
      .update(schema.apiKeys)
      .set({
        lastUsedAt: now,
        ...(userAgent ? { lastUserAgent: userAgent.slice(0, 500) } : {}),
        ...(host ? { lastHost: host.slice(0, 100) } : {}),
      })
      .where(eq(schema.apiKeys.id, row.id));
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
    const role = row.role as Role;
    c.set('role', role);
    c.set('permissions', expandRolePermissions(role));
    await next();
  });

/**
 * Hono helper for routes mounted under `apiKeyAuth` middleware. Use after the
 * api-key gate when a specific resource:action must be enforced for machine
 * traffic — e.g. /v1/mint-ucan requires `agents:read` (the SDK is asking
 * for a UCAN, which is the agent's authority).
 */
export function requirePermission(
  resource: Resource,
  action: Action,
): MiddlewareHandler<{ Variables: ApiKeyAuthVariables }> {
  return async (c: Context<{ Variables: ApiKeyAuthVariables }>, next) => {
    const role = c.var.role;
    if (!role || !hasPermission(role, resource, action)) {
      return c.json(
        {
          error: `api key role ${role ?? '<missing>'} cannot ${action} ${resource}`,
          error_code: 'role_forbidden',
          requiredPermission: `${resource}:${action}`,
        },
        403,
      );
    }
    await next();
  };
}
