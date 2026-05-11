import { generateKeypair } from '@auto-nomos/crypto';
import type { UcanPayload } from '@auto-nomos/shared-types';
import { describe, expect, it } from 'vitest';
import { validateChain } from '../chain.js';
import { issueUcan } from '../issue.js';

const NOW = 1_700_001_000;

function makeUcan(
  iss: { did: string; privateKey: Uint8Array },
  aud: string,
  overrides: Partial<UcanPayload> = {},
) {
  const base: UcanPayload = {
    iss: iss.did,
    aud,
    cmd: '/github',
    pol: [],
    nonce: `nonce-${Math.random()}`,
    nbf: 1_700_000_000,
    exp: 1_700_003_600,
    ...overrides,
  };
  return issueUcan({ payload: base, privateKey: iss.privateKey });
}

describe('validateChain', () => {
  it('rejects empty chain', () => {
    expect(validateChain([])).toEqual({ valid: false, error: 'empty_chain' });
  });

  it('accepts a single valid UCAN', () => {
    const root = generateKeypair();
    const agent = generateKeypair();
    const ucan = makeUcan(root, agent.did);
    const res = validateChain([ucan.jwt], {
      now: NOW,
      audience: agent.did,
      expectedCommand: '/github/issue/create',
    });
    expect(res.valid).toBe(true);
  });

  it('accepts a 3-link delegation chain', () => {
    const root = generateKeypair();
    const mid = generateKeypair();
    const leaf = generateKeypair();
    const a = makeUcan(root, mid.did, { cmd: '/github' });
    const b = makeUcan(mid, leaf.did, { cmd: '/github/issue', exp: 1_700_002_000 });
    const c = makeUcan(leaf, leaf.did, { cmd: '/github/issue/create', exp: 1_700_001_500 });
    // Note c.iss must equal b.aud (leaf.did) — leaf is delegating to itself or to a sub-agent
    const res = validateChain([a.jwt, b.jwt, c.jwt], { now: NOW });
    expect(res.valid).toBe(true);
  });

  it('rejects when child issuer does not equal parent audience', () => {
    const root = generateKeypair();
    const mid = generateKeypair();
    const otherAgent = generateKeypair();
    const a = makeUcan(root, mid.did, { cmd: '/github' });
    // b.iss = otherAgent (mismatched against a.aud=mid)
    const b = makeUcan(otherAgent, otherAgent.did, { cmd: '/github/issue/create' });
    const res = validateChain([a.jwt, b.jwt], { now: NOW });
    expect(res).toEqual({ valid: false, error: 'broken_delegation' });
  });

  it('rejects when child cmd is broader than parent cmd', () => {
    const root = generateKeypair();
    const mid = generateKeypair();
    const a = makeUcan(root, mid.did, { cmd: '/github/issue' });
    const b = makeUcan(mid, mid.did, { cmd: '/github' }); // broader
    const res = validateChain([a.jwt, b.jwt], { now: NOW });
    expect(res).toEqual({ valid: false, error: 'over_attenuated' });
  });

  it('rejects when child exp exceeds parent exp', () => {
    const root = generateKeypair();
    const mid = generateKeypair();
    const a = makeUcan(root, mid.did, { exp: 1_700_002_000 });
    const b = makeUcan(mid, mid.did, { exp: 1_700_005_000 });
    const res = validateChain([a.jwt, b.jwt], { now: NOW });
    expect(res).toEqual({ valid: false, error: 'over_attenuated' });
  });

  it('rejects when child nbf precedes parent nbf', () => {
    const root = generateKeypair();
    const mid = generateKeypair();
    const a = makeUcan(root, mid.did, { nbf: 1_700_000_500 });
    const b = makeUcan(mid, mid.did, { nbf: 1_700_000_000 });
    const res = validateChain([a.jwt, b.jwt], { now: 1_700_000_700 });
    expect(res).toEqual({ valid: false, error: 'over_attenuated' });
  });

  it('propagates per-ucan validation errors', () => {
    const root = generateKeypair();
    const mid = generateKeypair();
    const a = makeUcan(root, mid.did, { exp: NOW - 10 });
    const res = validateChain([a.jwt], { now: NOW });
    expect(res).toEqual({ valid: false, error: 'expired' });
  });

  it('accepts child constraint that is a path-prefix subset of parent', () => {
    const root = generateKeypair();
    const mid = generateKeypair();
    const a = makeUcan(root, mid.did, {
      cmd: '/filesystem/read',
      meta: { resource_constraint: { provider: 'filesystem', path_prefix: '/Users/x/finance/' } },
    });
    const b = makeUcan(mid, mid.did, {
      cmd: '/filesystem/read',
      meta: {
        resource_constraint: { provider: 'filesystem', path_prefix: '/Users/x/finance/2026/' },
      },
    });
    const res = validateChain([a.jwt, b.jwt], { now: NOW });
    expect(res.valid).toBe(true);
  });

  it('rejects child constraint that escapes parent prefix', () => {
    const root = generateKeypair();
    const mid = generateKeypair();
    const a = makeUcan(root, mid.did, {
      cmd: '/filesystem/read',
      meta: { resource_constraint: { provider: 'filesystem', path_prefix: '/Users/x/finance/' } },
    });
    const b = makeUcan(mid, mid.did, {
      cmd: '/filesystem/read',
      meta: { resource_constraint: { provider: 'filesystem', path_prefix: '/Users/x/' } },
    });
    const res = validateChain([a.jwt, b.jwt], { now: NOW });
    expect(res).toEqual({ valid: false, error: 'over_attenuated' });
  });

  it('child without constraint inherits parent constraint', () => {
    const root = generateKeypair();
    const mid = generateKeypair();
    const a = makeUcan(root, mid.did, {
      cmd: '/filesystem/read',
      meta: { resource_constraint: { provider: 'filesystem', path_prefix: '/Users/x/finance/' } },
    });
    const b = makeUcan(mid, mid.did, { cmd: '/filesystem/read' });
    const res = validateChain([a.jwt, b.jwt], { now: NOW });
    expect(res.valid).toBe(true);
  });

  it('only enforces audience and expectedCommand on the leaf', () => {
    const root = generateKeypair();
    const mid = generateKeypair();
    const leaf = generateKeypair();
    const other = generateKeypair();
    const a = makeUcan(root, mid.did, { cmd: '/github' });
    const b = makeUcan(mid, leaf.did, { cmd: '/github/issue/create' });
    const res = validateChain([a.jwt, b.jwt], {
      now: NOW,
      audience: leaf.did,
      expectedCommand: '/github/issue/create',
    });
    expect(res.valid).toBe(true);
    // Wrong leaf audience should fail
    expect(
      validateChain([a.jwt, b.jwt], {
        now: NOW,
        audience: other.did,
        expectedCommand: '/github/issue/create',
      }),
    ).toEqual({ valid: false, error: 'audience_mismatch' });
  });
});
