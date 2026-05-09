import { generateKeypair } from '@credential-broker/crypto';
import type { UcanPayload } from '@credential-broker/shared-types';
import { issueUcan } from '@credential-broker/ucan';
import pino from 'pino';
import { describe, expect, it } from 'vitest';
import { createPolicyCache } from '../cache/policies.js';
import { createRevocationCache } from '../cache/revocations.js';
import type { OAuthTokenResponse } from '../control-plane/client.js';
import { createServer } from '../server.js';

const CUSTOMER = '550e8400-e29b-41d4-a716-446655440000';

const githubPolicy = `
permit(
  principal,
  action == Action::"/github/issue/create",
  resource
)
when {
  resource.repo == "acme/billing"
};
`;

function makePayload(iss: string, aud: string, overrides: Partial<UcanPayload> = {}): UcanPayload {
  const now = Math.floor(Date.now() / 1000);
  return {
    iss,
    aud,
    cmd: '/github/issue/create',
    pol: [],
    nonce: `n-${Math.random()}`,
    nbf: now - 60,
    exp: now + 600,
    ...overrides,
  };
}

interface RefreshFixture {
  app: ReturnType<typeof createServer>;
  refreshCalls: number;
  upstreamCalls: { url: string; auth?: string }[];
}

function buildApp(opts: {
  upstreamSeq: ((url: string) => Response)[];
  fetchToken: () => Promise<OAuthTokenResponse>;
  refreshToken: () => Promise<OAuthTokenResponse>;
}): RefreshFixture {
  const logger = pino({ level: 'silent' });
  const policyCache = createPolicyCache({
    fetchBundle: async () => undefined,
    refreshIntervalMs: 60_000,
    logger,
  });
  policyCache.set(CUSTOMER, githubPolicy);
  const revocationCache = createRevocationCache({
    fetchRevocations: async () => undefined,
    refreshIntervalMs: 60_000,
    logger,
  });
  let upstreamIdx = 0;
  let refreshCalls = 0;
  const upstreamCalls: { url: string; auth?: string }[] = [];
  const upstreamFetch: typeof fetch = async (url, init) => {
    const handler = opts.upstreamSeq[upstreamIdx++];
    const headers = (init?.headers as Record<string, string>) ?? {};
    upstreamCalls.push({ url: String(url), auth: headers.authorization });
    if (!handler) return new Response('out of mocks', { status: 599 });
    return handler(String(url));
  };

  const fetchToken = opts.fetchToken;
  const refreshToken = async () => {
    refreshCalls += 1;
    return opts.refreshToken();
  };

  const app = createServer({
    logger,
    policyCache,
    revocationCache,
    oauthProxy: {
      fetchOAuthToken: fetchToken,
      refreshOAuthToken: refreshToken,
      upstreamFetch,
    },
  });

  return {
    app,
    get refreshCalls() {
      return refreshCalls;
    },
    upstreamCalls,
  };
}

describe('POST /v1/proxy/:command — refresh on 401 (Sprint 5.6)', () => {
  it('refreshes and retries when first upstream call returns 401', async () => {
    const fix = buildApp({
      upstreamSeq: [
        () =>
          new Response(JSON.stringify({ message: 'Bad credentials' }), {
            status: 401,
            headers: { 'content-type': 'application/json' },
          }),
        () =>
          new Response(JSON.stringify({ number: 11 }), {
            status: 201,
            headers: { 'content-type': 'application/json' },
          }),
      ],
      fetchToken: async () => ({
        connectionId: 'conn-1',
        customerId: CUSTOMER,
        connector: 'github',
        accountId: 'octocat',
        accessToken: 'gho_stale',
        accessTokenExpiresAt: null,
        scopesGranted: ['repo'],
      }),
      refreshToken: async () => ({
        connectionId: 'conn-1',
        customerId: CUSTOMER,
        connector: 'github',
        accountId: 'octocat',
        accessToken: 'gho_fresh',
        accessTokenExpiresAt: null,
        scopesGranted: ['repo'],
      }),
    });

    const issuer = generateKeypair();
    const agent = generateKeypair();
    const ucan = issueUcan({
      payload: makePayload(issuer.did, agent.did, {
        meta: { oauth_connection_id: 'conn-1' },
      }),
      privateKey: issuer.privateKey,
    });

    const res = await fix.app.request('/v1/proxy/github/issue/create', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-cb-customer': CUSTOMER },
      body: JSON.stringify({
        ucan: ucan.jwt,
        request: {
          ucan: ucan.jwt,
          command: '/github/issue/create',
          resource: { repo: 'acme/billing' },
          context: {},
        },
        apiCall: { method: 'POST', path: '/repos/acme/billing/issues' },
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { upstream: { status: number } };
    expect(body.upstream.status).toBe(201);
    expect(fix.refreshCalls).toBe(1);
    expect(fix.upstreamCalls).toHaveLength(2);
    expect(fix.upstreamCalls[0].auth).toBe('Bearer gho_stale');
    expect(fix.upstreamCalls[1].auth).toBe('Bearer gho_fresh');
  });

  it('returns 502 oauth_token_invalid when refresh itself fails', async () => {
    const fix = buildApp({
      upstreamSeq: [() => new Response('unauthorized', { status: 401 })],
      fetchToken: async () => ({
        connectionId: 'conn-1',
        customerId: CUSTOMER,
        connector: 'github',
        accountId: 'octocat',
        accessToken: 'gho_dead',
        accessTokenExpiresAt: null,
        scopesGranted: [],
      }),
      refreshToken: async () => {
        throw new Error('provider rejected refresh');
      },
    });

    const issuer = generateKeypair();
    const agent = generateKeypair();
    const ucan = issueUcan({
      payload: makePayload(issuer.did, agent.did, {
        meta: { oauth_connection_id: 'conn-1' },
      }),
      privateKey: issuer.privateKey,
    });

    const res = await fix.app.request('/v1/proxy/github/issue/create', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-cb-customer': CUSTOMER },
      body: JSON.stringify({
        ucan: ucan.jwt,
        request: {
          ucan: ucan.jwt,
          command: '/github/issue/create',
          resource: { repo: 'acme/billing' },
          context: {},
        },
        apiCall: { method: 'GET', path: '/repos/acme/billing' },
      }),
    });
    expect(res.status).toBe(502);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('oauth_token_invalid');
  });

  it('does NOT retry when refreshOAuthToken is not configured (only first 401 reaches caller)', async () => {
    const fix = buildApp({
      upstreamSeq: [
        () =>
          new Response(JSON.stringify({ message: 'Bad credentials' }), {
            status: 401,
            headers: { 'content-type': 'application/json' },
          }),
      ],
      fetchToken: async () => ({
        connectionId: 'conn-1',
        customerId: CUSTOMER,
        connector: 'github',
        accountId: 'octocat',
        accessToken: 'gho_stale',
        accessTokenExpiresAt: null,
        scopesGranted: [],
      }),
      refreshToken: async () => ({
        connectionId: 'conn-1',
        customerId: CUSTOMER,
        connector: 'github',
        accountId: 'octocat',
        accessToken: 'never-fetched',
        accessTokenExpiresAt: null,
        scopesGranted: [],
      }),
    });

    // Re-mount without refreshOAuthToken to verify the no-refresh path.
    const logger = pino({ level: 'silent' });
    const policyCache = createPolicyCache({
      fetchBundle: async () => undefined,
      refreshIntervalMs: 60_000,
      logger,
    });
    policyCache.set(CUSTOMER, githubPolicy);
    const revocationCache = createRevocationCache({
      fetchRevocations: async () => undefined,
      refreshIntervalMs: 60_000,
      logger,
    });
    const upstreamFetch: typeof fetch = async () =>
      new Response(JSON.stringify({ message: 'unauth' }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      });
    const app = createServer({
      logger,
      policyCache,
      revocationCache,
      oauthProxy: {
        fetchOAuthToken: async () => ({
          connectionId: 'conn-1',
          customerId: CUSTOMER,
          connector: 'github',
          accountId: 'octocat',
          accessToken: 'gho_stale',
          accessTokenExpiresAt: null,
          scopesGranted: [],
        }),
        upstreamFetch,
      },
    });

    const issuer = generateKeypair();
    const agent = generateKeypair();
    const ucan = issueUcan({
      payload: makePayload(issuer.did, agent.did, {
        meta: { oauth_connection_id: 'conn-1' },
      }),
      privateKey: issuer.privateKey,
    });
    const res = await app.request('/v1/proxy/github/issue/create', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-cb-customer': CUSTOMER },
      body: JSON.stringify({
        ucan: ucan.jwt,
        request: {
          ucan: ucan.jwt,
          command: '/github/issue/create',
          resource: { repo: 'acme/billing' },
          context: {},
        },
        apiCall: { method: 'GET', path: '/repos/acme/billing' },
      }),
    });
    // Without refresh wired, the 401 just bubbles up as the upstream response.
    expect(res.status).toBe(200); // /v1/proxy returns 200 with the upstream block
    const body = (await res.json()) as { upstream: { status: number } };
    expect(body.upstream.status).toBe(401);
    void fix; // built but unused — kept for alignment with first test's API
  });
});
