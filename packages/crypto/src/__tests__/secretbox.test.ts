import { hexToBytes } from '@noble/hashes/utils';
import { describe, expect, it } from 'vitest';
import {
  generateSecretboxKeyHex,
  loadSecretboxKey,
  openString,
  SECRETBOX_KEY_LEN,
  SECRETBOX_NONCE_LEN,
  sealString,
} from '../secretbox.js';

describe('secretbox', () => {
  describe('generateSecretboxKeyHex', () => {
    it('returns 64 hex chars (32 bytes)', () => {
      const hex = generateSecretboxKeyHex();
      expect(hex).toHaveLength(SECRETBOX_KEY_LEN * 2);
      expect(hex).toMatch(/^[0-9a-f]+$/);
    });

    it('returns different values each call', () => {
      const a = generateSecretboxKeyHex();
      const b = generateSecretboxKeyHex();
      expect(a).not.toBe(b);
    });
  });

  describe('loadSecretboxKey', () => {
    it('decodes a valid 64-char hex string', () => {
      const hex = generateSecretboxKeyHex();
      const key = loadSecretboxKey(hex);
      expect(key.length).toBe(SECRETBOX_KEY_LEN);
    });

    it('throws on wrong length', () => {
      expect(() => loadSecretboxKey('00')).toThrow(/must be 64 hex chars/);
      expect(() => loadSecretboxKey('z'.repeat(64))).toThrow();
    });

    it.each([null, undefined, 0, {}])('throws on non-string input %p', (bad) => {
      expect(() => loadSecretboxKey(bad as unknown as string)).toThrow();
    });
  });

  describe('sealString / openString', () => {
    const key = hexToBytes(generateSecretboxKeyHex());

    it('encrypts and decrypts UTF-8 round-trip', () => {
      const plaintext = 'gho_abcdef123456789_some-refresh-token';
      const sealed = sealString(key, plaintext);
      expect(sealed.ciphertextHex).toMatch(/^[0-9a-f]+$/);
      expect(sealed.nonceHex).toHaveLength(SECRETBOX_NONCE_LEN * 2);
      expect(openString(key, sealed.ciphertextHex, sealed.nonceHex)).toBe(plaintext);
    });

    it('produces a fresh nonce per call', () => {
      const a = sealString(key, 'same plaintext');
      const b = sealString(key, 'same plaintext');
      expect(a.nonceHex).not.toBe(b.nonceHex);
      expect(a.ciphertextHex).not.toBe(b.ciphertextHex);
    });

    it('throws when ciphertext is tampered with', () => {
      const sealed = sealString(key, 'sensitive');
      const tampered = sealed.ciphertextHex.replace(/^.{2}/, '00');
      expect(() => openString(key, tampered, sealed.nonceHex)).toThrow();
    });

    it('throws when wrong key is used', () => {
      const sealed = sealString(key, 'sensitive');
      const otherKey = hexToBytes(generateSecretboxKeyHex());
      expect(() => openString(otherKey, sealed.ciphertextHex, sealed.nonceHex)).toThrow();
    });

    it('throws when nonce is wrong length', () => {
      const sealed = sealString(key, 'x');
      expect(() => openString(key, sealed.ciphertextHex, '00')).toThrow(/nonce must be 24 bytes/);
    });

    it('throws when key is wrong length', () => {
      const shortKey = new Uint8Array(16);
      expect(() => sealString(shortKey, 'x')).toThrow(/key must be 32 bytes/);
      const sealed = sealString(key, 'x');
      expect(() => openString(shortKey, sealed.ciphertextHex, sealed.nonceHex)).toThrow(
        /key must be 32 bytes/,
      );
    });

    it('handles empty string plaintext', () => {
      const sealed = sealString(key, '');
      expect(openString(key, sealed.ciphertextHex, sealed.nonceHex)).toBe('');
    });

    it('handles long plaintext', () => {
      const plaintext = 'A'.repeat(8192);
      const sealed = sealString(key, plaintext);
      expect(openString(key, sealed.ciphertextHex, sealed.nonceHex)).toBe(plaintext);
    });

    it('handles unicode plaintext', () => {
      const plaintext = '🔐 connector_v2 — toñés';
      const sealed = sealString(key, plaintext);
      expect(openString(key, sealed.ciphertextHex, sealed.nonceHex)).toBe(plaintext);
    });
  });
});
