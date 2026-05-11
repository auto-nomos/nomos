/**
 * Integration: signRootForCustomer / signRootsForAllCustomers persist a
 * verifiable Ed25519 signature over the latest audit_event.hash for each
 * customer that has events.
 *
 * Requires postgres. SKIP_DB_TESTS=1 to skip.
 */
import { randomBytes } from 'node:crypto';
import { generateKeypair, verifyDetached } from '@auto-nomos/crypto';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';
import { eq } from 'drizzle-orm';
import pino from 'pino';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb, type Db } from '../db/index.js';
import * as schema from '../db/schema.js';
import {
  encodeRootHash,
  signRootForCustomer,
  signRootsForAllCustomers,
} from '../services/audit-roots.js';
import { createAuditRootSigner } from '../workers/audit-root-signer.js';

const TEST_URL = process.env.TEST_DATABASE_URL ?? 'postgres://cb:cb@localhost:5433/cb_dev';
const RUN = !process.env.SKIP_DB_TESTS;

const logger = pino({ level: 'silent' });

describe.skipIf(!RUN)('audit roots (requires postgres)', () => {
  let db: Db;
  const cleanupCustomerIds: string[] = [];
  const kp = generateKeypair();
  const signKey = kp.privateKey;
  const verifyKey = kp.publicKey;
  const signingKeyId = kp.did;

  beforeAll(async () => {
    db = createDb({ DATABASE_URL: TEST_URL });
    try {
      await db.pool.query('SELECT 1');
    } catch (err) {
      throw new Error(`Postgres not reachable: ${(err as Error).message}`);
    }
  });

  afterAll(async () => {
    for (const id of cleanupCustomerIds) {
      await db.pool.query('DELETE FROM customers WHERE id = $1', [id]);
    }
    await db.pool.end();
  });

  async function newCustomer(): Promise<string> {
    const [c] = await db.drizzle
      .insert(schema.customers)
      .values({ name: `audit-roots-${Date.now()}-${Math.random()}` })
      .returning();
    cleanupCustomerIds.push(c!.id);
    return c!.id;
  }

  async function emitEvent(
    customerId: string,
    overrides: Partial<typeof schema.auditEvents.$inferInsert> = {},
  ): Promise<{ eventId: string; hash: string }> {
    const hash = bytesToHex(randomBytes(32));
    const [row] = await db.drizzle
      .insert(schema.auditEvents)
      .values({
        customerId,
        agent: 'did:key:z6MkTest',
        decision: 'allow',
        command: '/x/y',
        resource: {},
        context: {},
        prevHash: '0'.repeat(64),
        hash,
        payload: {},
        ...overrides,
      })
      .returning();
    return { eventId: row!.eventId, hash: row!.hash };
  }

  it('signs the latest event hash for a customer; signature verifies', async () => {
    const customerId = await newCustomer();
    await emitEvent(customerId);
    const { eventId: latestId, hash: latestHash } = await emitEvent(customerId, {
      ts: new Date(Date.now() + 1000),
    });

    const result = await signRootForCustomer(customerId, {
      db: db.drizzle,
      signKey,
      signingKeyId,
    });

    expect(result.signed).toBe(true);
    expect(result.rootEventId).toBe(latestId);
    expect(result.rootHash).toBe(latestHash);

    const sigBytes = hexToBytes(result.signature!);
    expect(verifyDetached(verifyKey, encodeRootHash(latestHash), sigBytes)).toBe(true);

    const stored = await db.drizzle.query.auditRoots.findFirst({
      where: eq(schema.auditRoots.rootEventId, latestId),
    });
    expect(stored?.signingKeyId).toBe(signingKeyId);
    expect(stored?.signature).toBe(result.signature);
  });

  it('returns signed=false (no-op) when customer has no audit events', async () => {
    const customerId = await newCustomer();
    const result = await signRootForCustomer(customerId, {
      db: db.drizzle,
      signKey,
      signingKeyId,
    });
    expect(result.signed).toBe(false);
  });

  it('is idempotent — re-signing the same head event inserts nothing', async () => {
    const customerId = await newCustomer();
    await emitEvent(customerId);
    const first = await signRootForCustomer(customerId, {
      db: db.drizzle,
      signKey,
      signingKeyId,
    });
    expect(first.signed).toBe(true);
    const second = await signRootForCustomer(customerId, {
      db: db.drizzle,
      signKey,
      signingKeyId,
    });
    expect(second.signed).toBe(false);
  });

  it('signs roots for every customer that has events', async () => {
    const a = await newCustomer();
    const b = await newCustomer();
    const empty = await newCustomer();
    await emitEvent(a);
    await emitEvent(b);

    const result = await signRootsForAllCustomers({
      db: db.drizzle,
      signKey,
      signingKeyId,
    });
    expect(result.customers).toBeGreaterThanOrEqual(2);
    expect(result.signed).toBeGreaterThanOrEqual(2);

    const aRoot = await db.drizzle.query.auditRoots.findFirst({
      where: eq(schema.auditRoots.customerId, a),
    });
    const bRoot = await db.drizzle.query.auditRoots.findFirst({
      where: eq(schema.auditRoots.customerId, b),
    });
    const emptyRoot = await db.drizzle.query.auditRoots.findFirst({
      where: eq(schema.auditRoots.customerId, empty),
    });
    expect(aRoot).toBeDefined();
    expect(bRoot).toBeDefined();
    expect(emptyRoot).toBeUndefined();
  });

  it('worker.runOnce signs every customer that has events', async () => {
    const a = await newCustomer();
    await emitEvent(a);
    const worker = createAuditRootSigner({
      db: db.drizzle,
      signKey,
      signingKeyId,
      logger,
      intervalMs: 60_000,
    });
    const result = await worker.runOnce();
    expect(result.signed).toBeGreaterThanOrEqual(1);
    worker.stop();
  });
});
