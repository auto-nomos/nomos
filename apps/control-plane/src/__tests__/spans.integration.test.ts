/**
 * /v1/spans ingestion + observability graph aggregation (requires postgres).
 *
 * Spans are written by mcp-server after each tool call (see
 * packages/mcp-server/src/spans.ts). We assert here:
 *   - Happy-path POST inserts and returns spanId
 *   - Repeat POST is idempotent on (customer_id, receipt_id)
 *   - Cross-tenant receipt → 403 receipt_wrong_tenant
 *   - Agent-DID mismatch on receipt → 403 agent_mismatch
 *   - actionGraph returns customer-scoped nodes + edges
 *   - actionTimeline ordered desc with same scoping
 *   - spanDetail 404s on other tenant's span
 */
import { sha256Hex } from '@auto-nomos/crypto';
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import { eq } from 'drizzle-orm';
import { pino } from 'pino';
import superjson from 'superjson';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type Auth, createAuth } from '../auth/index.js';
import { loadConfig } from '../config.js';
import { createDb, type Db } from '../db/index.js';
import * as schema from '../db/schema.js';
import { createServer } from '../server.js';
import type { AppRouter } from '../trpc/router.js';

const TEST_URL = process.env.TEST_DATABASE_URL ?? 'postgres://cb:cb@localhost:5433/cb_dev';
const RUN = !process.env.SKIP_DB_TESTS;

interface Tenant {
  cookie: string;
  userId: string;
  customerId: string;
}

describe.skipIf(!RUN)('spans ingestion + observability v2 (requires postgres)', () => {
  let db: Db;
  let auth: Auth;
  let app: ReturnType<typeof createServer>;
  let alice: Tenant;
  let bob: Tenant;
  const logger = pino({ level: 'silent' });
  const cleanupCustomerIds: string[] = [];
  const cleanupUserIds: string[] = [];

  function trpcClient(cookie: string) {
    return createTRPCClient<AppRouter>({
      links: [
        httpBatchLink({
          url: 'http://localhost/trpc',
          transformer: superjson,
          fetch: (url, init) => app.request(url.toString(), init as RequestInit),
          headers: () => (cookie ? { cookie } : {}),
        }),
      ],
    });
  }

  async function signUp(prefix: string): Promise<Tenant> {
    const email = `${prefix}-${Date.now()}-${Math.random()}@spans-test.test`;
    const res = await app.request('/auth/sign-up/email', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password: 'long-password-1', name: prefix }),
    });
    expect(res.status).toBe(200);
    const cookie = (res.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
    const u = await db.drizzle.query.user.findFirst({ where: eq(schema.user.email, email) });
    const m = await db.drizzle.query.memberships.findFirst({
      where: eq(schema.memberships.userId, u!.id),
    });
    cleanupCustomerIds.push(m!.customerId);
    cleanupUserIds.push(u!.id);
    return { cookie, userId: u!.id, customerId: m!.customerId };
  }

  async function makeAgent(customerId: string, name: string): Promise<{ id: string; did: string }> {
    const did = `did:key:z6Mk${name}${Math.random().toString(36).slice(2, 8)}`;
    const [row] = await db.drizzle
      .insert(schema.agents)
      .values({
        customerId,
        name,
        did,
        status: 'active',
        connectionApprovedAt: new Date(),
      })
      .returning();
    return { id: row!.id, did: row!.did };
  }

  async function newApiKey(customerId: string, agentId: string): Promise<string> {
    const plaintext = `cb_${customerId}_secret-${Math.random()}`;
    await db.drizzle.insert(schema.apiKeys).values({
      customerId,
      agentId,
      keyHash: sha256Hex(plaintext),
      prefix: `cb_${customerId}`,
      name: 'spans-test',
    });
    return plaintext;
  }

  async function emitAudit(
    customerId: string,
    agentDid: string,
    overrides: Partial<typeof schema.auditEvents.$inferInsert> = {},
  ): Promise<string> {
    const hash = `h-${Date.now()}-${Math.random()}`;
    const [row] = await db.drizzle
      .insert(schema.auditEvents)
      .values({
        customerId,
        agent: agentDid,
        decision: 'allow',
        command: '/github/repo/list',
        resource: { owner: 'x', repo: 'y' },
        context: {},
        prevHash: '0'.repeat(64),
        hash,
        payload: { command: '/github/repo/list' },
        ...overrides,
      })
      .returning({ eventId: schema.auditEvents.eventId });
    return row!.eventId;
  }

  function spanBody(receiptId: string, overrides: Record<string, unknown> = {}) {
    const now = Date.now();
    return {
      receiptId,
      toolName: '/github/repo/list',
      status: 'success',
      startedAt: new Date(now - 220).toISOString(),
      endedAt: new Date(now).toISOString(),
      latencyMs: 220,
      httpStatus: 200,
      requestArgsHash: 'a'.repeat(64),
      requestSummary: { owner: 'x', repo: 'y' },
      responseHash: 'b'.repeat(64),
      responseSummary: { id: 'r1', count: 3 },
      ...overrides,
    };
  }

  async function postSpan(apiKey: string, body: unknown) {
    return app.request('/v1/spans', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });
  }

  beforeAll(async () => {
    db = createDb({ DATABASE_URL: TEST_URL });
    await db.pool.query('SELECT 1');
    const config = loadConfig({ DATABASE_URL: TEST_URL });
    auth = createAuth({ db: db.drizzle, config, logger });
    app = createServer({
      logger,
      db,
      auth,
      internal: { serviceToken: 'test-service-token' },
    });
    alice = await signUp('alice-spans');
    bob = await signUp('bob-spans');
  });

  afterAll(async () => {
    for (const id of cleanupCustomerIds) {
      await db.pool.query('DELETE FROM customers WHERE id = $1', [id]);
    }
    for (const id of cleanupUserIds) {
      await db.pool.query('DELETE FROM "user" WHERE id = $1', [id]);
    }
    await db.pool.end();
  });

  it('happy-path POST inserts a span and returns the id', async () => {
    const agent = await makeAgent(alice.customerId, `a-${Math.random()}`);
    const key = await newApiKey(alice.customerId, agent.id);
    const receiptId = await emitAudit(alice.customerId, agent.did);
    const res = await postSpan(key, spanBody(receiptId));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { spanId: string; inserted: boolean };
    expect(body.inserted).toBe(true);
    expect(typeof body.spanId).toBe('string');
  });

  it('idempotent: second POST with same receipt returns inserted=false', async () => {
    const agent = await makeAgent(alice.customerId, `idem-${Math.random()}`);
    const key = await newApiKey(alice.customerId, agent.id);
    const receiptId = await emitAudit(alice.customerId, agent.did);
    const first = await postSpan(key, spanBody(receiptId));
    const second = await postSpan(key, spanBody(receiptId, { latencyMs: 999 }));
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    const f = (await first.json()) as { spanId: string; inserted: boolean };
    const s = (await second.json()) as { spanId: string; inserted: boolean };
    expect(f.inserted).toBe(true);
    expect(s.inserted).toBe(false);
    expect(s.spanId).toBe(f.spanId);
  });

  it('cross-tenant receipt → 403 receipt_wrong_tenant', async () => {
    const bobAgent = await makeAgent(bob.customerId, `bob-${Math.random()}`);
    const bobReceipt = await emitAudit(bob.customerId, bobAgent.did);
    const aliceAgent = await makeAgent(alice.customerId, `alice-${Math.random()}`);
    const aliceKey = await newApiKey(alice.customerId, aliceAgent.id);
    const res = await postSpan(aliceKey, spanBody(bobReceipt));
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error_code: string };
    expect(body.error_code).toBe('receipt_wrong_tenant');
  });

  it('agent-DID mismatch → 403 agent_mismatch', async () => {
    const a1 = await makeAgent(alice.customerId, `am-1-${Math.random()}`);
    const a2 = await makeAgent(alice.customerId, `am-2-${Math.random()}`);
    const key2 = await newApiKey(alice.customerId, a2.id);
    const receipt = await emitAudit(alice.customerId, a1.did);
    const res = await postSpan(key2, spanBody(receipt));
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error_code: string };
    expect(body.error_code).toBe('agent_mismatch');
  });

  it('invalid request shape → 400', async () => {
    const agent = await makeAgent(alice.customerId, `bad-${Math.random()}`);
    const key = await newApiKey(alice.customerId, agent.id);
    const res = await postSpan(key, { receiptId: 'x' });
    expect(res.status).toBe(400);
  });

  it('actionGraph returns nodes + edges for the calling tenant only', async () => {
    const a = await makeAgent(alice.customerId, `g-a-${Math.random()}`);
    const b = await makeAgent(bob.customerId, `g-b-${Math.random()}`);
    const aKey = await newApiKey(alice.customerId, a.id);
    const bKey = await newApiKey(bob.customerId, b.id);
    const aRcpt = await emitAudit(alice.customerId, a.did, { command: '/github/repo/list' });
    const bRcpt = await emitAudit(bob.customerId, b.did, { command: '/slack/message/post' });
    expect((await postSpan(aKey, spanBody(aRcpt))).status).toBe(200);
    expect(
      (await postSpan(bKey, spanBody(bRcpt, { toolName: '/slack/message/post' }))).status,
    ).toBe(200);

    const aliceGraph = await trpcClient(alice.cookie).observability.actionGraph.query({
      sinceMinutes: 60,
    });
    const tools = aliceGraph.nodes
      .filter((n): n is Extract<typeof n, { kind: 'span' }> => n.kind === 'span')
      .map((n) => n.toolName);
    expect(tools).toContain('/github/repo/list');
    expect(tools).not.toContain('/slack/message/post');
    expect(aliceGraph.spanCount).toBeGreaterThanOrEqual(1);
  });

  it('actionTimeline scoped to caller customer, desc by startedAt', async () => {
    const a = await makeAgent(alice.customerId, `t-${Math.random()}`);
    const key = await newApiKey(alice.customerId, a.id);
    const r1 = await emitAudit(alice.customerId, a.did);
    const r2 = await emitAudit(alice.customerId, a.did);
    await postSpan(
      key,
      spanBody(r1, {
        startedAt: new Date(Date.now() - 60_000).toISOString(),
        endedAt: new Date(Date.now() - 59_900).toISOString(),
      }),
    );
    await postSpan(key, spanBody(r2));
    const tl = await trpcClient(alice.cookie).observability.actionTimeline.query({ limit: 5 });
    expect(tl.length).toBeGreaterThanOrEqual(2);
    // newest first
    expect(new Date(tl[0]!.startedAt).getTime()).toBeGreaterThanOrEqual(
      new Date(tl[1]!.startedAt).getTime(),
    );
  });

  it("spanDetail 404s when reading another tenant's span", async () => {
    const b = await makeAgent(bob.customerId, `d-${Math.random()}`);
    const bKey = await newApiKey(bob.customerId, b.id);
    const bRcpt = await emitAudit(bob.customerId, b.did);
    const res = await postSpan(bKey, spanBody(bRcpt));
    const { spanId } = (await res.json()) as { spanId: string };
    await expect(
      trpcClient(alice.cookie).observability.spanDetail.query({ spanId }),
    ).rejects.toThrow();
  });

  // PDP-side emission path. Verifies the internal endpoint authed by service
  // token resolves agent_id from did + customer, persists the intent column,
  // and dedupes if PDP and mcp-server both fire spans for the same receipt.
  describe('/v1/internal/spans/emit (PDP path)', () => {
    async function postInternal(body: unknown) {
      return app.request('/v1/internal/spans/emit', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: 'Bearer test-service-token',
        },
        body: JSON.stringify(body),
      });
    }

    it('happy-path inserts with intent + nextAgentHint persisted', async () => {
      const agent = await makeAgent(alice.customerId, `int-${Math.random()}`);
      const receiptId = await emitAudit(alice.customerId, agent.did);
      const res = await postInternal({
        customerId: alice.customerId,
        agentDid: agent.did,
        ...spanBody(receiptId, {
          intent: 'create release branch',
          nextAgentHint: 'writer will draft notes',
        }),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { spanId: string; inserted: boolean };
      expect(body.inserted).toBe(true);

      const row = await db.drizzle.query.agentSpans.findFirst({
        where: eq(schema.agentSpans.id, body.spanId),
        columns: { intent: true, nextAgentHint: true, customerId: true },
      });
      expect(row?.intent).toBe('create release branch');
      expect(row?.nextAgentHint).toBe('writer will draft notes');
      expect(row?.customerId).toBe(alice.customerId);
    });

    it('rejects with 401 without service token', async () => {
      const res = await app.request('/v1/internal/spans/emit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(401);
    });

    it('returns 404 when agentDid does not exist for the customer', async () => {
      const receiptId = await emitAudit(alice.customerId, `did:key:zNOTAGENT-${Math.random()}`);
      const res = await postInternal({
        customerId: alice.customerId,
        agentDid: 'did:key:zNOTEXIST',
        ...spanBody(receiptId),
      });
      expect(res.status).toBe(404);
      const body = (await res.json()) as { error_code: string };
      expect(body.error_code).toBe('agent_not_found');
    });

    it('idempotent across PDP + mcp-server (both emit same receiptId)', async () => {
      const agent = await makeAgent(alice.customerId, `dedupe-${Math.random()}`);
      const key = await newApiKey(alice.customerId, agent.id);
      const receiptId = await emitAudit(alice.customerId, agent.did);

      // PDP fires first.
      const pdpRes = await postInternal({
        customerId: alice.customerId,
        agentDid: agent.did,
        ...spanBody(receiptId, { intent: 'pdp-first' }),
      });
      expect(pdpRes.status).toBe(200);
      const pdpBody = (await pdpRes.json()) as { spanId: string; inserted: boolean };
      expect(pdpBody.inserted).toBe(true);

      // mcp-server retries the same receipt via /v1/spans.
      const mcpRes = await postSpan(key, spanBody(receiptId, { intent: 'mcp-retry' }));
      expect(mcpRes.status).toBe(200);
      const mcpBody = (await mcpRes.json()) as { spanId: string; inserted: boolean };
      expect(mcpBody.inserted).toBe(false);
      expect(mcpBody.spanId).toBe(pdpBody.spanId);

      // First emit wins — intent stays 'pdp-first'.
      const row = await db.drizzle.query.agentSpans.findFirst({
        where: eq(schema.agentSpans.id, pdpBody.spanId),
        columns: { intent: true },
      });
      expect(row?.intent).toBe('pdp-first');
    });
  });
});
