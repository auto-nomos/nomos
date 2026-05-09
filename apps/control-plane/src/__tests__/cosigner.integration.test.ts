/**
 * Sprint 9.3: cosigner UCAN minting binds a push_approvals row to a JWT
 * the PDP later validates against the original UCAN cid.
 *
 * Requires postgres. SKIP_DB_TESTS=1 to skip.
 */
import { generateKeypair } from '@credential-broker/crypto';
import { computeCid, parseUcanJwt, validateUcan } from '@credential-broker/ucan';
import { eq } from 'drizzle-orm';
import { pino } from 'pino';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type Auth, createAuth } from '../auth/index.js';
import { loadConfig } from '../config.js';
import { createDb, type Db } from '../db/index.js';
import * as schema from '../db/schema.js';
import {
  CosignerError,
  denyApproval,
  mintCosignerForApproval,
} from '../services/stepup/cosigner.js';

const TEST_URL = process.env.TEST_DATABASE_URL ?? 'postgres://cb:cb@localhost:5433/cb_dev';
const RUN = !process.env.SKIP_DB_TESTS;

describe.skipIf(!RUN)('cosigner mint (requires postgres)', () => {
  let db: Db;
  let auth: Auth;
  let customerId: string;
  let userId: string;
  let agentId: string;
  const signing = generateKeypair();
  const logger = pino({ level: 'silent' });

  beforeAll(async () => {
    db = createDb({ DATABASE_URL: TEST_URL });
    await db.pool.query('SELECT 1');
    const config = loadConfig({ DATABASE_URL: TEST_URL });
    auth = createAuth({ db: db.drizzle, config, logger });
    const email = `cosigner-int-${Date.now()}-${Math.random()}@test.test`;
    const _ = auth; // suppress unused
    const signUpRes = await fetch('http://localhost:0', {}).catch(() => null);
    void signUpRes;
    const [u] = await db.drizzle
      .insert(schema.user)
      .values({
        id: crypto.randomUUID(),
        name: 'Cosigner Tester',
        email,
        emailVerified: true,
      })
      .returning({ id: schema.user.id });
    userId = u!.id;
    const [c] = await db.drizzle
      .insert(schema.customers)
      .values({ name: 'cosigner-cust' })
      .returning({ id: schema.customers.id });
    customerId = c!.id;
    await db.drizzle.insert(schema.memberships).values({ userId, customerId, role: 'owner' });
    const [a] = await db.drizzle
      .insert(schema.agents)
      .values({
        customerId,
        name: 'cosigner-agent',
        did: 'did:key:z6MkCosignerAgent',
        status: 'active',
      })
      .returning({ id: schema.agents.id });
    agentId = a!.id;
  });

  afterAll(async () => {
    await db.pool.query('DELETE FROM agents WHERE customer_id = $1', [customerId]);
    await db.pool.query('DELETE FROM customers WHERE id = $1', [customerId]);
    await db.pool.query('DELETE FROM "user" WHERE id = $1', [userId]);
    await db.pool.end();
  });

  async function createApproval(originalUcanCid?: string): Promise<string> {
    const [row] = await db.drizzle
      .insert(schema.pushApprovals)
      .values({
        customerId,
        agentId,
        command: '/stripe/charge',
        resource: { amount: 250 },
        state: 'pending',
        expiresAt: new Date(Date.now() + 60_000),
        ...(originalUcanCid ? { originalUcanCid } : {}),
      })
      .returning({ id: schema.pushApprovals.id });
    return row!.id;
  }

  it('mints a cosigner UCAN bound to original cid; updates approval state', async () => {
    const origCid = 'b' + 'a'.repeat(46);
    const approvalId = await createApproval(origCid);
    const result = await mintCosignerForApproval(
      {
        approvalId,
        customerId,
        decidingUserId: userId,
        nonce: 'cos-1',
      },
      { db: db.drizzle, signKey: signing.privateKey, signerDid: signing.did },
    );

    expect(result.cosignerJwt.split('.')).toHaveLength(3);
    expect(result.cosignerCid).toBe(computeCid(result.cosignerJwt));
    const parsed = parseUcanJwt(result.cosignerJwt);
    if ('error' in parsed) throw new Error('parse failed');
    expect(parsed.payload.iss).toBe(signing.did);
    expect(parsed.payload.aud).toBe('did:key:z6MkCosignerAgent');
    expect(parsed.payload.cmd).toBe('/stripe/charge');
    expect(parsed.payload.meta?.cosigner_for).toBe(origCid);
    expect(parsed.payload.meta?.approval_id).toBe(approvalId);
    expect(parsed.payload.meta?.decided_by).toBe(userId);

    const validated = validateUcan(result.cosignerJwt, { expectedCommand: '/stripe/charge' });
    expect(validated.valid).toBe(true);

    const [row] = await db.drizzle
      .select()
      .from(schema.pushApprovals)
      .where(eq(schema.pushApprovals.id, approvalId));
    expect(row?.state).toBe('approved');
    expect(row?.decidedBy).toBe(userId);
    expect(row?.cosignerAttestationJwt).toBe(result.cosignerJwt);
  });

  it('rejects mint when approval already approved', async () => {
    const approvalId = await createApproval('b' + 'b'.repeat(46));
    await mintCosignerForApproval(
      { approvalId, customerId, decidingUserId: userId, nonce: 'cos-2' },
      { db: db.drizzle, signKey: signing.privateKey, signerDid: signing.did },
    );
    await expect(
      mintCosignerForApproval(
        { approvalId, customerId, decidingUserId: userId, nonce: 'cos-3' },
        { db: db.drizzle, signKey: signing.privateKey, signerDid: signing.did },
      ),
    ).rejects.toBeInstanceOf(CosignerError);
  });

  it('rejects mint when approval has no original_ucan_cid', async () => {
    const approvalId = await createApproval(); // no cid
    await expect(
      mintCosignerForApproval(
        { approvalId, customerId, decidingUserId: userId, nonce: 'cos-4' },
        { db: db.drizzle, signKey: signing.privateKey, signerDid: signing.did },
      ),
    ).rejects.toMatchObject({ code: 'no_original_cid' });
  });

  it('denyApproval flips pending → denied; idempotent', async () => {
    const approvalId = await createApproval('b' + 'c'.repeat(46));
    const first = await denyApproval(approvalId, customerId, userId, db.drizzle);
    expect(first.ok).toBe(true);
    const second = await denyApproval(approvalId, customerId, userId, db.drizzle);
    expect(second.ok).toBe(false);
    const [row] = await db.drizzle
      .select()
      .from(schema.pushApprovals)
      .where(eq(schema.pushApprovals.id, approvalId));
    expect(row?.state).toBe('denied');
  });
});
