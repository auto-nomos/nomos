import { expandRolePermissions, type Role } from '@auto-nomos/rbac';
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { type ApiKeyAuthVariables, requirePermission } from '../api-key-auth.js';

function appWithRole(role: Role) {
  const app = new Hono<{ Variables: ApiKeyAuthVariables }>();
  app.use('/v1/test', async (c, next) => {
    c.set('customerId', 'c1');
    c.set('agentId', 'a1');
    c.set('apiKeyId', 'k1');
    c.set('role', role);
    c.set('permissions', expandRolePermissions(role));
    await next();
  });
  app.post('/v1/test', requirePermission('agents', 'update'), (c) => c.json({ ok: true }));
  return app;
}

describe('requirePermission middleware', () => {
  it('allows owner', async () => {
    const res = await appWithRole('owner').request('/v1/test', { method: 'POST' });
    expect(res.status).toBe(200);
  });

  it('allows admin', async () => {
    const res = await appWithRole('admin').request('/v1/test', { method: 'POST' });
    expect(res.status).toBe(200);
  });

  it('allows agent_manager (has agents:update)', async () => {
    const res = await appWithRole('agent_manager').request('/v1/test', { method: 'POST' });
    expect(res.status).toBe(200);
  });

  it('rejects auditor with 403 + role_forbidden', async () => {
    const res = await appWithRole('auditor').request('/v1/test', { method: 'POST' });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error_code?: string; requiredPermission?: string };
    expect(body.error_code).toBe('role_forbidden');
    expect(body.requiredPermission).toBe('agents:update');
  });

  it('rejects policy_author (read-only on agents)', async () => {
    const res = await appWithRole('policy_author').request('/v1/test', { method: 'POST' });
    expect(res.status).toBe(403);
  });

  it('rejects member', async () => {
    const res = await appWithRole('member').request('/v1/test', { method: 'POST' });
    expect(res.status).toBe(403);
  });
});
