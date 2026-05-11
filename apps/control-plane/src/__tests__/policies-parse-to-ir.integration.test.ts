/**
 * Integration: policies.parseToIr (Cedar → visual IR) — every schema-pack
 * template parses (ends up either in `policies` or `unrepresentable`).
 *
 * This is what the dashboard's Visual tab calls on every Cedar edit.
 *
 * Requires postgres (tRPC ctx wants a session). SKIP_DB_TESTS=1 to skip.
 */
import { generateKeypair } from '@auto-nomos/crypto';
import { listTemplates } from '@auto-nomos/schema-packs';
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

describe.skipIf(!RUN)('policies.parseToIr (requires postgres)', () => {
  let db: Db;
  let auth: Auth;
  let app: ReturnType<typeof createServer>;
  let cookie: string;
  let customerId: string;
  let userId: string;
  const logger = pino({ level: 'silent' });
  const kp = generateKeypair();
  const signing = { signKey: kp.privateKey, signerDid: kp.did };

  function client() {
    return createTRPCClient<AppRouter>({
      links: [
        httpBatchLink({
          url: 'http://localhost/trpc',
          transformer: superjson,
          fetch: (url, init) => app.request(url.toString(), init as RequestInit),
          headers: () => ({ cookie }),
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
    app = createServer({ logger, db, auth, signing });

    const email = `parse-${Date.now()}-${Math.random()}@acmecorp.test`;
    const res = await app.request('/auth/sign-up/email', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password: 'long-password-1', name: 'Parse' }),
    });
    expect(res.status).toBe(200);
    cookie = (res.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
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

  it('every schema-pack template returns a non-empty IR (representable + unrepresentable)', async () => {
    for (const t of listTemplates()) {
      const result = await client().policies.parseToIr.query({ cedarText: t.cedarText });
      const total = result.policies.length + result.unrepresentable.length;
      expect(total, `template ${t.id} produced empty IR`).toBeGreaterThan(0);
    }
  });
});
