import { ed25519 } from '@noble/curves/ed25519';
import { describe, expect, it, vi } from 'vitest';
import { generateKeypair } from '../keypair.js';
import { signDetached, verifyDetached } from '../sign.js';

describe('signDetached / verifyDetached', () => {
  it('roundtrips: sign then verify returns true', () => {
    const kp = generateKeypair();
    const payload = new TextEncoder().encode('hello world');
    const sig = signDetached(kp.privateKey, payload);
    expect(sig).toHaveLength(64);
    expect(verifyDetached(kp.publicKey, payload, sig)).toBe(true);
  });

  it('returns false on tampered signature', () => {
    const kp = generateKeypair();
    const payload = new TextEncoder().encode('hello');
    const sig = signDetached(kp.privateKey, payload);
    const tampered = new Uint8Array(sig);
    tampered[0] = ((tampered[0] ?? 0) ^ 0x01) & 0xff;
    expect(verifyDetached(kp.publicKey, payload, tampered)).toBe(false);
  });

  it('returns false on tampered payload', () => {
    const kp = generateKeypair();
    const payload = new TextEncoder().encode('hello');
    const sig = signDetached(kp.privateKey, payload);
    const tamperedPayload = new TextEncoder().encode('hellp');
    expect(verifyDetached(kp.publicKey, tamperedPayload, sig)).toBe(false);
  });

  it('returns false when verifying with the wrong public key', () => {
    const a = generateKeypair();
    const b = generateKeypair();
    const payload = new TextEncoder().encode('hello');
    const sig = signDetached(a.privateKey, payload);
    expect(verifyDetached(b.publicKey, payload, sig)).toBe(false);
  });

  it('returns false on wrong-length signature', () => {
    const kp = generateKeypair();
    expect(verifyDetached(kp.publicKey, new Uint8Array([1, 2, 3]), new Uint8Array(63))).toBe(false);
    expect(verifyDetached(kp.publicKey, new Uint8Array([1, 2, 3]), new Uint8Array(65))).toBe(false);
  });

  it('returns false on wrong-length public key', () => {
    expect(verifyDetached(new Uint8Array(31), new Uint8Array(8), new Uint8Array(64))).toBe(false);
    expect(verifyDetached(new Uint8Array(33), new Uint8Array(8), new Uint8Array(64))).toBe(false);
  });

  it('returns false instead of throwing when ed25519.verify rejects malformed bytes', () => {
    const kp = generateKeypair();
    const payload = new TextEncoder().encode('hello');
    // signature with valid length but invalid scalar/curve point
    const garbage = new Uint8Array(64).fill(0xff);
    expect(verifyDetached(kp.publicKey, payload, garbage)).toBe(false);
  });

  it('returns false when public key bytes do not decode to a valid curve point', () => {
    // Public key of all 0xff: y coord > p → not on curve, ed25519.verify throws
    const badKey = new Uint8Array(32).fill(0xff);
    const payload = new TextEncoder().encode('hello');
    const sig = new Uint8Array(64);
    expect(verifyDetached(badKey, payload, sig)).toBe(false);
  });

  it('catches synchronous throws from underlying verify', () => {
    const kp = generateKeypair();
    const payload = new TextEncoder().encode('hello');
    const sig = signDetached(kp.privateKey, payload);
    const spy = vi.spyOn(ed25519, 'verify').mockImplementation(() => {
      throw new Error('forced');
    });
    try {
      expect(verifyDetached(kp.publicKey, payload, sig)).toBe(false);
    } finally {
      spy.mockRestore();
    }
  });

  it('throws on wrong-length private key in signDetached', () => {
    expect(() => signDetached(new Uint8Array(31), new Uint8Array(1))).toThrow(/32-byte/);
  });

  it('signs deterministically for the same key + payload', () => {
    const kp = generateKeypair();
    const payload = new TextEncoder().encode('deterministic');
    const sig1 = signDetached(kp.privateKey, payload);
    const sig2 = signDetached(kp.privateKey, payload);
    expect(sig1).toEqual(sig2);
  });
});
