/**
 * Integration: refreshConnection runs the full call-provider, decrypt-old,
 * encrypt-new round-trip against postgres + a mocked provider fetch.
 *
 * Requires postgres. Set SKIP_DB_TESTS=1 to skip.
 */
import { generateSecretboxKeyHex } from '@credential-broker/crypto';
import { hexToBytes } from '@noble/hashes/utils';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type Config, loadConfig } from '../../config.js';
import { createDb, type Db } from '../../db/index.js';
import * as schema from '../../db/schema.js';
import { saveConnection } from '../../oauth/tokens.js';
import { RefreshError, refreshConnection } from '../../services/oauth-refresh.js';

const TEST_URL = process.env.TEST_DATABASE_URL ?? 'postgres://cb:cb@localhost:5433/cb_dev';
const RUN = !process.env.SKIP_DB_TESTS;

describe.skipIf(!RUN)('refreshConnection (requires postgres)', () => {
  let db: Db;
  let config: Config;
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
      OAUTH_GITHUB_CLIENT_ID: 'github-cid',
      OAUTH_GITHUB_CLIENT_SECRET: 'github-sec',
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
      .values({ name: `refresh-${Date.now()}-${Math.random()}` })
      .returning();
    if (!c) throw new Error('customer insert returned no row');
    cleanupCustomerIds.push(c.id);
    return c.id;
  }

  function makeFetch(handlers: Array<[string, () => Response]>): typeof fetch {
    return async (url) => {
      const u = String(url);
      const handler = handlers.find(([prefix]) => u.startsWith(prefix))?.[1];
      if (!handler) return new Response('not mocked', { status: 599 });
      return handler();
    };
  }

  it('refreshes a github connection and persists the new tokens', async () => {
    const customerId = await newCustomer();
    const stored = await saveConnection(
      { db: db.drizzle, encryptionKey },
      {
        customerId,
        connector: 'github',
        tokens: {
          accessToken: 'gho_old',
          refreshToken: 'ghr_old',
          accessTokenExpiresAt: new Date(Date.now() - 60_000),
          refreshTokenExpiresAt: null,
          scopesGranted: ['repo'],
          accountId: 'octocat',
        },
      },
    );
    const fetch = makeFetch([
      [
        'https://github.com/login/oauth/access_token',
        () =>
          new Response(
            JSON.stringify({
              access_token: 'gho_new',
              refresh_token: 'ghr_new',
              scope: 'repo',
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          ),
      ],
      [
        'https://api.github.com/user',
        () =>
          new Response(JSON.stringify({ login: 'octocat' }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
      ],
    ]);
    const refreshed = await refreshConnection(
      { db: db.drizzle, encryptionKey, config, fetch },
      customerId,
      stored.id,
    );
    expect(refreshed.tokens.accessToken).toBe('gho_new');
    expect(refreshed.tokens.refreshToken).toBe('ghr_new');
  });

  it('throws no_refresh_token when stored connection has empty refresh', async () => {
    const customerId = await newCustomer();
    const stored = await saveConnection(
      { db: db.drizzle, encryptionKey },
      {
        customerId,
        connector: 'notion',
        tokens: {
          accessToken: 'secret_x',
          refreshToken: '',
          accessTokenExpiresAt: null,
          refreshTokenExpiresAt: null,
          scopesGranted: [],
          accountId: 'ws_1',
        },
      },
    );
    await expect(
      refreshConnection(
        {
          db: db.drizzle,
          encryptionKey,
          config: loadConfig({
            DATABASE_URL: TEST_URL,
            OAUTH_TOKEN_ENCRYPTION_KEY: encryptionKeyHex,
            OAUTH_NOTION_CLIENT_ID: 'notion-cid',
            OAUTH_NOTION_CLIENT_SECRET: 'notion-sec',
          }),
        },
        customerId,
        stored.id,
      ),
    ).rejects.toMatchObject({ code: 'no_refresh_token' });
  });

  it('throws connection_not_found for unknown id', async () => {
    const customerId = await newCustomer();
    await expect(
      refreshConnection(
        { db: db.drizzle, encryptionKey, config },
        customerId,
        '00000000-0000-0000-0000-000000000000',
      ),
    ).rejects.toMatchObject({ code: 'connection_not_found' });
  });

  it('throws connector_unconfigured when client_id missing', async () => {
    const customerId = await newCustomer();
    const stored = await saveConnection(
      { db: db.drizzle, encryptionKey },
      {
        customerId,
        connector: 'slack',
        tokens: {
          accessToken: 'xoxb',
          refreshToken: 'xoxe',
          accessTokenExpiresAt: null,
          refreshTokenExpiresAt: null,
          scopesGranted: [],
          accountId: 'T1',
        },
      },
    );
    // config has no slack creds → unconfigured
    await expect(
      refreshConnection({ db: db.drizzle, encryptionKey, config }, customerId, stored.id),
    ).rejects.toMatchObject({ code: 'connector_unconfigured' });
  });

  it('wraps provider 401 into RefreshError code=provider_rejected', async () => {
    const customerId = await newCustomer();
    const stored = await saveConnection(
      { db: db.drizzle, encryptionKey },
      {
        customerId,
        connector: 'github',
        tokens: {
          accessToken: 'gho_x',
          refreshToken: 'ghr_dead',
          accessTokenExpiresAt: null,
          refreshTokenExpiresAt: null,
          scopesGranted: [],
          accountId: 'octocat',
        },
      },
    );
    const fetch = makeFetch([
      [
        'https://github.com/login/oauth/access_token',
        () =>
          new Response(JSON.stringify({ error: 'bad_refresh_token' }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
      ],
    ]);
    await expect(
      refreshConnection({ db: db.drizzle, encryptionKey, config, fetch }, customerId, stored.id),
    ).rejects.toMatchObject({ name: 'RefreshError', code: 'provider_rejected' });
  });

  it('wraps non-ConnectorAuthError throws as transport_error', async () => {
    const customerId = await newCustomer();
    const stored = await saveConnection(
      { db: db.drizzle, encryptionKey },
      {
        customerId,
        connector: 'github',
        tokens: {
          accessToken: 'gho_x',
          refreshToken: 'ghr_x',
          accessTokenExpiresAt: null,
          refreshTokenExpiresAt: null,
          scopesGranted: [],
          accountId: 'octocat',
        },
      },
    );
    const fetch: typeof globalThis.fetch = async () => {
      throw new TypeError('fetch failed');
    };
    await expect(
      refreshConnection({ db: db.drizzle, encryptionKey, config, fetch }, customerId, stored.id),
    ).rejects.toBeInstanceOf(RefreshError);
  });
});
