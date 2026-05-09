/**
 * Authenticated symmetric encryption using XChaCha20-Poly1305 (AEAD).
 *
 * Used by the control-plane to encrypt OAuth refresh / access tokens at rest
 * with a single env-var master key (`OAUTH_TOKEN_ENCRYPTION_KEY`) and a fresh
 * 24-byte nonce per ciphertext.
 *
 * Per-customer KMS / per-customer key rotation is deferred to Phase 2; the key
 * derivation point is wrapped here so the rest of the codebase only sees
 * `seal(plaintext) -> { ciphertext, nonce }` / `open(ciphertext, nonce) -> plaintext`.
 *
 * Why XChaCha20-Poly1305 and not AES-GCM:
 *   - 192-bit nonce (vs 96-bit) makes random nonces safe at scale; no need for
 *     a counter or KMS.
 *   - Constant-time pure-JS implementation in @noble/ciphers — no native deps.
 *   - Authenticated: any tampering with ciphertext or nonce throws on decrypt.
 */
import { xchacha20poly1305 } from '@noble/ciphers/chacha';
import { bytesToHex, hexToBytes, randomBytes } from '@noble/hashes/utils';

export const SECRETBOX_KEY_LEN = 32;
export const SECRETBOX_NONCE_LEN = 24;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export interface SecretBoxCiphertext {
  ciphertextHex: string;
  nonceHex: string;
}

/** Decode a hex-encoded 32-byte key, throwing a clear error if malformed. */
export function loadSecretboxKey(hex: string): Uint8Array {
  if (typeof hex !== 'string' || hex.length !== SECRETBOX_KEY_LEN * 2) {
    throw new Error(
      `secretbox key must be ${SECRETBOX_KEY_LEN * 2} hex chars (${SECRETBOX_KEY_LEN} bytes)`,
    );
  }
  return hexToBytes(hex);
}

/** Generate a random secretbox key as hex. Use during setup, then store in env. */
export function generateSecretboxKeyHex(): string {
  return bytesToHex(randomBytes(SECRETBOX_KEY_LEN));
}

/**
 * Encrypt a UTF-8 string with the given 32-byte key. Returns hex-encoded
 * ciphertext + nonce so both can be persisted as text columns in Postgres
 * without dragging Buffer types through the data layer.
 */
export function sealString(key: Uint8Array, plaintext: string): SecretBoxCiphertext {
  if (key.length !== SECRETBOX_KEY_LEN) {
    throw new Error(`secretbox key must be ${SECRETBOX_KEY_LEN} bytes`);
  }
  const nonce = randomBytes(SECRETBOX_NONCE_LEN);
  const ct = xchacha20poly1305(key, nonce).encrypt(encoder.encode(plaintext));
  return { ciphertextHex: bytesToHex(ct), nonceHex: bytesToHex(nonce) };
}

/**
 * Decrypt a ciphertext+nonce pair produced by `sealString`. Throws if the
 * ciphertext was tampered with, the wrong key is supplied, or the nonce is
 * malformed.
 */
export function openString(key: Uint8Array, ciphertextHex: string, nonceHex: string): string {
  if (key.length !== SECRETBOX_KEY_LEN) {
    throw new Error(`secretbox key must be ${SECRETBOX_KEY_LEN} bytes`);
  }
  const nonce = hexToBytes(nonceHex);
  if (nonce.length !== SECRETBOX_NONCE_LEN) {
    throw new Error(`secretbox nonce must be ${SECRETBOX_NONCE_LEN} bytes`);
  }
  const ct = hexToBytes(ciphertextHex);
  const pt = xchacha20poly1305(key, nonce).decrypt(ct);
  return decoder.decode(pt);
}
