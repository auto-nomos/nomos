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
  /**
   * Audit C3 phase 2 (2026-05-24) — signed per-customer genesis anchor. When
   * present, verifier asserts both that the anchor's signature verifies AND
   * that the chain's first `prev_hash` equals `anchor.genesis_hash`. Optional
   * so bundles for customers created before phase 2 (no anchor row) still
   * pass chain-only verification.
   */
  genesis_anchor?: AuditBundleGenesisAnchor | null;
}

export interface AuditBundleGenesisAnchor {
  customer_id: string;
  genesis_hash: string;
  signing_key_id: string;
  /** Ed25519 over `nomos-genesis-anchor|v1|<customer_id>|<genesis_hash>|<signed_at_ms>`. */
  signature: string;
  signed_at_ms: number;
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
  /**
   * Hex Ed25519 signature. v1 signs UTF-8 bytes of `root_hash` only.
   * v2 (audit H7, 2026-05-24) signs the canonical envelope
   * `nomos-audit-root|v2|<customer_id>|<root_hash>|<signed_at_ms>` —
   * `customer_id` comes from the bundle's events[0] (chain-consistent),
   * `signed_at_ms` from this struct.
   */
  signature: string;
  signed_at: string;
  /** Defaults to 1 when absent for back-compat with pre-0033 bundles. */
  signature_version?: number;
  /** Required when `signature_version === 2`. */
  signed_at_ms?: number | null;
}

export interface VerifyError {
  index?: number;
  reason:
    | 'empty_bundle'
    | 'event_id_mismatch'
    | 'hash_mismatch'
    | 'prev_hash_mismatch'
    | 'root_hash_not_found_in_chain'
    | 'root_signature_invalid'
    | 'anchor_signature_invalid'
    | 'anchor_genesis_mismatch'
    | 'anchor_customer_mismatch';
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
      const version = bundle.root.signature_version ?? 1;
      let msg: Uint8Array;
      if (version === 2) {
        if (bundle.root.signed_at_ms === undefined || bundle.root.signed_at_ms === null) {
          throw new Error('v2 root missing signed_at_ms');
        }
        const customerId = bundle.events[0]!.customer_id;
        msg = new TextEncoder().encode(
          `nomos-audit-root|v2|${customerId}|${bundle.root.root_hash}|${bundle.root.signed_at_ms}`,
        );
      } else {
        msg = new TextEncoder().encode(bundle.root.root_hash);
      }
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

  // Audit C3 phase 2 — validate signed genesis anchor when supplied. Use the
  // SAME `verifyKeyHex` as the root signature; anchors are minted by the
  // audit-root signing key today.
  if (bundle.genesis_anchor) {
    const anchor = bundle.genesis_anchor;
    const firstEvent = bundle.events[0]!;
    if (anchor.customer_id !== firstEvent.customer_id) {
      errors.push({
        reason: 'anchor_customer_mismatch',
        detail: `anchor.customer_id=${anchor.customer_id} but events[0].customer_id=${firstEvent.customer_id}`,
      });
    }
    if (firstEvent.prev_hash !== anchor.genesis_hash) {
      errors.push({
        reason: 'anchor_genesis_mismatch',
        detail: `events[0].prev_hash=${firstEvent.prev_hash} but anchor.genesis_hash=${anchor.genesis_hash}`,
      });
    }
    let anchorSigValid = false;
    try {
      const verifyBytes = hexToBytes(verifyKeyHex);
      const sigBytes = hexToBytes(anchor.signature);
      const msg = new TextEncoder().encode(
        `nomos-genesis-anchor|v1|${anchor.customer_id}|${anchor.genesis_hash}|${anchor.signed_at_ms}`,
      );
      anchorSigValid = verifyDetached(verifyBytes, msg, sigBytes);
    } catch (err) {
      errors.push({
        reason: 'anchor_signature_invalid',
        detail: `failed to decode anchor key/signature: ${(err as Error).message}`,
      });
    }
    if (!anchorSigValid && !errors.some((e) => e.reason === 'anchor_signature_invalid')) {
      errors.push({
        reason: 'anchor_signature_invalid',
        detail: 'Ed25519 verify failed against supplied AUDIT_VERIFY_KEY',
      });
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
