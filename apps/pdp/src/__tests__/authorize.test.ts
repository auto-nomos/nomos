import { generateKeypair } from '@auto-nomos/crypto';
import type { UcanPayload } from '@auto-nomos/shared-types';
import { issueUcan } from '@auto-nomos/ucan';
import pino from 'pino';
import { describe, expect, it } from 'vitest';
import { createPolicyCache } from '../cache/policies.js';
import { createRevocationCache } from '../cache/revocations.js';
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

function buildApp(opts: { trustedIssuerDid?: string } = {}) {
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
  const app = createServer({
    logger,
    policyCache,
    revocationCache,
    ...(opts.trustedIssuerDid !== undefined ? { trustedIssuerDid: opts.trustedIssuerDid } : {}),
    emitAudit: async (ev) => {
      audits.push({ command: ev.request.command, allow: ev.decision.allow });
    },
  });
  return { app, policyCache, revocationCache, audits };
}

describe('POST /v1/authorize', () => {
  it('returns 200 allow when UCAN + policy + request align', async () => {
    const { app, policyCache } = buildApp();
    policyCache.set(CUSTOMER, githubPolicy);

    const issuer = generateKeypair();
    const agent = generateKeypair();
    const ucan = issueUcan({
      payload: makePayload(issuer.did, agent.did),
      privateKey: issuer.privateKey,
    });

    const res = await app.request('/v1/authorize', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-cb-customer': CUSTOMER },
      body: JSON.stringify({
        ucan: ucan.jwt,
        command: '/github/issue/create',
        resource: { repo: 'acme/billing' },
        context: {},
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { allow: boolean; receiptId: string };
    expect(body.allow).toBe(true);
    expect(body.receiptId).toMatch(/^[0-9a-f]{64}$/);
  });

  it('returns 200 deny + reason=expired for an expired UCAN', async () => {
    const { app, policyCache } = buildApp();
    policyCache.set(CUSTOMER, githubPolicy);

    const issuer = generateKeypair();
    const agent = generateKeypair();
    const ucan = issueUcan({
      payload: makePayload(issuer.did, agent.did, { exp: Math.floor(Date.now() / 1000) - 10 }),
      privateKey: issuer.privateKey,
    });

    const res = await app.request('/v1/authorize', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-cb-customer': CUSTOMER },
      body: JSON.stringify({
        ucan: ucan.jwt,
        command: '/github/issue/create',
        resource: { repo: 'acme/billing' },
        context: {},
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { allow: boolean; reason: string };
    expect(body.allow).toBe(false);
    expect(body.reason).toBe('expired');
  });

  it('returns 200 deny + reason=revoked when CID is in revocation cache', async () => {
    const { app, policyCache, revocationCache } = buildApp();
    policyCache.set(CUSTOMER, githubPolicy);

    const issuer = generateKeypair();
    const agent = generateKeypair();
    const ucan = issueUcan({
      payload: makePayload(issuer.did, agent.did),
      privateKey: issuer.privateKey,
    });
    revocationCache.set(CUSTOMER, [ucan.cid]);

    const res = await app.request('/v1/authorize', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-cb-customer': CUSTOMER },
      body: JSON.stringify({
        ucan: ucan.jwt,
        command: '/github/issue/create',
        resource: { repo: 'acme/billing' },
        context: {},
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { allow: boolean; reason: string };
    expect(body.allow).toBe(false);
    expect(body.reason).toBe('revoked');
  });

  it('returns 200 deny + reason=command_mismatch when UCAN cmd does not cover request', async () => {
    const { app, policyCache } = buildApp();
    policyCache.set(CUSTOMER, githubPolicy);

    const issuer = generateKeypair();
    const agent = generateKeypair();
    const ucan = issueUcan({
      payload: makePayload(issuer.did, agent.did, { cmd: '/github/issue/create' }),
      privateKey: issuer.privateKey,
    });

    const res = await app.request('/v1/authorize', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-cb-customer': CUSTOMER },
      body: JSON.stringify({
        ucan: ucan.jwt,
        command: '/github/pr/merge',
        resource: { repo: 'acme/billing' },
        context: {},
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { allow: boolean; reason: string };
    expect(body.allow).toBe(false);
    expect(body.reason).toBe('command_mismatch');
  });

  it('returns 200 deny + reason=policy_denied when policy says no', async () => {
    const { app, policyCache } = buildApp();
    policyCache.set(CUSTOMER, githubPolicy);

    const issuer = generateKeypair();
    const agent = generateKeypair();
    const ucan = issueUcan({
      payload: makePayload(issuer.did, agent.did),
      privateKey: issuer.privateKey,
    });

    const res = await app.request('/v1/authorize', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-cb-customer': CUSTOMER },
      body: JSON.stringify({
        ucan: ucan.jwt,
        command: '/github/issue/create',
        resource: { repo: 'attacker/repo' }, // not acme/billing
        context: {},
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { allow: boolean; reason: string };
    expect(body.allow).toBe(false);
    expect(body.reason).toBe('policy_denied');
  });

  it('returns 200 deny + reason=untrusted_issuer when PDP is pinned to another root issuer', async () => {
    const trusted = generateKeypair();
    const { app, policyCache } = buildApp({ trustedIssuerDid: trusted.did });
    policyCache.set(CUSTOMER, githubPolicy);

    const attacker = generateKeypair();
    const agent = generateKeypair();
    const ucan = issueUcan({
      payload: makePayload(attacker.did, agent.did),
      privateKey: attacker.privateKey,
    });

    const res = await app.request('/v1/authorize', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-cb-customer': CUSTOMER },
      body: JSON.stringify({
        ucan: ucan.jwt,
        command: '/github/issue/create',
        resource: { repo: 'acme/billing' },
        context: {},
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { allow: boolean; reason: string };
    expect(body.allow).toBe(false);
    expect(body.reason).toBe('untrusted_issuer');
  });

  it('returns 400 when JSON body is malformed', async () => {
    const { app, policyCache } = buildApp();
    policyCache.set(CUSTOMER, githubPolicy);
    const res = await app.request('/v1/authorize', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-cb-customer': CUSTOMER },
      body: 'not-json',
    });
    expect(res.status).toBe(400);
  });

  it('returns 400 when AuthorizeRequest shape is invalid', async () => {
    const { app, policyCache } = buildApp();
    policyCache.set(CUSTOMER, githubPolicy);
    const res = await app.request('/v1/authorize', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-cb-customer': CUSTOMER },
      body: JSON.stringify({ command: 'no-leading-slash' }),
    });
    expect(res.status).toBe(400);
  });

  it('returns 400 when x-cb-customer header is missing', async () => {
    const { app } = buildApp();
    const res = await app.request('/v1/authorize', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ucan: 'x',
        command: '/x/y',
        resource: {},
        context: {},
      }),
    });
    expect(res.status).toBe(400);
  });

  it('returns 404 when customer has no policy bundle cached', async () => {
    const { app } = buildApp();
    const issuer = generateKeypair();
    const agent = generateKeypair();
    const ucan = issueUcan({
      payload: makePayload(issuer.did, agent.did),
      privateKey: issuer.privateKey,
    });
    const res = await app.request('/v1/authorize', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-cb-customer': CUSTOMER },
      body: JSON.stringify({
        ucan: ucan.jwt,
        command: '/github/issue/create',
        resource: { repo: 'acme/billing' },
        context: {},
      }),
    });
    expect(res.status).toBe(404);
  });

  it('emits an audit event on successful allow', async () => {
    const { app, policyCache, audits } = buildApp();
    policyCache.set(CUSTOMER, githubPolicy);

    const issuer = generateKeypair();
    const agent = generateKeypair();
    const ucan = issueUcan({
      payload: makePayload(issuer.did, agent.did),
      privateKey: issuer.privateKey,
    });
    await app.request('/v1/authorize', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-cb-customer': CUSTOMER },
      body: JSON.stringify({
        ucan: ucan.jwt,
        command: '/github/issue/create',
        resource: { repo: 'acme/billing' },
        context: {},
      }),
    });
    expect(audits).toHaveLength(1);
    expect(audits[0]).toEqual({ command: '/github/issue/create', allow: true });
  });
});
