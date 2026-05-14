/**
 * End-to-end Better-Auth flow against a running postgres.
 * Sign-up MUST create: user row, customer row, owner membership row.
 */
import { eq } from 'drizzle-orm';
import { pino } from 'pino';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type Auth, createAuth } from '../auth/index.js';
import { loadConfig } from '../config.js';
import { createDb, type Db } from '../db/index.js';
import * as schema from '../db/schema.js';
import { createServer } from '../server.js';

const TEST_URL = process.env.TEST_DATABASE_URL ?? 'postgres://cb:cb@localhost:5433/cb_dev';
const RUN = !process.env.SKIP_DB_TESTS;

describe.skipIf(!RUN)('better-auth sign-up + sign-in (requires postgres)', () => {
  let db: Db;
  let auth: Auth;
  let app: ReturnType<typeof createServer>;
  const cleanupCustomerIds: string[] = [];
  const cleanupUserIds: string[] = [];
  const logger = pino({ level: 'silent' });

  beforeAll(async () => {
    db = createDb({ DATABASE_URL: TEST_URL });
    try {
      await db.pool.query('SELECT 1');
    } catch (err) {
      throw new Error(
        `Postgres not reachable at ${TEST_URL}. Run pnpm db:up first. (${(err as Error).message})`,
      );
    }
    const config = loadConfig({ DATABASE_URL: TEST_URL, NODE_ENV: 'test' });
    auth = createAuth({ db: db.drizzle, config, logger });
    app = createServer({ logger, db, auth });
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

  it('sign-up creates user + customer + owner membership atomically', async () => {
    const email = `signup-${Date.now()}-${Math.random()}@acmecorp.test`;
    const res = await app.request('/auth/sign-up/email', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password: 'long-password-1', name: 'Sign Up Tester' }),
    });
    expect(res.status).toBe(200);

    const u = await db.drizzle.query.user.findFirst({ where: eq(schema.user.email, email) });
    expect(u).toBeDefined();
    expect(u?.email).toBe(email);
    cleanupUserIds.push(u!.id);

    const m = await db.drizzle.query.memberships.findFirst({
      where: eq(schema.memberships.userId, u!.id),
    });
    expect(m).toBeDefined();
    expect(m?.role).toBe('owner');
    cleanupCustomerIds.push(m!.customerId);

    const c = await db.drizzle.query.customers.findFirst({
      where: eq(schema.customers.id, m!.customerId),
    });
    expect(c).toBeDefined();
    // Customer name derived from email domain: "acmecorp.test" → "acmecorp".
    expect(c?.name).toBe('acmecorp');
    expect(c?.plan).toBe('free');
  });

  it('sign-up sets a session cookie that get-session resolves back to the user', async () => {
    const email = `session-${Date.now()}-${Math.random()}@example.test`;
    const signUpRes = await app.request('/auth/sign-up/email', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password: 'long-password-1', name: 'Session Tester' }),
    });
    expect(signUpRes.status).toBe(200);
    const setCookie = signUpRes.headers.get('set-cookie');
    expect(setCookie).toBeTruthy();

    const cookieValue = (setCookie ?? '').split(';')[0] ?? '';
    const sessionRes = await app.request('/auth/get-session', {
      headers: { cookie: cookieValue },
    });
    expect(sessionRes.status).toBe(200);
    const body = (await sessionRes.json()) as { user?: { email: string } } | null;
    expect(body?.user?.email).toBe(email);

    const u = await db.drizzle.query.user.findFirst({ where: eq(schema.user.email, email) });
    if (u) cleanupUserIds.push(u.id);
    const m = await db.drizzle.query.memberships.findFirst({
      where: eq(schema.memberships.userId, u!.id),
    });
    if (m) cleanupCustomerIds.push(m.customerId);
  });

  it('rejects duplicate email on second sign-up', async () => {
    const email = `dup-${Date.now()}-${Math.random()}@example.test`;
    const first = await app.request('/auth/sign-up/email', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password: 'long-password-1', name: 'Dup' }),
    });
    expect(first.status).toBe(200);
    const u = await db.drizzle.query.user.findFirst({ where: eq(schema.user.email, email) });
    if (u) cleanupUserIds.push(u.id);
    const m = await db.drizzle.query.memberships.findFirst({
      where: eq(schema.memberships.userId, u!.id),
    });
    if (m) cleanupCustomerIds.push(m.customerId);

    const second = await app.request('/auth/sign-up/email', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password: 'long-password-1', name: 'Dup2' }),
    });
    expect(second.status).toBeGreaterThanOrEqual(400);
  });

  it('sign-in succeeds with correct password', async () => {
    const email = `signin-${Date.now()}-${Math.random()}@example.test`;
    const signUpRes = await app.request('/auth/sign-up/email', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password: 'long-password-1', name: 'Sign In Tester' }),
    });
    expect(signUpRes.status).toBe(200);
    const u = await db.drizzle.query.user.findFirst({ where: eq(schema.user.email, email) });
    if (u) cleanupUserIds.push(u.id);
    const m = await db.drizzle.query.memberships.findFirst({
      where: eq(schema.memberships.userId, u!.id),
    });
    if (m) cleanupCustomerIds.push(m.customerId);

    const signIn = await app.request('/auth/sign-in/email', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password: 'long-password-1' }),
    });
    expect(signIn.status).toBe(200);
    expect(signIn.headers.get('set-cookie')).toBeTruthy();
  });

  it('sign-in fails with wrong password', async () => {
    const email = `wrongpw-${Date.now()}-${Math.random()}@example.test`;
    const signUpRes = await app.request('/auth/sign-up/email', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password: 'long-password-1', name: 'Wrong PW' }),
    });
    expect(signUpRes.status).toBe(200);
    const u = await db.drizzle.query.user.findFirst({ where: eq(schema.user.email, email) });
    if (u) cleanupUserIds.push(u.id);
    const m = await db.drizzle.query.memberships.findFirst({
      where: eq(schema.memberships.userId, u!.id),
    });
    if (m) cleanupCustomerIds.push(m.customerId);

    const signIn = await app.request('/auth/sign-in/email', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password: 'wrong-password-9' }),
    });
    expect(signIn.status).toBeGreaterThanOrEqual(400);
  });
});
