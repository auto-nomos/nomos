/**
 * Cross-tenant isolation: a user in customer A must NEVER see customer B's
 * agents/policies/UCANs/audit even with a valid session. Tenancy is enforced
 * by `tenantProcedure` (src/trpc/index.ts) which forces every Drizzle query
 * in a tenant-scoped router to include `customerId = ctx.customerId`.
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

describe.skipIf(!RUN)('cross-tenant isolation (requires postgres)', () => {
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
    const email = `${prefix}-${Date.now()}-${Math.random()}@${prefix}corp.test`;
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

    alice = await signUp('alice');
    bob = await signUp('bob');
    expect(alice.customerId).not.toBe(bob.customerId);
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

  it('alice cannot see bob agents in agents.list', async () => {
    const bobAgent = await client(bob.cookie).agents.create.mutate({ name: 'bob-agent' });
    const aliceList = await client(alice.cookie).agents.list.query();
    expect(aliceList.find((a) => a.id === bobAgent.id)).toBeUndefined();
  });

  it('alice cannot update bob agents (404 from tenancy filter)', async () => {
    const bobAgent = await client(bob.cookie).agents.create.mutate({ name: 'bob-only' });
    await expect(
      client(alice.cookie).agents.update.mutate({ id: bobAgent.id, name: 'pwned' }),
    ).rejects.toThrow(/agent not found/);
  });

  it('alice cannot delete bob agents', async () => {
    const bobAgent = await client(bob.cookie).agents.create.mutate({ name: 'bob-target' });
    await expect(client(alice.cookie).agents.delete.mutate({ id: bobAgent.id })).rejects.toThrow(
      /agent not found/,
    );
    const stillThere = await client(bob.cookie).agents.list.query();
    expect(stillThere.find((a) => a.id === bobAgent.id && a.status === 'active')).toBeDefined();
  });

  it('alice cannot get bob policies', async () => {
    const bobPolicy = await client(bob.cookie).policies.upsert.mutate({
      name: 'bob-secret',
      cedarText: 'permit(principal, action, resource);',
    });
    await expect(client(alice.cookie).policies.get.query({ id: bobPolicy.id })).rejects.toThrow(
      /policy not found/,
    );
  });

  it('alice cannot mint UCAN against bob agent', async () => {
    const bobAgent = await client(bob.cookie).agents.create.mutate({ name: 'bob-mint-target' });
    await expect(
      client(alice.cookie).ucans.mint.mutate({
        agentId: bobAgent.id,
        command: '/x/y',
        ttlSeconds: 60,
      }),
    ).rejects.toThrow(/agent .* not found in this customer/);
  });

  it('alice cannot revoke bob UCANs', async () => {
    const bobAgent = await client(bob.cookie).agents.create.mutate({ name: 'bob-rev-target' });
    const bobUcan = await client(bob.cookie).ucans.mint.mutate({
      agentId: bobAgent.id,
      command: '/x/y',
      ttlSeconds: 60,
    });
    await expect(
      client(alice.cookie).ucans.revoke.mutate({ cid: bobUcan.cid, reason: 'pwn' }),
    ).rejects.toThrow(/ucan not found/);
  });

  it("alice's customers.get returns alice's customer, not bob's", async () => {
    const aliceCustomer = await client(alice.cookie).customers.get.query();
    const bobCustomer = await client(bob.cookie).customers.get.query();
    expect(aliceCustomer.id).toBe(alice.customerId);
    expect(bobCustomer.id).toBe(bob.customerId);
    expect(aliceCustomer.id).not.toBe(bobCustomer.id);
  });

  it("alice's customers.update never touches bob's customer row", async () => {
    await client(alice.cookie).customers.update.mutate({ name: 'Alice Renamed' });
    const bobAfter = await client(bob.cookie).customers.get.query();
    expect(bobAfter.name).not.toBe('Alice Renamed');
  });
});
