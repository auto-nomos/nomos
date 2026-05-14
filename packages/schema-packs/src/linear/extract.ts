import { parseLinearBody, parseLinearPath } from './path.js';

/**
 * Linear's apiCall is always a POST to `/` with a GraphQL document in
 * `body.query` + variables in `body.variables`. The validator surfaces
 * the canonical resource keys (`issue_id`, `team_id`, `project_id`) by
 * inspecting variables so a UCAN scoped to one team cannot be smuggled
 * to another via a mutation on a different team.
 *
 * Returns null when the body is missing or unparseable — the PDP then
 * refuses with `unparseable_path`/`unparseable_body`.
 */
export function extractResourceFromApiCall(
  _command: string,
  apiCall: { method: string; path: string; body?: unknown },
): Record<string, unknown> | null {
  if (!parseLinearPath(apiCall.path)) return null;
  const parsed = parseLinearBody(apiCall.body);
  if (!parsed) return null;
  const out: Record<string, unknown> = {};
  const v = parsed.variables ?? {};
  if (typeof v.id === 'string') out.issue_id = v.id;
  if (typeof v.issueId === 'string') out.issue_id = v.issueId;
  if (typeof v.teamId === 'string') out.team_id = v.teamId;
  if (typeof v.projectId === 'string') out.project_id = v.projectId;
  // `input.teamId` etc. (mutations bundle args under `input`).
  if (typeof v.input === 'object' && v.input !== null && !Array.isArray(v.input)) {
    const input = v.input as Record<string, unknown>;
    if (out.team_id === undefined && typeof input.teamId === 'string') out.team_id = input.teamId;
    if (out.project_id === undefined && typeof input.projectId === 'string')
      out.project_id = input.projectId;
    if (out.issue_id === undefined && typeof input.id === 'string') out.issue_id = input.id;
  }
  return Object.keys(out).length === 0 ? null : out;
}
