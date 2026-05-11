/**
 * Integration: oauth-sweep finds connections expiring within the lookahead
 * window and refreshes them via the connector. Tests use a tiny lookahead so
 * we don't need to wait for real time to elapse.
 *
 * Requires postgres. Set SKIP_DB_TESTS=1 to skip.
 */
import { generateSecretboxKeyHex } from '@auto-nomos/crypto';
import { hexToBytes } from '@noble/hashes/utils';
import { eq } from 'drizzle-orm';
import { pino } from 'pino';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type Config, loadConfig } from '../../config.js';
import { createDb, type Db } from '../../db/index.js';
import * as schema from '../../db/schema.js';
import { saveConnection } from '../../oauth/tokens.js';
import { createOAuthSweep } from '../../services/oauth-sweep.js';

const TEST_URL = process.env.TEST_DATABASE_URL ?? 'postgres://cb:cb@localhost:5433/cb_dev';
const RUN = !process.env.SKIP_DB_TESTS;

describe.skipIf(!RUN)('createOAuthSweep (requires postgres)', () => {
  let db: Db;
  let config: Config;
  const logger = pino({ level: 'silent' });
  const cleanupCustomerIds: string[] = [];
  const encryptionKeyHex = generateSecretboxKeyHex();
  const encryptionKey = hexToBytes(encryptionKeyHex);

  beforeAll(async () => {
    db = createDb({ DATABASE_URL: TEST_URL });
    try {
      await db.pool.query('SELECT 1');
    } catch (err) {
      throw new Error(`Postgres not reachable: ${(err as Error).message}`);
    }
    config = loadConfig({
      DATABASE_URL: TEST_URL,
      OAUTH_TOKEN_ENCRYPTION_KEY: encryptionKeyHex,
      OAUTH_GITHUB_CLIENT_ID: 'gh-cid',
      OAUTH_GITHUB_CLIENT_SECRET: 'gh-sec',
    });
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
      .values({ name: `sweep-${Date.now()}-${Math.random()}` })
      .returning();
    if (!c) throw new Error('customer insert returned no row');
    cleanupCustomerIds.push(c.id);
    return c.id;
  }

  it('refreshes a connection whose access_token_expires_at is within the lookahead', async () => {
    const customerId = await newCustomer();
    const expiringSoon = new Date(Date.now() + 60_000); // 1 min in future
    const stored = await saveConnection(
      { db: db.drizzle, encryptionKey },
      {
        customerId,
        connector: 'github',
        tokens: {
          accessToken: 'gho_old',
          refreshToken: 'ghr_old',
          accessTokenExpiresAt: expiringSoon,
          refreshTokenExpiresAt: null,
          scopesGranted: ['repo'],
          accountId: 'octocat',
        },
      },
    );

    const fetch: typeof globalThis.fetch = async (url) => {
      const u = String(url);
      if (u.startsWith('https://github.com/login/oauth/access_token')) {
        return new Response(
          JSON.stringify({ access_token: 'gho_swept', refresh_token: 'ghr_swept', scope: 'repo' }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      if (u.startsWith('https://api.github.com/user')) {
        return new Response(JSON.stringify({ login: 'octocat' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response('unmocked', { status: 599 });
    };

    const sweep = createOAuthSweep({
      db: db.drizzle,
      encryptionKey,
      config,
      logger,
      fetch,
      // lookahead longer than 1 min so this connection is in window
      refreshLookaheadMs: 5 * 60 * 1000,
    });
    const result = await sweep.runOnce();
    expect(result.scanned).toBeGreaterThanOrEqual(1);
    expect(result.refreshed).toBeGreaterThanOrEqual(1);

    const reloaded = await db.drizzle.query.oauthConnections.findFirst({
      where: eq(schema.oauthConnections.id, stored.id),
    });
    expect(reloaded?.encryptedAccessToken).not.toBe(stored.tokens.accessToken);
    // Decrypt to verify new token landed.
    // Use loadConnection helper indirectly:
    const { loadConnectionById } = await import('../../oauth/tokens.js');
    const decoded = await loadConnectionById(
      { db: db.drizzle, encryptionKey },
      customerId,
      stored.id,
    );
    expect(decoded?.tokens.accessToken).toBe('gho_swept');
  });

  it('skips connections whose tokens expire outside the lookahead window', async () => {
    const customerId = await newCustomer();
    const farFuture = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
    await saveConnection(
      { db: db.drizzle, encryptionKey },
      {
        customerId,
        connector: 'github',
        tokens: {
          accessToken: 'gho_long',
          refreshToken: 'ghr_long',
          accessTokenExpiresAt: farFuture,
          refreshTokenExpiresAt: null,
          scopesGranted: [],
          accountId: 'octocat-long',
        },
      },
    );

    let providerCalls = 0;
    const fetch: typeof globalThis.fetch = async () => {
      providerCalls += 1;
      return new Response('should not be called', { status: 599 });
    };
    const sweep = createOAuthSweep({
      db: db.drizzle,
      encryptionKey,
      config,
      logger,
      fetch,
      refreshLookaheadMs: 60 * 60 * 1000, // 1h — far less than 30 days
    });
    const result = await sweep.runOnce();
    // We can't assert scanned==0 because there may be other rows from other tests
    // but we can assert the provider was NOT called for THIS connection.
    expect(providerCalls).toBe(0);
    expect(result.refreshed).toBe(0);
  });

  it('continues sweeping when one connection fails', async () => {
    const customerId = await newCustomer();
    const expiringSoon = new Date(Date.now() + 60_000);
    await saveConnection(
      { db: db.drizzle, encryptionKey },
      {
        customerId,
        connector: 'github',
        tokens: {
          accessToken: 'gho_dead',
          refreshToken: 'ghr_dead',
          accessTokenExpiresAt: expiringSoon,
          refreshTokenExpiresAt: null,
          scopesGranted: [],
          accountId: 'dead-acct',
        },
      },
    );
    const fetch: typeof globalThis.fetch = async (url) => {
      const u = String(url);
      if (u.startsWith('https://github.com/login/oauth/access_token')) {
        return new Response(JSON.stringify({ error: 'bad_refresh_token' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response('unmocked', { status: 599 });
    };
    const sweep = createOAuthSweep({
      db: db.drizzle,
      encryptionKey,
      config,
      logger,
      fetch,
      refreshLookaheadMs: 5 * 60 * 1000,
    });
    const result = await sweep.runOnce();
    expect(result.failed).toBeGreaterThanOrEqual(1);
  });
});
