/**
 * Audit C3 phase 2 (2026-05-24) — write + read the per-customer signed
 * genesis anchor. Phase 1 (already shipped via PR #15) pinned the genesis
 * hash to a secret-derived value so a DB-write attacker without the secret
 * could no longer forge a believable first event for an unused customer.
 * Phase 2 wraps that pinned hash in an Ed25519 signature minted by the
 * audit-root key, so the attacker now needs to forge a signature too.
 *
 * The verifier consumes anchor rows via the audit bundle: see
 * `apps/pdp/src/audit/verify.ts` + `packages/audit-verify/src/verify.ts`.
 */
import { sha256Hex, signDetached, verifyDetached } from '@auto-nomos/crypto';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';
import { eq } from 'drizzle-orm';
import type { DrizzleClient } from '../db/index.js';
import * as schema from '../db/schema.js';

/**
 * Mirror of `apps/pdp/src/audit/emit.ts::auditGenesisHash` — kept in lockstep
 * so the same `(customerId, secret)` pair produces the same genesis hash on
 * both sides. If you change one, change the other.
 */
function auditGenesisHash(customerId: string, secret: string): string {
  return sha256Hex(`audit-genesis|v1|${customerId}|${secret}`);
}

export interface AnchorDeps {
  db: DrizzleClient;
  /** 32-byte Ed25519 private key — same root signing key as audit_roots. */
  signKey: Uint8Array;
  /** Stable identifier persisted on each row (did:key:… or env handle). */
  signingKeyId: string;
  /** Per-customer secret used to derive the pinned genesis hash. */
  genesisSecret: string;
  /** Replaceable for tests. */
  now?: () => Date;
}

export interface AnchorRow {
  customerId: string;
  genesisHash: string;
  signingKeyId: string;
  signature: string;
  signedAtMs: number;
}

/**
 * Re-exported (and re-shared with the bundle reader) — keep the canonical
 * envelope in one place so a typo on signer or verifier breaks both at once.
 */
export function encodeGenesisAnchor(input: {
  customerId: string;
  genesisHash: string;
  signedAtMs: number;
}): Uint8Array {
  return new TextEncoder().encode(
    `nomos-genesis-anchor|v1|${input.customerId}|${input.genesisHash}|${input.signedAtMs}`,
  );
}

/**
 * Insert an anchor row for `customerId`. Idempotent on the customer_id PK:
 * a second call for the same customer is a no-op (existing anchor wins).
 * Returns the row that ended up persisted.
 */
export async function writeAnchor(deps: AnchorDeps, customerId: string): Promise<AnchorRow> {
  const existing = await deps.db.query.auditGenesisAnchors.findFirst({
    where: eq(schema.auditGenesisAnchors.customerId, customerId),
  });
  if (existing) {
    return {
      customerId: existing.customerId,
      genesisHash: existing.genesisHash,
      signingKeyId: existing.signingKeyId,
      signature: existing.signature,
      signedAtMs: existing.signedAtMs,
    };
  }
  const genesisHash = auditGenesisHash(customerId, deps.genesisSecret);
  const signedAtMs = (deps.now?.() ?? new Date()).getTime();
  const signature = bytesToHex(
    signDetached(deps.signKey, encodeGenesisAnchor({ customerId, genesisHash, signedAtMs })),
  );
  const [inserted] = await deps.db
    .insert(schema.auditGenesisAnchors)
    .values({
      customerId,
      genesisHash,
      signingKeyId: deps.signingKeyId,
      signature,
      signedAt: new Date(signedAtMs),
      signedAtMs,
    })
    .onConflictDoNothing({ target: schema.auditGenesisAnchors.customerId })
    .returning();
  // Conflict path: another writer raced us; re-read.
  if (!inserted) {
    const after = await deps.db.query.auditGenesisAnchors.findFirst({
      where: eq(schema.auditGenesisAnchors.customerId, customerId),
    });
    if (!after) throw new Error(`anchor write race for ${customerId} produced no row`);
    return {
      customerId: after.customerId,
      genesisHash: after.genesisHash,
      signingKeyId: after.signingKeyId,
      signature: after.signature,
      signedAtMs: after.signedAtMs,
    };
  }
  return {
    customerId: inserted.customerId,
    genesisHash: inserted.genesisHash,
    signingKeyId: inserted.signingKeyId,
    signature: inserted.signature,
    signedAtMs: inserted.signedAtMs,
  };
}

/**
 * Verify an anchor against a known root verify-key. Used by the audit-verify
 * bundle path; the live PDP does not consume anchors directly.
 */
export function verifyAnchorSignature(input: { anchor: AnchorRow; verifyKeyHex: string }): boolean {
  try {
    return verifyDetached(
      hexToBytes(input.verifyKeyHex),
      encodeGenesisAnchor({
        customerId: input.anchor.customerId,
        genesisHash: input.anchor.genesisHash,
        signedAtMs: input.anchor.signedAtMs,
      }),
      hexToBytes(input.anchor.signature),
    );
  } catch {
    return false;
  }
}

/** One-shot backfill helper: write anchors for any customer that lacks one. */
export async function backfillMissingAnchors(deps: AnchorDeps): Promise<{
  customers: number;
  written: number;
}> {
  const customers = await deps.db.select({ id: schema.customers.id }).from(schema.customers);
  let written = 0;
  for (const c of customers) {
    const existing = await deps.db.query.auditGenesisAnchors.findFirst({
      where: eq(schema.auditGenesisAnchors.customerId, c.id),
    });
    if (existing) continue;
    await writeAnchor(deps, c.id);
    written++;
  }
  return { customers: customers.length, written };
}
