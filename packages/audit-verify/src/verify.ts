import { sha256Hex, verifyDetached } from '@auto-nomos/crypto';
import { canonicalize } from '@auto-nomos/ucan';
import { hexToBytes } from '@noble/hashes/utils';

/**
 * What the audit-verify CLI consumes. The control plane's
 * `GET /v1/audit/:eventId/proof` endpoint returns this exact shape, and the
 * R2 archive worker (Sprint 8.5) stores Parquet rows that can be reassembled
 * into one of these.
 */
export interface AuditBundle {
  /** The event the proof was requested for; always equals events[0].event_id. */
  event_id: string;
  /**
   * Ordered list of audit_event rows from the queried event up through (and
   * including) the row whose `hash` matches `root.root_hash`. The verifier
   * walks each step and re-derives `hash` from `payload`.
   */
  events: AuditBundleEvent[];
  /** When null, no signed root anchors this event yet (only chain integrity is checked). */
  root: AuditBundleRoot | null;
}

export interface AuditBundleEvent {
  event_id: string;
  customer_id: string;
  prev_hash: string;
  hash: string;
  /** The canonical pre-hash representation. sha256(prev_hash + '|' + canonicalize(payload)) === hash. */
  payload: Record<string, unknown>;
}

export interface AuditBundleRoot {
  root_event_id: string;
  root_hash: string;
  signing_key_id: string;
  /** Hex Ed25519 signature over UTF-8 bytes of `root_hash`. */
  signature: string;
  signed_at: string;
}

export interface VerifyError {
  index?: number;
  reason:
    | 'empty_bundle'
    | 'event_id_mismatch'
    | 'hash_mismatch'
    | 'prev_hash_mismatch'
    | 'root_hash_not_found_in_chain'
    | 'root_signature_invalid';
  detail?: string;
}

export interface VerifyResult {
  ok: boolean;
  errors: VerifyError[];
  /** Set when the bundle had a signed root and the signature checked out. */
  signedAt?: string;
  signingKeyId?: string;
}

/**
 * Pure-function verifier. No I/O. Given a bundle and the audit verification
 * public key, returns whether the bundle is internally consistent and whether
 * its signed root (if any) matches the supplied key.
 */
export function verifyBundle(bundle: AuditBundle, verifyKeyHex: string): VerifyResult {
  const errors: VerifyError[] = [];

  if (bundle.events.length === 0) {
    errors.push({ reason: 'empty_bundle' });
    return { ok: false, errors };
  }

  if (bundle.events[0]!.event_id !== bundle.event_id) {
    errors.push({
      reason: 'event_id_mismatch',
      detail: `bundle.event_id=${bundle.event_id} but events[0].event_id=${bundle.events[0]!.event_id}`,
    });
  }

  for (let i = 0; i < bundle.events.length; i++) {
    const ev = bundle.events[i]!;
    const recomputed = sha256Hex(
      `${ev.prev_hash}|${canonicalize(ev.payload as unknown as Record<string, unknown>)}`,
    );
    if (recomputed !== ev.hash) {
      errors.push({
        index: i,
        reason: 'hash_mismatch',
        detail: `expected ${ev.hash}, recomputed ${recomputed}`,
      });
    }
    if (i > 0) {
      const prev = bundle.events[i - 1]!;
      if (ev.prev_hash !== prev.hash) {
        errors.push({
          index: i,
          reason: 'prev_hash_mismatch',
          detail: `events[${i}].prev_hash=${ev.prev_hash} but events[${i - 1}].hash=${prev.hash}`,
        });
      }
    }
  }

  if (bundle.root) {
    const rootInChain = bundle.events.find((e) => e.hash === bundle.root!.root_hash);
    if (!rootInChain) {
      errors.push({
        reason: 'root_hash_not_found_in_chain',
        detail: `root_hash=${bundle.root.root_hash} matches no event in events[]`,
      });
    }
    let signatureValid = false;
    try {
      const verifyBytes = hexToBytes(verifyKeyHex);
      const sigBytes = hexToBytes(bundle.root.signature);
      const msg = new TextEncoder().encode(bundle.root.root_hash);
      signatureValid = verifyDetached(verifyBytes, msg, sigBytes);
    } catch (err) {
      signatureValid = false;
      errors.push({
        reason: 'root_signature_invalid',
        detail: `failed to decode key/signature: ${(err as Error).message}`,
      });
    }
    if (!signatureValid) {
      // Add the canonical reason if we didn't already attribute a decode error.
      if (!errors.some((e) => e.reason === 'root_signature_invalid')) {
        errors.push({
          reason: 'root_signature_invalid',
          detail: 'Ed25519 verify failed against supplied AUDIT_VERIFY_KEY',
        });
      }
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    errors: [],
    ...(bundle.root
      ? { signedAt: bundle.root.signed_at, signingKeyId: bundle.root.signing_key_id }
      : {}),
  };
}
