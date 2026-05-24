/**
 * AAD tests for sealString / openString.
 *
 * Audit finding H2 (2026-05-24): OAuth token AEAD lacked AAD binding to row
 * identity, so a DB-write attacker could copy ciphertext between rows and have
 * it decrypt to the original plaintext. Fix threads optional `aad` through both
 * functions; these tests pin the contract.
 */

import { hexToBytes } from '@noble/hashes/utils';
import { describe, expect, it } from 'vitest';
import { generateSecretboxKeyHex, openString, sealString } from '../secretbox.js';

const utf8 = (s: string) => new TextEncoder().encode(s);

describe('secretbox AAD binding', () => {
  const key = hexToBytes(generateSecretboxKeyHex());

  it('round-trips when AAD matches at seal and open', () => {
    const aad = utf8('oauth-token-v1|cust-A|github|acct-1');
    const sealed = sealString(key, 'plaintext', aad);
    expect(openString(key, sealed.ciphertextHex, sealed.nonceHex, aad)).toBe('plaintext');
  });

  it('rejects open with wrong AAD (cross-tenant ciphertext swap)', () => {
    const aadA = utf8('oauth-token-v1|cust-A|github|acct-1');
    const aadB = utf8('oauth-token-v1|cust-B|github|acct-1');
    const sealed = sealString(key, 'A-secret', aadA);
    expect(() => openString(key, sealed.ciphertextHex, sealed.nonceHex, aadB)).toThrow();
  });

  it('rejects open with no AAD when sealed with AAD', () => {
    const aad = utf8('oauth-token-v1|cust-A|github|acct-1');
    const sealed = sealString(key, 'tied-down', aad);
    expect(() => openString(key, sealed.ciphertextHex, sealed.nonceHex)).toThrow();
  });

  it('legacy path: open with no AAD when sealed with no AAD still works (back-compat)', () => {
    const sealed = sealString(key, 'legacy-row');
    expect(openString(key, sealed.ciphertextHex, sealed.nonceHex)).toBe('legacy-row');
  });

  it('rejects open with AAD when sealed without AAD', () => {
    const sealed = sealString(key, 'legacy-row');
    const aad = utf8('oauth-token-v1|cust-A|github|acct-1');
    expect(() => openString(key, sealed.ciphertextHex, sealed.nonceHex, aad)).toThrow();
  });
});
