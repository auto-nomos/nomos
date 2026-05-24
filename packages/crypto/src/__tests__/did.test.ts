import { describe, expect, it } from 'vitest';
import {
  canonicalizeDid,
  didFromPublicKey,
  ED25519_PUB_MULTICODEC,
  publicKeyFromDid,
} from '../did.js';

describe('didFromPublicKey', () => {
  it('throws on non-32-byte input', () => {
    expect(() => didFromPublicKey(new Uint8Array(31))).toThrow(/32-byte/);
    expect(() => didFromPublicKey(new Uint8Array(33))).toThrow(/32-byte/);
    expect(() => didFromPublicKey(new Uint8Array(0))).toThrow(/32-byte/);
  });

  it('produces did:key prefix with z multibase', () => {
    const pk = new Uint8Array(32).fill(7);
    const did = didFromPublicKey(pk);
    expect(did).toMatch(/^did:key:z[1-9A-HJ-NP-Za-km-z]+$/);
  });

  it('is deterministic for the same public key', () => {
    const pk = new Uint8Array(32).fill(0xab);
    expect(didFromPublicKey(pk)).toBe(didFromPublicKey(pk));
  });

  it('produces different DIDs for different public keys', () => {
    const a = new Uint8Array(32).fill(1);
    const b = new Uint8Array(32).fill(2);
    expect(didFromPublicKey(a)).not.toBe(didFromPublicKey(b));
  });

  it('embeds the ed25519 multicodec prefix', () => {
    expect(ED25519_PUB_MULTICODEC).toEqual(new Uint8Array([0xed, 0x01]));
  });
});

describe('publicKeyFromDid', () => {
  it('roundtrips through didFromPublicKey', () => {
    const pk = new Uint8Array(32);
    for (let i = 0; i < 32; i++) pk[i] = i + 1;
    const did = didFromPublicKey(pk);
    const decoded = publicKeyFromDid(did);
    expect(decoded).toEqual(pk);
  });

  it('throws on invalid format', () => {
    expect(() => publicKeyFromDid('not-a-did')).toThrow(/invalid did:key/);
    expect(() => publicKeyFromDid('did:web:example.com')).toThrow(/invalid did:key/);
    expect(() => publicKeyFromDid('did:key:abc')).toThrow(/invalid did:key/);
    expect(() => publicKeyFromDid('did:key:z0')).toThrow(/invalid did:key/);
  });

  it('throws when multicodec is not ed25519', () => {
    // craft a did:key with wrong multicodec (secp256k1 = 0xe701)
    // Build manually: prefix [0xe7, 0x01] + 32 bytes
    // base58btc encode and prepend did:key:z
    // We bypass our encoder by constructing bytes and calling base58btc directly via re-import.
    // Use a hardcoded did:key from secp256k1 example: did:key:zQ3sh...
    expect(() =>
      publicKeyFromDid('did:key:zQ3shZc2QzApp2oymGvQbzP8eKheVshBHbU4ZYjeXqwSKEn6N'),
    ).toThrow(/not an ed25519/);
  });

  it('throws when payload is too short', () => {
    // did:key:z2 base58btc-decodes to a single byte; our prefix check fails first ("not ed25519")
    // To exercise the "too short" branch, decode something < 3 bytes:
    // base58btc of [0x00] = 'z1' (single zero byte), decoded length 1 < 3
    expect(() => publicKeyFromDid('did:key:z1')).toThrow(/too short/);
  });

  it('canonicalizeDid returns the same canonical form for the input', () => {
    const pk = new Uint8Array(32).fill(9);
    const did = didFromPublicKey(pk);
    expect(canonicalizeDid(did)).toBe(did);
  });

  it('canonicalizeDid throws on invalid input', () => {
    expect(() => canonicalizeDid('did:web:example.com')).toThrow(/invalid did:key/);
    expect(() =>
      canonicalizeDid('did:key:zQ3shZc2QzApp2oymGvQbzP8eKheVshBHbU4ZYjeXqwSKEn6N'),
    ).toThrow(/not an ed25519/);
  });

  it('throws on truncated ed25519 pubkey', () => {
    // Construct did:key with valid ed25519 prefix but only 16 bytes of "pubkey"
    const truncated = new Uint8Array(2 + 16);
    truncated.set(ED25519_PUB_MULTICODEC, 0);
    // The simpler test: take a valid did, slice some bytes off the multibase part
    // Use a known short payload encoded manually
    // Compose: base58btc.encode([0xed, 0x01, 1,2,3,4]) yields short payload
    // We import base58btc inline to construct a malformed but parseable input.
    return import('multiformats/bases/base58').then(({ base58btc }) => {
      const malformed = new Uint8Array([0xed, 0x01, 1, 2, 3, 4]);
      const did = `did:key:${base58btc.encode(malformed)}`;
      expect(() => publicKeyFromDid(did)).toThrow(/unexpected ed25519 public key length/);
    });
  });
});
