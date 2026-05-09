/**
 * Sprint 8: ucans.revoke fires the revocation publisher exactly once on
 * successful revoke and skips it when the row was already revoked.
 *
 * Requires postgres. SKIP_DB_TESTS=1 to skip.
 */
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import { eq } from 'drizzle-orm';
import { pino } from 'pino';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { type Auth, createAuth } from '../auth/index.js';
import { loadConfig } from '../config.js';
import { createDb, type Db } from '../db/index.js';
import * as schema from '../db/schema.js';
import { createServer } from '../server.js';
import type { RevocationPublisher } from '../services/revocation-publisher.js';
import type { AppRouter } from '../trpc/router.js';

const TEST_URL = process.env.TEST_DATABASE_URL ?? 'postgres://cb:cb@localhost:5433/cb_dev';
const RUN = !process.env.SKIP_DB_TESTS;

describe.skipIf(!RUN)('ucans.revoke push (requires postgres)', () => {
  let db: Db;
  let auth: Auth;
  let app: ReturnType<typeof createServer>;
  let cookie: string;
  let customerId: string;
  let userId: string;
  const publisher: RevocationPublisher = {
    publish: vi.fn(async () => ({ succeeded: 1, failed: 0 })),
  };
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
    app = createServer({ logger, db, auth, revocationPublisher: publisher });

    const email = `revoke-push-${Date.now()}-${Math.random()}@test.test`;
    const signUp = await app.request('/auth/sign-up/email', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password: 'long-password-1', name: 'Revoke Tester' }),
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

  it('publishes once on successful revoke; not again on duplicate revoke', async () => {
    const agent = await client().agents.create.mutate({ name: 'revoke-push-agent' });
    const ucan = await client().ucans.mint.mutate({
      agentId: agent.id,
      command: '/x/y',
      ttlSeconds: 600,
      nonce: 'revoke-push-test',
    });

    (publisher.publish as ReturnType<typeof vi.fn>).mockClear();

    const first = await client().ucans.revoke.mutate({ cid: ucan.cid, reason: 'first' });
    expect(first.revoked).toBe(true);
    expect(publisher.publish).toHaveBeenCalledTimes(1);
    expect(publisher.publish).toHaveBeenCalledWith(customerId, ucan.cid);

    const second = await client().ucans.revoke.mutate({ cid: ucan.cid });
    expect(second.revoked).toBe(false);
    // Already revoked -> publisher should NOT be invoked again.
    expect(publisher.publish).toHaveBeenCalledTimes(1);
  });
});
