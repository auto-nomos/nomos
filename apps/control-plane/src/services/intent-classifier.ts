/**
 * Intent risk classifier — Approval Envelope gate.
 *
 * Decides whether an incoming /v1/intent request can be silently minted
 * inside an active envelope or must escalate to passkey step-up. Three
 * inputs are blended:
 *
 *  1. Risk heuristics (write actions, deny-listed paths) — always force
 *     step-up regardless of envelope coverage.
 *  2. Envelope match — if a high-risk check passes and an active envelope
 *     covers the constraint + actions, mint silently.
 *  3. Otherwise propose the constraint as a new envelope and step-up.
 *
 * Pure function over inputs. Database access lives in the caller.
 */
import type { ResourceConstraint } from '@auto-nomos/shared-types';
import type { Envelope } from './envelope-store.js';
import { findCoveringEnvelope } from './envelope-store.js';
import type { CoherenceVerifier } from './intent-coherence.js';

/** Path patterns that always require fresh passkey confirmation, even
 *  when an envelope nominally covers them. Keep small + obvious; the
 *  signal must be precision over recall. */
const SENSITIVE_PATH_FRAGMENTS = [
  '/.ssh',
  '/.aws',
  '/.gnupg',
  '/.env',
  '/secrets',
  '/credentials',
  '/private_key',
  '/id_rsa',
  '/id_ed25519',
];

/** GitHub repos that always require fresh confirmation. Mirrors the
 *  filesystem deny-list spirit: high-blast-radius, low-traffic. */
const SENSITIVE_GITHUB_REPOS = ['.github', 'secrets', 'terraform', 'infrastructure', 'vault'];

/** Action commands that always require step-up. The taxonomy follows
 *  the `/<provider>/<resource>/<verb>` convention; the leaf verb is what
 *  matters here. */
const HIGH_RISK_VERBS = [
  'write',
  'create',
  'update',
  'delete',
  'execute',
  'send',
  'merge',
  'force-push',
];

export type ClassifierDecision =
  | { kind: 'mint'; envelope: Envelope }
  | { kind: 'stepup'; reason: ClassifierStepUpReason };

export type ClassifierStepUpReason =
  | 'no_covering_envelope'
  | 'sensitive_path'
  | 'high_risk_action'
  | 'org_admin_action'
  | 'coherence_mismatch';

export interface ClassifyInput {
  constraint: ResourceConstraint;
  actions: string[];
  envelopes: Envelope[];
  /** Operator-declared purpose, surfaced to the LLM verifier. */
  purpose?: string;
  /** Optional request-level args used by the LLM verifier. */
  requestArgs?: Record<string, unknown>;
}

export interface ClassifyDeps {
  /** When set, runs after envelope-cover passes. Heuristic denies still
   *  short-circuit before the LLM call. */
  verifier?: CoherenceVerifier;
}

export async function classifyIntent(
  input: ClassifyInput,
  deps: ClassifyDeps = {},
): Promise<ClassifierDecision> {
  if (hasSensitivePath(input.constraint)) {
    return { kind: 'stepup', reason: 'sensitive_path' };
  }
  if (isOrgAdminAction(input.constraint, input.actions)) {
    return { kind: 'stepup', reason: 'org_admin_action' };
  }
  if (hasHighRiskAction(input.actions)) {
    return { kind: 'stepup', reason: 'high_risk_action' };
  }
  const covering = findCoveringEnvelope(input.envelopes, input.constraint, input.actions);
  if (!covering) {
    return { kind: 'stepup', reason: 'no_covering_envelope' };
  }
  if (deps.verifier && input.purpose) {
    const result = await deps.verifier({
      purpose: input.purpose,
      constraint: input.constraint,
      actions: input.actions,
      ...(input.requestArgs ? { requestArgs: input.requestArgs } : {}),
    });
    if (!result.coherent) {
      return { kind: 'stepup', reason: 'coherence_mismatch' };
    }
  }
  return { kind: 'mint', envelope: covering };
}

function hasSensitivePath(c: ResourceConstraint): boolean {
  if (c.provider === 'filesystem') {
    const lc = c.path_prefix.toLowerCase();
    return SENSITIVE_PATH_FRAGMENTS.some((frag) => lc.includes(frag));
  }
  if (c.provider === 'github') {
    const repo = c.repo?.toLowerCase();
    if (!repo) return false;
    if (repo.startsWith('infra-')) return true;
    return SENSITIVE_GITHUB_REPOS.includes(repo);
  }
  return false;
}

function hasHighRiskAction(actions: string[]): boolean {
  return actions.some((a) => {
    const verb = a.split('/').pop() ?? '';
    return HIGH_RISK_VERBS.includes(verb);
  });
}

/**
 * Org-wide write action (e.g. owner-only github constraint with a
 * write-class verb). Even inside an active envelope, a github intent
 * that touches "all repos in this org" plus a mutating verb is too
 * broad to silently mint — re-prompt every time.
 */
function isOrgAdminAction(c: ResourceConstraint, actions: string[]): boolean {
  if (c.provider !== 'github') return false;
  if (c.repo !== undefined) return false;
  return hasHighRiskAction(actions);
}
