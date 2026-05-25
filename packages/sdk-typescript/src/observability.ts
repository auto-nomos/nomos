/**
 * Sprint MAOS-B / P1 — observability helpers.
 *
 * Today: `recordHandoff` — stamp a typed delegation envelope on the
 * outgoing PDP request body so the parent's terminal span carries
 * `handoff_to_did` / `handoff_task` / `handoff_expected_output` /
 * `handoff_rationale`. The dashboard surfaces these as edge labels in
 * the swarm action graph and, in P3, as planned-vs-actual diffs.
 *
 * The handoff is parent-declared — it lives on the request that
 * immediately precedes the fork, *not* on `forkChild()` (which is
 * child-bound env wiring). Keep the two surfaces separate.
 */
export interface SpanHandoffEnvelope {
  /** DID of the child agent receiving the delegation. */
  toAgentDid: string;
  /** What the child is expected to do (1-2 sentences). */
  task: string;
  /** Optional structured output the parent expects back. */
  expectedOutput?: string;
  /** Optional rationale — why this fork, why this child. */
  rationale?: string;
}

/**
 * apiCall body shape the SDK posts to `/v1/proxy/:command`. Permissive
 * by design — we only need to attach `handoff` without dictating the
 * caller's broader shape.
 */
export interface ApiCallLike {
  handoff?: SpanHandoffEnvelope;
  [k: string]: unknown;
}

/**
 * Attach a typed handoff envelope to an outgoing apiCall body. Returns a
 * new object — does not mutate the input (callers commonly reuse the
 * apiCall shape across retries).
 *
 * No PDP-side validation beyond zod length caps. The handoff has zero
 * effect on the authorization decision; it is a pure observability
 * annotation. Caller-supplied `handoff` already on the apiCall wins.
 */
export function recordHandoff<T extends ApiCallLike>(apiCall: T, handoff: SpanHandoffEnvelope): T {
  if (apiCall.handoff) return apiCall;
  return {
    ...apiCall,
    handoff: {
      toAgentDid: handoff.toAgentDid,
      task: handoff.task,
      ...(handoff.expectedOutput !== undefined ? { expectedOutput: handoff.expectedOutput } : {}),
      ...(handoff.rationale !== undefined ? { rationale: handoff.rationale } : {}),
    },
  };
}
