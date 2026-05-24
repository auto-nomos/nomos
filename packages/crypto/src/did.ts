import { base58btc } from 'multiformats/bases/base58';

export const ED25519_PUB_MULTICODEC = new Uint8Array([0xed, 0x01]);

const DID_KEY_PREFIX = 'did:key:';
const DID_KEY_REGEX = /^did:key:z[1-9A-HJ-NP-Za-km-z]+$/;

export function didFromPublicKey(publicKey: Uint8Array): string {
  if (publicKey.length !== 32) {
    throw new Error(`expected 32-byte ed25519 public key, got ${publicKey.length}`);
  }
  const buffer = new Uint8Array(ED25519_PUB_MULTICODEC.length + publicKey.length);
  buffer.set(ED25519_PUB_MULTICODEC, 0);
  buffer.set(publicKey, ED25519_PUB_MULTICODEC.length);
  return `${DID_KEY_PREFIX}${base58btc.encode(buffer)}`;
}

export function publicKeyFromDid(did: string): Uint8Array {
  if (!DID_KEY_REGEX.test(did)) {
    throw new Error(`invalid did:key format: ${did}`);
  }
  const multibase = did.slice(DID_KEY_PREFIX.length);
  const decoded = base58btc.decode(multibase);
  if (decoded.length < 3) {
    throw new Error('did:key payload too short');
  }
  if (decoded[0] !== ED25519_PUB_MULTICODEC[0] || decoded[1] !== ED25519_PUB_MULTICODEC[1]) {
    throw new Error('did:key is not an ed25519 key (unsupported multicodec)');
  }
  const publicKey = decoded.slice(2);
  if (publicKey.length !== 32) {
    throw new Error(`unexpected ed25519 public key length: ${publicKey.length}`);
  }
  return publicKey;
}

/**
 * Re-encode a `did:key` string into the single canonical multibase form
 * (base58btc, `z` prefix) used by this codebase. Throws on any unsupported
 * encoding or malformed payload.
 *
 * Audit H11 (2026-05-24): UCAN issuer/audience DIDs are embedded verbatim in
 * the signed payload + hashed into the CID, so accepting two surface forms of
 * the same key would let an attacker construct distinct UCANs that decode to
 * the same authority but produce different CIDs — breaking the cosigner
 * CID-binding check. Callers that ingest DIDs from outside (UCAN payloads,
 * federation rows, env variables) should normalise via this function before
 * comparing or hashing.
 */
export function canonicalizeDid(did: string): string {
  const publicKey = publicKeyFromDid(did);
  return didFromPublicKey(publicKey);
}
