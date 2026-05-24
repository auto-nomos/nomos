import { describe, expect, it } from 'vitest';
import { freshNonce, signState, verifyState } from '../../oauth/state.js';

const SECRET = 'test-state-signing-secret-32+chars';

describe('signState / verifyState', () => {
  const payload = {
    customerId: 'cust-1',
    connector: 'github',
    nonce: 'abcd',
    exp: Date.now() + 60_000,
  };

  it('signs and verifies a fresh state', () => {
    const state = signState(SECRET, payload);
    const result = verifyState(SECRET, state);
    expect(result.ok).toBe(true);
    expect(result.payload).toEqual(payload);
  });

  it('rejects when signature is altered', () => {
    const state = signState(SECRET, payload);
    const tampered = `${state.slice(0, -2)}aa`;
    expect(verifyState(SECRET, tampered).reason).toMatch(/signature/);
  });

  it('rejects when payload is altered', () => {
    const state = signState(SECRET, payload);
    const [, sig] = state.split('.');
    const newPayloadJson = JSON.stringify({ ...payload, customerId: 'attacker' });
    const newPayloadB64 = Buffer.from(newPayloadJson).toString('base64url');
    const tampered = `${newPayloadB64}.${sig}`;
    expect(verifyState(SECRET, tampered).reason).toMatch(/signature/);
  });

  it('rejects when state is expired', () => {
    const oldPayload = { ...payload, exp: Date.now() - 10 };
    const state = signState(SECRET, oldPayload);
    expect(verifyState(SECRET, state).reason).toMatch(/expired/);
  });

  it('rejects malformed states', () => {
    expect(verifyState(SECRET, '').reason).toMatch(/missing/);
    expect(verifyState(SECRET, 'no-dot').reason).toMatch(/malformed/);
    expect(verifyState(SECRET, '@@@.@@@').reason).toMatch(/payload/);
    expect(verifyState(SECRET, 'aGVsbG8.signature').reason).toMatch(/JSON|signature/);
  });

  it('rejects signed-with-different-secret state', () => {
    const state = signState(SECRET, payload);
    expect(verifyState('different-secret-32+chars-abcd', state).reason).toMatch(/signature/);
  });

  it('rejects when payload shape is wrong', () => {
    const json = JSON.stringify({ customerId: 'x' });
    const b64 = Buffer.from(json).toString('base64url');
    const sig = Buffer.from('any').toString('base64url');
    expect(verifyState(SECRET, `${b64}.${sig}`).reason).toMatch(/shape|signature/);
  });

  it('respects an explicit `now` argument so tests are deterministic', () => {
    const state = signState(SECRET, { ...payload, exp: 5_000 });
    expect(verifyState(SECRET, state, 4_000).ok).toBe(true);
    expect(verifyState(SECRET, state, 5_001).reason).toMatch(/expired/);
  });

  // Regression: state signature compare must be constant-time on raw bytes,
  // not string compare on base64url. Verifies negative cases all return the
  // same failure code (i.e., no carrier signal beyond "mismatch") and that
  // a signature with a non-base64url byte sequence is rejected uniformly.
  it('rejects signatures with non-base64url bytes uniformly', () => {
    const state = signState(SECRET, payload);
    const [b64Payload] = state.split('.');
    const garbage = `${b64Payload}.!!!not-base64!!!`;
    expect(verifyState(SECRET, garbage).reason).toMatch(/signature/);
  });

  it('rejects signatures of the wrong length uniformly', () => {
    const state = signState(SECRET, payload);
    const [b64Payload, sig] = state.split('.');
    const truncated = `${b64Payload}.${sig?.slice(0, 10) ?? ''}`;
    expect(verifyState(SECRET, truncated).reason).toMatch(/signature/);
  });
});

describe('freshNonce', () => {
  it('returns 32 hex chars', () => {
    expect(freshNonce()).toMatch(/^[0-9a-f]{32}$/);
  });

  it('returns different values each call', () => {
    expect(freshNonce()).not.toBe(freshNonce());
  });
});
