/**
 * Migration 0029 invariants — run against the migrated DB and assert:
 *   1. every user has at least one membership
 *   2. every customer has at least one owner
 *   3. every api_keys row has a non-null role
 *   4. every customer has slug + display_name populated
 *
 * Requires postgres + 0029 already applied (`pnpm db:up && pnpm db:migrate`).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb, type Db } from '../db/index.js';

const TEST_URL = process.env.TEST_DATABASE_URL ?? 'postgres://cb:cb@localhost:5433/cb_dev';
const RUN = !process.env.SKIP_DB_TESTS;

describe.skipIf(!RUN)('migration 0029 org_rbac (requires postgres)', () => {
  let db: Db;

  beforeAll(async () => {
    db = createDb({ DATABASE_URL: TEST_URL });
    await db.pool.query('SELECT 1');
  });

  afterAll(async () => {
    await db.pool.end();
  });

  it('every user has >= 1 membership', async () => {
    const { rows } = await db.pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM "user" u
       LEFT JOIN memberships m ON m.user_id = u.id WHERE m.id IS NULL`,
    );
    expect(Number(rows[0]?.count)).toBe(0);
  });

  it('every customer has >= 1 owner', async () => {
    const { rows } = await db.pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM customers c
       LEFT JOIN memberships m ON m.customer_id = c.id AND m.role='owner'
       WHERE m.id IS NULL`,
    );
    expect(Number(rows[0]?.count)).toBe(0);
  });

  it('every api_keys row has a non-null role', async () => {
    const { rows } = await db.pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM api_keys WHERE role IS NULL`,
    );
    expect(Number(rows[0]?.count)).toBe(0);
  });

  it('every customer has slug + display_name', async () => {
    const { rows } = await db.pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM customers
       WHERE slug IS NULL OR display_name IS NULL`,
    );
    expect(Number(rows[0]?.count)).toBe(0);
  });

  it('membership_role enum has all 6 values', async () => {
    const { rows } = await db.pool.query<{ enumlabel: string }>(
      `SELECT enumlabel FROM pg_enum
       WHERE enumtypid = 'membership_role'::regtype
       ORDER BY enumsortorder`,
    );
    const labels = rows.map((r) => r.enumlabel);
    expect(labels).toEqual(
      expect.arrayContaining([
        'owner',
        'admin',
        'agent_manager',
        'policy_author',
        'auditor',
        'member',
      ]),
    );
  });

  it('org_invites table has the expected columns', async () => {
    const { rows } = await db.pool.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema='public' AND table_name='org_invites'
       ORDER BY column_name`,
    );
    const cols = rows.map((r) => r.column_name).sort();
    expect(cols).toEqual([
      'accepted_at',
      'created_at',
      'customer_id',
      'email',
      'expires_at',
      'id',
      'invited_by',
      'revoked_at',
      'role',
      'token_hash',
    ]);
  });
});
