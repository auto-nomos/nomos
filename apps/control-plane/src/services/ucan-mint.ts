/**
 * UCAN minting service — Sprint 5.4.
 *
 * Mints a UCAN bound to (agent, command, policy, oauth_connection) and signs
 * it with the control-plane signing key (the same key that signs policy
 * bundles). The agent receives the UCAN; the upstream OAuth token never
 * leaves the platform — the PDP-side proxy adapter (Sprint 5.5) reads
 * `meta.oauth_connection_id` to look up the encrypted token at proxy time.
 *
 * Policy → Cedar-predicate translation is deferred to Sprint 7 (visual
 * builder); for now the UCAN's `pol` array stays empty and the policy's
 * authoritative source is the signed bundle the PDP loads from
 * `/v1/internal/bundles/:customerId`.
 */
import type { ResourceConstraint, UcanPayload } from '@auto-nomos/shared-types';
import { issueUcan } from '@auto-nomos/ucan';
import { and, eq } from 'drizzle-orm';
import type { DrizzleClient } from '../db/index.js';
import * as schema from '../db/schema.js';

export class MintError extends Error {
  readonly code:
    | 'agent_not_found'
    | 'agent_not_active'
    | 'oauth_connection_not_found'
    | 'oauth_connection_other_customer'
    | 'policy_not_found';
  constructor(code: MintError['code'], message: string) {
    super(message);
    this.code = code;
    this.name = 'MintError';
  }
}

export interface MintInput {
  customerId: string;
  agentId: string;
  command: string;
  /**
   * Optional Cedar policy row id. When set, the UCAN's `meta.policy_id`
   * carries the value so audit can show *why* a request was allowed even
   * when no Cedar predicate has yet been translated into the UCAN's `pol`
   * array (translation lands Sprint 7).
   */
  policyId?: string;
  /**
   * Optional OAuth connection id. Required for proxy-mode UCANs; without
   * one, the PDP cannot route a `/v1/proxy/<command>` request to the
   * upstream SaaS.
   */
  oauthConnectionId?: string;
  /** UCAN lifetime in seconds, capped at 7 days. */
  ttlSeconds: number;
  /** Caller-supplied nonce; surfaced into payload so the same (agent, command,
   *  policy) combo can be minted multiple times with distinct CIDs. */
  nonce: string;
  /**
   * D-5 (Sprint 7): issuer-vouched stable context values to stamp into
   * `meta.context_hints`. The PDP merges these into the Cedar evaluation
   * context with priority over agent-supplied request.context.
   *
   * Use for values the issuer knows at mint time and the agent cannot
   * change later (e.g. `{ user: { department: "engineering" } }`).
   * Ephemeral values (time, IP) belong in PDP-computed context, not here.
   */
  contextHints?: Record<string, unknown>;
  /**
   * Issuer-vouched resource scope. When set, the PDP enforces that
   * `request.resource` stays inside the constraint, and chain
   * attenuation forbids any child UCAN from broadening it.
   */
  resourceConstraint?: ResourceConstraint;
  /**
   * Audit tag. `dynamic` for /v1/intent path; `static` for bulk mint /
   * policy-pre-mint path. Defaults from `resourceConstraint` presence.
   */
  mode?: 'static' | 'dynamic';
}

export interface MintDeps {
  db: DrizzleClient;
  signKey: Uint8Array;
  signerDid: string;
  /** Override clock for deterministic tests. Returns ms since epoch. */
  now?: () => number;
}

export interface MintResult {
  cid: string;
  jwt: string;
  payload: UcanPayload;
  expiresAt: Date;
}

export async function mintUcan(input: MintInput, deps: MintDeps): Promise<MintResult> {
  const agent = await deps.db.query.agents.findFirst({
    where: and(eq(schema.agents.id, input.agentId), eq(schema.agents.customerId, input.customerId)),
  });
  if (!agent) {
    throw new MintError('agent_not_found', `agent ${input.agentId} not found in this customer`);
  }
  if (agent.status !== 'active') {
    throw new MintError('agent_not_active', `agent ${input.agentId} is ${agent.status}`);
  }

  if (input.policyId) {
    const policy = await deps.db.query.policies.findFirst({
      where: and(
        eq(schema.policies.id, input.policyId),
        eq(schema.policies.customerId, input.customerId),
      ),
    });
    if (!policy) {
      throw new MintError('policy_not_found', `policy ${input.policyId} not found`);
    }
  }

  if (input.oauthConnectionId) {
    const conn = await deps.db.query.oauthConnections.findFirst({
      where: eq(schema.oauthConnections.id, input.oauthConnectionId),
    });
    if (!conn) {
      throw new MintError(
        'oauth_connection_not_found',
        `oauth connection ${input.oauthConnectionId} not found`,
      );
    }
    if (conn.customerId !== input.customerId) {
      throw new MintError(
        'oauth_connection_other_customer',
        'oauth connection belongs to a different customer',
      );
    }
  }

  const nowMs = deps.now ? deps.now() : Date.now();
  const nowSec = Math.floor(nowMs / 1000);
  const meta: Record<string, unknown> = { agent_id: agent.id };
  if (input.policyId) meta.policy_id = input.policyId;
  if (input.oauthConnectionId) meta.oauth_connection_id = input.oauthConnectionId;
  if (input.contextHints && Object.keys(input.contextHints).length > 0) {
    meta.context_hints = input.contextHints;
  }
  if (input.resourceConstraint) {
    meta.resource_constraint = input.resourceConstraint;
  }
  // Audit signal: record which mint path produced the UCAN. `dynamic`
  // means it came through /v1/intent inside an Approval Envelope;
  // `static` means it came through the bulk mint endpoint or a policy
  // pre-mint. Defaults to `static` because static is the older path.
  meta.mode = input.mode ?? (input.resourceConstraint ? 'dynamic' : 'static');

  const payload: UcanPayload = {
    iss: deps.signerDid,
    aud: agent.did,
    cmd: input.command,
    pol: [],
    nonce: input.nonce,
    nbf: nowSec - 60,
    exp: nowSec + input.ttlSeconds,
    ...(Object.keys(meta).length > 0 ? { meta } : {}),
  };

  const ucan = issueUcan({ payload, privateKey: deps.signKey });
  const expiresAt = new Date((nowSec + input.ttlSeconds) * 1000);

  await deps.db.insert(schema.ucanIssues).values({
    cid: ucan.cid,
    customerId: input.customerId,
    agentId: agent.id,
    payload,
    jwt: ucan.jwt,
    expiresAt,
  });

  return { cid: ucan.cid, jwt: ucan.jwt, payload, expiresAt };
}
