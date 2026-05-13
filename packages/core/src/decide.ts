import type { Context } from '@auto-nomos/cedar';
import { evaluate, type Schema } from '@auto-nomos/cedar';
import { sha256Hex } from '@auto-nomos/crypto';
import type {
  AttenuationSummary,
  AuthorizeDecision,
  AuthorizeRequest,
  DenyReason,
} from '@auto-nomos/shared-types';
import {
  type ChainError,
  canonicalize,
  computeCid,
  constraintMatchesResource,
  extractResourceConstraint,
  parseUcanJwt,
  validateChain,
} from '@auto-nomos/ucan';

/**
 * Sprint MAOS-A — chain depth cap. Hard guard against runaway delegation
 * (e.g. agent loops re-issuing to itself). Effective length includes the
 * leaf — so MAX_CHAIN_DEPTH=8 means up to 8 UCANs in a chain.
 */
export const DEFAULT_MAX_CHAIN_DEPTH = 8;

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
  /**
   * Sprint MAOS-A — override chain depth cap. Defaults to
   * `DEFAULT_MAX_CHAIN_DEPTH`. PDP wires this from `NOMOS_MAX_CHAIN_DEPTH`.
   */
  maxChainDepth?: number;
}

const CHAIN_ERROR_TO_REASON: Record<ChainError, DenyReason> = {
  malformed_ucan: 'malformed_ucan',
  bad_signature: 'bad_signature',
  expired: 'expired',
  not_yet_valid: 'not_yet_valid',
  audience_mismatch: 'audience_mismatch',
  command_mismatch: 'command_mismatch',
  issuer_unsupported: 'malformed_ucan',
  broken_delegation: 'chain_invalid',
  over_attenuated: 'chain_attenuation_violation',
  empty_chain: 'malformed_ucan',
};

function summarizeAttenuation(jwts: string[]): AttenuationSummary | undefined {
  if (jwts.length < 2) return undefined;
  const root = parseUcanJwt(jwts[0] as string);
  const leaf = parseUcanJwt(jwts[jwts.length - 1] as string);
  if ('error' in root || 'error' in leaf) return undefined;
  const lost: string[] = [];
  const narrowed: string[] = [];
  if (root.payload.cmd !== leaf.payload.cmd && !leaf.payload.cmd.startsWith(root.payload.cmd)) {
    lost.push(root.payload.cmd);
  }
  const rootCons = extractResourceConstraint(root.payload.meta);
  const leafCons = extractResourceConstraint(leaf.payload.meta);
  if (rootCons && leafCons && JSON.stringify(rootCons) !== JSON.stringify(leafCons)) {
    narrowed.push('resource_constraint');
  }
  return { capability_lost: lost, resources_narrowed: narrowed };
}

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
  const maxDepth = input.maxChainDepth ?? DEFAULT_MAX_CHAIN_DEPTH;

  if (jwts.length === 0) {
    return {
      allow: false,
      reason: 'malformed_ucan',
      receiptId: sha256Hex(
        `empty|${canonicalize(input.request as unknown as Record<string, unknown>)}`,
      ),
    };
  }

  if (jwts.length > maxDepth) {
    return deny('chain_too_deep', jwts, input.request);
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
  const root = chainResult.root;
  const chainDepth = jwts.length - 1;

  const constraint = extractResourceConstraint(leaf.meta);
  if (constraint && !constraintMatchesResource(constraint, input.request.resource)) {
    return deny('resource_out_of_scope', jwts, input.request);
  }

  // Sprint MAOS-A — chain-derived principal attributes available to Cedar.
  const ancestors = jwts.slice(0, -1).map((jwt) => {
    const p = parseUcanJwt(jwt);
    return 'error' in p ? 'unknown' : p.payload.aud;
  });
  const principalAttrs: Record<string, unknown> = {
    delegationDepth: chainDepth,
    rootAgent: root.aud,
    invokedBy: ancestors,
  };

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
      {
        uid: { type: 'Agent', id: leaf.aud },
        attrs: principalAttrs as unknown as Context,
        parents: [],
      },
      {
        uid: { type: 'Resource', id: '__request__' },
        attrs: input.request.resource as unknown as Context,
        parents: [],
      },
    ],
    ...(input.schema !== undefined ? { schema: input.schema } : {}),
  });

  const attenuation = summarizeAttenuation(jwts);
  const chainFields =
    chainDepth > 0
      ? {
          chain_depth: chainDepth,
          ...(attenuation ? { attenuation_summary: attenuation } : {}),
        }
      : {};

  if (cedarResult.decision === 'deny') {
    return { ...deny('policy_denied', jwts, input.request), ...chainFields };
  }

  return {
    allow: true,
    receiptId: buildReceiptId(jwts, input.request),
    ...chainFields,
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
