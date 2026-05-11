import { generateKeypair } from '@auto-nomos/crypto';
import type { UcanPayload } from '@auto-nomos/shared-types';
import { issueUcan } from '@auto-nomos/ucan';
import pino from 'pino';
import { describe, expect, it, vi } from 'vitest';
import { createPolicyCache } from '../cache/policies.js';
import { createRevocationCache } from '../cache/revocations.js';
import type { StepUpStateResponse } from '../control-plane/client.js';
import { createServer } from '../server.js';

const CUSTOMER = '550e8400-e29b-41d4-a716-446655440000';
const AGENT_ID = '11111111-1111-1111-1111-111111111111';

const stripePolicy = `
permit(
  principal,
  action == Action::"/example/charge",
  resource
)
when {
  resource.amount <= 100
};

permit(
  principal,
  action == Action::"/example/charge",
  resource
)
when {
  resource.amount > 100 && context has "cosigner" && context.cosigner == true
};
`;

function makePayload(iss: string, aud: string, overrides: Partial<UcanPayload> = {}): UcanPayload {
  const now = Math.floor(Date.now() / 1000);
  return {
    iss,
    aud,
    cmd: '/example/charge',
    pol: [],
    nonce: `n-${Math.random()}`,
    nbf: now - 60,
    exp: now + 600,
    meta: { agent_id: AGENT_ID },
    ...overrides,
  };
}

function buildApp(stepupCreate?: ReturnType<typeof vi.fn>) {
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
  const stepupState = new Map<string, StepUpStateResponse>();
  const create =
    stepupCreate ??
    vi.fn(async (args: { customerId: string; agentId: string; command: string }) => {
      const id = `aprv-${Math.random().toString(16).slice(2, 10)}`;
      stepupState.set(id, {
        id,
        customerId: args.customerId,
        agentId: args.agentId,
        command: args.command,
        resource: {},
        state: 'pending',
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        decidedAt: null,
        cosignerAttestationJwt: null,
      });
      return { id, deepLink: `http://localhost:3000/approve/${id}` };
    });
  const app = createServer({
    logger,
    policyCache,
    revocationCache,
    stepup: {
      create,
      getStepUp: async (id) => stepupState.get(id),
    },
  });
  return { app, policyCache, revocationCache, create, stepupState };
}

describe('POST /v1/authorize step-up', () => {
  it('allows under-threshold charge without step-up', async () => {
    const { app, policyCache, create } = buildApp();
    policyCache.set(CUSTOMER, stripePolicy);
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
        command: '/example/charge',
        resource: { amount: 50 },
        context: {},
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { allow: boolean; requiresStepUp?: boolean };
    expect(body.allow).toBe(true);
    expect(body.requiresStepUp).toBeUndefined();
    expect(create).not.toHaveBeenCalled();
  });

  it('over-threshold charge returns requiresStepUp + creates approval', async () => {
    const { app, policyCache, create } = buildApp();
    policyCache.set(CUSTOMER, stripePolicy);
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
        command: '/example/charge',
        resource: { amount: 250 },
        context: {},
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      allow: boolean;
      reason: string;
      requiresStepUp: boolean;
      stepUpUrl: string;
      stepUpId: string;
    };
    expect(body.allow).toBe(false);
    expect(body.reason).toBe('step_up_required');
    expect(body.requiresStepUp).toBe(true);
    expect(body.stepUpId).toMatch(/^aprv-/);
    expect(body.stepUpUrl).toContain('/approve/');
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        customerId: CUSTOMER,
        agentId: AGENT_ID,
        command: '/example/charge',
        resource: { amount: 250 },
      }),
    );
  });

  it('does not loop when caller already supplies cosigner=true', async () => {
    const { app, policyCache, create } = buildApp();
    policyCache.set(CUSTOMER, stripePolicy);
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
        command: '/example/charge',
        resource: { amount: 250 },
        context: { cosigner: true },
      }),
    });
    const body = (await res.json()) as { allow: boolean; requiresStepUp?: boolean };
    expect(body.allow).toBe(true);
    expect(body.requiresStepUp).toBeUndefined();
    expect(create).not.toHaveBeenCalled();
  });

  it('expired UCAN does not trigger step-up (real deny)', async () => {
    const { app, policyCache, create } = buildApp();
    policyCache.set(CUSTOMER, stripePolicy);
    const issuer = generateKeypair();
    const agent = generateKeypair();
    const ucan = issueUcan({
      payload: makePayload(issuer.did, agent.did, {
        exp: Math.floor(Date.now() / 1000) - 10,
      }),
      privateKey: issuer.privateKey,
    });
    const res = await app.request('/v1/authorize', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-cb-customer': CUSTOMER },
      body: JSON.stringify({
        ucan: ucan.jwt,
        command: '/example/charge',
        resource: { amount: 250 },
        context: {},
      }),
    });
    const body = (await res.json()) as { allow: boolean; reason: string; requiresStepUp?: boolean };
    expect(body.allow).toBe(false);
    expect(body.reason).toBe('expired');
    expect(body.requiresStepUp).toBeUndefined();
    expect(create).not.toHaveBeenCalled();
  });
});

describe('POST /v1/authorize cosigner retry', () => {
  it('allows when cosignerJwt is valid + approval=approved', async () => {
    const { app, policyCache, stepupState } = buildApp();
    policyCache.set(CUSTOMER, stripePolicy);
    const issuer = generateKeypair();
    const agent = generateKeypair();
    const requestUcan = issueUcan({
      payload: makePayload(issuer.did, agent.did),
      privateKey: issuer.privateKey,
    });
    const origCid = (await import('@auto-nomos/ucan')).computeCid(requestUcan.jwt);
    const approvalId = 'aprv-cosign-1';
    const cosigner = issueUcan({
      payload: {
        iss: issuer.did,
        aud: agent.did,
        cmd: '/example/charge',
        pol: [],
        nonce: 'cos',
        nbf: Math.floor(Date.now() / 1000) - 60,
        exp: Math.floor(Date.now() / 1000) + 600,
        meta: { cosigner_for: origCid, approval_id: approvalId, decided_by: 'u-1' },
      },
      privateKey: issuer.privateKey,
    });
    stepupState.set(approvalId, {
      id: approvalId,
      customerId: CUSTOMER,
      agentId: AGENT_ID,
      command: '/example/charge',
      resource: { amount: 250 },
      state: 'approved',
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      decidedAt: new Date().toISOString(),
      cosignerAttestationJwt: cosigner.jwt,
    });
    const res = await app.request('/v1/authorize', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-cb-customer': CUSTOMER },
      body: JSON.stringify({
        ucan: requestUcan.jwt,
        command: '/example/charge',
        resource: { amount: 250 },
        context: {},
        cosignerJwt: cosigner.jwt,
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { allow: boolean; requiresStepUp?: boolean };
    expect(body.allow).toBe(true);
    expect(body.requiresStepUp).toBeUndefined();
  });

  it('denies cosigner_mismatch when JWT cid does not match request', async () => {
    const { app, policyCache, stepupState } = buildApp();
    policyCache.set(CUSTOMER, stripePolicy);
    const issuer = generateKeypair();
    const agent = generateKeypair();
    const requestUcan = issueUcan({
      payload: makePayload(issuer.did, agent.did),
      privateKey: issuer.privateKey,
    });
    const approvalId = 'aprv-cosign-2';
    const cosigner = issueUcan({
      payload: {
        iss: issuer.did,
        aud: agent.did,
        cmd: '/example/charge',
        pol: [],
        nonce: 'cos2',
        nbf: Math.floor(Date.now() / 1000) - 60,
        exp: Math.floor(Date.now() / 1000) + 600,
        meta: {
          cosigner_for: 'b' + 'x'.repeat(46),
          approval_id: approvalId,
          decided_by: 'u-1',
        },
      },
      privateKey: issuer.privateKey,
    });
    stepupState.set(approvalId, {
      id: approvalId,
      customerId: CUSTOMER,
      agentId: AGENT_ID,
      command: '/example/charge',
      resource: { amount: 250 },
      state: 'approved',
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      decidedAt: new Date().toISOString(),
      cosignerAttestationJwt: cosigner.jwt,
    });
    const res = await app.request('/v1/authorize', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-cb-customer': CUSTOMER },
      body: JSON.stringify({
        ucan: requestUcan.jwt,
        command: '/example/charge',
        resource: { amount: 250 },
        context: {},
        cosignerJwt: cosigner.jwt,
      }),
    });
    const body = (await res.json()) as { allow: boolean; reason: string };
    expect(body.allow).toBe(false);
    expect(body.reason).toBe('cosigner_invalid');
  });
});

describe('GET /v1/stepup/:id', () => {
  it('returns approval state for the right customer', async () => {
    const { app, policyCache, stepupState } = buildApp();
    policyCache.set(CUSTOMER, stripePolicy);
    stepupState.set('aprv-123', {
      id: 'aprv-123',
      customerId: CUSTOMER,
      agentId: AGENT_ID,
      command: '/example/charge',
      resource: { amount: 250 },
      state: 'pending',
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      decidedAt: null,
      cosignerAttestationJwt: null,
    });
    const res = await app.request('/v1/stepup/aprv-123', {
      headers: { 'x-cb-customer': CUSTOMER },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { state: string; cosignerJwt: string | null };
    expect(body.state).toBe('pending');
    expect(body.cosignerJwt).toBeNull();
  });

  it('returns 404 for cross-customer reads', async () => {
    const { app, policyCache, stepupState } = buildApp();
    policyCache.set(CUSTOMER, stripePolicy);
    stepupState.set('aprv-456', {
      id: 'aprv-456',
      customerId: 'other-customer',
      agentId: AGENT_ID,
      command: '/example/charge',
      resource: {},
      state: 'pending',
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      decidedAt: null,
      cosignerAttestationJwt: null,
    });
    const res = await app.request('/v1/stepup/aprv-456', {
      headers: { 'x-cb-customer': CUSTOMER },
    });
    expect(res.status).toBe(404);
  });
});
