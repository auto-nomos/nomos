import { signDetached } from '@credential-broker/crypto';
import { bytesToHex } from '@noble/hashes/utils';
import { desc, eq } from 'drizzle-orm';
import type { DrizzleClient } from '../db/index.js';
import * as schema from '../db/schema.js';

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
  const signature = bytesToHex(signDetached(deps.signKey, encodeRootHash(rootHash)));
  const now = deps.now?.() ?? new Date();
  const [inserted] = await deps.db
    .insert(schema.auditRoots)
    .values({
      customerId,
      rootEventId: head.eventId,
      rootHash,
      signingKeyId: deps.signingKeyId,
      signature,
      signedAt: now,
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
 * Canonical message format the verifier expects to recompute.
 * We sign the UTF-8 bytes of the hex hash so the wire form is human-readable
 * in DB inspections, and so the audit-verify CLI never has to negotiate
 * binary encoding.
 */
export function encodeRootHash(rootHash: string): Uint8Array {
  return new TextEncoder().encode(rootHash);
}
