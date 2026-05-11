/**
 * /v1/oauth/connect/:connector + /v1/oauth/callback/:connector against a
 * running postgres + Hono app + a mocked upstream provider (fetch is injected
 * into the OAuth deps so each test can shape the mock per provider).
 *
 * SKIP_DB_TESTS=1 skips.
 */

import { generateSecretboxKeyHex, openString } from '@auto-nomos/crypto';
import { hexToBytes } from '@noble/hashes/utils';
import { eq } from 'drizzle-orm';
import { pino } from 'pino';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { type Auth, createAuth } from '../../auth/index.js';
import { type Config, loadConfig } from '../../config.js';
import { createDb, type Db } from '../../db/index.js';
import * as schema from '../../db/schema.js';
import { signState } from '../../oauth/state.js';
import { createServer } from '../../server.js';

const TEST_URL = process.env.TEST_DATABASE_URL ?? 'postgres://cb:cb@localhost:5433/cb_dev';
const RUN = !process.env.SKIP_DB_TESTS;

interface ProviderHandler {
  match: string;
  respond: () => Response | Promise<Response>;
}

function makeFetch(handlers: ProviderHandler[]): {
  fetch: typeof fetch;
  callsTo: (urlPrefix: string) => number;
} {
  const calls: { url: string }[] = [];
  const f: typeof fetch = async (url) => {
    const u = String(url);
    calls.push({ url: u });
    const handler = handlers.find((h) => u.startsWith(h.match));
    if (!handler) return new Response(`unmocked: ${u}`, { status: 599 });
    return handler.respond();
  };
  return { fetch: f, callsTo: (p: string) => calls.filter((c) => c.url.startsWith(p)).length };
}

describe.skipIf(!RUN)('OAuth routes (requires postgres)', () => {
  let db: Db;
  let auth: Auth;
  let config: Config;
  const logger = pino({ level: 'silent' });
  const cleanupCustomerIds: string[] = [];
  const cleanupUserIds: string[] = [];
  const encryptionKeyHex = generateSecretboxKeyHex();
  const encryptionKey = hexToBytes(encryptionKeyHex);
  const stateSecret = 'test-oauth-state-secret-32+chars';

  // Filled per test:
  let mockFetch: typeof fetch;
  let app: ReturnType<typeof createServer>;
  let alice: { cookie: string; userId: string; customerId: string };

  function buildApp(opts: { now?: () => number } = {}): void {
    app = createServer({
      logger,
      db,
      auth,
      oauth: { config, encryptionKey, fetch: mockFetch, now: opts.now },
    });
  }

  async function signUp(prefix: string): Promise<{
    cookie: string;
    userId: string;
    customerId: string;
  }> {
    const email = `${prefix}-${Date.now()}-${Math.random()}@${prefix}corp.test`;
    const res = await app.request('/auth/sign-up/email', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password: 'long-password-1', name: prefix }),
    });
    expect(res.status).toBe(200);
    const cookie = (res.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
    const u = await db.drizzle.query.user.findFirst({ where: eq(schema.user.email, email) });
    const m = await db.drizzle.query.memberships.findFirst({
      where: eq(schema.memberships.userId, u!.id),
    });
    cleanupCustomerIds.push(m!.customerId);
    cleanupUserIds.push(u!.id);
    return { cookie, userId: u!.id, customerId: m!.customerId };
  }

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
      OAUTH_STATE_SIGN_SECRET: stateSecret,
      OAUTH_GITHUB_CLIENT_ID: 'github-cid',
      OAUTH_GITHUB_CLIENT_SECRET: 'github-sec',
      OAUTH_SLACK_CLIENT_ID: 'slack-cid',
      OAUTH_SLACK_CLIENT_SECRET: 'slack-sec',
      // google + notion intentionally omitted to test "not configured" path.
      CONTROL_PLANE_PUBLIC_URL: 'http://localhost:8788',
    });
    auth = createAuth({ db: db.drizzle, config, logger });

    // Initial app for sign-up; will be re-built per test with shaped fetch.
    mockFetch = async () => new Response('unset', { status: 599 });
    buildApp();
    alice = await signUp('alice');
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

  beforeEach(() => {
    mockFetch = async () => new Response('unset', { status: 599 });
    buildApp();
  });

  describe('POST /v1/oauth/connect/:connector', () => {
    it('returns a signed authUrl for a configured connector', async () => {
      const res = await app.request('/v1/oauth/connect/github', {
        method: 'POST',
        headers: { cookie: alice.cookie },
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { authUrl: string; state: string };
      expect(body.authUrl).toContain('https://github.com/login/oauth/authorize');
      expect(body.authUrl).toContain('client_id=github-cid');
      expect(body.authUrl).toContain('state=');
      expect(body.state.split('.').length).toBe(2);
    });

    it('returns 401 without a session', async () => {
      const res = await app.request('/v1/oauth/connect/github', { method: 'POST' });
      expect(res.status).toBe(401);
    });

    it('returns 404 for an unknown connector', async () => {
      const res = await app.request('/v1/oauth/connect/salesforce', {
        method: 'POST',
        headers: { cookie: alice.cookie },
      });
      expect(res.status).toBe(404);
    });

    it('returns 503 for an unconfigured connector (notion has no client_id)', async () => {
      const res = await app.request('/v1/oauth/connect/notion', {
        method: 'POST',
        headers: { cookie: alice.cookie },
      });
      expect(res.status).toBe(503);
    });
  });

  describe('GET /v1/oauth/callback/:connector', () => {
    it('exchanges code, persists encrypted tokens, returns connectionId', async () => {
      const fetched = makeFetch([
        {
          match: 'https://github.com/login/oauth/access_token',
          respond: () =>
            new Response(
              JSON.stringify({
                access_token: 'gho_cb',
                refresh_token: 'ghr_cb',
                expires_in: 3600,
                scope: 'repo read:user',
              }),
              { status: 200, headers: { 'content-type': 'application/json' } },
            ),
        },
        {
          match: 'https://api.github.com/user',
          respond: () =>
            new Response(JSON.stringify({ login: 'alice-octo', id: 99 }), {
              status: 200,
              headers: { 'content-type': 'application/json' },
            }),
        },
      ]);
      mockFetch = fetched.fetch;
      buildApp();
      const state = signState(stateSecret, {
        customerId: alice.customerId,
        connector: 'github',
        nonce: 'cb-test-1',
        exp: Date.now() + 60_000,
      });
      const res = await app.request(
        `/v1/oauth/callback/github?code=AUTH_CODE&state=${encodeURIComponent(state)}`,
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as { connectionId: string; accountId: string };
      expect(body.accountId).toBe('alice-octo');

      const stored = await db.drizzle.query.oauthConnections.findFirst({
        where: eq(schema.oauthConnections.id, body.connectionId),
      });
      expect(stored?.encryptedAccessToken).not.toBe('gho_cb');
      expect(
        openString(encryptionKey, stored!.encryptedAccessToken!, stored!.accessTokenNonce!),
      ).toBe('gho_cb');
    });

    it('rejects missing code or state', async () => {
      const res1 = await app.request('/v1/oauth/callback/github');
      expect(res1.status).toBe(400);
      const res2 = await app.request('/v1/oauth/callback/github?code=x');
      expect(res2.status).toBe(400);
    });

    it('rejects invalid state', async () => {
      const res = await app.request('/v1/oauth/callback/github?code=x&state=not.a.valid.state');
      expect(res.status).toBe(400);
    });

    it('rejects state where connector field does not match URL', async () => {
      const state = signState(stateSecret, {
        customerId: alice.customerId,
        connector: 'slack', // mismatch
        nonce: 'n',
        exp: Date.now() + 60_000,
      });
      const res = await app.request(
        `/v1/oauth/callback/github?code=x&state=${encodeURIComponent(state)}`,
      );
      expect(res.status).toBe(400);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe('state_connector_mismatch');
    });

    it('returns 400 when provider rejects the code', async () => {
      mockFetch = (async () =>
        new Response(JSON.stringify({ error: 'bad_verification_code' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })) as typeof fetch;
      buildApp();
      const state = signState(stateSecret, {
        customerId: alice.customerId,
        connector: 'github',
        nonce: 'n',
        exp: Date.now() + 60_000,
      });
      const res = await app.request(
        `/v1/oauth/callback/github?code=BAD&state=${encodeURIComponent(state)}`,
      );
      expect(res.status).toBe(400);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe('code_exchange_failed');
    });

    it('returns 503 when the connector lacks credentials', async () => {
      const state = signState(stateSecret, {
        customerId: alice.customerId,
        connector: 'notion',
        nonce: 'n',
        exp: Date.now() + 60_000,
      });
      const res = await app.request(
        `/v1/oauth/callback/notion?code=x&state=${encodeURIComponent(state)}`,
      );
      expect(res.status).toBe(503);
    });

    it('returns 404 for an unknown connector id', async () => {
      const res = await app.request('/v1/oauth/callback/salesforce?code=x&state=y');
      expect(res.status).toBe(404);
    });
  });
});
