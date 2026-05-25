/**
 * PDP proxy span emission — verifies fireSpan() runs for every meaningful
 * exit branch of /v1/proxy with the right SpanStatus, latencyMs, and
 * redacted summaries. mcp-server already has unit coverage for the
 * redaction module itself; this test pins the wiring between PDP outcome
 * branches and the EmitSpanInput envelope.
 */
import { generateKeypair } from '@auto-nomos/crypto';
import type { EmitSpanInput, UcanPayload } from '@auto-nomos/shared-types';
import { issueUcan } from '@auto-nomos/ucan';
import pino from 'pino';
import { describe, expect, it } from 'vitest';
import { createPolicyCache } from '../cache/policies.js';
import { createRevocationCache } from '../cache/revocations.js';
import type { OAuthTokenResponse } from '../control-plane/client.js';
import { createServer } from '../server.js';

const CUSTOMER = '550e8400-e29b-41d4-a716-446655440000';

const POLICY = `
permit(
  principal,
  action == Action::"/github/issue/create",
  resource
)
when {
  resource.repo == "acme/billing"
};
`;

interface SpanCall {
  customerId: string;
  agentDid: string;
  input: EmitSpanInput;
}

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
    meta: { oauth_connection_id: 'conn-1' },
    ...overrides,
  };
}

function buildApp(upstream: { status: number; body: unknown }) {
  const logger = pino({ level: 'silent' });
  const spans: SpanCall[] = [];
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

  const fakeUpstream: typeof fetch = async () =>
    new Response(JSON.stringify(upstream.body), {
      status: upstream.status,
      headers: { 'content-type': 'application/json' },
    });

  const fetchOAuthToken = async (
    customerId: string,
    connectionId: string,
  ): Promise<OAuthTokenResponse> => ({
    connectionId,
    customerId,
    connector: 'github',
    accountId: 'octocat',
    accessToken: 'gho_resolved',
    accessTokenExpiresAt: null,
    scopesGranted: ['repo'],
  });

  const app = createServer({
    logger,
    policyCache,
    revocationCache,
    oauthProxy: {
      fetchOAuthToken,
      upstreamFetch: fakeUpstream,
      emitSpan: async (args) => {
        spans.push(args);
      },
    },
  });

  return { app, policyCache, spans };
}

async function proxyCall(app: ReturnType<typeof createServer>, resource: Record<string, unknown>) {
  const issuer = generateKeypair();
  const agent = generateKeypair();
  const ucan = issueUcan({
    payload: makePayload(issuer.did, agent.did),
    privateKey: issuer.privateKey,
  });

  return app.request('/v1/proxy/github/issue/create', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-cb-customer': CUSTOMER },
    body: JSON.stringify({
      ucan: ucan.jwt,
      request: {
        ucan: ucan.jwt,
        command: '/github/issue/create',
        resource,
        context: {},
      },
      apiCall: {
        method: 'POST',
        path: '/repos/acme/billing/issues',
        body: { owner: 'acme', repo: 'billing', title: 'pay invoice' },
        intent: 'create issue per user request',
        nextAgentHint: 'researcher will summarize',
      },
    }),
  });
}

describe('PDP /v1/proxy span emission', () => {
  it('emits success span with status=success and upstream HTTP status', async () => {
    const fix = buildApp({ status: 201, body: { id: 42, url: 'https://github.com/acme' } });
    fix.policyCache.set(CUSTOMER, POLICY);

    const res = await proxyCall(fix.app, { repo: 'acme/billing' });
    expect(res.status).toBe(200);

    // Span emit is sync from PDP's perspective in this fixture (Promise.resolve).
    await Promise.resolve();

    expect(fix.spans).toHaveLength(1);
    const s = fix.spans[0]!;
    expect(s.customerId).toBe(CUSTOMER);
    expect(s.input.toolName).toBe('/github/issue/create');
    expect(s.input.status).toBe('success');
    expect(s.input.httpStatus).toBe(201);
    expect(s.input.latencyMs).toBeGreaterThanOrEqual(0);
    expect(s.input.requestArgsHash).toMatch(/^[0-9a-f]{64}$/);
    expect(s.input.requestSummary).toEqual({ owner: 'acme', repo: 'billing' });
    expect(s.input.responseHash).toMatch(/^[0-9a-f]{64}$/);
    expect(s.input.responseSummary).toEqual({ id: 42, url: 'https://github.com/acme' });
    expect(s.input.intent).toBe('create issue per user request');
    expect(s.input.nextAgentHint).toBe('researcher will summarize');
  });

  it('emits denied span when policy denies (resource mismatch)', async () => {
    const fix = buildApp({ status: 200, body: {} });
    fix.policyCache.set(CUSTOMER, POLICY);

    // resource.repo does not match the policy filter — Cedar denies.
    const res = await proxyCall(fix.app, { repo: 'acme/secrets' });
    expect(res.status).toBe(403);
    await Promise.resolve();

    expect(fix.spans).toHaveLength(1);
    const s = fix.spans[0]!;
    expect(s.input.status).toBe('denied');
    expect(s.input.errorCode).toBeTruthy();
    expect(s.input.httpStatus).toBeNull();
    // No upstream call ran → response artifacts absent.
    expect(s.input.responseHash).toBeNull();
    expect(s.input.responseSummary).toBeNull();
  });

  it('emits failure span when upstream returns 4xx', async () => {
    const fix = buildApp({ status: 404, body: { error_code: 'not_found' } });
    fix.policyCache.set(CUSTOMER, POLICY);

    const res = await proxyCall(fix.app, { repo: 'acme/billing' });
    expect(res.status).toBe(200);
    await Promise.resolve();

    expect(fix.spans).toHaveLength(1);
    const s = fix.spans[0]!;
    expect(s.input.status).toBe('failure');
    expect(s.input.httpStatus).toBe(404);
    expect(s.input.responseSummary).toEqual({ error_code: 'not_found' });
  });

  it('propagates apiCall.handoff envelope into EmitSpanInput.handoff', async () => {
    const fix = buildApp({ status: 201, body: { id: 7 } });
    fix.policyCache.set(CUSTOMER, POLICY);

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
        apiCall: {
          method: 'POST',
          path: '/repos/acme/billing/issues',
          body: { owner: 'acme', repo: 'billing', title: 'pay invoice' },
          handoff: {
            toAgentDid: 'did:web:researcher.acme.test',
            task: 'summarize the new issue and post to #ops',
            expectedOutput: 'one-paragraph slack message',
            rationale: 'caller is planner; researcher owns summarization',
          },
        },
      }),
    });
    expect(res.status).toBe(200);
    await Promise.resolve();

    expect(fix.spans).toHaveLength(1);
    const s = fix.spans[0]!;
    expect(s.input.handoff).toEqual({
      toAgentDid: 'did:web:researcher.acme.test',
      task: 'summarize the new issue and post to #ops',
      expectedOutput: 'one-paragraph slack message',
      rationale: 'caller is planner; researcher owns summarization',
    });
  });

  it('omits handoff on the span when apiCall has no handoff field', async () => {
    const fix = buildApp({ status: 201, body: { id: 8 } });
    fix.policyCache.set(CUSTOMER, POLICY);
    const res = await proxyCall(fix.app, { repo: 'acme/billing' });
    expect(res.status).toBe(200);
    await Promise.resolve();
    expect(fix.spans).toHaveLength(1);
    expect(fix.spans[0]!.input.handoff).toBeNull();
  });
});
