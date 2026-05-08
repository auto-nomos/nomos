import { sha256Hex } from '@credential-broker/crypto';

/**
 * Compute a content identifier for a UCAN JWT.
 * Phase 1: simple sha256-hex over the full compact-JWT string.
 * Phase 2 may switch to multihash + multibase CIDv1 for interop.
 */
export function computeCid(jwt: string): string {
  return sha256Hex(jwt);
}
