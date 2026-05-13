/**
 * Integration: GET /v1/agent/me/tools — MCP discovery endpoint.
 *
 * Requires postgres. SKIP_DB_TESTS=1 to skip.
 */
import { generateKeypair, sha256Hex } from '@auto-nomos/crypto';
import { pino } from 'pino';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type Auth, createAuth } from '../auth/index.js';
import { loadConfig } from '../config.js';
import { createDb, type Db } from '../db/index.js';
import * as schema from '../db/schema.js';
import { createServer } from '../server.js';

const TEST_URL = process.env.TEST_DATABASE_URL ?? 'postgres://cb:cb@localhost:5433/cb_dev';
const RUN = !process.env.SKIP_DB_TESTS;

describe.skipIf(!RUN)('GET /v1/agent/me/tools (requires postgres)', () => {
  let db: Db;
  let auth: Auth;
  let app: ReturnType<typeof createServer>;
  const cleanupCustomerIds: string[] = [];
  const logger = pino({ level: 'silent' });
  const kp = generateKeypair();
  const signing = { signKey: kp.privateKey, signerDid: kp.did };

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

  async function bootstrap(): Promise<{ apiKey: string; customerId: string; agentId: string }> {
    const [c] = await db.drizzle
      .insert(schema.customers)
      .values({ name: `agent-me-${Date.now()}-${Math.random()}` })
      .returning();
    const customerId = c!.id;
    cleanupCustomerIds.push(customerId);

    const [a] = await db.drizzle
      .insert(schema.agents)
      .values({
        customerId,
        name: 'discovery-test-agent',
        did: `did:key:test-${Date.now()}-${Math.random()}`,
        connectionApprovedAt: new Date(),
      })
      .returning();
    const agentId = a!.id;

    const plaintext = `cb_${customerId}_secret-${Math.random()}`;
    await db.drizzle.insert(schema.apiKeys).values({
      customerId,
      agentId,
      keyHash: sha256Hex(plaintext),
      prefix: `cb_${customerId}`,
      name: 'test',
    });

    return { apiKey: plaintext, customerId, agentId };
  }

  it('returns 401 without bearer', async () => {
    const res = await app.request('/v1/agent/me/tools');
    expect(res.status).toBe(401);
  });

  it('returns empty integrations for customer with no policies', async () => {
    const { apiKey, agentId } = await bootstrap();
    const res = await app.request('/v1/agent/me/tools', {
      headers: { authorization: `Bearer ${apiKey}` },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      agentId: string;
      agentName: string;
      integrations: string[];
      commands: string[];
    };
    expect(body.agentId).toBe(agentId);
    expect(body.agentName).toBe('discovery-test-agent');
    expect(body.integrations).toEqual([]);
    expect(body.commands).toEqual([]);
  });

  it('returns distinct integrations from policies', async () => {
    const { apiKey, customerId } = await bootstrap();
    // Two policies on the same integration → still one integration in output.
    await db.drizzle.insert(schema.policies).values([
      { customerId, integrationId: 'github', name: 'p1', cedarText: 'permit(...)' },
      { customerId, integrationId: 'github', name: 'p2', cedarText: 'permit(...)' },
      { customerId, integrationId: 'slack', name: 'p3', cedarText: 'permit(...)' },
    ]);
    const res = await app.request('/v1/agent/me/tools', {
      headers: { authorization: `Bearer ${apiKey}` },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { integrations: string[]; commands: string[] };
    expect(body.integrations).toEqual(['github', 'slack']);
    // Commands are flattened from schema-packs; sanity-check shape (non-empty,
    // every command begins with the integration prefix).
    expect(body.commands.length).toBeGreaterThan(0);
    for (const cmd of body.commands) {
      expect(cmd.startsWith('/github/') || cmd.startsWith('/slack/')).toBe(true);
    }
  });

  it('strips integrations not present in schema-packs', async () => {
    const { apiKey, customerId } = await bootstrap();
    // schemas table has a row for an integration that's no longer in PACKS
    // (e.g. a removed pack); the route should drop it even if FK lets it in.
    await db.pool.query(
      "INSERT INTO schemas (id, version, definition, schema_hash) VALUES ('removed-pack-xyz', 'v1', '{}', '') ON CONFLICT DO NOTHING",
    );
    await db.drizzle.insert(schema.policies).values({
      customerId,
      integrationId: 'removed-pack-xyz',
      name: 'rogue',
      cedarText: 'permit(...)',
    });
    const res = await app.request('/v1/agent/me/tools', {
      headers: { authorization: `Bearer ${apiKey}` },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { integrations: string[] };
    expect(body.integrations).toEqual([]);
  });
});
