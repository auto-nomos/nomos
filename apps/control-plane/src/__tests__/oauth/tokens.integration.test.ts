/**
 * Integration: OAuth tokens repo encrypts at rest, round-trips through
 * Drizzle, and replaces values on re-save / update.
 *
 * Requires postgres. Set SKIP_DB_TESTS=1 to skip.
 */

import { generateSecretboxKeyHex } from '@credential-broker/crypto';
import { hexToBytes } from '@noble/hashes/utils';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb, type Db } from '../../db/index.js';
import * as schema from '../../db/schema.js';
import {
  loadConnection,
  loadConnectionById,
  saveConnection,
  type TokensServiceDeps,
  updateConnectionTokens,
} from '../../oauth/tokens.js';

const TEST_URL = process.env.TEST_DATABASE_URL ?? 'postgres://cb:cb@localhost:5433/cb_dev';
const RUN = !process.env.SKIP_DB_TESTS;

describe.skipIf(!RUN)('oauth/tokens (requires postgres)', () => {
  let db: Db;
  let deps: TokensServiceDeps;
  const cleanupCustomerIds: string[] = [];

  beforeAll(async () => {
    db = createDb({ DATABASE_URL: TEST_URL });
    try {
      await db.pool.query('SELECT 1');
    } catch (err) {
      throw new Error(`Postgres not reachable: ${(err as Error).message}`);
    }
    deps = {
      db: db.drizzle,
      encryptionKey: hexToBytes(generateSecretboxKeyHex()),
    };
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
      .values({ name: `oauth-${Date.now()}-${Math.random()}` })
      .returning();
    if (!c) throw new Error('customer insert returned no row');
    cleanupCustomerIds.push(c.id);
    return c.id;
  }

  it('saveConnection inserts encrypted refresh + access tokens', async () => {
    const cid = await newCustomer();
    const exp = new Date('2026-08-01T00:00:00Z');
    const stored = await saveConnection(deps, {
      customerId: cid,
      connector: 'github',
      tokens: {
        accessToken: 'gho_access_v1',
        refreshToken: 'ghr_refresh_v1',
        accessTokenExpiresAt: exp,
        refreshTokenExpiresAt: null,
        scopesGranted: ['repo', 'read:user'],
        accountId: 'octocat',
      },
    });
    expect(stored.tokens.accessToken).toBe('gho_access_v1');
    expect(stored.tokens.refreshToken).toBe('ghr_refresh_v1');
    expect(stored.tokens.accessTokenExpiresAt?.toISOString()).toBe(exp.toISOString());

    // Verify ciphertext is actually encrypted in postgres.
    const raw = await db.drizzle.query.oauthConnections.findFirst({
      where: eq(schema.oauthConnections.id, stored.id),
    });
    expect(raw?.encryptedAccessToken).not.toBe('gho_access_v1');
    expect(raw?.encryptedAccessToken).toMatch(/^[0-9a-f]+$/);
    expect(raw?.accessTokenNonce).toMatch(/^[0-9a-f]{48}$/);
    expect(raw?.encryptedRefreshToken).not.toBe('ghr_refresh_v1');
  });

  it('saveConnection upserts on (customer, connector, account_id)', async () => {
    const cid = await newCustomer();
    const a = await saveConnection(deps, {
      customerId: cid,
      connector: 'github',
      tokens: {
        accessToken: 'a1',
        refreshToken: 'r1',
        accessTokenExpiresAt: null,
        refreshTokenExpiresAt: null,
        scopesGranted: [],
        accountId: 'octocat',
      },
    });
    const b = await saveConnection(deps, {
      customerId: cid,
      connector: 'github',
      tokens: {
        accessToken: 'a2',
        refreshToken: 'r2',
        accessTokenExpiresAt: null,
        refreshTokenExpiresAt: null,
        scopesGranted: ['repo'],
        accountId: 'octocat',
      },
    });
    expect(a.id).toBe(b.id);
    expect(b.tokens.accessToken).toBe('a2');
    const count = await db.drizzle.execute(
      sql`SELECT count(*)::int as c FROM oauth_connections WHERE customer_id = ${cid}`,
    );
    expect((count.rows[0] as { c: number }).c).toBe(1);
  });

  it('loadConnection decrypts back to plaintext', async () => {
    const cid = await newCustomer();
    await saveConnection(deps, {
      customerId: cid,
      connector: 'slack',
      tokens: {
        accessToken: 'xoxb_loaded',
        refreshToken: 'xoxe_loaded',
        accessTokenExpiresAt: null,
        refreshTokenExpiresAt: null,
        scopesGranted: ['chat:write'],
        accountId: 'T1',
      },
    });
    const loaded = await loadConnection(deps, cid, 'slack');
    expect(loaded?.tokens.accessToken).toBe('xoxb_loaded');
    expect(loaded?.tokens.refreshToken).toBe('xoxe_loaded');
    expect(loaded?.tokens.accountId).toBe('T1');
  });

  it('loadConnectionById refuses cross-tenant access', async () => {
    const cidA = await newCustomer();
    const cidB = await newCustomer();
    const conn = await saveConnection(deps, {
      customerId: cidA,
      connector: 'google',
      tokens: {
        accessToken: 'ya29',
        refreshToken: 'rt',
        accessTokenExpiresAt: null,
        refreshTokenExpiresAt: null,
        scopesGranted: [],
        accountId: 'g1',
      },
    });
    expect(await loadConnectionById(deps, cidB, conn.id)).toBeNull();
    expect(await loadConnectionById(deps, cidA, conn.id)).not.toBeNull();
  });

  it('updateConnectionTokens replaces ciphertext with new values', async () => {
    const cid = await newCustomer();
    const stored = await saveConnection(deps, {
      customerId: cid,
      connector: 'notion',
      tokens: {
        accessToken: 'secret_old',
        refreshToken: '',
        accessTokenExpiresAt: null,
        refreshTokenExpiresAt: null,
        scopesGranted: [],
        accountId: 'ws_1',
      },
    });
    const updated = await updateConnectionTokens(deps, stored.id, {
      accessToken: 'secret_new',
      refreshToken: '',
      accessTokenExpiresAt: null,
      refreshTokenExpiresAt: null,
      scopesGranted: [],
      accountId: 'ws_1',
    });
    expect(updated.tokens.accessToken).toBe('secret_new');
    const reloaded = await loadConnectionById(deps, cid, stored.id);
    expect(reloaded?.tokens.accessToken).toBe('secret_new');
  });

  it('handles connectors without refresh tokens (notion / no refresh)', async () => {
    const cid = await newCustomer();
    const stored = await saveConnection(deps, {
      customerId: cid,
      connector: 'notion',
      tokens: {
        accessToken: 'secret_long',
        refreshToken: '',
        accessTokenExpiresAt: null,
        refreshTokenExpiresAt: null,
        scopesGranted: [],
        accountId: 'ws_2',
      },
    });
    const reloaded = await loadConnection(deps, cid, 'notion');
    expect(reloaded?.tokens.refreshToken).toBe('');
    expect(reloaded?.tokens.accessToken).toBe('secret_long');
    expect(stored.id).toBe(reloaded?.id);
  });
});
