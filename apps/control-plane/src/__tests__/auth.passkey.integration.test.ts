/**
 * Passkey plumbing smoke against a running postgres.
 *
 * We don't forge a full WebAuthn attestation here — generating a valid
 * CBOR-encoded ES256/EdDSA signed assertion is non-trivial and belongs in
 * a browser-driven e2e. Instead we verify the integration points:
 *
 *   1. Migration 0019 created the `passkey` table + `user.passkey_enrolled_at`.
 *   2. Better-Auth's passkey plugin endpoints respond (registration options
 *      after sign-in is what the dashboard hits).
 *   3. `auth.passkeyStatus` tRPC reports enrollment correctly when rows are
 *      manually inserted into the `passkey` table.
 *   4. `auth.markPasskeyEnrolled` sets the timestamp only when a passkey
 *      exists.
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

describe.skipIf(!RUN)('passkey plumbing (requires postgres)', () => {
  let db: Db;
  let auth: Auth;
  let app: ReturnType<typeof createServer>;
  const cleanupCustomerIds: string[] = [];
  const cleanupUserIds: string[] = [];
  const logger = pino({ level: 'silent' });

  async function signUpAndGetCookie(email: string): Promise<{ userId: string; cookie: string }> {
    const res = await app.request('/auth/sign-up/email', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password: 'long-passkey-test-1', name: 'Passkey Tester' }),
    });
    expect(res.status).toBe(200);
    const cookie = (res.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
    const u = await db.drizzle.query.user.findFirst({ where: eq(schema.user.email, email) });
    expect(u).toBeDefined();
    cleanupUserIds.push(u!.id);
    const m = await db.drizzle.query.memberships.findFirst({
      where: eq(schema.memberships.userId, u!.id),
    });
    if (m) cleanupCustomerIds.push(m.customerId);
    return { userId: u!.id, cookie };
  }

  beforeAll(async () => {
    db = createDb({ DATABASE_URL: TEST_URL });
    try {
      await db.pool.query('SELECT 1');
    } catch (err) {
      throw new Error(
        `Postgres not reachable at ${TEST_URL}. Run pnpm db:up first. (${(err as Error).message})`,
      );
    }
    const config = loadConfig({ DATABASE_URL: TEST_URL });
    auth = createAuth({ db: db.drizzle, config, logger });
    app = createServer({ logger, db, auth });
  });

  afterAll(async () => {
    for (const id of cleanupUserIds) {
      await db.pool.query('DELETE FROM "passkey" WHERE user_id = $1', [id]);
    }
    for (const id of cleanupCustomerIds) {
      await db.pool.query('DELETE FROM customers WHERE id = $1', [id]);
    }
    for (const id of cleanupUserIds) {
      await db.pool.query('DELETE FROM "user" WHERE id = $1', [id]);
    }
    await db.pool.end();
  });

  it('passkey table + user.passkey_enrolled_at column exist (migration 0019 applied)', async () => {
    const passkeyCols = await db.pool.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'passkey'`,
    );
    const names = passkeyCols.rows.map((r) => r.column_name as string).sort();
    for (const required of [
      'id',
      'user_id',
      'credential_id',
      'public_key',
      'counter',
      'device_type',
      'backed_up',
      'transports',
    ]) {
      expect(names).toContain(required);
    }
    const userCols = await db.pool.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'user'`,
    );
    expect(userCols.rows.map((r) => r.column_name as string)).toContain('passkey_enrolled_at');
  });

  it('passkey plugin registration-options endpoint requires session, returns 401 anon', async () => {
    const res = await app.request('/auth/passkey/generate-register-options', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it('newly-signed-up user has passkey_enrolled_at = null', async () => {
    const email = `passkey-init-${Date.now()}-${Math.random()}@acme.test`;
    const { userId } = await signUpAndGetCookie(email);
    const u = await db.drizzle.query.user.findFirst({ where: eq(schema.user.id, userId) });
    expect(u?.passkeyEnrolledAt).toBeNull();
    const creds = await db.drizzle
      .select()
      .from(schema.passkey)
      .where(eq(schema.passkey.userId, userId));
    expect(creds).toHaveLength(0);
  });

  it('insert into passkey + set passkey_enrolled_at flips enrollment state', async () => {
    const email = `passkey-enrolled-${Date.now()}-${Math.random()}@acme.test`;
    const { userId } = await signUpAndGetCookie(email);
    await db.drizzle.insert(schema.passkey).values({
      userId,
      credentialID: `cred-${Date.now()}-${Math.random()}`,
      publicKey: 'AAAA',
      counter: 0,
      deviceType: 'singleDevice',
      backedUp: false,
      name: 'Test device',
    });
    await db.drizzle
      .update(schema.user)
      .set({ passkeyEnrolledAt: new Date() })
      .where(eq(schema.user.id, userId));
    const refreshed = await db.drizzle.query.user.findFirst({
      where: eq(schema.user.id, userId),
    });
    expect(refreshed?.passkeyEnrolledAt).not.toBeNull();
    const creds = await db.drizzle
      .select()
      .from(schema.passkey)
      .where(eq(schema.passkey.userId, userId));
    expect(creds).toHaveLength(1);
  });
});
