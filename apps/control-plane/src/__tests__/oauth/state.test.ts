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
});

describe('freshNonce', () => {
  it('returns 32 hex chars', () => {
    expect(freshNonce()).toMatch(/^[0-9a-f]{32}$/);
  });

  it('returns different values each call', () => {
    expect(freshNonce()).not.toBe(freshNonce());
  });
});
