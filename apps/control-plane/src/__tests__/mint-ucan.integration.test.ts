/**
 * Integration: POST /v1/mint-ucan — the SDK ↔ control-plane handoff.
 *
 * Requires postgres. SKIP_DB_TESTS=1 to skip.
 */
import { generateKeypair, generateSecretboxKeyHex, sha256Hex } from '@credential-broker/crypto';
import { hexToBytes } from '@noble/hashes/utils';
import { pino } from 'pino';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type Auth, createAuth } from '../auth/index.js';
import { loadConfig } from '../config.js';
import { createDb, type Db } from '../db/index.js';
import * as schema from '../db/schema.js';
import { saveConnection } from '../oauth/tokens.js';
import { createServer } from '../server.js';

const TEST_URL = process.env.TEST_DATABASE_URL ?? 'postgres://cb:cb@localhost:5433/cb_dev';
const RUN = !process.env.SKIP_DB_TESTS;

interface MintResponse {
  ucans?: Array<{ command: string; jwt: string; cid: string; expiresAt: string }>;
  error?: string;
  error_code?: string;
}

describe.skipIf(!RUN)('POST /v1/mint-ucan (requires postgres)', () => {
  let db: Db;
  let auth: Auth;
  let app: ReturnType<typeof createServer>;
  const cleanupCustomerIds: string[] = [];
  const logger = pino({ level: 'silent' });
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
    const config = loadConfig({ DATABASE_URL: TEST_URL });
    auth = createAuth({ db: db.drizzle, config, logger });
    app = createServer({ logger, db, auth, signing });
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
      .values({ name: `mint-ucan-${Date.now()}-${Math.random()}` })
      .returning();
    cleanupCustomerIds.push(c!.id);
    return c!.id;
  }

  async function newAgent(customerId: string, status: 'active' | 'disabled' = 'active') {
    const [a] = await db.drizzle
      .insert(schema.agents)
      .values({
        customerId,
        name: `agent-${Math.random()}`,
        did: `did:key:test-${Date.now()}-${Math.random()}`,
        status,
      })
      .returning();
    return a!.id;
  }

  async function newApiKey(opts: {
    customerId: string;
    agentId: string | null;
    revoked?: boolean;
  }): Promise<{ plaintext: string; id: string }> {
    const plaintext = `cb_${opts.customerId}_secret-${Math.random()}`;
    const [k] = await db.drizzle
      .insert(schema.apiKeys)
      .values({
        customerId: opts.customerId,
        agentId: opts.agentId,
        keyHash: sha256Hex(plaintext),
        prefix: `cb_${opts.customerId}`,
        name: 'test',
        revokedAt: opts.revoked ? new Date() : null,
      })
      .returning();
    return { plaintext, id: k!.id };
  }

  async function newGithubConnection(customerId: string): Promise<string> {
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
          accountId: `octocat-${Math.random()}`,
        },
      },
    );
    return conn.id;
  }

  function post(apiKey: string | null, body: unknown) {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (apiKey) headers.authorization = `Bearer ${apiKey}`;
    return app.request('/v1/mint-ucan', {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
  }

  it('mints one UCAN per command, binding to the inferred GitHub connection', async () => {
    const customerId = await newCustomer();
    const agentId = await newAgent(customerId);
    await newGithubConnection(customerId);
    const { plaintext } = await newApiKey({ customerId, agentId });

    const res = await post(plaintext, {
      commands: ['/github/issue/create', '/github/repo/read'],
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as MintResponse;
    expect(body.ucans).toHaveLength(2);
    expect(body.ucans?.[0]?.command).toBe('/github/issue/create');
    expect(body.ucans?.[0]?.jwt).toBeTruthy();
    expect(body.ucans?.[0]?.cid).toBeTruthy();
    expect(body.ucans?.[1]?.command).toBe('/github/repo/read');
  });

  it('rejects missing api key with 401', async () => {
    const res = await post(null, { commands: ['/github/repo/read'] });
    expect(res.status).toBe(401);
    const body = (await res.json()) as MintResponse;
    expect(body.error_code).toBe('missing_api_key');
  });

  it('rejects revoked api key with 401', async () => {
    const customerId = await newCustomer();
    const agentId = await newAgent(customerId);
    const { plaintext } = await newApiKey({ customerId, agentId, revoked: true });

    const res = await post(plaintext, { commands: ['/github/repo/read'] });
    expect(res.status).toBe(401);
    expect(((await res.json()) as MintResponse).error_code).toBe('invalid_api_key');
  });

  it('rejects agentless api key with 403', async () => {
    const customerId = await newCustomer();
    const { plaintext } = await newApiKey({ customerId, agentId: null });

    const res = await post(plaintext, { commands: ['/github/repo/read'] });
    expect(res.status).toBe(403);
    expect(((await res.json()) as MintResponse).error_code).toBe('agentless_api_key');
  });

  it('rejects ttlSeconds beyond cap with 400', async () => {
    const customerId = await newCustomer();
    const agentId = await newAgent(customerId);
    const { plaintext } = await newApiKey({ customerId, agentId });

    const res = await post(plaintext, {
      commands: ['/github/repo/read'],
      ttlSeconds: 9_999_999,
    });
    expect(res.status).toBe(400);
    expect(((await res.json()) as MintResponse).error_code).toBe('invalid_body');
  });

  it('rejects malformed command shape with 400', async () => {
    const customerId = await newCustomer();
    const agentId = await newAgent(customerId);
    const { plaintext } = await newApiKey({ customerId, agentId });

    const res = await post(plaintext, { commands: ['no-leading-slash'] });
    expect(res.status).toBe(400);
    expect(((await res.json()) as MintResponse).error_code).toBe('invalid_body');
  });

  it('returns 409 when a connector has multiple oauth connections and none was specified', async () => {
    const customerId = await newCustomer();
    const agentId = await newAgent(customerId);
    await newGithubConnection(customerId);
    await newGithubConnection(customerId); // second connection — ambiguous
    const { plaintext } = await newApiKey({ customerId, agentId });

    const res = await post(plaintext, { commands: ['/github/repo/read'] });
    expect(res.status).toBe(409);
    const body = (await res.json()) as MintResponse & { connector?: string };
    expect(body.error_code).toBe('oauth_connection_ambiguous');
    expect(body.connector).toBe('github');
  });

  it('rejects disabled agents with 403', async () => {
    const customerId = await newCustomer();
    const agentId = await newAgent(customerId, 'disabled');
    await newGithubConnection(customerId);
    const { plaintext } = await newApiKey({ customerId, agentId });

    const res = await post(plaintext, { commands: ['/github/repo/read'] });
    expect(res.status).toBe(403);
    expect(((await res.json()) as MintResponse).error_code).toBe('agent_not_active');
  });
});
