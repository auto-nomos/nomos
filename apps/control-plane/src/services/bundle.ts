import { sha256Hex, signDetached } from '@auto-nomos/crypto';
import { bytesToBase64url, canonicalize } from '@auto-nomos/ucan';
import { eq } from 'drizzle-orm';
import type { DrizzleClient } from '../db/index.js';
import * as schema from '../db/schema.js';
import {
  loadActiveGrantsForCustomer,
  loadStepUpAgentsForCustomer,
  renderGrantsBlock,
  renderStepUpBaseline,
} from './grants/render-cedar.js';

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
  const [policies, grants, stepUpAgents] = await Promise.all([
    deps.db.query.policies.findMany({
      where: eq(schema.policies.customerId, customerId),
    }),
    loadActiveGrantsForCustomer(deps.db, customerId),
    loadStepUpAgentsForCustomer(deps.db, customerId),
  ]);

  const bundlePolicies: BundlePolicy[] = policies.map((p) => ({
    id: p.id,
    name: p.name,
    integrationId: p.integrationId,
    cedarText: p.cedarText,
    version: p.version,
  }));

  const grantsBlock = renderGrantsBlock(grants);
  if (grantsBlock) {
    bundlePolicies.push({
      id: `dynamic-grants:${customerId}`,
      name: 'Dynamic agent grants',
      integrationId: null,
      cedarText: grantsBlock,
      version: 1,
    });
  }

  const baselineBlock = renderStepUpBaseline(stepUpAgents);
  if (baselineBlock) {
    bundlePolicies.push({
      id: `stepup-baseline:${customerId}`,
      name: 'Step-up baseline',
      integrationId: null,
      cedarText: baselineBlock,
      version: 1,
    });
  }

  const bundle: BundleBody = {
    customer_id: customerId,
    version: 1,
    generated_at: new Date().toISOString(),
    policies: bundlePolicies,
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
