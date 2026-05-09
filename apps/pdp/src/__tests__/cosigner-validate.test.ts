import { generateKeypair } from '@credential-broker/crypto';
import type { UcanPayload } from '@credential-broker/shared-types';
import { computeCid, issueUcan } from '@credential-broker/ucan';
import { describe, expect, it } from 'vitest';
import type { StepUpStateResponse } from '../control-plane/client.js';
import { validateCosigner } from '../services/cosigner-validate.js';

function makePayload(
  iss: string,
  aud: string,
  origCid: string,
  approvalId: string,
  overrides: Partial<UcanPayload> = {},
): UcanPayload {
  const now = Math.floor(Date.now() / 1000);
  return {
    iss,
    aud,
    cmd: '/stripe/charge',
    pol: [],
    nonce: `n-${Math.random()}`,
    nbf: now - 60,
    exp: now + 600,
    meta: { cosigner_for: origCid, approval_id: approvalId, decided_by: 'user-x' },
    ...overrides,
  };
}

function approvalRow(args: {
  id: string;
  customerId?: string;
  agentId?: string;
  state?: 'pending' | 'approved' | 'denied' | 'expired';
  cosignerJwt?: string | null;
}): StepUpStateResponse {
  return {
    id: args.id,
    customerId: args.customerId ?? 'cust',
    agentId: args.agentId ?? 'ag',
    command: '/stripe/charge',
    resource: { amount: 250 },
    state: args.state ?? 'approved',
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    decidedAt: new Date().toISOString(),
    cosignerAttestationJwt: args.cosignerJwt ?? null,
  };
}

describe('validateCosigner', () => {
  const cp = generateKeypair();
  const agent = generateKeypair();
  const requestUcan = issueUcan({
    payload: {
      iss: cp.did,
      aud: agent.did,
      cmd: '/stripe/charge',
      pol: [],
      nonce: 'orig',
      nbf: Math.floor(Date.now() / 1000) - 60,
      exp: Math.floor(Date.now() / 1000) + 600,
    },
    privateKey: cp.privateKey,
  });
  const origCid = computeCid(requestUcan.jwt);

  it('approves a valid cosigner that matches stored approval', async () => {
    const cosigner = issueUcan({
      payload: makePayload(cp.did, agent.did, origCid, 'aprv-1'),
      privateKey: cp.privateKey,
    });
    const approval = approvalRow({ id: 'aprv-1', cosignerJwt: cosigner.jwt });
    const result = await validateCosigner({
      cosignerJwt: cosigner.jwt,
      requestUcan: requestUcan.jwt,
      command: '/stripe/charge',
      fetchApproval: async () => approval,
    });
    expect(result).toEqual({ ok: true, approvalId: 'aprv-1' });
  });

  it('rejects when meta.cosigner_for does not match request UCAN cid', async () => {
    const cosigner = issueUcan({
      payload: makePayload(cp.did, agent.did, 'b' + 'z'.repeat(46), 'aprv-2'),
      privateKey: cp.privateKey,
    });
    const result = await validateCosigner({
      cosignerJwt: cosigner.jwt,
      requestUcan: requestUcan.jwt,
      command: '/stripe/charge',
      fetchApproval: async () => approvalRow({ id: 'aprv-2', cosignerJwt: cosigner.jwt }),
    });
    expect(result).toEqual({ ok: false, reason: 'cosigner_mismatch' });
  });

  it('rejects when stored cosigner_attestation_jwt differs (replay)', async () => {
    const cosigner = issueUcan({
      payload: makePayload(cp.did, agent.did, origCid, 'aprv-3'),
      privateKey: cp.privateKey,
    });
    const result = await validateCosigner({
      cosignerJwt: cosigner.jwt,
      requestUcan: requestUcan.jwt,
      command: '/stripe/charge',
      fetchApproval: async () => approvalRow({ id: 'aprv-3', cosignerJwt: 'something-else' }),
    });
    expect(result).toEqual({ ok: false, reason: 'cosigner_mismatch' });
  });

  it('rejects when approval is denied', async () => {
    const cosigner = issueUcan({
      payload: makePayload(cp.did, agent.did, origCid, 'aprv-4'),
      privateKey: cp.privateKey,
    });
    const result = await validateCosigner({
      cosignerJwt: cosigner.jwt,
      requestUcan: requestUcan.jwt,
      command: '/stripe/charge',
      fetchApproval: async () =>
        approvalRow({ id: 'aprv-4', state: 'denied', cosignerJwt: cosigner.jwt }),
    });
    expect(result).toEqual({ ok: false, reason: 'cosigner_not_approved' });
  });

  it('rejects expired cosigner UCAN', async () => {
    const cosigner = issueUcan({
      payload: makePayload(cp.did, agent.did, origCid, 'aprv-5', {
        exp: Math.floor(Date.now() / 1000) - 10,
      }),
      privateKey: cp.privateKey,
    });
    const result = await validateCosigner({
      cosignerJwt: cosigner.jwt,
      requestUcan: requestUcan.jwt,
      command: '/stripe/charge',
      fetchApproval: async () => approvalRow({ id: 'aprv-5', cosignerJwt: cosigner.jwt }),
    });
    expect(result).toEqual({ ok: false, reason: 'cosigner_expired' });
  });

  it('rejects malformed cosigner JWT', async () => {
    const result = await validateCosigner({
      cosignerJwt: 'not.a.jwt',
      requestUcan: requestUcan.jwt,
      command: '/stripe/charge',
      fetchApproval: async () => undefined,
    });
    expect(result).toEqual({ ok: false, reason: 'cosigner_invalid' });
  });

  it('rejects when approval id from cosigner does not exist', async () => {
    const cosigner = issueUcan({
      payload: makePayload(cp.did, agent.did, origCid, 'aprv-missing'),
      privateKey: cp.privateKey,
    });
    const result = await validateCosigner({
      cosignerJwt: cosigner.jwt,
      requestUcan: requestUcan.jwt,
      command: '/stripe/charge',
      fetchApproval: async () => undefined,
    });
    expect(result).toEqual({ ok: false, reason: 'cosigner_invalid' });
  });
});
