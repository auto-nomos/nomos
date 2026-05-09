import { sha256Hex, signDetached } from '@credential-broker/crypto';
import { bytesToBase64url, canonicalize } from '@credential-broker/ucan';
import { eq } from 'drizzle-orm';
import type { DrizzleClient } from '../db/index.js';
import * as schema from '../db/schema.js';

export interface BundlePolicy {
  id: string;
  name: string;
  integrationId: string | null;
  cedarText: string;
  version: number;
}

export interface BundleBody {
  customer_id: string;
  version: number;
  generated_at: string;
  policies: BundlePolicy[];
  schema_hash: string;
}

export interface SignedBundle {
  bundle: BundleBody;
  signature: string;
  signerDid: string;
}

export interface BundleServiceDeps {
  db: DrizzleClient;
  signKey: Uint8Array;
  signerDid: string;
}

const encoder = new TextEncoder();

/**
 * Generate a fresh signed policy bundle for a customer.
 *
 * Bundle wire format (D-2 resolved): JSON envelope with the bundle body, a
 * detached Ed25519 signature over the canonicalized body, and the signer DID.
 *
 * The PDP verifies by re-canonicalizing the body and checking the signature
 * against `CONTROL_PLANE_BUNDLE_VERIFY_KEY` (configured at PDP boot).
 */
export async function generateBundle(
  customerId: string,
  deps: BundleServiceDeps,
): Promise<SignedBundle> {
  const policies = await deps.db.query.policies.findMany({
    where: eq(schema.policies.customerId, customerId),
  });

  const bundle: BundleBody = {
    customer_id: customerId,
    version: 1,
    generated_at: new Date().toISOString(),
    policies: policies.map((p) => ({
      id: p.id,
      name: p.name,
      integrationId: p.integrationId,
      cedarText: p.cedarText,
      version: p.version,
    })),
    // Schema-pack hash placeholder until Sprint 10 wires real packs in.
    schema_hash: sha256Hex(canonicalize({ schemas: [] })),
  };

  const signature = signDetached(deps.signKey, encoder.encode(canonicalize(bundle)));
  return {
    bundle,
    signature: bytesToBase64url(signature),
    signerDid: deps.signerDid,
  };
}
