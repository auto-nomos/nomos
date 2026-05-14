/**
 * Integration: policies.dryRun evaluates the saved Cedar text against a
 * synthetic UCAN without persisting.
 *
 * Requires postgres. SKIP_DB_TESTS=1 to skip.
 */
import { generateKeypair } from '@auto-nomos/crypto';
import { createTRPCClient, httpBatchLink, type TRPCClientError } from '@trpc/client';
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

describe.skipIf(!RUN)('policies.dryRun (requires postgres)', () => {
  let db: Db;
  let auth: Auth;
  let app: ReturnType<typeof createServer>;
  const cleanupCustomerIds: string[] = [];
  const cleanupUserIds: string[] = [];
  const logger = pino({ level: 'silent' });
  const kp = generateKeypair();
  const signing = { signKey: kp.privateKey, signerDid: kp.did };

  function client(cookie: string) {
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
    const config = loadConfig({ DATABASE_URL: TEST_URL, NODE_ENV: 'test' });
    auth = createAuth({ db: db.drizzle, config, logger });
    app = createServer({ logger, db, auth, signing });
    await db.drizzle
      .insert(schema.schemas)
      .values({ id: 'github', version: 'v1', definition: {}, schemaHash: '' })
      .onConflictDoNothing();
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

  async function signUp(): Promise<{ cookie: string; customerId: string }> {
    const email = `dryrun-${Date.now()}-${Math.random()}@acmecorp.test`;
    const res = await app.request('/auth/sign-up/email', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password: 'long-password-1', name: 'DryRun' }),
    });
    expect(res.status).toBe(200);
    const cookie = (res.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
    const u = await db.drizzle.query.user.findFirst({ where: eq(schema.user.email, email) });
    cleanupUserIds.push(u!.id);
    const m = await db.drizzle.query.memberships.findFirst({
      where: eq(schema.memberships.userId, u!.id),
    });
    cleanupCustomerIds.push(m!.customerId);
    return { cookie, customerId: m!.customerId };
  }

  async function insertPolicy(
    customerId: string,
    cedarText: string,
    integrationId?: string,
  ): Promise<string> {
    const [p] = await db.drizzle
      .insert(schema.policies)
      .values({
        customerId,
        name: `dryrun-${Math.random()}`,
        cedarText,
        ...(integrationId ? { integrationId } : {}),
      })
      .returning();
    return p!.id;
  }

  it('returns allow when the policy permits the command', async () => {
    const { cookie, customerId } = await signUp();
    const cedar = `permit (
  principal,
  action == Action::"/github/repo/read",
  resource
);`;
    const policyId = await insertPolicy(customerId, cedar, 'github');

    const result = await client(cookie).policies.dryRun.mutate({
      policyId,
      command: '/github/repo/read',
      resource: { repo: 'acme/billing' },
      context: {},
    });
    expect(result.allow).toBe(true);
    expect(result.receiptId).toBeTruthy();
  });

  it('returns deny when the policy does not permit the command', async () => {
    const { cookie, customerId } = await signUp();
    const cedar = `permit (
  principal,
  action == Action::"/github/repo/read",
  resource
);`;
    const policyId = await insertPolicy(customerId, cedar, 'github');

    const result = await client(cookie).policies.dryRun.mutate({
      policyId,
      command: '/github/issue/create',
      resource: { repo: 'acme/billing' },
      context: {},
    });
    expect(result.allow).toBe(false);
    expect(result.reason).toBe('policy_denied');
  });

  it('returns NOT_FOUND when the policy belongs to a different customer', async () => {
    const a = await signUp();
    const b = await signUp();
    const policyId = await insertPolicy(
      a.customerId,
      'permit (principal, action, resource);',
      'github',
    );

    await expect(
      client(b.cookie).policies.dryRun.mutate({
        policyId,
        command: '/github/repo/read',
        resource: {},
        context: {},
      }),
    ).rejects.toMatchObject({
      data: { code: 'NOT_FOUND' },
    } satisfies Partial<TRPCClientError<AppRouter>>);
  });
});
