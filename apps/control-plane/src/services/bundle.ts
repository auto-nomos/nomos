import { sha256Hex, signDetached } from '@auto-nomos/crypto';
import { bytesToBase64url, canonicalize } from '@auto-nomos/ucan';
import { and, eq, ne } from 'drizzle-orm';
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

/**
 * Per-agent metadata embedded in the bundle so the PDP can enforce the
 * `connectionApprovedAt` gate for static apps without hitting the DB on
 * the hot path. Dynamic apps bypass this gate; their unmapped commands
 * still deny via empty policy coverage, which routes through step-up.
 */
export interface BundleAgent {
  agentId: string;
  did: string;
  mode: 'static' | 'dynamic';
  status: 'active' | 'disabled' | 'deleted';
  connectionApprovedAt: string | null;
}

export interface BundleBody {
  customer_id: string;
  version: number;
  generated_at: string;
  policies: BundlePolicy[];
  agents: BundleAgent[];
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
 * Each customer policy in `policies` is mapped to zero or more agents via
 * `agent_policies`. Unmapped policies are omitted (deny-by-default).
 * Mapped policies are duplicated per-DID with a tightened `principal`
 * scope so Cedar evaluates them only for the listed agents. Policies
 * that already constrain `principal` are left untouched.
 *
 * The PDP verifies by re-canonicalizing the body and checking the
 * signature against `CONTROL_PLANE_BUNDLE_VERIFY_KEY`.
 */
export async function generateBundle(
  customerId: string,
  deps: BundleServiceDeps,
): Promise<SignedBundle> {
  const [policies, mappingRows, agentRows, grants, stepUpAgents] = await Promise.all([
    deps.db.query.policies.findMany({
      where: eq(schema.policies.customerId, customerId),
    }),
    deps.db
      .select({
        agentId: schema.agentPolicies.agentId,
        policyId: schema.agentPolicies.policyId,
        agentDid: schema.agents.did,
      })
      .from(schema.agentPolicies)
      .innerJoin(schema.agents, eq(schema.agentPolicies.agentId, schema.agents.id))
      .where(
        and(eq(schema.agentPolicies.customerId, customerId), ne(schema.agents.status, 'deleted')),
      ),
    deps.db
      .select({
        agentId: schema.agents.id,
        did: schema.agents.did,
        mode: schema.agents.mode,
        status: schema.agents.status,
        connectionApprovedAt: schema.agents.connectionApprovedAt,
      })
      .from(schema.agents)
      .where(eq(schema.agents.customerId, customerId)),
    loadActiveGrantsForCustomer(deps.db, customerId),
    loadStepUpAgentsForCustomer(deps.db, customerId),
  ]);

  const policyToDids = new Map<string, string[]>();
  for (const row of mappingRows) {
    const list = policyToDids.get(row.policyId) ?? [];
    list.push(row.agentDid);
    policyToDids.set(row.policyId, list);
  }

  const bundlePolicies: BundlePolicy[] = [];
  for (const p of policies) {
    const dids = policyToDids.get(p.id);
    if (!dids || dids.length === 0) continue;
    bundlePolicies.push({
      id: p.id,
      name: p.name,
      integrationId: p.integrationId,
      cedarText: scopeCedarToAgents(p.cedarText, dids),
      version: p.version,
    });
  }

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

  const bundleAgents: BundleAgent[] = agentRows.map((a) => ({
    agentId: a.agentId,
    did: a.did,
    mode: a.mode as 'static' | 'dynamic',
    status: a.status as 'active' | 'disabled' | 'deleted',
    connectionApprovedAt: a.connectionApprovedAt ? a.connectionApprovedAt.toISOString() : null,
  }));

  const bundle: BundleBody = {
    customer_id: customerId,
    version: 1,
    generated_at: new Date().toISOString(),
    policies: bundlePolicies,
    agents: bundleAgents,
    schema_hash: sha256Hex(canonicalize({ schemas: [] })),
  };

  const signature = signDetached(deps.signKey, encoder.encode(canonicalize(bundle)));
  return {
    bundle,
    signature: bytesToBase64url(signature),
    signerDid: deps.signerDid,
  };
}

const HEAD_PRINCIPAL_PATTERN =
  /^(\s*)(@\w+\([^)]*\)\s*)?(permit|forbid)\s*\(\s*principal\s*(==|in|is)/m;
const HEAD_BARE_PRINCIPAL_REPLACE_PATTERN =
  /^(\s*)((?:@\w+\([^)]*\)\s*)?)(permit|forbid)(\s*)\(\s*principal\s*,/gm;

function escapeCedarString(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/**
 * Duplicate a Cedar policy text per-DID, replacing the bare `principal`
 * in each rule's head with `principal == Agent::"<did>"`. If the head
 * already constrains `principal` (`==`, `in`, or `is`), the policy is
 * returned verbatim and the caller is expected to honour its original
 * scoping. Comments and whitespace pass through unchanged.
 */
export function scopeCedarToAgents(cedarText: string, dids: readonly string[]): string {
  if (dids.length === 0) return '';
  if (HEAD_PRINCIPAL_PATTERN.test(cedarText)) {
    return cedarText;
  }
  return dids
    .map(
      (did) =>
        `// scoped to Agent::${did}\n${cedarText.replace(
          HEAD_BARE_PRINCIPAL_REPLACE_PATTERN,
          (_m, lead: string, anno: string, verb: string, sp: string) =>
            `${lead}${anno}${verb}${sp}(\n  principal == Agent::"${escapeCedarString(did)}",`,
        )}`,
    )
    .join('\n\n');
}
