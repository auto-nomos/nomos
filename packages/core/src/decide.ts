import type { Context } from '@auto-nomos/cedar';
import { evaluate, type Schema } from '@auto-nomos/cedar';
import { sha256Hex } from '@auto-nomos/crypto';
import type { AuthorizeDecision, AuthorizeRequest, DenyReason } from '@auto-nomos/shared-types';
import {
  type ChainError,
  canonicalize,
  computeCid,
  constraintMatchesResource,
  extractResourceConstraint,
  validateChain,
} from '@auto-nomos/ucan';

export interface DecideInput {
  ucan: string | string[];
  request: AuthorizeRequest;
  policies: string;
  revokedCids?: ReadonlySet<string>;
  schema?: Schema;
  /**
   * Optional root issuer trust anchor. PDPs that know the control-plane
   * signing DID should set this so arbitrary self-issued UCANs cannot satisfy
   * broad Cedar policies.
   */
  trustedIssuerDid?: string;
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

  if (input.trustedIssuerDid && chainResult.root.iss !== input.trustedIssuerDid) {
    return deny('untrusted_issuer', jwts, input.request);
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

  const constraint = extractResourceConstraint(leaf.meta);
  if (constraint && !constraintMatchesResource(constraint, input.request.resource)) {
    return deny('resource_out_of_scope', jwts, input.request);
  }

  const mergedContext = mergeContext(
    input.request.context as unknown as Record<string, unknown>,
    computeEphemeralContext(now),
    extractContextHints(leaf.meta),
    constraint
      ? { resource_constraint: constraint as unknown as Record<string, unknown> }
      : undefined,
  );
  const cedarResult = evaluate({
    policies: input.policies,
    principal: { type: 'Agent', id: leaf.aud },
    action: { type: 'Action', id: input.request.command },
    resource: { type: 'Resource', id: '__request__' },
    context: mergedContext as unknown as Context,
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

/**
 * D-5 resolution (Sprint 7): build the Cedar evaluation context.
 *
 * Sources, lowest priority first (later sources win):
 *  1. `request.context` — supplied by the agent / SDK at authorize time.
 *     Untrusted; an agent can lie about anything here.
 *  2. PDP-computed ephemerals — `time.hour` from `now`. Other ephemerals
 *     (geo IP, etc.) join when external lookup lands in Phase 2.
 *  3. UCAN `meta.context_hints` — issuer-vouched stable values stamped at
 *     mint time (e.g. `user.department`). Highest priority because the
 *     issuer is trusted to know who the user is.
 *
 * Merge is deep one level: shared top-level keys (`time`, `user`, `ip`)
 * have their child fields merged so the agent's `time.source` survives
 * even when the PDP overrides `time.hour`.
 */
function mergeContext(
  ...sources: ReadonlyArray<Record<string, unknown> | undefined>
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const src of sources) {
    if (!src) continue;
    for (const [k, v] of Object.entries(src)) {
      if (
        v !== null &&
        typeof v === 'object' &&
        !Array.isArray(v) &&
        out[k] &&
        typeof out[k] === 'object' &&
        !Array.isArray(out[k])
      ) {
        out[k] = {
          ...(out[k] as Record<string, unknown>),
          ...(v as Record<string, unknown>),
        };
      } else {
        out[k] = v;
      }
    }
  }
  return out;
}

function computeEphemeralContext(nowSec: number): Record<string, unknown> {
  const date = new Date(nowSec * 1000);
  return {
    time: {
      hour: date.getUTCHours(),
      epoch: nowSec,
    },
  };
}

function extractContextHints(meta: unknown): Record<string, unknown> | undefined {
  if (!meta || typeof meta !== 'object') return undefined;
  const hints = (meta as Record<string, unknown>).context_hints;
  if (!hints || typeof hints !== 'object' || Array.isArray(hints)) return undefined;
  return hints as Record<string, unknown>;
}
