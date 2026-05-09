/**
 * Signed-bundle delivery + revocation list endpoint.
 *
 * Covers:
 * - signed bundle round-trip (sign here → verify in test using known pubkey)
 * - bundle reflects committed policies for the customer (no cross-tenant leak)
 * - revocations endpoint reflects revoked CIDs
 * - bearer-token gate rejects missing/wrong tokens
 */
import { generateKeypair, sha256Hex, verifyDetached } from '@credential-broker/crypto';
import { base64urlToBytes, canonicalize } from '@credential-broker/ucan';
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
const SERVICE_TOKEN = 'bundle-test-token';

interface SignedBundleResponse {
  bundle: {
    customer_id: string;
    version: number;
    generated_at: string;
    policies: {
      id: string;
      name: string;
      cedarText: string;
      integrationId: string | null;
      version: number;
    }[];
    schema_hash: string;
  };
  signature: string;
  signerDid: string;
}

describe.skipIf(!RUN)('signed bundle + revocations (requires postgres)', () => {
  let db: Db;
  let auth: Auth;
  let app: ReturnType<typeof createServer>;
  let cookie: string;
  let customerId: string;
  let userId: string;
  const cleanupCustomerIds: string[] = [];
  const cleanupUserIds: string[] = [];
  const logger = pino({ level: 'silent' });
  const signKp = generateKeypair();

  function client(c: string) {
    return createTRPCClient<AppRouter>({
      links: [
        httpBatchLink({
          url: 'http://localhost/trpc',
          transformer: superjson,
          fetch: (url, init) => app.request(url.toString(), init as RequestInit),
          headers: () => (c ? { cookie: c } : {}),
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
    app = createServer({
      logger,
      db,
      auth,
      signing: { signKey: signKp.privateKey, signerDid: signKp.did },
      internal: { serviceToken: SERVICE_TOKEN },
    });

    const email = `bundle-${Date.now()}-${Math.random()}@bundlecorp.test`;
    const signUp = await app.request('/auth/sign-up/email', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password: 'long-password-1', name: 'Bundle Tester' }),
    });
    expect(signUp.status).toBe(200);
    cookie = (signUp.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
    const u = await db.drizzle.query.user.findFirst({ where: eq(schema.user.email, email) });
    userId = u!.id;
    const m = await db.drizzle.query.memberships.findFirst({
      where: eq(schema.memberships.userId, userId),
    });
    customerId = m!.customerId;
    cleanupCustomerIds.push(customerId);
    cleanupUserIds.push(userId);
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

  it('GET /v1/internal/bundles/:customerId requires bearer token', async () => {
    const noAuth = await app.request(`/v1/internal/bundles/${customerId}`);
    expect(noAuth.status).toBe(401);

    const wrongAuth = await app.request(`/v1/internal/bundles/${customerId}`, {
      headers: { authorization: 'Bearer not-the-real-token' },
    });
    expect(wrongAuth.status).toBe(401);
  });

  it('returns a valid signed bundle reflecting committed policies', async () => {
    await client(cookie).policies.upsert.mutate({
      name: 'p1',
      cedarText: 'permit(principal, action == Action::"/x/y", resource);',
    });
    await client(cookie).policies.upsert.mutate({
      name: 'p2',
      cedarText: 'forbid(principal, action == Action::"/danger/*", resource);',
    });

    const res = await app.request(`/v1/internal/bundles/${customerId}`, {
      headers: { authorization: `Bearer ${SERVICE_TOKEN}` },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as SignedBundleResponse;

    expect(body.bundle.customer_id).toBe(customerId);
    expect(body.bundle.policies.length).toBeGreaterThanOrEqual(2);
    expect(body.bundle.policies.find((p) => p.name === 'p1')).toBeDefined();
    expect(body.signerDid).toBe(signKp.did);
    expect(body.bundle.schema_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(body.bundle.schema_hash).toBe(sha256Hex(canonicalize({ schemas: [] })));

    // Verify Ed25519 signature against the canonicalized bundle body using
    // the public key counterpart of signKp.
    const sig = base64urlToBytes(body.signature);
    const payload = new TextEncoder().encode(canonicalize(body.bundle));
    expect(verifyDetached(signKp.publicKey, payload, sig)).toBe(true);

    // Tampering with the bundle invalidates the signature.
    const tampered = { ...body.bundle, customer_id: 'attacker' };
    const tamperedPayload = new TextEncoder().encode(canonicalize(tampered));
    expect(verifyDetached(signKp.publicKey, tamperedPayload, sig)).toBe(false);
  });

  it('GET /v1/internal/revocations/:customerId returns revoked CIDs', async () => {
    const agent = await client(cookie).agents.create.mutate({ name: 'rev-agent' });
    const ucan = await client(cookie).ucans.mint.mutate({
      agentId: agent.id,
      command: '/x/y',
      ttlSeconds: 600,
    });

    const before = await app.request(`/v1/internal/revocations/${customerId}`, {
      headers: { authorization: `Bearer ${SERVICE_TOKEN}` },
    });
    expect(before.status).toBe(200);
    const beforeBody = (await before.json()) as { customer_id: string; revoked: string[] };
    expect(beforeBody.revoked).not.toContain(ucan.cid);

    await client(cookie).ucans.revoke.mutate({ cid: ucan.cid });

    const after = await app.request(`/v1/internal/revocations/${customerId}`, {
      headers: { authorization: `Bearer ${SERVICE_TOKEN}` },
    });
    const afterBody = (await after.json()) as { customer_id: string; revoked: string[] };
    expect(afterBody.revoked).toContain(ucan.cid);
  });
});
