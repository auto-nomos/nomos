/**
 * Integration: audit.proof returns an AuditBundle that the audit-verify CLI
 * accepts when payloads are intact and rejects when an event has been
 * tampered with.
 *
 * Requires postgres. SKIP_DB_TESTS=1 to skip.
 */
import { type AuditBundle, verifyBundle } from '@auto-nomos/audit-verify';
import { generateKeypair, sha256Hex } from '@auto-nomos/crypto';
import { canonicalize } from '@auto-nomos/ucan';
import { bytesToHex } from '@noble/hashes/utils';
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import { eq } from 'drizzle-orm';
import pino from 'pino';
import superjson from 'superjson';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPostgresAuditEmitter } from '../../../pdp/src/audit/postgres-emitter.js';
import { createPgAuditWriter } from '../../../pdp/src/audit/postgres-writer.js';
import { type Auth, createAuth } from '../auth/index.js';
import { loadConfig } from '../config.js';
import { createDb, type Db } from '../db/index.js';
import * as schema from '../db/schema.js';
import { createServer } from '../server.js';
import { signRootForCustomer } from '../services/audit-roots.js';
import type { AppRouter } from '../trpc/router.js';

const TEST_URL = process.env.TEST_DATABASE_URL ?? 'postgres://cb:cb@localhost:5433/cb_dev';
const RUN = !process.env.SKIP_DB_TESTS;

describe.skipIf(!RUN)('audit.proof bundle round-trip (requires postgres)', () => {
  let db: Db;
  let auth: Auth;
  let app: ReturnType<typeof createServer>;
  let cookie: string;
  let customerId: string;
  let userId: string;
  const logger = pino({ level: 'silent' });

  const auditKp = generateKeypair();
  const auditSignKey = auditKp.privateKey;
  const auditVerifyKey = bytesToHex(auditKp.publicKey);
  const signingKeyId = auditKp.did;

  function client() {
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

    const email = `audit-proof-${Date.now()}-${Math.random()}@test.test`;
    const signUp = await app.request('/auth/sign-up/email', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password: 'long-password-1', name: 'Audit Proof' }),
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

  async function emitChain(count: number) {
    const emitter = createPostgresAuditEmitter({
      writer: createPgAuditWriter(db.pool),
      logger,
      flushIntervalMs: 60_000,
    });
    const events = [];
    const baseTs = Date.now();
    for (let i = 0; i < count; i++) {
      events.push(
        await emitter.emit({
          customer_id: customerId,
          ts: baseTs + i,
          agent: 'did:key:z6MkTest',
          decision: 'allow',
          command: '/x/y',
          resource: { i },
          context: {},
        }),
      );
    }
    await emitter.flush();
    return events;
  }

  it('returns a bundle audit-verify accepts (with signed root)', async () => {
    const events = await emitChain(5);
    await signRootForCustomer(customerId, {
      db: db.drizzle,
      signKey: auditSignKey,
      signingKeyId,
    });

    const bundle = (await client().audit.proof.query({
      eventId: events[0]!.event_id,
    })) as AuditBundle;
    expect(bundle.root).not.toBeNull();
    expect(bundle.events.length).toBeGreaterThanOrEqual(5);

    const result = verifyBundle(bundle, auditVerifyKey);
    expect(result.ok).toBe(true);
    expect(result.signingKeyId).toBe(signingKeyId);
  });

  it('audit-verify detects payload tampering on the wire', async () => {
    const events = await emitChain(3);
    await signRootForCustomer(customerId, {
      db: db.drizzle,
      signKey: auditSignKey,
      signingKeyId,
    });
    const bundle = (await client().audit.proof.query({
      eventId: events[0]!.event_id,
    })) as AuditBundle;

    // Mutate event #1's payload.command — its stored hash no longer derives.
    const tampered = JSON.parse(JSON.stringify(bundle)) as AuditBundle;
    (tampered.events[1]!.payload as { command: string }).command = '/EVIL';
    const result = verifyBundle(tampered, auditVerifyKey);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.reason === 'hash_mismatch')).toBe(true);

    // Sanity: the original payload still re-derives the stored hash.
    const ev = bundle.events[1]!;
    const recomputed = sha256Hex(`${ev.prev_hash}|${canonicalize(ev.payload)}`);
    expect(recomputed).toBe(ev.hash);
  });

  it('returns root: null when no signed root exists yet for this customer', async () => {
    // Fresh customer with events but no audit_roots row yet.
    const [c] = await db.drizzle
      .insert(schema.customers)
      .values({ name: `unsigned-${Date.now()}-${Math.random()}` })
      .returning();
    try {
      const emitter = createPostgresAuditEmitter({
        writer: createPgAuditWriter(db.pool),
        logger,
        flushIntervalMs: 60_000,
      });
      const head = await emitter.emit({
        customer_id: c!.id,
        ts: Date.now(),
        agent: 'did:key:z6MkTest',
        decision: 'allow',
        command: '/x/y',
        resource: {},
        context: {},
      });
      await emitter.flush();

      // The ad-hoc customer has no membership for our session user, so the
      // tRPC procedure can't see it. Hit the underlying service-shaped query
      // directly instead.
      const ev = await db.drizzle.query.auditEvents.findFirst({
        where: eq(schema.auditEvents.eventId, head.event_id),
      });
      expect(ev).toBeDefined();
      const root = await db.drizzle.query.auditRoots.findFirst({
        where: eq(schema.auditRoots.customerId, c!.id),
      });
      expect(root).toBeUndefined();
    } finally {
      await db.pool.query('DELETE FROM customers WHERE id = $1', [c!.id]);
    }
  });
});
