/**
 * Integration test against a running postgres (run `pnpm db:up && pnpm db:migrate` first).
 * Set SKIP_DB_TESTS=1 to skip — useful for environments without docker available.
 */
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb, type Db } from '../db/index.js';
import * as schema from '../db/schema.js';

const TEST_URL = process.env.TEST_DATABASE_URL ?? 'postgres://cb:cb@localhost:5433/cb_dev';
const RUN = !process.env.SKIP_DB_TESTS;

describe.skipIf(!RUN)('db migration smoke (requires postgres)', () => {
  let db: Db;
  const cleanupCustomerIds: string[] = [];
  const cleanupUserIds: string[] = [];

  beforeAll(async () => {
    db = createDb({ DATABASE_URL: TEST_URL });
    try {
      await db.pool.query('SELECT 1');
    } catch (err) {
      throw new Error(
        `Postgres not reachable at ${TEST_URL}. Run pnpm db:up first. (${(err as Error).message})`,
      );
    }
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

  it('all 33 tables exist (26 application + 4 Better-Auth + passkey + cloud x2)', async () => {
    // Sprint MAOS-A/B added `swarms` + `agent_chain_approvals` (2 tables).
    // Observability v2 added `agent_spans`. Cloud IAM M0 added
    // `cloud_connections` + `oidc_issuer_keys`. Org RBAC added `org_invites`.
    const result = await db.pool.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
         AND table_name NOT LIKE '\\_\\_drizzle%' ESCAPE '\\'`,
    );
    const tables = result.rows.map((r) => r.table_name).sort();
    expect(tables).toEqual([
      'account',
      'agent_chain_approvals',
      'agent_grants',
      'agent_policies',
      'agent_spans',
      'agents',
      'api_keys',
      'audit_events',
      'audit_roots',
      'chain_context_facts',
      'cloud_connections',
      'customer_telegram_links',
      'customers',
      'envelopes',
      'mcp_servers',
      'memberships',
      'notification_preferences',
      'oauth_connections',
      'oidc_issuer_keys',
      'org_invites',
      'passkey',
      'policies',
      'push_approvals',
      'revocations',
      'schemas',
      'session',
      'swarms',
      'telegram_link_tokens',
      'ucan_issues',
      'usage_counters',
      'user',
      'verification',
      'webauthn_credentials',
    ]);
  });

  it('customer round-trip via Drizzle (defaults applied)', async () => {
    const [inserted] = await db.drizzle
      .insert(schema.customers)
      .values({ name: `test-${Date.now()}` })
      .returning();
    expect(inserted).toBeDefined();
    cleanupCustomerIds.push(inserted!.id);

    const fetched = await db.drizzle.query.customers.findFirst({
      where: eq(schema.customers.id, inserted!.id),
    });
    expect(fetched?.name).toContain('test-');
    expect(fetched?.plan).toBe('free');
    expect(fetched?.createdAt).toBeInstanceOf(Date);
  });

  it('membership cascades on customer delete; user survives', async () => {
    const [c] = await db.drizzle
      .insert(schema.customers)
      .values({ name: `cascade-${Date.now()}` })
      .returning();
    const [u] = await db.drizzle
      .insert(schema.user)
      .values({ email: `cascade-${Date.now()}-${Math.random()}@x.test` })
      .returning();
    const [m] = await db.drizzle
      .insert(schema.memberships)
      .values({ userId: u!.id, customerId: c!.id, role: 'owner' })
      .returning();
    expect(m).toBeDefined();
    cleanupUserIds.push(u!.id);

    await db.drizzle.delete(schema.customers).where(eq(schema.customers.id, c!.id));

    const remainingMembership = await db.drizzle.query.memberships.findFirst({
      where: eq(schema.memberships.id, m!.id),
    });
    expect(remainingMembership).toBeUndefined();

    const userStill = await db.drizzle.query.user.findFirst({
      where: eq(schema.user.id, u!.id),
    });
    expect(userStill).toBeDefined();
  });

  it('agent did unique constraint enforced', async () => {
    const [c] = await db.drizzle
      .insert(schema.customers)
      .values({ name: `did-${Date.now()}` })
      .returning();
    cleanupCustomerIds.push(c!.id);
    const did = `did:key:test-${Date.now()}-${Math.random()}`;
    await db.drizzle.insert(schema.agents).values({ customerId: c!.id, name: 'a1', did });

    await expect(
      db.drizzle.insert(schema.agents).values({ customerId: c!.id, name: 'a2', did }),
    ).rejects.toThrow(/duplicate key|unique/i);
  });

  it('audit_events hash unique constraint enforced', async () => {
    const [c] = await db.drizzle
      .insert(schema.customers)
      .values({ name: `audit-${Date.now()}` })
      .returning();
    cleanupCustomerIds.push(c!.id);
    const hash = `h-${Date.now()}-${Math.random()}`;
    await db.drizzle.insert(schema.auditEvents).values({
      customerId: c!.id,
      agent: 'did:key:agent',
      decision: 'allow',
      command: '/x/y',
      resource: { foo: 'bar' },
      prevHash: '0',
      hash,
      payload: {},
    });

    await expect(
      db.drizzle.insert(schema.auditEvents).values({
        customerId: c!.id,
        agent: 'did:key:agent',
        decision: 'allow',
        command: '/x/y',
        resource: { foo: 'bar' },
        prevHash: '0',
        hash,
        payload: {},
      }),
    ).rejects.toThrow(/duplicate key|unique/i);
  });
});
