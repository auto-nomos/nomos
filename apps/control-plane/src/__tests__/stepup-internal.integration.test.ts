/**
 * Sprint 9.2: control-plane internal step-up endpoints.
 *   POST /v1/internal/stepup/create  — inserts push_approvals row, fires notifier
 *   GET  /v1/internal/stepup/:id     — exposes state for SDK polling
 *
 * Requires postgres. SKIP_DB_TESTS=1 to skip.
 */
import { eq } from 'drizzle-orm';
import { pino } from 'pino';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { type Auth, createAuth } from '../auth/index.js';
import { loadConfig } from '../config.js';
import { createDb, type Db } from '../db/index.js';
import * as schema from '../db/schema.js';
import { createServer } from '../server.js';
import type { StepUpNotifier } from '../services/stepup/notify.js';

const TEST_URL = process.env.TEST_DATABASE_URL ?? 'postgres://cb:cb@localhost:5433/cb_dev';
const RUN = !process.env.SKIP_DB_TESTS;
const TOKEN = 'dev-shared-token';

describe.skipIf(!RUN)('stepup internal endpoints (requires postgres)', () => {
  let db: Db;
  let auth: Auth;
  let app: ReturnType<typeof createServer>;
  let customerId: string;
  let userId: string;
  let agentId: string;
  const notifier = vi.fn(async () => undefined) as unknown as StepUpNotifier;
  const logger = pino({ level: 'silent' });

  beforeAll(async () => {
    db = createDb({ DATABASE_URL: TEST_URL });
    try {
      await db.pool.query('SELECT 1');
    } catch (err) {
      throw new Error(`Postgres not reachable: ${(err as Error).message}`);
    }
    const config = loadConfig({ DATABASE_URL: TEST_URL });
    auth = createAuth({ db: db.drizzle, config, logger });
    app = createServer({
      logger,
      db,
      auth,
      internal: { serviceToken: TOKEN },
      stepup: {
        notifier,
        dashboardPublicUrl: 'http://localhost:3000',
        defaultTtlSeconds: 60,
      },
    });

    const email = `stepup-int-${Date.now()}-${Math.random()}@test.test`;
    const signUp = await app.request('/auth/sign-up/email', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password: 'long-password-1', name: 'StepUp Tester' }),
    });
    expect(signUp.status).toBe(200);
    const u = await db.drizzle.query.user.findFirst({ where: eq(schema.user.email, email) });
    userId = u!.id;
    const m = await db.drizzle.query.memberships.findFirst({
      where: eq(schema.memberships.userId, userId),
    });
    customerId = m!.customerId;
    const [a] = await db.drizzle
      .insert(schema.agents)
      .values({
        customerId,
        name: 'stepup-test-agent',
        did: 'did:key:z6MkstepupTestAgent',
        status: 'active',
      })
      .returning({ id: schema.agents.id });
    agentId = a!.id;
  });

  afterAll(async () => {
    await db.pool.query('DELETE FROM agents WHERE customer_id = $1', [customerId]);
    await db.pool.query('DELETE FROM customers WHERE id = $1', [customerId]);
    await db.pool.query('DELETE FROM "user" WHERE id = $1', [userId]);
    await db.pool.end();
  });

  it('POST /v1/internal/stepup/create requires bearer token', async () => {
    const res = await app.request('/v1/internal/stepup/create', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ customer_id: customerId, agent_id: agentId, command: '/x/y' }),
    });
    expect(res.status).toBe(401);
  });

  it('POST /v1/internal/stepup/create inserts row + fires notifier', async () => {
    (notifier as unknown as ReturnType<typeof vi.fn>).mockClear();
    const res = await app.request('/v1/internal/stepup/create', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${TOKEN}` },
      body: JSON.stringify({
        customer_id: customerId,
        agent_id: agentId,
        command: '/stripe/charge',
        resource: { amount: 250 },
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: string; expires_at: string; deep_link: string };
    expect(body.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(body.deep_link).toMatch(new RegExp(`/approve/${body.id}$`));

    // Wait for fire-and-forget notifier
    await new Promise((r) => setTimeout(r, 20));
    expect(notifier).toHaveBeenCalledTimes(1);
    const calledWith = (notifier as unknown as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(calledWith).toMatchObject({
      approvalId: body.id,
      customerId,
      agentId,
      command: '/stripe/charge',
      decidingUserId: userId,
    });

    const row = await db.drizzle.query.pushApprovals.findFirst({
      where: eq(schema.pushApprovals.id, body.id),
    });
    expect(row?.state).toBe('pending');
    expect(row?.command).toBe('/stripe/charge');
  });

  it('rejects unknown agent', async () => {
    const res = await app.request('/v1/internal/stepup/create', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${TOKEN}` },
      body: JSON.stringify({
        customer_id: customerId,
        agent_id: '00000000-0000-0000-0000-000000000000',
        command: '/x/y',
      }),
    });
    expect(res.status).toBe(404);
  });

  it('GET /v1/internal/stepup/:id returns pending state', async () => {
    const create = await app.request('/v1/internal/stepup/create', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${TOKEN}` },
      body: JSON.stringify({
        customer_id: customerId,
        agent_id: agentId,
        command: '/x/y',
        resource: { foo: 'bar' },
        ttl_seconds: 30,
      }),
    });
    const { id } = (await create.json()) as { id: string };
    const res = await app.request(`/v1/internal/stepup/${id}`, {
      headers: { authorization: `Bearer ${TOKEN}` },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.id).toBe(id);
    expect(body.state).toBe('pending');
    expect(body.cosigner_attestation_jwt).toBeNull();
    expect(body.command).toBe('/x/y');
  });

  it('GET /v1/internal/stepup/:id exposes expired when past TTL', async () => {
    const create = await app.request('/v1/internal/stepup/create', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${TOKEN}` },
      body: JSON.stringify({
        customer_id: customerId,
        agent_id: agentId,
        command: '/x/y',
        ttl_seconds: 1,
      }),
    });
    const { id } = (await create.json()) as { id: string };
    // Force-backdate expires_at via direct SQL
    await db.pool.query(
      "UPDATE push_approvals SET expires_at = NOW() - INTERVAL '1 minute' WHERE id = $1",
      [id],
    );
    const res = await app.request(`/v1/internal/stepup/${id}`, {
      headers: { authorization: `Bearer ${TOKEN}` },
    });
    const body = (await res.json()) as { state: string };
    expect(body.state).toBe('expired');
  });

  it('GET /v1/internal/stepup/:id returns 404 for unknown id', async () => {
    const res = await app.request(`/v1/internal/stepup/00000000-0000-0000-0000-000000000000`, {
      headers: { authorization: `Bearer ${TOKEN}` },
    });
    expect(res.status).toBe(404);
  });

  it('dedups: second call with same (agent, command, resource) returns existing id + skips notifier', async () => {
    (notifier as unknown as ReturnType<typeof vi.fn>).mockClear();
    const payload = {
      customer_id: customerId,
      agent_id: agentId,
      command: '/dedup/test',
      resource: { foo: 'same' },
    };
    const first = await app.request('/v1/internal/stepup/create', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${TOKEN}` },
      body: JSON.stringify(payload),
    });
    expect(first.status).toBe(200);
    const firstBody = (await first.json()) as { id: string };
    await new Promise((r) => setTimeout(r, 20));
    expect(notifier).toHaveBeenCalledTimes(1);

    const second = await app.request('/v1/internal/stepup/create', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${TOKEN}` },
      body: JSON.stringify(payload),
    });
    expect(second.status).toBe(200);
    const secondBody = (await second.json()) as { id: string };
    expect(secondBody.id).toBe(firstBody.id);
    await new Promise((r) => setTimeout(r, 20));
    expect(notifier).toHaveBeenCalledTimes(1); // still only the first
  });

  it('dedup: expired pending row is refreshed in place (same id, new expiresAt)', async () => {
    const payload = {
      customer_id: customerId,
      agent_id: agentId,
      command: '/dedup/expired',
      resource: { foo: 'old' },
    };
    const first = await app.request('/v1/internal/stepup/create', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${TOKEN}` },
      body: JSON.stringify(payload),
    });
    const firstBody = (await first.json()) as { id: string; expires_at: string };
    await db.pool.query(
      "UPDATE push_approvals SET expires_at = NOW() - INTERVAL '1 minute' WHERE id = $1",
      [firstBody.id],
    );
    const second = await app.request('/v1/internal/stepup/create', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${TOKEN}` },
      body: JSON.stringify(payload),
    });
    const secondBody = (await second.json()) as { id: string; expires_at: string };
    expect(secondBody.id).toBe(firstBody.id);
    expect(new Date(secondBody.expires_at).getTime()).toBeGreaterThan(Date.now());
  });
});
