import { generateKeypair } from '@auto-nomos/crypto';
import type { UcanPayload } from '@auto-nomos/shared-types';
import { issueUcan } from '@auto-nomos/ucan';
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

interface ProxyAppFixture {
  app: ReturnType<typeof createServer>;
  policyCache: ReturnType<typeof createPolicyCache>;
  audits: Array<{ command: string; allow: boolean }>;
  upstreamCalls: { url: string; method: string; headers: Record<string, string>; body?: string }[];
  tokenLookups: { customerId: string; connectionId: string }[];
}

function buildApp(opts: {
  upstreamRespond?: (url: string) => Response;
  tokenResp?: OAuthTokenResponse | (() => Promise<never>);
  customerForToken?: string;
}): ProxyAppFixture {
  const logger = pino({ level: 'silent' });
  const policyCache = createPolicyCache({
    fetchBundle: async () => undefined,
    refreshIntervalMs: 60_000,
    logger,
  });
  const revocationCache = createRevocationCache({
    fetchRevocations: async () => undefined,
    refreshIntervalMs: 60_000,
    logger,
  });
  const audits: Array<{ command: string; allow: boolean }> = [];
  const upstreamCalls: ProxyAppFixture['upstreamCalls'] = [];
  const tokenLookups: { customerId: string; connectionId: string }[] = [];

  const fakeUpstream: typeof fetch = async (url, init) => {
    upstreamCalls.push({
      url: String(url),
      method: init?.method ?? 'GET',
      headers: (init?.headers as Record<string, string>) ?? {},
      body: typeof init?.body === 'string' ? init.body : undefined,
    });
    return opts.upstreamRespond
      ? opts.upstreamRespond(String(url))
      : new Response('default 200', { status: 200, headers: { 'content-type': 'text/plain' } });
  };

  const fetchOAuthToken = async (
    customerId: string,
    connectionId: string,
  ): Promise<OAuthTokenResponse> => {
    tokenLookups.push({ customerId, connectionId });
    if (typeof opts.tokenResp === 'function') {
      await opts.tokenResp();
      throw new Error('unreachable');
    }
    return (
      opts.tokenResp ?? {
        connectionId,
        customerId: opts.customerForToken ?? customerId,
        connector: 'github',
        accountId: 'octocat',
        accessToken: 'gho_resolved',
        accessTokenExpiresAt: null,
        scopesGranted: ['repo'],
      }
    );
  };

  const app = createServer({
    logger,
    policyCache,
    revocationCache,
    emitAudit: async (ev) => {
      audits.push({ command: ev.request.command, allow: ev.decision.allow });
    },
    oauthProxy: { fetchOAuthToken, upstreamFetch: fakeUpstream },
  });
  return { app, policyCache, audits, upstreamCalls, tokenLookups };
}

describe('POST /v1/proxy/:command', () => {
  it('runs authorize and proxies the upstream call when allow + ucan has oauth_connection_id', async () => {
    const fix = buildApp({
      upstreamRespond: () =>
        new Response(JSON.stringify({ number: 42 }), {
          status: 201,
          headers: { 'content-type': 'application/json' },
        }),
    });
    fix.policyCache.set(CUSTOMER, githubPolicy);

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
        apiCall: {
          method: 'POST',
          path: '/repos/acme/billing/issues',
          body: { title: 'pay invoice' },
        },
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      allow: boolean;
      decision: { allow: boolean };
      upstream: { status: number; body: { number: number } };
      connector: string;
    };
    expect(body.allow).toBe(true);
    expect(body.upstream.status).toBe(201);
    expect(body.upstream.body.number).toBe(42);
    expect(body.connector).toBe('github');
    expect(fix.upstreamCalls[0].url).toBe('https://api.github.com/repos/acme/billing/issues');
    expect(fix.upstreamCalls[0].headers.authorization).toBe('Bearer gho_resolved');
    expect(fix.tokenLookups[0]).toEqual({ customerId: CUSTOMER, connectionId: 'conn-1' });
    expect(fix.audits).toHaveLength(1);
    expect(fix.audits[0].allow).toBe(true);
  });

  it('returns 403 + decision when policy denies (no upstream call)', async () => {
    const fix = buildApp({});
    fix.policyCache.set(CUSTOMER, githubPolicy);

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
          resource: { repo: 'acme/payroll' }, // policy only allows acme/billing
          context: {},
        },
        apiCall: { method: 'POST', path: '/repos/acme/payroll/issues' },
      }),
    });
    expect(res.status).toBe(403);
    expect(fix.upstreamCalls).toHaveLength(0);
  });

  it('returns 400 when UCAN lacks meta.oauth_connection_id', async () => {
    const fix = buildApp({});
    fix.policyCache.set(CUSTOMER, githubPolicy);

    const issuer = generateKeypair();
    const agent = generateKeypair();
    const ucan = issueUcan({
      payload: makePayload(issuer.did, agent.did),
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
    expect(res.status).toBe(400);
    expect(fix.upstreamCalls).toHaveLength(0);
  });

  it('returns 400 when URL command does not match request.command', async () => {
    const fix = buildApp({});
    fix.policyCache.set(CUSTOMER, githubPolicy);

    const issuer = generateKeypair();
    const agent = generateKeypair();
    const ucan = issueUcan({
      payload: makePayload(issuer.did, agent.did),
      privateKey: issuer.privateKey,
    });

    const res = await fix.app.request('/v1/proxy/github/issue/create', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-cb-customer': CUSTOMER },
      body: JSON.stringify({
        ucan: ucan.jwt,
        request: {
          ucan: ucan.jwt,
          command: '/github/issue/comment', // mismatch
          resource: { repo: 'acme/billing' },
          context: {},
        },
        apiCall: { method: 'GET', path: '/repos/acme/billing' },
      }),
    });
    expect(res.status).toBe(400);
  });

  it('returns 502 when control-plane token fetch throws', async () => {
    const fix = buildApp({
      tokenResp: () => Promise.reject(new Error('boom')),
    });
    fix.policyCache.set(CUSTOMER, githubPolicy);

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
  });

  it('returns 400 when x-cb-customer header is missing', async () => {
    const fix = buildApp({});
    const res = await fix.app.request('/v1/proxy/github/issue/create', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ucan: 'x',
        request: {},
        apiCall: { method: 'GET', path: '/' },
      }),
    });
    expect(res.status).toBe(400);
  });

  it('returns 400 on malformed JSON body', async () => {
    const fix = buildApp({});
    const res = await fix.app.request('/v1/proxy/github/issue/create', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-cb-customer': CUSTOMER },
      body: 'not valid json',
    });
    expect(res.status).toBe(400);
  });

  it('returns 404 when no policies cached for customer', async () => {
    const fix = buildApp({});
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
    expect(res.status).toBe(404);
  });
});
