/**
 * Sprint 9 — step-up detection.
 *
 * The PDP runs the Cedar evaluator twice when a request denies:
 *   1. With the agent-supplied context.
 *   2. With `context.cosigner = true` synthesized.
 *
 * If the second run allows where the first denied, the *only* gate left is
 * the cosigner — that is, a passkey approval would unblock this request.
 * The PDP creates a push_approvals row via the control plane and returns a
 * `requiresStepUp` decision with a deep link the agent (or human) can poll
 * for state.
 *
 * Cedar eval is sub-millisecond, so the second pass is cheap. We skip it
 * when:
 * - decision.allow is already true,
 * - reason isn't `policy_denied` (UCAN expired/revoked/etc are real denies),
 * - the request already carries cosigner=true (would loop otherwise),
 * - the request already carries a `cosignerJwt` (cosigner retry path).
 */
import { type DecideInput, decide } from '@credential-broker/core';
import type { AuthorizeDecision } from '@credential-broker/shared-types';

const COSIGNER_KEY = 'cosigner';

export function shouldDetectStepUp(
  decision: AuthorizeDecision,
  input: Pick<DecideInput, 'request'>,
): boolean {
  if (decision.allow) return false;
  if (decision.reason !== 'policy_denied') return false;
  const ctx = input.request.context as Record<string, unknown> | undefined;
  if (ctx && ctx[COSIGNER_KEY] === true) return false;
  return true;
}

export function evaluateStepUpPotential(input: DecideInput): boolean {
  const withCosigner: DecideInput = {
    ...input,
    request: {
      ...input.request,
      context: {
        ...(input.request.context as Record<string, unknown>),
        [COSIGNER_KEY]: true,
      },
    },
  };
  const second = decide(withCosigner);
  return second.allow;
}
