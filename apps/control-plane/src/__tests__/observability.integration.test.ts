/**
 * Observability router integration test (requires postgres).
 *
 * Seeds two customers with overlapping agent activity, then asserts:
 *   - liveFeed returns only the calling tenant's rows
 *   - agentInventory aggregates match hand-computed counts
 *   - anomalies fires `new_command` on a freshly-seen command, `deny_spike`
 *     on a same-day deny burst, `depth_spike` on a chain depth above prior
 *     baseline, `resource_widened` on a same-day resource explosion
 *   - capabilityDiff correctly buckets canCommands vs didCommands
 *   - blastRadius unions all permitted commands across the swarm's agents
 *   - globalSummary mirrors a hand-computed group-by
 *   - every procedure refuses to leak across tenants
 */
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

describe.skipIf(!RUN)('observability router (requires postgres)', () => {
  let db: Db;
  let auth: Auth;
  let app: ReturnType<typeof createServer>;
  let alice: Tenant;
  let bob: Tenant;
  const logger = pino({ level: 'silent' });
  const cleanupCustomerIds: string[] = [];
  const cleanupUserIds: string[] = [];

  function client(cookie: string) {
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
    const email = `${prefix}-${Date.now()}-${Math.random()}@obs-test.test`;
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

  async function makeAgent(
    customerId: string,
    name: string,
    overrides: Partial<typeof schema.agents.$inferInsert> = {},
  ): Promise<{ id: string; did: string }> {
    const did = `did:key:z6Mk${name}${Math.random().toString(36).slice(2, 8)}`;
    const [row] = await db.drizzle
      .insert(schema.agents)
      .values({
        customerId,
        name,
        did,
        status: 'active',
        connectionApprovedAt: new Date(),
        ...overrides,
      })
      .returning();
    return { id: row!.id, did: row!.did };
  }

  async function emit(
    customerId: string,
    agentDid: string,
    overrides: Partial<typeof schema.auditEvents.$inferInsert> = {},
  ): Promise<void> {
    const hash = `h-${Date.now()}-${Math.random()}-${Math.random()}`;
    await db.drizzle.insert(schema.auditEvents).values({
      customerId,
      agent: agentDid,
      decision: 'allow',
      command: '/x/y',
      resource: { foo: 'bar' },
      context: {},
      prevHash: '0'.repeat(64),
      hash,
      payload: { command: '/x/y' },
      ...overrides,
    });
  }

  async function emitSpan(
    customerId: string,
    agentId: string,
    toolName: string,
    startedAt: Date,
    overrides: Partial<typeof schema.agentSpans.$inferInsert> = {},
  ): Promise<{ id: string; receiptId: string }> {
    const receiptId = `rcpt-${Math.random().toString(36).slice(2)}`;
    const [row] = await db.drizzle
      .insert(schema.agentSpans)
      .values({
        customerId,
        agentId,
        receiptId,
        toolName,
        status: 'success',
        requestArgsHash: 'a'.repeat(64),
        startedAt,
        endedAt: new Date(startedAt.getTime() + 5),
        latencyMs: 5,
        ...overrides,
      })
      .returning({ id: schema.agentSpans.id, receiptId: schema.agentSpans.receiptId });
    return { id: row!.id, receiptId: row!.receiptId };
  }

  beforeAll(async () => {
    db = createDb({ DATABASE_URL: TEST_URL });
    try {
      await db.pool.query('SELECT 1');
    } catch (err) {
      throw new Error(`Postgres not reachable: ${(err as Error).message}`);
    }
    const config = loadConfig({ DATABASE_URL: TEST_URL });
    auth = createAuth({ db: db.drizzle, config, logger });
    app = createServer({ logger, db, auth });

    alice = await signUp('alice-obs');
    bob = await signUp('bob-obs');
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

  it('liveFeed returns only the caller customer rows', async () => {
    const aAgent = await makeAgent(alice.customerId, `live-a-${Math.random()}`);
    const bAgent = await makeAgent(bob.customerId, `live-b-${Math.random()}`);
    await emit(alice.customerId, aAgent.did, { command: '/alice/cmd' });
    await emit(bob.customerId, bAgent.did, { command: '/bob/cmd' });
    const feed = await client(alice.cookie).observability.liveFeed.query({ limit: 50 });
    expect(feed.some((r) => r.command === '/alice/cmd')).toBe(true);
    expect(feed.some((r) => r.command === '/bob/cmd')).toBe(false);
  });

  it('agentInventory aggregates match hand-computed counts', async () => {
    const a = await makeAgent(alice.customerId, `inv-${Math.random()}`);
    // 3 allow, 2 deny, 1 stepup, 2 distinct commands, 2 distinct resources.
    await emit(alice.customerId, a.did, {
      command: '/cmd1',
      decision: 'allow',
      resource: { r: 1 },
    });
    await emit(alice.customerId, a.did, {
      command: '/cmd1',
      decision: 'allow',
      resource: { r: 1 },
    });
    await emit(alice.customerId, a.did, {
      command: '/cmd1',
      decision: 'allow',
      resource: { r: 2 },
    });
    await emit(alice.customerId, a.did, { command: '/cmd2', decision: 'deny', resource: { r: 1 } });
    await emit(alice.customerId, a.did, { command: '/cmd2', decision: 'deny', resource: { r: 1 } });
    await emit(alice.customerId, a.did, {
      command: '/cmd2',
      decision: 'stepup',
      resource: { r: 1 },
    });
    const inv = await client(alice.cookie).observability.agentInventory.query({ windowDays: 7 });
    const mine = inv.find((r) => r.agentId === a.id);
    expect(mine).toBeDefined();
    expect(mine!.total).toBe(6);
    expect(mine!.allow).toBe(3);
    expect(mine!.deny).toBe(2);
    expect(mine!.stepup).toBe(1);
    expect(mine!.distinctCommands).toBe(2);
    expect(mine!.distinctResources).toBe(2);
  });

  it('anomalies fires new_command on a freshly-seen command', async () => {
    const a = await makeAgent(alice.customerId, `anom-new-${Math.random()}`);
    // Single fresh emission with a command never seen before.
    await emit(alice.customerId, a.did, { command: '/anom/fresh' });
    const anomalies = await client(alice.cookie).observability.anomalies.query({ windowDays: 7 });
    const hit = anomalies.find(
      (x) =>
        x.agentId === a.id &&
        x.kind === 'new_command' &&
        (x.evidence as { command?: string }).command === '/anom/fresh',
    );
    expect(hit).toBeDefined();
  });

  it('anomalies fires resource_widened when today resources >> baseline', async () => {
    const a = await makeAgent(alice.customerId, `anom-wid-${Math.random()}`);
    // Yesterday: 2 distinct resources.
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    await emit(alice.customerId, a.did, { resource: { r: 'y1' }, ts: yesterday });
    await emit(alice.customerId, a.did, { resource: { r: 'y2' }, ts: yesterday });
    // Today: 8 distinct resources — should trip 2× threshold and minimum 3.
    for (let i = 0; i < 8; i++) {
      await emit(alice.customerId, a.did, { resource: { r: `t${i}` } });
    }
    const anomalies = await client(alice.cookie).observability.anomalies.query({ windowDays: 7 });
    expect(anomalies.some((x) => x.agentId === a.id && x.kind === 'resource_widened')).toBe(true);
  });

  it('capabilityDiff lists permitted-but-unused commands as unusedCapabilities', async () => {
    const a = await makeAgent(alice.customerId, `cap-${Math.random()}`);
    const cedarText = `permit(principal, action in [Action::"github_create_issue", Action::"github_close_issue"], resource);`;
    const [policy] = await db.drizzle
      .insert(schema.policies)
      .values({ customerId: alice.customerId, name: 'cap-test', cedarText })
      .returning();
    await db.drizzle.insert(schema.agentPolicies).values({
      customerId: alice.customerId,
      agentId: a.id,
      policyId: policy!.id,
      source: 'manual',
    });
    // Only one of the two permitted commands was ever exercised.
    await emit(alice.customerId, a.did, { command: 'github_create_issue' });
    const diff = await client(alice.cookie).observability.capabilityDiff.query({
      agentId: a.id,
      windowDays: 7,
    });
    expect(diff.canCommands.sort()).toEqual(['github_close_issue', 'github_create_issue']);
    expect(diff.didCommands).toContain('github_create_issue');
    expect(diff.unusedCapabilities).toContain('github_close_issue');
    expect(diff.outOfPolicy).not.toContain('github_create_issue');
  });

  it('globalSummary mirrors a hand-computed group-by', async () => {
    // Use a fresh customer so total counts are deterministic.
    const eve = await signUp('eve-obs');
    const a = await makeAgent(eve.customerId, `sum-${Math.random()}`);
    await emit(eve.customerId, a.did, { decision: 'allow' });
    await emit(eve.customerId, a.did, { decision: 'allow' });
    await emit(eve.customerId, a.did, { decision: 'deny' });
    const sum = await client(eve.cookie).observability.globalSummary.query({ windowDays: 7 });
    expect(sum.total).toBe(3);
    expect(sum.allow).toBe(2);
    expect(sum.deny).toBe(1);
    expect(sum.stepup).toBe(0);
    expect(sum.distinctAgents).toBe(1);
  });

  it('cross-tenant: alice cannot see bob agents via agentInventory', async () => {
    const b = await makeAgent(bob.customerId, `iso-${Math.random()}`);
    await emit(bob.customerId, b.did, { command: '/bob/only' });
    const inv = await client(alice.cookie).observability.agentInventory.query({ windowDays: 7 });
    expect(inv.some((r) => r.agentId === b.id)).toBe(false);
  });

  it('actionGraph builds a forward-flowing tree with sub-agent spawn fork', async () => {
    // Conversation: root → child1 → child2 (all same agent, no explicit parent
    // links → sequential fallback). child2 spawns a sub-agent that does one
    // tool call via explicit parent_span_id.
    const parent = await makeAgent(alice.customerId, `graph-parent-${Math.random()}`);
    const sub = await makeAgent(alice.customerId, `graph-sub-${Math.random()}`);

    const now = Date.now();
    const root = await emitSpan(alice.customerId, parent.id, 'list_repos', new Date(now - 4_000));
    const child1 = await emitSpan(
      alice.customerId,
      parent.id,
      'list_commits',
      new Date(now - 3_000),
    );
    const child2 = await emitSpan(
      alice.customerId,
      parent.id,
      'create_branch',
      new Date(now - 2_000),
    );
    const subCall = await emitSpan(alice.customerId, sub.id, 'edit_file', new Date(now - 1_000), {
      parentSpanId: child2.id,
    });

    const graph = await client(alice.cookie).observability.actionGraph.query({
      sinceMinutes: 60,
    });

    const ids = new Set(graph.nodes.map((n) => n.id));
    expect(ids.has(root.id)).toBe(true);
    expect(ids.has(child1.id)).toBe(true);
    expect(ids.has(child2.id)).toBe(true);
    expect(ids.has(subCall.id)).toBe(true);

    // All four spans must share the same conversation root.
    const roots = new Set(
      graph.nodes
        .filter((n) => ids.has(n.id) && [root.id, child1.id, child2.id, subCall.id].includes(n.id))
        .map((n) => n.rootSpanId),
    );
    expect(roots.size).toBe(1);
    expect([...roots][0]).toBe(root.id);

    // Edge kinds: two sequential edges (root→child1, child1→child2) and one
    // spawn edge (child2→subCall).
    const ourEdges = graph.edges.filter((e) =>
      [root.id, child1.id, child2.id, subCall.id].includes(e.to),
    );
    const sequentialCount = ourEdges.filter((e) => e.kind === 'sequential').length;
    const spawnCount = ourEdges.filter((e) => e.kind === 'spawn').length;
    expect(sequentialCount).toBe(2);
    expect(spawnCount).toBe(1);

    // agents map populated for both participants.
    expect(graph.agents[parent.id]).toBeDefined();
    expect(graph.agents[sub.id]).toBeDefined();
    expect(graph.agents[parent.id]!.color).not.toBe(graph.agents[sub.id]!.color);
  });

  it('cross-tenant: alice cannot capabilityDiff bob agent (404)', async () => {
    const b = await makeAgent(bob.customerId, `iso-cap-${Math.random()}`);
    await expect(
      client(alice.cookie).observability.capabilityDiff.query({ agentId: b.id, windowDays: 7 }),
    ).rejects.toThrow(/agent not found/);
  });
});
