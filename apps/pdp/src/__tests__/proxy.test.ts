import { generateKeypair } from '@auto-nomos/crypto';
import type { UcanPayload } from '@auto-nomos/shared-types';
import { computeCid, issueUcan } from '@auto-nomos/ucan';
import pino from 'pino';
import { describe, expect, it, vi } from 'vitest';
import { createPolicyCache } from '../cache/policies.js';
import { createRevocationCache } from '../cache/revocations.js';
import type { OAuthTokenResponse, StepUpStateResponse } from '../control-plane/client.js';
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
  audits: Array<{ command: string; allow: boolean; reason?: string }>;
  upstreamCalls: { url: string; method: string; headers: Record<string, string>; body?: string }[];
  tokenLookups: { customerId: string; connectionId: string }[];
  stepupCreate?: ReturnType<typeof vi.fn>;
  stepupState?: Map<string, StepUpStateResponse>;
}

interface BuildAppOpts {
  upstreamRespond?: (url: string) => Response;
  tokenResp?: OAuthTokenResponse | (() => Promise<never>);
  customerForToken?: string;
  withStepup?: boolean;
}

function buildApp(opts: BuildAppOpts): ProxyAppFixture {
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

  const stepupState = new Map<string, StepUpStateResponse>();
  const stepupCreate = vi.fn(
    async (args: {
      customerId: string;
      agentId: string;
      command: string;
      resource: Record<string, unknown>;
      originalUcanCid?: string;
    }) => {
      const id = `aprv-${Math.random().toString(16).slice(2, 10)}`;
      stepupState.set(id, {
        id,
        customerId: args.customerId,
        agentId: args.agentId,
        command: args.command,
        resource: args.resource,
        state: 'pending',
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        decidedAt: null,
        cosignerAttestationJwt: null,
      });
      return { id, deepLink: `http://localhost:3000/approve/${id}` };
    },
  );

  const app = createServer({
    logger,
    policyCache,
    revocationCache,
    emitAudit: async (ev) => {
      audits.push({
        command: ev.request.command,
        allow: ev.decision.allow,
        ...(ev.decision.reason !== undefined ? { reason: ev.decision.reason } : {}),
      });
    },
    oauthProxy: { fetchOAuthToken, upstreamFetch: fakeUpstream },
    ...(opts.withStepup
      ? {
          stepup: {
            create: stepupCreate,
            getStepUp: async (id) => stepupState.get(id),
          },
        }
      : {}),
  });
  return { app, policyCache, audits, upstreamCalls, tokenLookups, stepupCreate, stepupState };
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
        apiCall: { method: 'POST', path: '/repos/acme/billing/issues', body: { title: 't' } },
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
        apiCall: { method: 'POST', path: '/repos/acme/billing/issues', body: { title: 't' } },
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

  it('triggers step-up when policy denies but cosigner=true would allow', async () => {
    const stepUpPolicy = `
permit (
  principal,
  action == Action::"/github/repo/create",
  resource
) when { context.cosigner == true };
`;
    const fix = buildApp({ withStepup: true });
    fix.policyCache.set(CUSTOMER, stepUpPolicy);

    const issuer = generateKeypair();
    const agent = generateKeypair();
    const AGENT_ID = '22222222-2222-2222-2222-222222222222';
    const ucan = issueUcan({
      payload: makePayload(issuer.did, agent.did, {
        cmd: '/github/repo/create',
        meta: { oauth_connection_id: 'conn-1', agent_id: AGENT_ID },
      }),
      privateKey: issuer.privateKey,
    });

    const res = await fix.app.request('/v1/proxy/github/repo/create', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-cb-customer': CUSTOMER },
      body: JSON.stringify({
        ucan: ucan.jwt,
        request: {
          ucan: ucan.jwt,
          command: '/github/repo/create',
          resource: { name: 'test-repo-01' },
          context: {},
        },
        apiCall: {
          method: 'POST',
          path: '/user/repos',
          body: { name: 'test-repo-01', private: true },
        },
      }),
    });
    // step-up returns 200 (not 403) so SDK keeps decision intact
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      allow: boolean;
      decision: {
        allow: boolean;
        reason?: string;
        receiptId: string;
        requiresStepUp?: boolean;
        stepUpUrl?: string;
        stepUpId?: string;
      };
    };
    expect(body.allow).toBe(false);
    expect(body.decision.requiresStepUp).toBe(true);
    expect(body.decision.reason).toBe('step_up_required');
    expect(body.decision.stepUpUrl).toMatch(/\/approve\//);
    expect(body.decision.stepUpId).toMatch(/^aprv-/);
    expect(typeof body.decision.receiptId).toBe('string');
    expect(body.decision.receiptId.length).toBeGreaterThan(0);
    expect(fix.stepupCreate).toHaveBeenCalledOnce();
    expect(fix.stepupCreate?.mock.calls[0]?.[0]).toMatchObject({
      customerId: CUSTOMER,
      agentId: AGENT_ID,
      command: '/github/repo/create',
      resource: { name: 'test-repo-01' },
      originalUcanCid: computeCid(ucan.jwt),
    });
    expect(fix.upstreamCalls).toHaveLength(0);
  });

  it('skips step-up when UCAN lacks meta.agent_id', async () => {
    const stepUpPolicy = `
permit (
  principal,
  action == Action::"/github/repo/create",
  resource
) when { context.cosigner == true };
`;
    const fix = buildApp({ withStepup: true });
    fix.policyCache.set(CUSTOMER, stepUpPolicy);

    const issuer = generateKeypair();
    const agent = generateKeypair();
    const ucan = issueUcan({
      payload: makePayload(issuer.did, agent.did, {
        cmd: '/github/repo/create',
        meta: { oauth_connection_id: 'conn-1' },
      }),
      privateKey: issuer.privateKey,
    });

    const res = await fix.app.request('/v1/proxy/github/repo/create', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-cb-customer': CUSTOMER },
      body: JSON.stringify({
        ucan: ucan.jwt,
        request: {
          ucan: ucan.jwt,
          command: '/github/repo/create',
          resource: { name: 'test-repo-01' },
          context: {},
        },
        apiCall: { method: 'POST', path: '/user/repos', body: { name: 'test-repo-01' } },
      }),
    });
    expect(res.status).toBe(403);
    const body = (await res.json()) as {
      decision: { requiresStepUp?: boolean; receiptId: string };
    };
    expect(body.decision.requiresStepUp).toBeUndefined();
    expect(typeof body.decision.receiptId).toBe('string');
    expect(fix.stepupCreate).not.toHaveBeenCalled();
  });

  it('returns 200 deny (unknown_customer) when no policies cached', async () => {
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
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      allow: boolean;
      decision: { allow: boolean; reason: string; receiptId: string };
      error_code: string;
    };
    expect(body.allow).toBe(false);
    expect(body.decision.allow).toBe(false);
    expect(body.decision.reason).toBe('unknown_customer');
    expect(body.decision.receiptId).toMatch(/^[0-9a-f]{64}$/);
    expect(body.error_code).toBe('unknown_customer');
  });

  it('D3 — denies with schema_violation when apiCall method mismatches command', async () => {
    const fix = buildApp({});
    fix.policyCache.set(CUSTOMER, githubPolicy);

    const issuer = generateKeypair();
    const agent = generateKeypair();
    const ucan = issueUcan({
      payload: makePayload(issuer.did, agent.did, {
        meta: { oauth_connection_id: 'conn-1', customer_id: CUSTOMER },
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
        // issue/create requires POST; GET triggers schema_violation
        apiCall: { method: 'GET', path: '/repos/acme/billing/issues' },
      }),
    });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error_code: string; decision: { reason: string } };
    expect(body.error_code).toBe('schema_violation');
    expect(body.decision.reason).toBe('schema_violation');
    // upstream must not be called when schema-pack denies pre-decide
    expect(fix.upstreamCalls).toHaveLength(0);
  });

  it('D3 — rejects path traversal in apiCall path', async () => {
    const fix = buildApp({});
    fix.policyCache.set(CUSTOMER, githubPolicy);

    const issuer = generateKeypair();
    const agent = generateKeypair();
    const ucan = issueUcan({
      payload: makePayload(issuer.did, agent.did, {
        meta: { oauth_connection_id: 'conn-1', customer_id: CUSTOMER },
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
          path: '/repos/acme/../etc/passwd',
          body: { title: 't' },
        },
      }),
    });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error_code: string };
    expect(body.error_code).toBe('schema_violation');
    expect(fix.upstreamCalls).toHaveLength(0);
  });

  // Regression for 2026-05-14 incident: an agent minted a UCAN for
  // /github/content/update and called /v1/proxy/github/content/update with
  // an apiCall pointing at POST /repos/o/r/git/refs (branch creation). The
  // PDP allowed it because no apiCallSchema existed for content/update;
  // the generated schema in __generated__/github-api-schemas.ts now binds
  // PUT + /repos/{o}/{r}/contents/{path} and this smuggle path denies.
  it('D3 — /github/content/update with smuggled git/refs path returns schema_violation', async () => {
    const contentUpdatePolicy = `
permit(
  principal,
  action == Action::"/github/content/update",
  resource
)
when { resource.repo == "acme/billing" };
`;
    const fix = buildApp({});
    fix.policyCache.set(CUSTOMER, contentUpdatePolicy);

    const issuer = generateKeypair();
    const agent = generateKeypair();
    const ucan = issueUcan({
      payload: makePayload(issuer.did, agent.did, {
        cmd: '/github/content/update',
        meta: { oauth_connection_id: 'conn-1', customer_id: CUSTOMER },
      }),
      privateKey: issuer.privateKey,
    });

    const res = await fix.app.request('/v1/proxy/github/content/update', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-cb-customer': CUSTOMER },
      body: JSON.stringify({
        ucan: ucan.jwt,
        request: {
          ucan: ucan.jwt,
          command: '/github/content/update',
          resource: { repo: 'acme/billing', owner: 'acme', repo_name: 'billing' },
          context: {},
        },
        apiCall: {
          method: 'POST',
          path: '/repos/acme/billing/git/refs',
          body: { ref: 'refs/heads/smuggle', sha: 'deadbeef' },
        },
      }),
    });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error_code: string; decision: { reason: string } };
    expect(body.error_code).toBe('schema_violation');
    expect(body.decision.reason).toBe('schema_violation');
    expect(fix.upstreamCalls).toHaveLength(0);
  });

  it('D3 — /github/content/update accepts the bound PUT /contents/{path} call', async () => {
    const contentUpdatePolicy = `
permit(
  principal,
  action == Action::"/github/content/update",
  resource
)
when { resource.repo == "acme/billing" };
`;
    const fix = buildApp({});
    fix.policyCache.set(CUSTOMER, contentUpdatePolicy);

    const issuer = generateKeypair();
    const agent = generateKeypair();
    const ucan = issueUcan({
      payload: makePayload(issuer.did, agent.did, {
        cmd: '/github/content/update',
        meta: { oauth_connection_id: 'conn-1', customer_id: CUSTOMER },
      }),
      privateKey: issuer.privateKey,
    });

    const res = await fix.app.request('/v1/proxy/github/content/update', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-cb-customer': CUSTOMER },
      body: JSON.stringify({
        ucan: ucan.jwt,
        request: {
          ucan: ucan.jwt,
          command: '/github/content/update',
          resource: { repo: 'acme/billing', owner: 'acme', repo_name: 'billing' },
          context: {},
        },
        apiCall: {
          method: 'PUT',
          path: '/repos/acme/billing/contents/docs/readme.md',
          body: { message: 'docs', content: 'aGVsbG8=' },
        },
      }),
    });
    // Allowed by Cedar + schema; upstream gets the PUT (fake fetch returns 200).
    expect(res.status).toBe(200);
    expect(fix.upstreamCalls).toHaveLength(1);
    expect(fix.upstreamCalls[0]?.method).toBe('PUT');
    expect(fix.upstreamCalls[0]?.url).toContain('/contents/docs/readme.md');
  });

  it('D3 — /github/branch/create binds POST /git/refs (no longer smuggleable under content/update)', async () => {
    const branchPolicy = `
permit(
  principal,
  action == Action::"/github/branch/create",
  resource
)
when { resource.repo == "acme/billing" };
`;
    const fix = buildApp({});
    fix.policyCache.set(CUSTOMER, branchPolicy);

    const issuer = generateKeypair();
    const agent = generateKeypair();
    const ucan = issueUcan({
      payload: makePayload(issuer.did, agent.did, {
        cmd: '/github/branch/create',
        meta: { oauth_connection_id: 'conn-1', customer_id: CUSTOMER },
      }),
      privateKey: issuer.privateKey,
    });

    const res = await fix.app.request('/v1/proxy/github/branch/create', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-cb-customer': CUSTOMER },
      body: JSON.stringify({
        ucan: ucan.jwt,
        request: {
          ucan: ucan.jwt,
          command: '/github/branch/create',
          resource: { repo: 'acme/billing', owner: 'acme', repo_name: 'billing' },
          context: {},
        },
        apiCall: {
          method: 'POST',
          path: '/repos/acme/billing/git/refs',
          body: { ref: 'refs/heads/feature', sha: 'deadbeef' },
        },
      }),
    });
    expect(res.status).toBe(200);
    expect(fix.upstreamCalls).toHaveLength(1);
    expect(fix.upstreamCalls[0]?.method).toBe('POST');
  });

  it('D3 — slack/message/post denies a smuggled chat.delete path (cross-pack)', async () => {
    const slackPolicy = `
permit(
  principal,
  action == Action::"/slack/message/post",
  resource
);
`;
    const fix = buildApp({});
    fix.policyCache.set(CUSTOMER, slackPolicy);

    const issuer = generateKeypair();
    const agent = generateKeypair();
    const ucan = issueUcan({
      payload: makePayload(issuer.did, agent.did, {
        cmd: '/slack/message/post',
        meta: { oauth_connection_id: 'conn-1', customer_id: CUSTOMER },
      }),
      privateKey: issuer.privateKey,
    });

    const res = await fix.app.request('/v1/proxy/slack/message/post', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-cb-customer': CUSTOMER },
      body: JSON.stringify({
        ucan: ucan.jwt,
        request: {
          ucan: ucan.jwt,
          command: '/slack/message/post',
          resource: { channel: 'C123' },
          context: {},
        },
        // chat.postMessage is POST; chat.delete would be a smuggle.
        apiCall: {
          method: 'POST',
          path: '/api/chat.delete',
          body: { channel: 'C123', ts: '1' },
        },
      }),
    });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error_code: string; decision: { reason: string } };
    expect(body.error_code).toBe('schema_violation');
    expect(body.decision.reason).toBe('schema_violation');
    expect(fix.upstreamCalls).toHaveLength(0);
  });
});
