/**
 * Sprint 9 — cosigner UCAN minting after a passkey approval.
 *
 * The dashboard /approve/:id page verifies a WebAuthn assertion against the
 * approving user's registered credentials, then calls into this service to
 * mint a short-lived UCAN whose `meta.cosigner_for` cid binds it to the
 * exact request the user approved. The PDP later validates this cosigner
 * UCAN before allowing the original request.
 *
 * Validity window is short (default 5 min) — long enough for the SDK to
 * poll once more and retry, short enough that a leaked cosigner can't
 * unlock unrelated requests far in the future.
 */
import { issueUcan } from '@auto-nomos/ucan';
import { and, eq } from 'drizzle-orm';
import type { DrizzleClient } from '../../db/index.js';
import * as schema from '../../db/schema.js';

export class CosignerError extends Error {
  readonly code:
    | 'approval_not_found'
    | 'approval_not_pending'
    | 'approval_expired'
    | 'agent_not_found'
    | 'no_original_cid';
  constructor(code: CosignerError['code'], message: string) {
    super(message);
    this.code = code;
    this.name = 'CosignerError';
  }
}

export interface MintCosignerInput {
  approvalId: string;
  customerId: string;
  decidingUserId: string;
  ttlSeconds?: number;
  nonce: string;
  /** Standing approvals create a durable envelope on /v1/intent retry.
   *  Default 'session' preserves the existing TTL behavior. */
  mode?: 'session' | 'standing';
}

export interface MintCosignerDeps {
  db: DrizzleClient;
  signKey: Uint8Array;
  signerDid: string;
  now?: () => Date;
}

export interface MintCosignerResult {
  approvalId: string;
  cosignerJwt: string;
  cosignerCid: string;
  cosignerFor: string;
  expiresAt: Date;
}

const DEFAULT_TTL_SECONDS = 300;

export async function mintCosignerForApproval(
  input: MintCosignerInput,
  deps: MintCosignerDeps,
): Promise<MintCosignerResult> {
  const ttlSeconds = input.ttlSeconds ?? DEFAULT_TTL_SECONDS;
  const now = deps.now ? deps.now() : new Date();

  const [approval] = await deps.db
    .select()
    .from(schema.pushApprovals)
    .where(
      and(
        eq(schema.pushApprovals.id, input.approvalId),
        eq(schema.pushApprovals.customerId, input.customerId),
      ),
    )
    .limit(1);
  if (!approval) {
    throw new CosignerError('approval_not_found', `approval ${input.approvalId} not found`);
  }
  if (approval.state !== 'pending') {
    throw new CosignerError(
      'approval_not_pending',
      `approval is ${approval.state}, can only sign pending approvals`,
    );
  }
  if (approval.expiresAt.getTime() <= now.getTime()) {
    throw new CosignerError('approval_expired', 'approval ttl elapsed');
  }
  if (!approval.originalUcanCid) {
    // Defensive — every PDP-driven step-up writes the cid.
    throw new CosignerError(
      'no_original_cid',
      'approval has no original_ucan_cid; cannot bind cosigner',
    );
  }

  const [agent] = await deps.db
    .select({ did: schema.agents.did })
    .from(schema.agents)
    .where(eq(schema.agents.id, approval.agentId))
    .limit(1);
  if (!agent) {
    throw new CosignerError('agent_not_found', `agent ${approval.agentId} not found`);
  }

  const nowSec = Math.floor(now.getTime() / 1000);
  const cosigner = issueUcan({
    payload: {
      iss: deps.signerDid,
      aud: agent.did,
      cmd: approval.command,
      pol: [],
      nonce: input.nonce,
      nbf: nowSec - 60,
      exp: nowSec + ttlSeconds,
      meta: {
        cosigner_for: approval.originalUcanCid,
        approval_id: approval.id,
        decided_by: input.decidingUserId,
        mode: input.mode ?? 'session',
      },
    },
    privateKey: deps.signKey,
  });

  const decidedAt = now;
  const expiresAt = new Date((nowSec + ttlSeconds) * 1000);
  await deps.db
    .update(schema.pushApprovals)
    .set({
      state: 'approved',
      decidedAt,
      decidedBy: input.decidingUserId,
      cosignerAttestationJwt: cosigner.jwt,
    })
    .where(eq(schema.pushApprovals.id, input.approvalId));

  return {
    approvalId: input.approvalId,
    cosignerJwt: cosigner.jwt,
    cosignerCid: cosigner.cid,
    cosignerFor: approval.originalUcanCid,
    expiresAt,
  };
}

export async function denyApproval(
  approvalId: string,
  customerId: string,
  decidingUserId: string,
  db: DrizzleClient,
  now: Date = new Date(),
): Promise<{ ok: boolean }> {
  const result = await db
    .update(schema.pushApprovals)
    .set({ state: 'denied', decidedAt: now, decidedBy: decidingUserId })
    .where(
      and(
        eq(schema.pushApprovals.id, approvalId),
        eq(schema.pushApprovals.customerId, customerId),
        eq(schema.pushApprovals.state, 'pending'),
      ),
    )
    .returning({ id: schema.pushApprovals.id });
  return { ok: result.length === 1 };
}
