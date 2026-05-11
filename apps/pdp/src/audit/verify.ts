import { sha256Hex } from '@auto-nomos/crypto';
import type { AuditEvent } from '@auto-nomos/shared-types';
import { canonicalize } from '@auto-nomos/ucan';

import { ZERO_HASH } from './emit.js';

export interface AuditChainVerification {
  ok: boolean;
  brokenAt?: number;
  reason?: 'hash_mismatch' | 'prev_hash_mismatch';
}

/**
 * Re-derive the hash chain from a list of audit events and assert each entry's
 * hash and prev_hash are consistent.
 */
export function verifyAuditChain(events: AuditEvent[]): AuditChainVerification {
  let expectedPrev = ZERO_HASH;
  for (let i = 0; i < events.length; i++) {
    const ev = events[i] as AuditEvent;
    if (ev.prev_hash !== expectedPrev) {
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
