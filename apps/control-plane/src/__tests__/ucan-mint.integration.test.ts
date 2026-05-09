/**
 * Integration: ucan-mint service binds UCANs to OAuth grants + policies and
 * refuses cross-tenant connection ids.
 *
 * Requires postgres. SKIP_DB_TESTS=1 to skip.
 */
import { generateKeypair, generateSecretboxKeyHex } from '@credential-broker/crypto';
import { hexToBytes } from '@noble/hashes/utils';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb, type Db } from '../db/index.js';
import * as schema from '../db/schema.js';
import { saveConnection } from '../oauth/tokens.js';
import { MintError, mintUcan } from '../services/ucan-mint.js';

const TEST_URL = process.env.TEST_DATABASE_URL ?? 'postgres://cb:cb@localhost:5433/cb_dev';
const RUN = !process.env.SKIP_DB_TESTS;

describe.skipIf(!RUN)('mintUcan service (requires postgres)', () => {
  let db: Db;
  const cleanupCustomerIds: string[] = [];
  const kp = generateKeypair();
  const signing = { signKey: kp.privateKey, signerDid: kp.did };
  const encryptionKey = hexToBytes(generateSecretboxKeyHex());

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
      .values({ name: `mint-${Date.now()}-${Math.random()}` })
      .returning();
    if (!c) throw new Error('customer insert returned no row');
    cleanupCustomerIds.push(c.id);
    return c.id;
  }

  async function newAgent(
    customerId: string,
    overrides: Partial<typeof schema.agents.$inferInsert> = {},
  ): Promise<string> {
    const [a] = await db.drizzle
      .insert(schema.agents)
      .values({
        customerId,
        name: `agent-${Math.random()}`,
        did: `did:key:test-${Date.now()}-${Math.random()}`,
        ...overrides,
      })
      .returning();
    if (!a) throw new Error('agent insert returned no row');
    return a.id;
  }

  it('mints a valid UCAN with meta.oauth_connection_id when supplied', async () => {
    const customerId = await newCustomer();
    const agentId = await newAgent(customerId);
    const conn = await saveConnection(
      { db: db.drizzle, encryptionKey },
      {
        customerId,
        connector: 'github',
        tokens: {
          accessToken: 'gho_x',
          refreshToken: 'ghr_x',
          accessTokenExpiresAt: null,
          refreshTokenExpiresAt: null,
          scopesGranted: ['repo'],
          accountId: 'octocat',
        },
      },
    );

    const result = await mintUcan(
      {
        customerId,
        agentId,
        command: '/github/issue/create',
        oauthConnectionId: conn.id,
        ttlSeconds: 3600,
        nonce: 'mint-test-1',
      },
      { db: db.drizzle, ...signing },
    );

    expect(result.cid).toBeTruthy();
    expect(result.jwt.split('.')).toHaveLength(3);
    expect(result.payload.iss).toBe(signing.signerDid);
    expect(result.payload.cmd).toBe('/github/issue/create');
    expect(result.payload.meta).toEqual({ agent_id: agentId, oauth_connection_id: conn.id });
    expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now());

    const stored = await db.drizzle.query.ucanIssues.findFirst({
      where: eq(schema.ucanIssues.cid, result.cid),
    });
    expect(stored?.customerId).toBe(customerId);
    expect(stored?.agentId).toBe(agentId);
  });

  it('rejects mint with oauth_connection from a different customer', async () => {
    const cidA = await newCustomer();
    const cidB = await newCustomer();
    const agentB = await newAgent(cidB);
    const connA = await saveConnection(
      { db: db.drizzle, encryptionKey },
      {
        customerId: cidA,
        connector: 'github',
        tokens: {
          accessToken: 'gho_a',
          refreshToken: 'ghr_a',
          accessTokenExpiresAt: null,
          refreshTokenExpiresAt: null,
          scopesGranted: [],
          accountId: 'octocat-a',
        },
      },
    );

    await expect(
      mintUcan(
        {
          customerId: cidB,
          agentId: agentB,
          command: '/github/issue/create',
          oauthConnectionId: connA.id,
          ttlSeconds: 60,
          nonce: 'cross-tenant',
        },
        { db: db.drizzle, ...signing },
      ),
    ).rejects.toMatchObject({ name: 'MintError', code: 'oauth_connection_other_customer' });
  });

  it('rejects mint with non-existent oauth_connection_id', async () => {
    const customerId = await newCustomer();
    const agentId = await newAgent(customerId);
    await expect(
      mintUcan(
        {
          customerId,
          agentId,
          command: '/x/y',
          oauthConnectionId: '00000000-0000-0000-0000-000000000000',
          ttlSeconds: 60,
          nonce: 'no-conn',
        },
        { db: db.drizzle, ...signing },
      ),
    ).rejects.toBeInstanceOf(MintError);
  });

  it('rejects mint with non-existent policy_id', async () => {
    const customerId = await newCustomer();
    const agentId = await newAgent(customerId);
    await expect(
      mintUcan(
        {
          customerId,
          agentId,
          command: '/x/y',
          policyId: '00000000-0000-0000-0000-000000000000',
          ttlSeconds: 60,
          nonce: 'no-policy',
        },
        { db: db.drizzle, ...signing },
      ),
    ).rejects.toMatchObject({ code: 'policy_not_found' });
  });

  it('rejects mint with disabled agent', async () => {
    const customerId = await newCustomer();
    const agentId = await newAgent(customerId, { status: 'disabled' });
    await expect(
      mintUcan(
        {
          customerId,
          agentId,
          command: '/x/y',
          ttlSeconds: 60,
          nonce: 'disabled',
        },
        { db: db.drizzle, ...signing },
      ),
    ).rejects.toMatchObject({ code: 'agent_not_active' });
  });

  it('rejects mint with non-existent agent', async () => {
    const customerId = await newCustomer();
    await expect(
      mintUcan(
        {
          customerId,
          agentId: '00000000-0000-0000-0000-000000000000',
          command: '/x/y',
          ttlSeconds: 60,
          nonce: 'no-agent',
        },
        { db: db.drizzle, ...signing },
      ),
    ).rejects.toMatchObject({ code: 'agent_not_found' });
  });

  it('omits meta when no policyId/oauthConnectionId provided', async () => {
    const customerId = await newCustomer();
    const agentId = await newAgent(customerId);
    const result = await mintUcan(
      {
        customerId,
        agentId,
        command: '/x/y',
        ttlSeconds: 600,
        nonce: 'no-meta',
      },
      { db: db.drizzle, ...signing },
    );
    expect(result.payload.meta).toEqual({ agent_id: agentId });
  });

  it('D-5: stamps contextHints into meta.context_hints when provided', async () => {
    const customerId = await newCustomer();
    const agentId = await newAgent(customerId);
    const result = await mintUcan(
      {
        customerId,
        agentId,
        command: '/x/y',
        ttlSeconds: 600,
        nonce: 'with-hints',
        contextHints: { user: { department: 'engineering', role: 'staff' } },
      },
      { db: db.drizzle, ...signing },
    );
    expect(result.payload.meta).toEqual({
      agent_id: agentId,
      context_hints: { user: { department: 'engineering', role: 'staff' } },
    });
  });

  it('D-5: omits context_hints when contextHints is empty object; carries agent_id', async () => {
    const customerId = await newCustomer();
    const agentId = await newAgent(customerId);
    const result = await mintUcan(
      {
        customerId,
        agentId,
        command: '/x/y',
        ttlSeconds: 600,
        nonce: 'empty-hints',
        contextHints: {},
      },
      { db: db.drizzle, ...signing },
    );
    expect(result.payload.meta).toEqual({ agent_id: agentId });
  });

  it('uses injected `now` for deterministic exp/nbf', async () => {
    const customerId = await newCustomer();
    const agentId = await newAgent(customerId);
    const fixedNow = new Date('2026-06-01T00:00:00Z').getTime();
    const result = await mintUcan(
      {
        customerId,
        agentId,
        command: '/x/y',
        ttlSeconds: 1000,
        nonce: 'fixed-clock',
      },
      { db: db.drizzle, ...signing, now: () => fixedNow },
    );
    expect(result.payload.exp).toBe(Math.floor(fixedNow / 1000) + 1000);
    expect(result.payload.nbf).toBe(Math.floor(fixedNow / 1000) - 60);
  });
});
