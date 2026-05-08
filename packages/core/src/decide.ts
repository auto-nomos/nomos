import type { Context } from '@credential-broker/cedar';
import { evaluate, type Schema } from '@credential-broker/cedar';
import { sha256Hex } from '@credential-broker/crypto';
import type {
  AuthorizeDecision,
  AuthorizeRequest,
  DenyReason,
} from '@credential-broker/shared-types';
import { type ChainError, canonicalize, computeCid, validateChain } from '@credential-broker/ucan';

export interface DecideInput {
  ucan: string | string[];
  request: AuthorizeRequest;
  policies: string;
  revokedCids?: ReadonlySet<string>;
  schema?: Schema;
  now?: number;
}

const CHAIN_ERROR_TO_REASON: Record<ChainError, DenyReason> = {
  malformed_ucan: 'malformed_ucan',
  bad_signature: 'bad_signature',
  expired: 'expired',
  not_yet_valid: 'not_yet_valid',
  audience_mismatch: 'audience_mismatch',
  command_mismatch: 'command_mismatch',
  issuer_unsupported: 'malformed_ucan',
  broken_delegation: 'malformed_ucan',
  over_attenuated: 'malformed_ucan',
  empty_chain: 'malformed_ucan',
};

function buildReceiptId(jwts: string[], request: AuthorizeRequest): string {
  const leafCid = computeCid(jwts[jwts.length - 1] as string);
  return sha256Hex(`${leafCid}|${canonicalize(request as unknown as Record<string, unknown>)}`);
}

function deny(reason: DenyReason, jwts: string[], request: AuthorizeRequest): AuthorizeDecision {
  return {
    allow: false,
    reason,
    receiptId: buildReceiptId(jwts, request),
  };
}

export function decide(input: DecideInput): AuthorizeDecision {
  const jwts = Array.isArray(input.ucan) ? input.ucan : [input.ucan];
  const now = input.now ?? Math.floor(Date.now() / 1000);

  if (jwts.length === 0) {
    return {
      allow: false,
      reason: 'malformed_ucan',
      receiptId: sha256Hex(
        `empty|${canonicalize(input.request as unknown as Record<string, unknown>)}`,
      ),
    };
  }

  const chainResult = validateChain(jwts, {
    now,
    expectedCommand: input.request.command,
  });

  if (!chainResult.valid) {
    return deny(CHAIN_ERROR_TO_REASON[chainResult.error], jwts, input.request);
  }

  const revoked = input.revokedCids;
  if (revoked && revoked.size > 0) {
    for (const jwt of jwts) {
      if (revoked.has(computeCid(jwt))) {
        return deny('revoked', jwts, input.request);
      }
    }
  }

  const leaf = chainResult.leaf;
  const cedarResult = evaluate({
    policies: input.policies,
    principal: { type: 'Agent', id: leaf.aud },
    action: { type: 'Action', id: input.request.command },
    resource: { type: 'Resource', id: '__request__' },
    context: input.request.context as unknown as Context,
    entities: [
      { uid: { type: 'Agent', id: leaf.aud }, attrs: {}, parents: [] },
      {
        uid: { type: 'Resource', id: '__request__' },
        attrs: input.request.resource as unknown as Context,
        parents: [],
      },
    ],
    ...(input.schema !== undefined ? { schema: input.schema } : {}),
  });

  if (cedarResult.decision === 'deny') {
    return deny('policy_denied', jwts, input.request);
  }

  return {
    allow: true,
    receiptId: buildReceiptId(jwts, input.request),
  };
}
