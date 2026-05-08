import { describe, expect, it } from 'vitest';
import { publicKeyFromDid } from '../did.js';
import { generateKeypair, keypairFromPrivate } from '../keypair.js';

describe('generateKeypair', () => {
  it('produces 32-byte private + public keys', () => {
    const kp = generateKeypair();
    expect(kp.privateKey).toHaveLength(32);
    expect(kp.publicKey).toHaveLength(32);
  });

  it('produces a did:key matching the public key', () => {
    const kp = generateKeypair();
    expect(kp.did).toMatch(/^did:key:z[1-9A-HJ-NP-Za-km-z]+$/);
    expect(publicKeyFromDid(kp.did)).toEqual(kp.publicKey);
  });

  it('produces unique keypairs across calls', () => {
    const a = generateKeypair();
    const b = generateKeypair();
    expect(a.did).not.toBe(b.did);
    expect(a.privateKey).not.toEqual(b.privateKey);
  });
});

describe('keypairFromPrivate', () => {
  it('rejects non-32-byte private key', () => {
    expect(() => keypairFromPrivate(new Uint8Array(31))).toThrow(/32-byte/);
    expect(() => keypairFromPrivate(new Uint8Array(33))).toThrow(/32-byte/);
  });

  it('is deterministic for fixed private key', () => {
    const priv = new Uint8Array(32).fill(0x42);
    const a = keypairFromPrivate(priv);
    const b = keypairFromPrivate(priv);
    expect(a.did).toBe(b.did);
    expect(a.publicKey).toEqual(b.publicKey);
  });

  it('matches generateKeypair output for the same private key', () => {
    const kp1 = generateKeypair();
    const kp2 = keypairFromPrivate(kp1.privateKey);
    expect(kp2.did).toBe(kp1.did);
    expect(kp2.publicKey).toEqual(kp1.publicKey);
  });
});
