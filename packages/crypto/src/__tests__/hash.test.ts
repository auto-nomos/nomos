import { describe, expect, it } from 'vitest';
import { sha256, sha256Hex } from '../hash.js';

describe('sha256', () => {
  it('matches NIST test vector for empty input', () => {
    expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });

  it('matches NIST test vector for "abc"', () => {
    expect(sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('matches NIST test vector for 448-bit alphabet', () => {
    expect(sha256Hex('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')).toBe(
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
    );
  });

  it('returns 32-byte digest', () => {
    expect(sha256('abc')).toHaveLength(32);
  });

  it('treats string input as utf-8', () => {
    const fromString = sha256Hex('café');
    const fromBytes = sha256Hex(new TextEncoder().encode('café'));
    expect(fromString).toBe(fromBytes);
  });

  it('handles raw Uint8Array', () => {
    const bytes = new Uint8Array([0x61, 0x62, 0x63]);
    expect(sha256Hex(bytes)).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('produces 64-char lowercase hex from sha256Hex', () => {
    const hex = sha256Hex('hello');
    expect(hex).toHaveLength(64);
    expect(hex).toMatch(/^[0-9a-f]{64}$/);
  });
});
