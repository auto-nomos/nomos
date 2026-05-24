import { signDetached } from '@auto-nomos/crypto';
import { bytesToHex } from '@noble/hashes/utils';
import { desc, eq } from 'drizzle-orm';
import type { DrizzleClient } from '../db/index.js';
import * as schema from '../db/schema.js';

/** Always emit signatures in this format. Verifier dispatches on
 * `signatureVersion` column so legacy v1 rows still validate. */
export const CURRENT_SIGNATURE_VERSION = 2;

export interface SignRootDeps {
  db: DrizzleClient;
  /** 32-byte Ed25519 private key. */
  signKey: Uint8Array;
  /** Stable identifier for the verifier (e.g. `did:key:...`). Persisted on each row. */
  signingKeyId: string;
  /** Replaceable for tests. */
  now?: () => Date;
}

export interface SignRootResult {
  /** Whether a row was inserted. False when the customer has no audit events to anchor. */
  signed: boolean;
  rootEventId?: string;
  rootHash?: string;
  signature?: string;
  signatureVersion?: number;
  signedAtMs?: number;
}

/**
 * Pick the latest audit_events row for `customerId` and persist a signed root
 * over its hash. No-op when the customer has no audit events to anchor.
 *
 * Idempotency: a UNIQUE index on `audit_roots.root_event_id` means re-signing
 * the same head row inserts nothing — the function returns `signed: false`.
 */
export async function signRootForCustomer(
  customerId: string,
  deps: SignRootDeps,
): Promise<SignRootResult> {
  const head = await deps.db.query.auditEvents.findFirst({
    where: eq(schema.auditEvents.customerId, customerId),
    orderBy: [desc(schema.auditEvents.ts)],
  });
  if (!head) return { signed: false };

  const rootHash = head.hash;
  const now = deps.now?.() ?? new Date();
  const signedAtMs = now.getTime();
  const signature = bytesToHex(
    signDetached(deps.signKey, encodeSignedRoot({ customerId, rootHash, signedAtMs })),
  );
  const [inserted] = await deps.db
    .insert(schema.auditRoots)
    .values({
      customerId,
      rootEventId: head.eventId,
      rootHash,
      signingKeyId: deps.signingKeyId,
      signature,
      signatureVersion: CURRENT_SIGNATURE_VERSION,
      signedAt: now,
      signedAtMs,
    })
    .onConflictDoNothing({ target: schema.auditRoots.rootEventId })
    .returning();
  if (!inserted) {
    return { signed: false };
  }
  return {
    signed: true,
    rootEventId: head.eventId,
    rootHash,
    signature,
    signatureVersion: CURRENT_SIGNATURE_VERSION,
    signedAtMs,
  };
}

/** Pick every customer that has audit events and sign a root for each. */
export async function signRootsForAllCustomers(deps: SignRootDeps): Promise<{
  customers: number;
  signed: number;
}> {
  const rows = await deps.db
    .selectDistinct({ customerId: schema.auditEvents.customerId })
    .from(schema.auditEvents);
  let signed = 0;
  for (const r of rows) {
    const result = await signRootForCustomer(r.customerId, deps);
    if (result.signed) signed++;
  }
  return { customers: rows.length, signed };
}

/**
 * v1 canonical: UTF-8 bytes of the hex hash. Kept for verifying signatures
 * minted before migration 0033. New signatures use `encodeSignedRoot` (v2).
 */
export function encodeRootHash(rootHash: string): Uint8Array {
  return new TextEncoder().encode(rootHash);
}

/**
 * v2 canonical (audit H7, 2026-05-24): bind the signature to `customerId`
 * and `signedAtMs` so a DB-write attacker cannot move a signature row from
 * one customer to another or rewrite the signed_at column without
 * invalidating the signature. Format is plain `|`-delimited UTF-8 — no JSON
 * escaping required since the inputs are a UUID, a hex digest, and a
 * non-negative integer.
 */
export function encodeSignedRoot(input: {
  customerId: string;
  rootHash: string;
  signedAtMs: number;
}): Uint8Array {
  return new TextEncoder().encode(
    `nomos-audit-root|v2|${input.customerId}|${input.rootHash}|${input.signedAtMs}`,
  );
}
