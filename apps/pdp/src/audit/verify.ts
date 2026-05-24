import { sha256Hex } from '@auto-nomos/crypto';
import type { AuditEvent } from '@auto-nomos/shared-types';
import { canonicalize } from '@auto-nomos/ucan';

import { ZERO_HASH } from './emit.js';

export interface AuditChainVerification {
  ok: boolean;
  brokenAt?: number;
  reason?: 'hash_mismatch' | 'prev_hash_mismatch';
}

export interface VerifyAuditChainOptions {
  /**
   * Audit C3 — when supplied, the first event's prev_hash MUST equal
   * `genesisFor(customer_id)`. Verifier rejects `ZERO_HASH` genesis so an
   * attacker without the secret cannot fabricate a believable first event
   * for an unused customer. Omit (or set `acceptLegacyZeroHash: true`) to
   * verify chains written before `AUDIT_GENESIS_SECRET` was deployed.
   */
  genesisFor?: (customerId: string) => string;
  /**
   * Audit C3 back-compat. Verifying chains written before the pinned
   * genesis was rolled out, plus a `genesisFor` callback. Accepts either
   * `ZERO_HASH` OR the pinned value as the first event's prev_hash.
   * Production verification of new data should leave this `false`.
   */
  acceptLegacyZeroHash?: boolean;
}

/**
 * Re-derive the hash chain from a list of audit events and assert each entry's
 * hash and prev_hash are consistent.
 */
export function verifyAuditChain(
  events: AuditEvent[],
  opts: VerifyAuditChainOptions = {},
): AuditChainVerification {
  let expectedPrev: string | null = null;
  for (let i = 0; i < events.length; i++) {
    const ev = events[i] as AuditEvent;
    if (expectedPrev === null) {
      const pinned = opts.genesisFor?.(ev.customer_id);
      const acceptable = new Set<string>();
      if (pinned) {
        acceptable.add(pinned);
        if (opts.acceptLegacyZeroHash) acceptable.add(ZERO_HASH);
      } else {
        // No pinned genesis configured — back-compat ZERO_HASH only.
        acceptable.add(ZERO_HASH);
      }
      if (!acceptable.has(ev.prev_hash)) {
        return { ok: false, brokenAt: i, reason: 'prev_hash_mismatch' };
      }
    } else if (ev.prev_hash !== expectedPrev) {
      return { ok: false, brokenAt: i, reason: 'prev_hash_mismatch' };
    }
    const { hash, ...withoutHash } = ev;
    const recomputed = sha256Hex(
      `${ev.prev_hash}|${canonicalize(withoutHash as unknown as Record<string, unknown>)}`,
    );
    if (recomputed !== hash) {
      return { ok: false, brokenAt: i, reason: 'hash_mismatch' };
    }
    expectedPrev = hash;
  }
  return { ok: true };
}
