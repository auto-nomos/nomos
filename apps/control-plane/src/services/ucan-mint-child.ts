/**
 * Sprint MAOS-A.2 — child UCAN minting.
 *
 * `mintUcan()` (root-mint) signs with the platform's signing key. A *child*
 * UCAN must satisfy validateChain's `iss == parent.aud` rule, so it has to
 * be signed by the parent agent's own private key — the keypair we sealed
 * into `agents.encrypted_signing_key` at registration.
 *
 * Flow:
 *   1. Caller (the parent agent, authenticated via API key) presents a
 *      `parentChain` (root-first JWT array) + `childAgentId` + the command
 *      it wants to delegate.
 *   2. We `validateChain(parentChain)` to fail fast on broken / over-attenuated
 *      input. This is also a defense against a compromised parent splicing in
 *      a stolen UCAN — it would already have failed validation upstream, but
 *      checking here keeps the trust boundary clean.
 *   3. We confirm the leaf's `aud` equals the calling parent agent's DID
 *      (no cross-agent forking) and decrypt the parent's signing key.
 *   4. We narrow the payload (`exp ≤ parent.exp`, `nbf ≥ parent.nbf`,
 *      command is the same or stricter, optional resource_constraint
 *      narrows the parent's). The new UCAN cites the parent leaf via
 *      `prf=[<parentLeafCid>]`.
 *   5. `issueUcan({ payload, privateKey: parentKey })` — child JWT.
 *   6. Insert into `ucan_issues` so revocation, audit, and the SDK's
 *      "list issued UCANs" all see it.
 */
import { openString, privateKeyFromHex } from '@auto-nomos/crypto';
import type { ResourceConstraint, UcanPayload } from '@auto-nomos/shared-types';
import {
  actionMatchesGranted,
  computeCid,
  constraintCovers,
  extractResourceConstraint,
  issueUcan,
  validateChain,
} from '@auto-nomos/ucan';
import { and, eq } from 'drizzle-orm';
import type { DrizzleClient } from '../db/index.js';
import * as schema from '../db/schema.js';

export class MintChildError extends Error {
  readonly code:
    | 'parent_chain_invalid'
    | 'parent_chain_attenuation_violation'
    | 'parent_chain_too_deep'
    | 'parent_aud_mismatch'
    | 'parent_agent_not_found'
    | 'agent_no_signing_key'
    | 'child_agent_not_found'
    | 'command_not_subset'
    | 'ttl_exceeds_parent'
    | 'resource_constraint_broader'
    | 'oauth_disabled';
  constructor(code: MintChildError['code'], message: string) {
    super(message);
    this.code = code;
    this.name = 'MintChildError';
  }
}

export interface MintChildInput {
  customerId: string;
  /** API-key-authenticated caller. Must equal the leaf UCAN's audience. */
  parentAgentId: string;
  parentChain: string[];
  childAgentId: string;
  command: string;
  ttlSeconds: number;
  nonce: string;
  resourceConstraint?: ResourceConstraint;
  oauthConnectionId?: string;
}

export interface MintChildDeps {
  db: DrizzleClient;
  encryptionKey: Uint8Array;
  maxChainDepth: number;
  now?: () => number;
}

export interface MintChildResult {
  cid: string;
  jwt: string;
  payload: UcanPayload;
  expiresAt: Date;
  /** Concatenation of parent chain + new child UCAN, root-first. */
  newChain: string[];
}

export async function mintChildUcan(
  input: MintChildInput,
  deps: MintChildDeps,
): Promise<MintChildResult> {
  const nowSec = Math.floor((deps.now ? deps.now() : Date.now()) / 1000);

  // Step 1 — fail fast on bad parent chain.
  const validation = validateChain(input.parentChain, { now: nowSec });
  if (!validation.valid) {
    if (validation.error === 'broken_delegation') {
      throw new MintChildError('parent_chain_invalid', 'parent chain broken_delegation');
    }
    if (validation.error === 'over_attenuated') {
      throw new MintChildError(
        'parent_chain_attenuation_violation',
        'parent chain over_attenuated',
      );
    }
    throw new MintChildError('parent_chain_invalid', `parent chain: ${validation.error}`);
  }

  // Step 1b — depth cap. parentChain.length is the *current* depth; the new
  // child would be parentChain.length + 1 deep, which must stay ≤ max.
  if (input.parentChain.length + 1 > deps.maxChainDepth) {
    throw new MintChildError(
      'parent_chain_too_deep',
      `chain depth ${input.parentChain.length + 1} exceeds max ${deps.maxChainDepth}`,
    );
  }

  // Step 2 — caller must own the leaf UCAN's audience.
  const parentAgent = await deps.db.query.agents.findFirst({
    where: and(
      eq(schema.agents.id, input.parentAgentId),
      eq(schema.agents.customerId, input.customerId),
    ),
  });
  if (!parentAgent) {
    throw new MintChildError(
      'parent_agent_not_found',
      `parent agent ${input.parentAgentId} not found`,
    );
  }
  if (validation.leaf.aud !== parentAgent.did) {
    throw new MintChildError(
      'parent_aud_mismatch',
      `parent chain leaf aud (${validation.leaf.aud}) does not match calling agent did (${parentAgent.did})`,
    );
  }
  if (!parentAgent.encryptedSigningKey || !parentAgent.signingKeyNonce) {
    throw new MintChildError(
      'agent_no_signing_key',
      'parent agent has no signing key — re-create the agent or run the signing-key backfill',
    );
  }

  // Step 3 — child must exist in the same customer.
  const childAgent = await deps.db.query.agents.findFirst({
    where: and(
      eq(schema.agents.id, input.childAgentId),
      eq(schema.agents.customerId, input.customerId),
    ),
  });
  if (!childAgent) {
    throw new MintChildError(
      'child_agent_not_found',
      `child agent ${input.childAgentId} not found`,
    );
  }

  // Step 4 — payload narrowing.
  const parentLeaf = validation.leaf;
  if (!actionMatchesGranted(parentLeaf.cmd, input.command)) {
    throw new MintChildError(
      'command_not_subset',
      `child command ${input.command} is not a subset of parent ${parentLeaf.cmd}`,
    );
  }
  const childExp = nowSec + input.ttlSeconds;
  if (childExp > parentLeaf.exp) {
    throw new MintChildError(
      'ttl_exceeds_parent',
      `child exp ${childExp} exceeds parent ${parentLeaf.exp}`,
    );
  }
  if (input.resourceConstraint) {
    const parentConstraint = extractResourceConstraint(parentLeaf.meta);
    if (parentConstraint && !constraintCovers(parentConstraint, input.resourceConstraint)) {
      throw new MintChildError(
        'resource_constraint_broader',
        'child resource constraint not covered by parent',
      );
    }
  }

  // Step 5 — sign with parent's key.
  const privateHex = openString(
    deps.encryptionKey,
    parentAgent.encryptedSigningKey,
    parentAgent.signingKeyNonce,
  );
  const privateKey = privateKeyFromHex(privateHex);

  const parentLeafJwt = input.parentChain[input.parentChain.length - 1] as string;
  const parentLeafCid = computeCid(parentLeafJwt);

  const meta: Record<string, unknown> = {
    agent_id: childAgent.id,
    customer_id: input.customerId,
    chain_depth: input.parentChain.length,
    mode: 'static',
  };
  if (input.oauthConnectionId) meta.oauth_connection_id = input.oauthConnectionId;
  if (input.resourceConstraint) meta.resource_constraint = input.resourceConstraint;

  const payload: UcanPayload = {
    iss: parentAgent.did,
    aud: childAgent.did,
    cmd: input.command,
    pol: [],
    nonce: input.nonce,
    nbf: Math.max(parentLeaf.nbf, nowSec - 60),
    exp: childExp,
    prf: [parentLeafCid],
    meta,
  };

  const ucan = issueUcan({ payload, privateKey });
  const expiresAt = new Date(childExp * 1000);

  await deps.db.insert(schema.ucanIssues).values({
    cid: ucan.cid,
    customerId: input.customerId,
    agentId: childAgent.id,
    payload,
    jwt: ucan.jwt,
    expiresAt,
  });

  return {
    cid: ucan.cid,
    jwt: ucan.jwt,
    payload,
    expiresAt,
    newChain: [...input.parentChain, ucan.jwt],
  };
}
