/**
 * tRPC integration test against running postgres + Better-Auth.
 *
 * Sign up → grab session cookie → exercise each router via the tRPC client
 * pointed at our in-memory Hono server (Hono's `app.request` is fetch-shaped).
 */
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import { eq } from 'drizzle-orm';
import { pino } from 'pino';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type Auth, createAuth } from '../auth/index.js';
import { loadConfig } from '../config.js';
import { createDb, type Db } from '../db/index.js';
import * as schema from '../db/schema.js';
import { createServer } from '../server.js';
import type { AppRouter } from '../trpc/router.js';

const TEST_URL = process.env.TEST_DATABASE_URL ?? 'postgres://cb:cb@localhost:5433/cb_dev';
const RUN = !process.env.SKIP_DB_TESTS;

describe.skipIf(!RUN)('tRPC routers (requires postgres)', () => {
  let db: Db;
  let auth: Auth;
  let app: ReturnType<typeof createServer>;
  let cookie: string;
  let customerId: string;
  let userId: string;
  const logger = pino({ level: 'silent' });

  function client() {
    return createTRPCClient<AppRouter>({
      links: [
        httpBatchLink({
          url: 'http://localhost/trpc',
          fetch: (url, init) => app.request(url.toString(), init as RequestInit),
          headers: () => (cookie ? { cookie } : {}),
        }),
      ],
    });
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

    const email = `trpc-${Date.now()}-${Math.random()}@trpctest.test`;
    const signUp = await app.request('/auth/sign-up/email', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password: 'long-password-1', name: 'tRPC Tester' }),
    });
    expect(signUp.status).toBe(200);
    cookie = (signUp.headers.get('set-cookie') ?? '').split(';')[0] ?? '';

    const u = await db.drizzle.query.user.findFirst({ where: eq(schema.user.email, email) });
    userId = u!.id;
    const m = await db.drizzle.query.memberships.findFirst({
      where: eq(schema.memberships.userId, userId),
    });
    customerId = m!.customerId;
  });

  afterAll(async () => {
    await db.pool.query('DELETE FROM customers WHERE id = $1', [customerId]);
    await db.pool.query('DELETE FROM "user" WHERE id = $1', [userId]);
    await db.pool.end();
  });

  it('customers.get returns the active customer', async () => {
    const c = await client().customers.get.query();
    expect(c.id).toBe(customerId);
    expect(c.plan).toBe('free');
  });

  it('customers.update changes name', async () => {
    const updated = await client().customers.update.mutate({ name: 'Renamed Org' });
    expect(updated.name).toBe('Renamed Org');
  });

  it('agents create / list / update / delete round-trip', async () => {
    const created = await client().agents.create.mutate({ name: 'release-bot' });
    expect(created.name).toBe('release-bot');
    expect(created.did).toMatch(/^did:key:z6Mk/);
    expect(created.status).toBe('active');

    const list = await client().agents.list.query();
    expect(list.some((a) => a.id === created.id)).toBe(true);

    const renamed = await client().agents.update.mutate({ id: created.id, name: 'release-bot-2' });
    expect(renamed.name).toBe('release-bot-2');

    const deleted = await client().agents.delete.mutate({ id: created.id });
    expect(deleted.deleted).toBe(true);
  });

  it('policies.upsert validates Cedar before persisting', async () => {
    const valid = `permit(principal, action == Action::"/x/y", resource);`;
    const created = await client().policies.upsert.mutate({
      name: 'p1',
      cedarText: valid,
    });
    expect(created.cedarText).toContain('permit');

    await expect(
      client().policies.upsert.mutate({ name: 'bad', cedarText: 'not valid cedar' }),
    ).rejects.toThrow(/cedar parse errors/);
  });

  it('policies.preview reports parse errors without persisting', async () => {
    const ok = await client().policies.preview.query({
      cedarText: 'permit(principal, action, resource);',
    });
    expect(ok.ok).toBe(true);

    const bad = await client().policies.preview.query({ cedarText: 'garbage syntax' });
    expect(bad.ok).toBe(false);
    expect(bad.errors.length).toBeGreaterThan(0);
  });

  it('schemas.list / get return registry entries', async () => {
    const list = await client().schemas.list.query();
    expect(list.find((s) => s.id === 'github@v1')).toBeDefined();
    const one = await client().schemas.get.query({ id: 'github@v1' });
    expect(one.name).toBe('GitHub');
  });

  it('ucans.mint creates a UCAN bound to an active agent', async () => {
    const agent = await client().agents.create.mutate({ name: 'mint-test' });
    const ucan = await client().ucans.mint.mutate({
      agentId: agent.id,
      command: '/github/issue/create',
      ttlSeconds: 600,
      nonce: 'trpc-test',
    });
    expect(ucan.cid).toBeTruthy();
    expect(ucan.jwt.split('.')).toHaveLength(3);
    // Without a transformer (superjson) the JSON wire format yields ISO strings.
    expect(typeof ucan.expiresAt === 'string' || ucan.expiresAt instanceof Date).toBe(true);
    expect(new Date(ucan.expiresAt).getTime()).toBeGreaterThan(Date.now());

    const listed = await client().ucans.list.query({ agentId: agent.id });
    expect(listed.find((u) => u.cid === ucan.cid)).toBeDefined();

    const revoked = await client().ucans.revoke.mutate({ cid: ucan.cid, reason: 'unit test' });
    expect(revoked.revoked).toBe(true);
  });

  it('ucans.mint refuses non-existent / wrong-tenant agent', async () => {
    await expect(
      client().ucans.mint.mutate({
        agentId: '00000000-0000-0000-0000-000000000000',
        command: '/x/y',
      }),
    ).rejects.toThrow(/agent .* not found in this customer/);
  });

  it('audit.list returns paginated events for the tenant (empty in fresh tenant)', async () => {
    const rows = await client().audit.list.query({ limit: 10 });
    expect(Array.isArray(rows)).toBe(true);
  });

  it('audit.proof returns 404 for unknown eventId', async () => {
    await expect(
      client().audit.proof.query({ eventId: '00000000-0000-0000-0000-000000000000' }),
    ).rejects.toThrow(/audit event not found/);
  });

  it('unauthenticated tRPC call is rejected', async () => {
    const cookieBackup = cookie;
    cookie = '';
    await expect(client().customers.get.query()).rejects.toThrow();
    cookie = cookieBackup;
  });
});
